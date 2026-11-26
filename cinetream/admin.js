// Administrador de Cinetream: sesión con contraseña, importar por link, subir archivos y editar el catálogo.
import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import {
  actualizarPelicula, adminConfigurado, agregarPelicula, buscarPelicula, CARPETA_PORTADAS, CARPETA_VIDEOS,
  claveCorrecta, definirClave, quitarPelicula, todas,
} from './datos.js';
import { analizar, descargar, ErrorImportar, revisarReproductor } from './importar.js';
import { activarPlan, buscarCuenta, guardarCuentas, guardarPlanes, listaPlanes, planEfectivo, todasLasCuentas } from './cuentas.js';
import { actualizarCampana, buscarCampana, campanas, CARPETA_PIEZAS, crearCampana, ponerPieza, quitarCampana } from './publicidad.js';
import { modoPrueba } from './pagos.js';
import { direccionPublica, enInternet, esLocal, ipCliente } from './red.js';
import {
  borrarObjeto, espacioUsado, ErrorR2, linkSubida, permitirSubidasDesde, probarConexion, r2Bucket, r2Configurado, subirFlujo,
} from './r2.js';
import { estadoEnlace, guardarEnlace, olvidarPelicula, revisarEnlace, vistas, vistasPorDia } from './estadisticas.js';

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
export function sesionValida(req) {
  const id = (req.headers.cookie || '').match(/cinetream_admin=([^;]+)/)?.[1];
  const vence = id && sesiones.get(id);
  return Boolean(vence && vence > Date.now());
}
function abrirSesion(req, res, datos = { ok: true }) {
  const id = crypto.randomBytes(32).toString('base64url');
  sesiones.set(id, Date.now() + HORAS_SESION * 3600000);
  json(res, 200, datos, { 'Set-Cookie': cookie(req, id, HORAS_SESION * 3600) });
}
const ip = ipCliente;
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

async function espacioCarpeta(carpeta) {
  let total = 0;
  for (const f of await readdir(carpeta).catch(() => [])) total += (await stat(path.join(carpeta, f)).catch(() => ({ size: 0 }))).size;
  return total;
}
const espacioVideos = () => espacioCarpeta(CARPETA_VIDEOS);

// Cuánto ocupa Cinetream y cuánto lugar queda en el disco (en Render, el disco persistente)
async function disco() {
  const [videos, portadas, anuncios] = await Promise.all([espacioCarpeta(CARPETA_VIDEOS), espacioCarpeta(CARPETA_PORTADAS), espacioCarpeta(CARPETA_PIEZAS)]);
  let total = 0;
  let libre = 0;
  try { const s = await statfs(CARPETA_VIDEOS); total = s.blocks * s.bsize; libre = s.bavail * s.bsize; } catch { /* sistema sin statfs */ }
  return { videos, portadas, anuncios, total, libre };
}

const esExterno = (v) => /^https?:\/\//i.test(v || '');
const enR2 = (v) => /^r2:/.test(v || '');
const TIPOS_VIDEO = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg' };

// Cuánto ocupa el bucket de R2 (se consulta como mucho una vez por minuto)
let espacioR2 = { fecha: 0, datos: null };
async function datosR2() {
  if (!r2Configurado()) return { configurado: false };
  if (Date.now() - espacioR2.fecha > 60000) {
    try { espacioR2 = { fecha: Date.now(), datos: await espacioUsado() }; } catch (e) { espacioR2 = { fecha: Date.now(), datos: { error: e.message } }; }
  }
  return { configurado: true, bucket: r2Bucket(), ...espacioR2.datos };
}

// La regla CORS del bucket se pone una sola vez por arranque (para subir directo desde el navegador)
let corsListo = '';
async function asegurarCors(req) {
  const origen = req.headers.origin || direccionPublica(req) || `http://${req.headers.host}`;
  if (corsListo === origen) return;
  await permitirSubidasDesde(origen);
  corsListo = origen;
}

// Pasa un video (de un link o del disco) a Cloudflare R2 sin sacarlo de la plataforma mientras sube
async function pasarAR2(p) {
  const trabajo = { estado: 'descargando', tipo: 'r2', bytes: 0, total: 0, error: null, control: new AbortController() };
  trabajos.set(p.id, trabajo);
  const anterior = p.video;
  const ext = esExterno(anterior) ? extDe(anterior) : path.extname(anterior).toLowerCase() || '.mp4';
  const clave = `videos/${nombreArchivo(p.id, ext)}`;
  try {
    let flujo;
    let tipo = TIPOS_VIDEO[ext] || 'video/mp4';
    if (esExterno(anterior)) {
      const r = await fetch(anterior, { redirect: 'follow', signal: trabajo.control.signal, headers: { 'User-Agent': 'Cinetream/1.0' } });
      if (!r.ok || !r.body) throw new ErrorImportar(`El link respondió ${r.status}.`);
      if (/text\/html/i.test(r.headers.get('content-type') || '')) throw new ErrorImportar('El link ya no lleva a un video.');
      tipo = (r.headers.get('content-type') || tipo).split(';')[0];
      trabajo.total = Number(r.headers.get('content-length')) || 0;
      flujo = Readable.fromWeb(r.body);
    } else {
      const archivo = path.join(CARPETA_VIDEOS, anterior.slice('videos/'.length));
      trabajo.total = (await stat(archivo)).size;
      flujo = createReadStream(archivo);
    }
    const tamano = await subirFlujo(clave, flujo, { tipo, senal: trabajo.control.signal, alProgreso: (n) => { trabajo.bytes = n; } });
    actualizarPelicula(p.id, { video: `r2:${clave}`, tamano, videoOriginal: esExterno(anterior) ? anterior : buscarPelicula(p.id)?.videoOriginal });
    if (anterior.startsWith('videos/')) await borrarArchivoPropio(anterior);
    espacioR2.fecha = 0;
    trabajo.estado = 'listo';
  } catch (e) {
    trabajo.estado = 'error';
    trabajo.error = trabajo.control.signal.aborted ? 'Se canceló el pase a R2.'
      : e instanceof ErrorImportar || e instanceof ErrorR2 ? e.message : 'No se pudo pasar el video a Cloudflare R2.';
  }
}

// Pasar una película «desde link» a un archivo guardado en el servidor, sin sacarla de la plataforma mientras baja
async function guardarEnServidor(p) {
  const origen = p.video;
  const trabajo = { estado: 'descargando', tipo: 'guardar', bytes: 0, total: 0, error: null, control: new AbortController() };
  trabajos.set(p.id, trabajo);
  const archivo = nombreArchivo(p.id, extDe(origen));
  try {
    await descargar(origen, path.join(CARPETA_VIDEOS, archivo), {
      senal: trabajo.control.signal,
      alProgreso: (bytes, total) => { trabajo.bytes = bytes; trabajo.total = total || trabajo.total; },
    });
    actualizarPelicula(p.id, { video: `videos/${archivo}`, videoOriginal: origen });
    trabajo.estado = 'listo';
  } catch (e) {
    trabajo.estado = 'error';
    trabajo.error = e instanceof ErrorImportar ? e.message : 'No se pudo guardar el video en el servidor.';
  }
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
    if (modo === 'r2') {
      // Se sube directo del link a R2, sin pasar por el disco del servidor
      actualizarPelicula(p.id, { video: info.video });
      trabajos.delete(p.id);
      await pasarAR2(buscarPelicula(p.id));
      const t = trabajos.get(p.id);
      if (t?.estado === 'error') throw new ErrorImportar(t.error);
      trabajos.set(p.id, trabajo);
    } else if (modo === 'descargar') {
      const archivo = nombreArchivo(p.id, extDe(info.video));
      await descargar(info.video, path.join(CARPETA_VIDEOS, archivo), {
        senal: trabajo.control.signal,
        alProgreso: (bytes, total) => { trabajo.bytes = bytes; trabajo.total = total || trabajo.total; },
      });
      actualizarPelicula(p.id, { video: `videos/${archivo}`, videoOriginal: info.video });
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
    if (ruta === '/estado') {
      return json(res, 200, {
        configurado: adminConfigurado(), sesion: sesionValida(req),
        enInternet, direccion: direccionPublica(req), render: Boolean(process.env.RENDER),
      });
    }

    if (ruta === '/configurar' && req.method === 'POST') {
      if (adminConfigurado()) return json(res, 403, { error: 'El administrador ya tiene contraseña.' });
      // Desde internet nadie puede elegir la primera contraseña: se pone con la variable ADMIN_CLAVE (en Render se genera sola)
      if (!esLocal(req)) return json(res, 403, { error: 'La primera contraseña se elige desde la PC del servidor o con la variable ADMIN_CLAVE.' });
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
      const extra = {};
      for (const p of todas()) {
        const local = p.video?.startsWith('videos/');
        extra[p.id] = {
          bytes: local ? (await stat(path.join(CARPETA_VIDEOS, p.video.slice(7))).catch(() => ({ size: 0 }))).size : enR2(p.video) ? p.tamano : 0,
          vistas: vistas(p.id),
          enlace: esExterno(p.video) || p.embed ? estadoEnlace(p.id) : null,
        };
      }
      return json(res, 200, {
        peliculas: todas(),
        trabajos: Object.fromEntries([...trabajos].map(([id, t]) => [id, { estado: t.estado, tipo: t.tipo || 'importar', bytes: t.bytes, total: t.total, error: t.error }])),
        espacio: await espacioVideos(),
        extra,
        disco: await disco(),
        r2: await datosR2(),
      });
    }

    // ---------- Cloudflare R2 ----------
    if (ruta === '/r2') return json(res, 200, await datosR2());
    if (ruta === '/r2/probar' && req.method === 'POST') {
      if (!r2Configurado()) return json(res, 400, { error: 'Faltan las variables de R2 (R2_CUENTA, R2_CLAVE_ID, R2_CLAVE_SECRETA y R2_BUCKET).' });
      await probarConexion();
      let cors = true;
      try { corsListo = ''; await asegurarCors(req); } catch { cors = false; }
      espacioR2.fecha = 0;
      return json(res, 200, { ok: true, cors, ...(await datosR2()) });
    }
    // El navegador sube el archivo directo a R2 con un link firmado: no pasa por el servidor
    if (ruta === '/r2/subida' && req.method === 'POST') {
      if (!r2Configurado()) return json(res, 400, { error: 'Cloudflare R2 no está configurado.' });
      const { base, tipo } = await leerJSON(req);
      if (!EXT_VIDEO[tipo]) return json(res, 415, { error: 'Ese archivo no es un video compatible (MP4, WebM o MOV).' });
      try { await asegurarCors(req); } catch (e) { return json(res, 502, { error: `R2 no aceptó la regla para subir desde el navegador: ${e.message}` }); }
      const clave = `videos/${nombreArchivo(String(base || 'pelicula'), EXT_VIDEO[tipo])}`;
      return json(res, 200, { url: linkSubida(clave), video: `r2:${clave}` });
    }

    // Revisa que los videos «desde link» sigan funcionando (de a 4 por vez)
    if (ruta === '/enlaces/revisar' && req.method === 'POST') {
      const conLink = todas().filter((p) => esExterno(p.video) || p.embed);
      const resultados = {};
      for (let i = 0; i < conLink.length; i += 4) {
        await Promise.all(conLink.slice(i, i + 4).map(async (p) => {
          const r = p.embed ? await revisarReproductor(p.embed) : await revisarEnlace(p.video);
          guardarEnlace(p.id, r);
          resultados[p.id] = r;
        }));
      }
      const caidos = Object.values(resultados).filter((r) => !r.ok).length;
      return json(res, 200, { revisados: conLink.length, caidos, resultados });
    }

    // Cambiar la contraseña del administrador (cierra las demás sesiones abiertas)
    if (ruta === '/clave' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const { actual, nueva } = await leerJSON(req);
      if (!claveCorrecta(actual)) { fallo(req); return json(res, 403, { error: 'La contraseña actual no es correcta.' }); }
      if (typeof nueva !== 'string' || nueva.length < 10) return json(res, 400, { error: 'La contraseña nueva tiene que tener al menos 10 caracteres.' });
      if (nueva === actual) return json(res, 400, { error: 'La contraseña nueva tiene que ser distinta de la actual.' });
      await definirClave(nueva);
      const propia = (req.headers.cookie || '').match(/cinetream_admin=([^;]+)/)?.[1];
      let cerradas = 0;
      for (const id of [...sesiones.keys()]) if (id !== propia) { sesiones.delete(id); cerradas++; }
      return json(res, 200, { ok: true, cerradas });
    }
    if (ruta === '/sesiones/cerrar' && req.method === 'POST') {
      const propia = (req.headers.cookie || '').match(/cinetream_admin=([^;]+)/)?.[1];
      let cerradas = 0;
      for (const id of [...sesiones.keys()]) if (id !== propia) { sesiones.delete(id); cerradas++; }
      return json(res, 200, { cerradas });
    }

    // Suscriptores en una planilla (se abre con Excel o Google Sheets)
    if (ruta === '/cuentas.csv') {
      // Un valor que empieza con = + - @ se toma como fórmula en Excel: se le antepone un apóstrofo
      const celda = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
      const fecha = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
      const filas = [['Correo', 'Nombre', 'Plan', 'Estado', 'Vence', 'Alta', 'Pago']].concat(todasLasCuentas().map((c) => [
        c.email, c.nombre, planEfectivo(c).nombre, planEfectivo(c).id === 'gratis' ? '' : c.estado, fecha(c.vence), fecha(c.alta), c.pago?.proveedor || '',
      ]));
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="cinetream-suscriptores-${fecha(Date.now())}.csv"`,
      });
      return res.end(`\ufeff${filas.map((f) => f.map(celda).join(';')).join('\r\n')}\r\n`);
    }

    if (ruta === '/analizar' && req.method === 'POST') {
      const { url: link } = await leerJSON(req);
      return json(res, 200, await analizar(String(link || '').trim()));
    }

    if (ruta === '/importar' && req.method === 'POST') {
      const { info, datos, modo, derechos } = await leerJSON(req);
      if (!derechos) return json(res, 400, { error: 'Confirmá que tenés derecho a publicar esta película.' });
      if (!info?.video && !info?.embed) return json(res, 400, { error: 'Primero buscá el link.' });
      if (info.embed) {
        // Con el reproductor del otro sitio no se descarga nada: solo la portada
        const p = agregarPelicula({ ...datos, video: null, embed: info.embed, fuente: info.fuente || info.embed, estado: 'descargando' });
        importar(p, { ...info, video: null, publicar: Boolean(datos?.publicar) }, 'link');
        return json(res, 200, { pelicula: p });
      }
      const p = agregarPelicula({ ...datos, video: modo === 'link' ? info.video : null, fuente: info.fuente || info.video, estado: 'descargando' });
      if (modo === 'r2' && !r2Configurado()) return json(res, 400, { error: 'Cloudflare R2 no está configurado.' });
      importar(p, { ...info, publicar: Boolean(datos?.publicar) }, ['descargar', 'r2'].includes(modo) ? modo : 'link');
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

    const m = ruta.match(/^\/peliculas\/([a-z0-9-]+)(\/portada|\/cancelar|\/guardar|\/liberar|\/r2)?$/);
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
        olvidarPelicula(p.id);
        if (enR2(p.video)) await borrarObjeto(p.video.slice(3)).catch(() => {});
        await borrarArchivoPropio(p.video);
        await borrarArchivoPropio(p.portada);
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/guardar' && req.method === 'POST') {
        if (!esExterno(p.video)) return json(res, 400, { error: 'Esta película no se ve desde un link.' });
        if (trabajos.get(p.id)?.estado === 'descargando') return json(res, 409, { error: 'Ya se está guardando.' });
        const d = await disco();
        if (d.total && d.libre < 512 * 1024 ** 2) return json(res, 507, { error: 'Casi no queda lugar en el disco del servidor.' });
        guardarEnServidor(p);
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/r2' && req.method === 'POST') {
        if (!r2Configurado()) return json(res, 400, { error: 'Cloudflare R2 no está configurado.' });
        if (!esExterno(p.video) && !p.video?.startsWith('videos/')) return json(res, 400, { error: 'Esta película no tiene un video para pasar a R2.' });
        if (trabajos.get(p.id)?.estado === 'descargando') return json(res, 409, { error: 'Ya hay una copia en curso.' });
        pasarAR2(p);
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/liberar' && req.method === 'POST') {
        // Vuelve a reproducirse desde el link original y se borra el archivo del servidor (o de R2)
        if (!p.video?.startsWith('videos/') && !enR2(p.video)) return json(res, 400, { error: 'Esta película no está guardada.' });
        if (!esExterno(p.videoOriginal)) return json(res, 400, { error: 'No se conoce el link original de este video: no se puede liberar sin que deje de verse.' });
        const r = await revisarEnlace(p.videoOriginal);
        if (!r.ok) return json(res, 409, { error: `El link original ya no funciona (${r.detalle.toLowerCase()}). Si se libera, la película dejaría de verse.` });
        const archivo = p.video;
        actualizarPelicula(p.id, { video: p.videoOriginal, tamano: 0 });
        guardarEnlace(p.id, r);
        if (enR2(archivo)) await borrarObjeto(archivo.slice(3));
        else await borrarArchivoPropio(archivo);
        return json(res, 200, { pelicula: buscarPelicula(p.id) });
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
    // ---------- Resumen del negocio ----------
    if (ruta === '/resumen') {
      const cuentas = todasLasCuentas();
      const porPlan = {};
      let mensual = 0;
      for (const c of cuentas) {
        const plan = planEfectivo(c);
        porPlan[plan.id] = (porPlan[plan.id] || 0) + 1;
        if (plan.precio) mensual += plan.periodo === 'año' ? plan.precio / 12 : plan.precio;
      }
      const stats = campanas().reduce((t, c) => ({ impresiones: t.impresiones + c.stats.impresiones, clics: t.clics + c.stats.clics, completos: t.completos + c.stats.completos }), { impresiones: 0, clics: 0, completos: 0 });
      const hace30 = Date.now() - 30 * 86400000;
      return json(res, 200, {
        cuentas: cuentas.length, nuevas30: cuentas.filter((c) => c.alta > hace30).length, porPlan,
        ingresoMensual: Math.round(mensual), publicidad: stats, campanasActivas: campanas().filter((c) => c.activa).length,
        planes: listaPlanes(), modoPrueba: modoPrueba(),
        vistasPorDia: vistasPorDia(30),
        masVistas: todas().map((p) => ({ id: p.id, titulo: p.titulo, anio: p.anio, ...vistas(p.id) }))
          .filter((p) => p.recientes > 0).sort((a, b) => b.recientes - a.recientes).slice(0, 5),
        disco: await disco(),
        r2: await datosR2(),
        catalogo: {
          publicadas: todas().filter((p) => p.estado === 'publicada').length,
          enServidor: todas().filter((p) => p.video?.startsWith('videos/')).length,
          enR2: todas().filter((p) => enR2(p.video)).length,
          desdeLink: todas().filter((p) => esExterno(p.video) || p.embed).length,
          linksCaidos: todas().filter((p) => (esExterno(p.video) || p.embed) && estadoEnlace(p.id)?.ok === false).length,
        },
      });
    }

    // ---------- Suscriptores ----------
    if (ruta === '/cuentas') {
      return json(res, 200, {
        cuentas: todasLasCuentas().map((c) => ({
          id: c.id, email: c.email, nombre: c.nombre, alta: c.alta, plan: c.plan, estado: c.estado, vence: c.vence,
          planEfectivo: planEfectivo(c).id, pago: c.pago ? { proveedor: c.pago.proveedor, estado: c.pago.estado } : null,
        })),
      });
    }
    const mc = ruta.match(/^\/cuentas\/([a-f0-9]+)$/);
    if (mc && req.method === 'PUT') {
      // Cambio manual (por ejemplo, un pago por transferencia o una cortesía)
      const cuenta = buscarCuenta(mc[1]);
      if (!cuenta) return json(res, 404, { error: 'Esa cuenta no existe.' });
      const { plan, dias } = await leerJSON(req);
      activarPlan(cuenta, plan, { vence: plan === 'gratis' ? null : Date.now() + Math.min(Math.max(Number(dias) || 30, 1), 3660) * 86400000, pago: { proveedor: 'manual', estado: 'autorizada' } });
      guardarCuentas();
      return json(res, 200, { ok: true });
    }

    // ---------- Planes y precios ----------
    if (ruta === '/planes' && req.method === 'PUT') {
      const { planes } = await leerJSON(req);
      return json(res, 200, { planes: await guardarPlanes(Array.isArray(planes) ? planes : []) });
    }

    // ---------- Publicidad ----------
    if (ruta === '/publicidad' && req.method === 'GET') return json(res, 200, { campanas: campanas() });
    if (ruta === '/publicidad' && req.method === 'POST') return json(res, 200, { campana: crearCampana((await leerJSON(req)).datos || {}) });
    const mp = ruta.match(/^\/publicidad\/([a-z0-9-]+)(\/pieza)?$/);
    if (mp) {
      const c = buscarCampana(mp[1]);
      if (!c) return json(res, 404, { error: 'Esa campaña no existe.' });
      if (!mp[2] && req.method === 'PUT') return json(res, 200, { campana: actualizarCampana(c.id, (await leerJSON(req)).datos || {}) });
      if (!mp[2] && req.method === 'DELETE') {
        quitarCampana(c.id);
        if (c.pieza) await rm(path.join(CARPETA_PIEZAS, path.basename(c.pieza)), { force: true });
        return json(res, 200, { ok: true });
      }
      if (mp[2] && req.method === 'DELETE') {
        const { anterior } = ponerPieza(c.id, null, null);
        if (anterior) await rm(path.join(CARPETA_PIEZAS, path.basename(anterior)), { force: true });
        return json(res, 200, { campana: buscarCampana(c.id) });
      }
      if (mp[2] && req.method === 'PUT') {
        // La pieza (imagen o video) llega entera en el cuerpo
        const tipo = (req.headers['content-type'] || '').split(';')[0];
        const ext = EXT_IMAGEN[tipo] || EXT_VIDEO[tipo];
        if (!ext) return json(res, 415, { error: 'La pieza tiene que ser una imagen (JPG, PNG, WebP) o un video (MP4, WebM).' });
        const archivo = nombreArchivo(c.id, ext);
        const parcial = path.join(CARPETA_PIEZAS, `${archivo}.parcial`);
        const salida = createWriteStream(parcial);
        let total = 0;
        try {
          for await (const parte of req) {
            total += parte.length;
            if (total > 200 * 1024 ** 2) throw new Error('La pieza es demasiado grande (máximo 200 MB).');
            if (!salida.write(parte)) await once(salida, 'drain');
          }
          salida.end();
          await once(salida, 'finish');
          await rename(parcial, path.join(CARPETA_PIEZAS, archivo));
        } catch (e) {
          salida.destroy();
          await rm(parcial, { force: true });
          return json(res, 400, { error: e.message });
        }
        const { campana, anterior } = ponerPieza(c.id, `anuncios/${archivo}`, EXT_IMAGEN[tipo] ? 'imagen' : 'video');
        if (anterior) await rm(path.join(CARPETA_PIEZAS, path.basename(anterior)), { force: true });
        return json(res, 200, { campana });
      }
    }
    return json(res, 404, { error: 'No existe.' });
  } catch (e) {
    return json(res, e instanceof ErrorImportar ? 422 : 400, { error: e.message || 'Error' });
  }
}
