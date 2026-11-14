// Servidor de Cinetream: sirve la plataforma y los videos de la carpeta videos/.
// Los videos se sirven por partes (HTTP Range), así se puede adelantar sin descargar el archivo entero.
// Sin dependencias: solo módulos nativos de Node.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3500;
// 0.0.0.0: también la pueden abrir la tele y el celular conectados a la misma red wifi
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const VIDEOS_DIR = path.join(__dirname, 'videos');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
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
    if (url.pathname.startsWith('/videos/')) {
      const archivo = dentroDe(VIDEOS_DIR, url.pathname.slice('/videos/'.length));
      if (!archivo) { res.writeHead(403, SEGURIDAD); return res.end(); }
      return await servirVideo(req, res, archivo);
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
  // Direcciones para abrirla desde la tele o el celular en la misma red
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const red of lista || []) {
      if (red.family === 'IPv4' && !red.internal) console.log(`   En la tele o el celular (misma wifi): http://${red.address}:${PORT}`);
    }
  }
});
