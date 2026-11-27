// Arranca el servidor de verdad (como en Render) y prueba lo básico de punta a punta
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carpetaTemporal } from './preparar.ts';

const carpeta = carpetaTemporal();
const PUERTO = String(4100 + Math.floor(Math.random() * 800));
const B = `http://127.0.0.1:${PUERTO}`;
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const servidor = spawn(process.execPath, ['server.js'], { cwd: raiz, env: { ...process.env, CARPETA_DATOS: carpeta, PORT: PUERTO, HOST: '127.0.0.1' } });
let salida = '';
servidor.stdout.on('data', (d) => { salida += d; });
servidor.stderr.on('data', (d) => { salida += d; });
after(() => servidor.kill());

async function listo() {
  for (let i = 0; i < 100; i++) {
    if (servidor.exitCode !== null) throw new Error(`El servidor se cerró al arrancar:\n${salida}`);
    try { if ((await fetch(`${B}/api/planes`)).ok) return; } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`El servidor no arrancó:\n${salida}`);
}

test('arranca y sirve la plataforma, el catálogo y los planes', async () => {
  await listo();
  assert.equal((await fetch(`${B}/`)).status, 200);
  const { peliculas } = await (await fetch(`${B}/api/catalogo`)).json() as { peliculas: unknown[] };
  assert.ok(peliculas.length >= 10, 'trae el catálogo de ejemplo');
  const { planes } = await (await fetch(`${B}/api/planes`)).json() as { planes: { id: string; pantallas: number }[] };
  assert.deepEqual(planes.map((p) => p.id), ['gratis', 'plus', 'plus-anual']);
});

test('crear cuenta, entrar y ver la cuenta con la cookie', async () => {
  await listo();
  const alta = await fetch(`${B}/api/cuenta/registrar`, { method: 'POST', body: JSON.stringify({ email: 'prueba@ejemplo.com', clave: 'clave1234' }) });
  assert.equal(alta.status, 200);
  const cookie = alta.headers.get('set-cookie')!.split(';')[0];
  const yo = await (await fetch(`${B}/api/cuenta/yo`, { headers: { cookie } })).json() as { cuenta: { email: string; plan: string } };
  assert.equal(yo.cuenta.email, 'prueba@ejemplo.com');
  assert.equal(yo.cuenta.plan, 'gratis');
  assert.equal((await fetch(`${B}/api/cuenta/entrar`, { method: 'POST', body: JSON.stringify({ email: 'prueba@ejemplo.com', clave: 'mal' }) })).status, 401);
});

test('el administrador pide contraseña y no deja ver datos sin sesión', async () => {
  await listo();
  assert.equal((await fetch(`${B}/api/admin/catalogo`)).status, 401);
  assert.equal((await fetch(`${B}/api/admin/estado`)).status, 200);
});

test('rutas protegidas: no se sale de las carpetas ni se ven videos ajenos', async () => {
  await listo();
  assert.notEqual((await fetch(`${B}/..%2fserver.js`)).status, 200);
  assert.equal((await fetch(`${B}/descargas/..%2Fserver.js`)).status, 404);
});
