// Administrador de Cinetream: sesión con contraseña, importar por link, subir archivos y editar el catálogo.
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import {
  actualizarPelicula, adminConfigurado, agregarPelicula, buscarPelicula, CARPETA_PORTADAS, CARPETA_VIDEOS,
  claveCorrecta, definirClave, quitarPelicula, todas,
} from './datos.js';
import { analizar, descargar, ErrorImportar } from './importar.js';

const HORAS_SESION = 12;
const sesiones = new Map(); // id → vence
const fallos = new Map(); // ip → { n, desde }
const trabajos = new Map(); // id película → { estado, bytes, total, error, control }

// ---------- Utilidades HTTP ----------
function json(res, estado, datos, cabeceras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabeceras });
  res.end(JSON.stringify(datos));
}
function leerJSON(req, limite = 200_000) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    req.on('data', (d) => { total += d.length; if (total > limite) { rechazar(new Error('Datos demasiado grandes')); req.destroy(); } else partes.push(d); });
    req.on('end', () => { try { resolver(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { rechazar(new Error('Datos inválidos')); } });
    req.on('error', rechazar);
  });
}
const cookie = (req, valor, segundos) => `cinetream_admin=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
function sesionValida(req) {
  const id = (req.headers.cookie || '').match(/cinetream_admin=([^;]+)/)?.[1];
  const vence = id && sesiones.get(id);
  return Boolean(vence && vence > Date.now());
}
function abrirSesion(req, res, datos = { ok: true }) {
  const id = crypto.randomBytes(32).toString('base64url');
  sesiones.set(id, Date.now() + HORAS_SESION * 3600000);
  json(res, 200, datos, { 'Set-Cookie': cookie(req, id, HORAS_SESION * 3600) });
}
const ip = (req) => req.socket.remoteAddress || '';
function bloqueado(req) {
  const f = fallos.get(ip(req));
  return f && Date.now() - f.desde < 15 * 60000 && f.n >= 8;
}
function fallo(req) {
  const f = fallos.get(ip(req));
  if (!f || Date.now() - f.desde > 15 * 60000) fallos.set(ip(req), { n: 1, desde: Date.now() });
  else f.n++;
}

// Nombres de archivo propios: nunca se usa el nombre que llega de afuera
const nombreArchivo = (base, ext) => `${String(base).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'pelicula'}-${crypto.randomBytes(4).toString('hex')}${ext}`;
const EXT_VIDEO = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-m4v': '.m4v', 'video/ogg': '.ogv' };
const EXT_IMAGEN = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const extDe = (url, tipo) => EXT_VIDEO[tipo] || (path.extname(new URL(url).pathname).toLowerCase().match(/^\.(mp4|m4v|webm|mov|ogv)$/)?.[0]) || '.mp4';

async function espacioVideos() {
  let total = 0;
  for (const f of await readdir(CARPETA_VIDEOS).catch(() => [])) total += (await stat(path.join(CARPETA_VIDEOS, f)).catch(() => ({ size: 0 }))).size;
  return total;
}

// Borra un archivo propio (videos/… o portadas/…) cuando se reemplaza o se elimina la película
async function borrarArchivoPropio(ruta) {
  if (!ruta) return;
  const m = ruta.match(/^(videos|portadas)\/([a-z0-9.-]+)$/i);
  if (!m) return;
  await rm(path.join(m[1] === 'videos' ? CARPETA_VIDEOS : CARPETA_PORTADAS, m[2]), { force: true });
}

// ---------- Importar en segundo plano ----------
async function importar(p, info, modo) {
  const trabajo = { estado: 'descargando', bytes: 0, total: info.tamano || 0, error: null, control: new AbortController() };
  trabajos.set(p.id, trabajo);
  try {
    // La portada primero: es chica y deja la ficha lista enseguida
    if (info.portada) {
      try {
        const destino = nombreArchivo(p.id, '.jpg');
        const { tipo } = await descargar(info.portada, path.join(CARPETA_PORTADAS, destino), { tipos: ['image/'], maxBytes: 15 * 1024 ** 2 });
        const ext = EXT_IMAGEN[tipo.split(';')[0]] || '.jpg';
        let final = destino;
        if (ext !== '.jpg') { final = destino.replace(/\.jpg$/, ext); await rename(path.join(CARPETA_PORTADAS, destino), path.join(CARPETA_PORTADAS, final)); }
        actualizarPelicula(p.id, { portada: `portadas/${final}` });
      } catch { /* sin portada: se usa la ilustración de Cinetream */ }
    }
    if (modo === 'descargar') {
      const archivo = nombreArchivo(p.id, extDe(info.video));
      await descargar(info.video, path.join(CARPETA_VIDEOS, archivo), {
        senal: trabajo.control.signal,
        alProgreso: (bytes, total) => { trabajo.bytes = bytes; trabajo.total = total || trabajo.total; },
      });
      actualizarPelicula(p.id, { video: `videos/${archivo}` });
    }
    // Queda oculta hasta que el administrador la revise y la publique (o publicada si así se pidió)
    actualizarPelicula(p.id, { estado: info.publicar ? 'publicada' : 'oculta' });
    trabajo.estado = 'listo';
  } catch (e) {
    trabajo.estado = 'error';
    trabajo.error = e instanceof ErrorImportar ? e.message : 'Error inesperado al importar.';
    actualizarPelicula(p.id, { estado: 'error' });
  }
}

// ---------- Rutas ----------
export async function rutasAdmin(req, res, url) {
  const ruta = url.pathname.replace(/^\/api\/admin/, '');
  try {
    if (ruta === '/estado') return json(res, 200, { configurado: adminConfigurado(), sesion: sesionValida(req) });

    if (ruta === '/configurar' && req.method === 'POST') {
      if (adminConfigurado()) return json(res, 403, { error: 'El administrador ya tiene contraseña.' });
      const { clave } = await leerJSON(req);
      if (typeof clave !== 'string' || clave.length < 8) return json(res, 400, { error: 'La contraseña tiene que tener al menos 8 caracteres.' });
      await definirClave(clave);
      return abrirSesion(req, res);
    }
    if (ruta === '/entrar' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const { clave } = await leerJSON(req);
      if (!claveCorrecta(clave)) { fallo(req); return json(res, 401, { error: 'Contraseña incorrecta.' }); }
      return abrirSesion(req, res);
    }
    if (ruta === '/salir' && req.method === 'POST') {
      const id = (req.headers.cookie || '').match(/cinetream_admin=([^;]+)/)?.[1];
      if (id) sesiones.delete(id);
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    }

    // Todo lo demás requiere sesión
    if (!sesionValida(req)) return json(res, 401, { error: 'Iniciá sesión como administrador.' });

    if (ruta === '/catalogo') {
      return json(res, 200, {
        peliculas: todas(),
        trabajos: Object.fromEntries([...trabajos].map(([id, t]) => [id, { estado: t.estado, bytes: t.bytes, total: t.total, error: t.error }])),
        espacio: await espacioVideos(),
      });
    }

    if (ruta === '/analizar' && req.method === 'POST') {
      const { url: link } = await leerJSON(req);
      return json(res, 200, await analizar(String(link || '').trim()));
    }

    if (ruta === '/importar' && req.method === 'POST') {
      const { info, datos, modo, derechos } = await leerJSON(req);
      if (!derechos) return json(res, 400, { error: 'Confirmá que tenés derecho a publicar esta película.' });
      if (!info?.video) return json(res, 400, { error: 'Primero buscá el link.' });
      const p = agregarPelicula({ ...datos, video: modo === 'descargar' ? null : info.video, fuente: info.fuente || info.video, estado: 'descargando' });
      importar(p, { ...info, publicar: Boolean(datos?.publicar) }, modo === 'descargar' ? 'descargar' : 'link');
      return json(res, 200, { pelicula: p });
    }

    if (ruta === '/subir' && req.method === 'PUT') {
      // El archivo llega entero en el cuerpo, sin formularios: así se suben películas de varios GB
      const tipo = (req.headers['content-type'] || '').split(';')[0];
      if (!EXT_VIDEO[tipo]) return json(res, 415, { error: 'Ese archivo no es un video compatible (MP4, WebM o MOV).' });
      const archivo = nombreArchivo(url.searchParams.get('base') || 'pelicula', EXT_VIDEO[tipo]);
      const parcial = path.join(CARPETA_VIDEOS, `${archivo}.parcial`);
      const salida = createWriteStream(parcial);
      try {
        for await (const parte of req) { if (!salida.write(parte)) await once(salida, 'drain'); }
        salida.end();
        await once(salida, 'finish');
        await rename(parcial, path.join(CARPETA_VIDEOS, archivo));
      } catch {
        salida.destroy();
        await rm(parcial, { force: true });
        return json(res, 400, { error: 'La subida se cortó. Probá de nuevo.' });
      }
      return json(res, 200, { video: `videos/${archivo}` });
    }

    if (ruta === '/peliculas' && req.method === 'POST') {
      const { datos, derechos } = await leerJSON(req);
      if (!derechos) return json(res, 400, { error: 'Confirmá que tenés derecho a publicar esta película.' });
      return json(res, 200, { pelicula: agregarPelicula(datos) });
    }

    const m = ruta.match(/^\/peliculas\/([a-z0-9-]+)(\/portada|\/cancelar)?$/);
    if (m) {
      const p = buscarPelicula(m[1]);
      if (!p) return json(res, 404, { error: 'Esa película no existe.' });
      if (!m[2] && req.method === 'PUT') {
        const { datos } = await leerJSON(req);
        if (datos.portada === null && p.portada) await borrarArchivoPropio(p.portada);
        return json(res, 200, { pelicula: actualizarPelicula(p.id, datos) });
      }
      if (!m[2] && req.method === 'DELETE') {
        trabajos.get(p.id)?.control.abort();
        trabajos.delete(p.id);
        quitarPelicula(p.id);
        await borrarArchivoPropio(p.video);
        await borrarArchivoPropio(p.portada);
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/cancelar' && req.method === 'POST') {
        trabajos.get(p.id)?.control.abort();
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/portada' && req.method === 'PUT') {
        const tipo = (req.headers['content-type'] || '').split(';')[0];
        if (!EXT_IMAGEN[tipo]) return json(res, 415, { error: 'La portada tiene que ser JPG, PNG o WebP.' });
        const archivo = nombreArchivo(p.id, EXT_IMAGEN[tipo]);
        const partes = [];
        let total = 0;
        for await (const parte of req) {
          total += parte.length;
          if (total > 15 * 1024 ** 2) return json(res, 413, { error: 'La imagen es demasiado grande (máximo 15 MB).' });
          partes.push(parte);
        }
        const destino = createWriteStream(path.join(CARPETA_PORTADAS, archivo));
        destino.end(Buffer.concat(partes));
        await once(destino, 'finish');
        await borrarArchivoPropio(p.portada);
        return json(res, 200, { pelicula: actualizarPelicula(p.id, { portada: `portadas/${archivo}` }) });
      }
    }
    return json(res, 404, { error: 'No existe.' });
  } catch (e) {
    return json(res, e instanceof ErrorImportar ? 422 : 400, { error: e.message || 'Error' });
  }
}
