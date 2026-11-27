// Servidor de Cinetream: sirve la plataforma, el catálogo, las portadas y los videos de la carpeta videos/.
// Los videos se sirven por partes (HTTP Range), así se puede adelantar sin descargar el archivo entero.
// El administrador (/admin.html) solo se abre desde esta misma PC, salvo que se configure ADMIN_DESDE_RED=1.
// Sin dependencias: solo módulos nativos de Node.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarPelicula, CARPETA_PORTADAS, CARPETA_VIDEOS, publicadas } from './datos.js';
import { rutasAdmin, sesionValida } from './admin.js';
import { linkReproduccion, r2Configurado } from './r2.js';
import { rutasCuenta } from './rutas-cuenta.js';
import { cuentaDe, planEfectivo } from './cuentas.js';
import { CARPETA_PIEZAS } from './publicidad.js';
import { modoPrueba } from './pagos.js';
import { esLocal, ipCliente } from './red.js';
import { registrarVista } from './estadisticas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3500;
// 0.0.0.0: también la pueden abrir la tele y el celular conectados a la misma red wifi
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const VIDEOS_DIR = CARPETA_VIDEOS;
const DESCARGAS_DIR = process.env.CARPETA_DESCARGAS || path.join(__dirname, 'descargas'); // APK de la app para Android
// Si el APK no está en el servidor, se ofrece desde otro lado (por ejemplo las Releases de GitHub)
const DESCARGAS_URL = (process.env.DESCARGAS_URL || '').replace(/\/$/, '');
const ADMIN_DESDE_RED = process.env.ADMIN_DESDE_RED === '1';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};
const SEGURIDAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

// Ruta dentro de una carpeta, sin permitir salir de ella (../)
function dentroDe(carpeta, ruta) {
  const archivo = path.normalize(path.join(carpeta, decodeURIComponent(ruta)));
  return archivo.startsWith(carpeta + path.sep) ? archivo : null;
}

async function servirVideo(req, res, archivo) {
  const info = await stat(archivo);
  const tipo = TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
  const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!rango) {
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', ...SEGURIDAD });
    return createReadStream(archivo).pipe(res);
  }
  let inicio = rango[1] === '' ? info.size - Number(rango[2]) : Number(rango[1]);
  let fin = rango[1] !== '' && rango[2] !== '' ? Number(rango[2]) : info.size - 1;
  fin = Math.min(fin, info.size - 1, inicio + 8 * 1024 * 1024 - 1); // de a 8 MB
  if (inicio < 0 || inicio > fin) {
    res.writeHead(416, { 'Content-Range': `bytes */${info.size}`, ...SEGURIDAD });
    return res.end();
  }
  res.writeHead(206, {
    'Content-Type': tipo,
    'Content-Length': fin - inicio + 1,
    'Content-Range': `bytes ${inicio}-${fin}/${info.size}`,
    'Accept-Ranges': 'bytes',
    ...SEGURIDAD,
  });
  createReadStream(archivo, { start: inicio, end: fin }).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Catálogo público: solo las películas publicadas
    // Catálogo público: solo las películas publicadas. Los títulos Plus llegan sin su video a quien no es Plus
    if (url.pathname === '/api/catalogo') {
      const plus = planEfectivo(cuentaDe(req)).plus;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD });
      return res.end(JSON.stringify({ peliculas: publicadas().map(({ fuente, estado, videoOriginal, tamano, streamhg, ...p }) => (p.plus && !plus ? { ...p, video: null, embed: null, bloqueada: true }
        : /^r2:/.test(p.video) ? { ...p, video: `r2/${p.id}` } : p)) }));
    }
    // Cuenta, planes, pagos y publicidad
    // Videos en Cloudflare R2: se reenvía a un link firmado que vence solo (el bucket no es público)
    if (url.pathname.startsWith('/r2/')) {
      const peli = buscarPelicula(url.pathname.slice(4));
      const admin = sesionValida(req);
      if (!peli || !/^r2:/.test(peli.video) || (peli.estado !== 'publicada' && !admin)) { res.writeHead(404, SEGURIDAD); return res.end(); }
      if (peli.plus && !admin && !planEfectivo(cuentaDe(req)).plus) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD });
        return res.end('Este título es solo para suscriptores Plus.');
      }
      res.writeHead(302, { Location: linkReproduccion(peli.video.slice(3)), 'Cache-Control': 'no-store', ...SEGURIDAD });
      return res.end();
    }
    // Una reproducción (la manda la plataforma cuando arranca una película)
    if (url.pathname === '/api/vista' && req.method === 'POST') {
      let cuerpo = '';
      for await (const parte of req) { cuerpo += parte; if (cuerpo.length > 500) break; }
      const id = String((() => { try { return JSON.parse(cuerpo).id; } catch { return ''; } })() || '');
      if (publicadas().some((p) => p.id === id)) registrarVista(id, cuentaDe(req)?.id || ipCliente(req));
      res.writeHead(204, SEGURIDAD);
      return res.end();
    }
    if (/^\/api\/(cuenta|planes|anuncios|pagos|pantallas)(\/|$)/.test(url.pathname)) return await rutasCuenta(req, res, url);
    if (url.pathname.startsWith('/anuncios/')) {
      const archivo = dentroDe(CARPETA_PIEZAS, url.pathname.slice('/anuncios/'.length));
      if (!archivo) { res.writeHead(403, SEGURIDAD); return res.end(); }
      if (/\.(mp4|webm|m4v|mov)$/i.test(archivo)) return await servirVideo(req, res, archivo);
      const contenido = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...SEGURIDAD });
      return res.end(contenido);
    }
    // Administrador
    if (url.pathname.startsWith('/api/admin/') || url.pathname === '/admin.html') {
      if (!ADMIN_DESDE_RED && !esLocal(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD });
        return res.end('El administrador de Cinetream solo se abre desde la PC donde está instalado (o con ADMIN_DESDE_RED=1).');
      }
      if (url.pathname !== '/admin.html') return await rutasAdmin(req, res, url);
    }
    if (url.pathname.startsWith('/portadas/')) {
      const archivo = dentroDe(CARPETA_PORTADAS, url.pathname.slice('/portadas/'.length));
      if (!archivo) { res.writeHead(403, SEGURIDAD); return res.end(); }
      const contenido = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...SEGURIDAD });
      return res.end(contenido);
    }
    if (url.pathname.startsWith('/videos/')) {
      const archivo = dentroDe(VIDEOS_DIR, url.pathname.slice('/videos/'.length));
      if (!archivo) { res.writeHead(403, SEGURIDAD); return res.end(); }
      // Los títulos Plus solo se sirven a cuentas Plus: el bloqueo es en el servidor, no solo en la pantalla
      const ruta = `videos/${path.basename(archivo)}`;
      const peli = publicadas().find((p) => p.video === ruta);
      if (peli?.plus && !planEfectivo(cuentaDe(req)).plus) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD });
        return res.end('Este título es solo para suscriptores Plus.');
      }
      return await servirVideo(req, res, archivo);
    }
    if (url.pathname === '/api/descargas') {
      // Qué APK hay para bajar: descargas/cinetream-celular.apk y descargas/cinetream-tele.apk
      const apps = {};
      for (const tipo of ['celular', 'tele']) {
        const info = await stat(path.join(DESCARGAS_DIR, `cinetream-${tipo}.apk`)).catch(() => null);
        apps[tipo] = info ? { url: `/descargas/cinetream-${tipo}.apk`, tamano: info.size, fecha: info.mtimeMs }
          : DESCARGAS_URL ? { url: `${DESCARGAS_URL}/cinetream-${tipo}.apk` } : null;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD });
      return res.end(JSON.stringify(apps));
    }
    if (url.pathname.startsWith('/descargas/')) {
      const archivo = dentroDe(DESCARGAS_DIR, url.pathname.slice('/descargas/'.length));
      if (!archivo || !archivo.endsWith('.apk')) { res.writeHead(404, SEGURIDAD); return res.end(); }
      const info = await stat(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS['.apk'], 'Content-Length': info.size, 'Content-Disposition': `attachment; filename="${path.basename(archivo)}"`, 'Cache-Control': 'no-cache', ...SEGURIDAD });
      return createReadStream(archivo).pipe(res);
    }
    const archivo = dentroDe(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!archivo) { res.writeHead(403, SEGURIDAD); return res.end(); }
    const contenido = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEGURIDAD });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD });
    res.end('No encontrado');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🎬 Cinetream → http://localhost:${PORT}`);
  console.log(`   Administrador (desde esta PC) → http://localhost:${PORT}/admin.html`);
  console.log(modoPrueba()
    ? '   Pagos: MODO PRUEBA (no se cobra). Para cobrar, configurá MP_ACCESS_TOKEN de Mercado Pago.'
    : '   Pagos: Mercado Pago activo.');
  console.log(r2Configurado() ? `   Videos: Cloudflare R2 (bucket ${process.env.R2_BUCKET})` : '   Videos: en el disco o desde links (Cloudflare R2 sin configurar).');
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`   En internet: ${process.env.RENDER_EXTERNAL_URL} (administrador: ${process.env.RENDER_EXTERNAL_URL}/admin.html)`);
    return;
  }
  // Direcciones para abrirla desde la tele o el celular en la misma red
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const red of lista || []) {
      if (red.family === 'IPv4' && !red.internal) console.log(`   En la tele o el celular (misma wifi): http://${red.address}:${PORT}`);
    }
  }
});
