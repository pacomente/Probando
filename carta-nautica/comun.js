// Código compartido por Trappi a bordo (server.js) y Trappi Central (central.js).
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Carga simple de un archivo .env (clave=valor) sin pisar variables ya definidas
export function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const line of readFileSync(archivo, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

export async function servirArchivo(res, carpeta, ruta) {
  const archivo = path.normalize(path.join(carpeta, ruta === '/' ? 'index.html' : ruta));
  if (!archivo.startsWith(carpeta + path.sep)) {
    res.writeHead(403, SEGURIDAD);
    return res.end();
  }
  try {
    const contenido = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEGURIDAD });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD });
    res.end('No encontrado');
  }
}

export function responderJSON(res, estado, datos, cabeceras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD, ...cabeceras });
  res.end(JSON.stringify(datos));
}

// Lee un cuerpo JSON con límite de tamaño (para que nadie pueda llenar la memoria del servidor)
export function leerJSON(req, limite = 1_000_000) {
  return new Promise((resolver, rechazar) => {
    let total = 0;
    const partes = [];
    req.on('data', (d) => {
      total += d.length;
      if (total > limite) { rechazar(new Error('demasiado grande')); req.destroy(); return; }
      partes.push(d);
    });
    req.on('end', () => {
      try { resolver(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { rechazar(new Error('JSON inválido')); }
    });
    req.on('error', rechazar);
  });
}

export function abrirEventos(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...SEGURIDAD });
}

// Valida una posición recibida de afuera
export function posicionValida(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}
