// Trappi Central · Trappi Tecnología
// Servidor en la nube que reúne la flota de cada empresa pesquera:
//  - Recibe las posiciones y alertas de cada barco (Trappi a bordo, por Starlink/4G) con su clave propia.
//  - La oficina entra con usuario y contraseña y ve su flota en tiempo real, con historial de recorridos.
//  - Cada barco recibe las posiciones de los demás barcos de SU empresa. Ninguna empresa ve la flota de otra.
//
// Administración (en la terminal del servidor):
//   node central.js empresa "Pesquera del Sur"                 → crea la empresa y muestra su código
//   node central.js usuario <empresa> <usuario>                → crea un usuario de oficina con contraseña nueva
//   node central.js buque <empresa> "Nombre del buque" [MMSI]  → registra un barco y muestra su clave (TRAPPI_TOKEN)
//   node central.js listar                                     → empresas, usuarios y barcos
//   node central.js                                            → arranca el servidor
import http from 'node:http';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distNM } from './public/navegacion.js';
import { abrirEventos, cargarEnv, leerJSON, posicionValida, responderJSON, servirArchivo } from './comun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
cargarEnv(path.join(__dirname, '.env.central'));

const PORT = Number(process.env.PORT) || 3100;
const CARPETA = process.env.CARPETA_DATOS || path.join(__dirname, 'datos-central');
const ARCHIVO_CUENTAS = path.join(CARPETA, 'cuentas.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const HORAS_SESION = 12;
const MINUTOS_ESTELA = 180;
mkdirSync(CARPETA, { recursive: true });

// ---------- Cuentas ----------
let cuentas = existsSync(ARCHIVO_CUENTAS) ? JSON.parse(readFileSync(ARCHIVO_CUENTAS, 'utf8')) : { empresas: [] };
const guardarCuentas = () => writeFileSync(ARCHIVO_CUENTAS, JSON.stringify(cuentas, null, 2), { mode: 0o600 });

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const id = () => crypto.randomBytes(6).toString('hex');
function hashClave(clave, sal = crypto.randomBytes(16).toString('hex')) {
  return { sal, hash: crypto.scryptSync(clave, sal, 64).toString('hex') };
}
function claveCorrecta(clave, u) {
  const calculado = crypto.scryptSync(clave, u.sal, 64);
  return crypto.timingSafeEqual(calculado, Buffer.from(u.hash, 'hex'));
}
const buscarEmpresa = (codigo) => cuentas.empresas.find((e) => e.id === codigo || e.nombre.toLowerCase() === String(codigo).toLowerCase());

function indiceBuques() {
  const porToken = new Map();
  for (const e of cuentas.empresas) for (const b of e.buques) porToken.set(b.tokenHash, { empresa: e, buque: b });
  return porToken;
}

// ---------- Comandos de administración ----------
const [comando, ...args] = process.argv.slice(2);
if (comando) {
  administrar(comando, args);
  process.exit(0);
}

function administrar(cmd, a) {
  if (cmd === 'empresa' && a[0]) {
    const e = { id: id(), nombre: a[0], usuarios: [], buques: [] };
    cuentas.empresas.push(e);
    guardarCuentas();
    console.log(`Empresa creada: ${e.nombre}\nCódigo: ${e.id}`);
  } else if (cmd === 'usuario' && a[1]) {
    const e = buscarEmpresa(a[0]);
    if (!e) return console.error('No existe esa empresa');
    if (e.usuarios.some((u) => u.usuario === a[1])) return console.error('Ese usuario ya existe');
    const clave = crypto.randomBytes(9).toString('base64url');
    e.usuarios.push({ usuario: a[1], ...hashClave(clave) });
    guardarCuentas();
    console.log(`Usuario de oficina creado en ${e.nombre}\nUsuario: ${a[1]}\nContraseña: ${clave}\n(Guardala ahora: no se vuelve a mostrar.)`);
  } else if (cmd === 'buque' && a[1]) {
    const e = buscarEmpresa(a[0]);
    if (!e) return console.error('No existe esa empresa');
    const token = `trp_${crypto.randomBytes(24).toString('base64url')}`;
    const mmsi = a[2] && /^\d{9}$/.test(a[2]) ? Number(a[2]) : null;
    e.buques.push({ id: id(), nombre: a[1].toUpperCase(), mmsi, tokenHash: sha256(token) });
    guardarCuentas();
    console.log(`Buque registrado en ${e.nombre}: ${a[1].toUpperCase()}${mmsi ? ` (MMSI ${mmsi})` : ''}\n` +
      `Poné esto en el .env de la PC del barco:\nTRAPPI_TOKEN=${token}\n(Guardalo ahora: no se vuelve a mostrar.)`);
  } else if (cmd === 'listar') {
    for (const e of cuentas.empresas) {
      console.log(`\n${e.nombre} (código ${e.id})`);
      console.log(`  Usuarios: ${e.usuarios.map((u) => u.usuario).join(', ') || '—'}`);
      for (const b of e.buques) console.log(`  Buque: ${b.nombre}${b.mmsi ? ` · MMSI ${b.mmsi}` : ''} · id ${b.id}`);
    }
  } else {
    console.log('Comandos: empresa <nombre> · usuario <empresa> <usuario> · buque <empresa> <nombre> [mmsi] · listar');
  }
}

// ---------- Estado de la flota ----------
const estado = new Map(); // buque.id → { lat, lon, sog, cog, hora, estela: [[lat, lon, hora]], sos }
const carpetaHistorial = (e, b) => path.join(CARPETA, 'historial', e.id, b.id);
const dia = (ms) => new Date(ms).toISOString().slice(0, 10);

// Al arrancar, recupera la última posición y la estela de cada barco desde el historial
for (const e of cuentas.empresas) {
  for (const b of e.buques) {
    const carpeta = carpetaHistorial(e, b);
    if (!existsSync(carpeta)) continue;
    const archivos = readdirSync(carpeta).sort().slice(-2);
    const puntos = archivos.flatMap((f) => readFileSync(path.join(carpeta, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const ultimo = puntos.at(-1);
    if (!ultimo) continue;
    const desde = Date.now() - MINUTOS_ESTELA * 60000;
    estado.set(b.id, { hora: ultimo[0], lat: ultimo[1], lon: ultimo[2], sog: ultimo[3], cog: ultimo[4],
      estela: puntos.filter((p) => p[0] >= desde).map((p) => [p[1], p[2], p[0]]), sos: null });
  }
}

function registrarPosicion(e, b, p) {
  const actual = estado.get(b.id) || { estela: [], sos: null };
  if (actual.hora && p.hora <= actual.hora) return false; // repetida o más vieja que la última
  // Posición imposible (más de 60 nudos desde la anterior): error del GPS, se descarta
  if (actual.hora && distNM(actual, p) > 0.5 && distNM(actual, p) / Math.max((p.hora - actual.hora) / 3600000, 1 / 3600) > 60) return false;
  Object.assign(actual, { lat: p.lat, lon: p.lon, sog: p.sog, cog: p.cog, hora: p.hora });
  const ultimaEstela = actual.estela.at(-1);
  if (!ultimaEstela || p.hora - ultimaEstela[2] >= 60000) actual.estela.push([p.lat, p.lon, p.hora]);
  const limite = Date.now() - MINUTOS_ESTELA * 60000;
  while (actual.estela.length && actual.estela[0][2] < limite) actual.estela.shift();
  estado.set(b.id, actual);
  const carpeta = carpetaHistorial(e, b);
  mkdirSync(carpeta, { recursive: true });
  appendFile(path.join(carpeta, `${dia(p.hora)}.jsonl`), `${JSON.stringify([p.hora, p.lat, p.lon, p.sog, p.cog])}\n`).catch(() => {});
  return true;
}

function datosFlota(empresa, excluir = null) {
  return empresa.buques.filter((b) => b.id !== excluir).flatMap((b) => {
    const s = estado.get(b.id);
    if (!s?.hora) return [];
    return [{ id: b.id, mmsi: b.mmsi || `trappi-${b.id}`, nombre: b.nombre, lat: s.lat, lon: s.lon, sog: s.sog, cog: s.cog,
      hora: s.hora, actualizado: s.hora, estela: s.estela.map(([la, lo]) => [la, lo]), sos: s.sos, flota: true }];
  });
}

// ---------- Sesiones de oficina ----------
const sesiones = new Map(); // id → { empresaId, usuario, expira }
const fallosLogin = new Map(); // ip → { n, desde }

function sesionDe(req) {
  const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('trappi_sesion='));
  const s = cookie && sesiones.get(cookie.slice('trappi_sesion='.length));
  if (!s || s.expira < Date.now()) return null;
  const empresa = cuentas.empresas.find((e) => e.id === s.empresaId);
  return empresa ? { ...s, empresa } : null;
}

function cookieSesion(req, valor, maxAge) {
  const segura = process.env.HTTPS === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `trappi_sesion=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${segura ? '; Secure' : ''}`;
}

const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function bloqueado(ip) {
  const f = fallosLogin.get(ip);
  if (!f || Date.now() - f.desde > 15 * 60000) return false;
  return f.n >= 10;
}
function registrarFallo(ip) {
  const f = fallosLogin.get(ip);
  if (!f || Date.now() - f.desde > 15 * 60000) fallosLogin.set(ip, { n: 1, desde: Date.now() });
  else f.n++;
}

// ---------- HTTP ----------
function buqueDe(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
  return m ? indiceBuques().get(sha256(m[1])) : null;
}

async function api(req, res, url) {
  const ruta = url.pathname;

  // --- Barcos (Trappi a bordo) ---
  if (ruta.startsWith('/api/flota')) {
    const quien = buqueDe(req);
    if (!quien) return responderJSON(res, 401, { error: 'clave de buque inválida' });
    const { empresa, buque } = quien;
    if (ruta === '/api/flota' && req.method === 'GET') {
      return responderJSON(res, 200, { buque: { id: buque.id, nombre: buque.nombre }, flota: datosFlota(empresa, buque.id) });
    }
    if (ruta === '/api/flota/posiciones' && req.method === 'POST') {
      const { posiciones } = await leerJSON(req, 2_000_000);
      if (!Array.isArray(posiciones)) return responderJSON(res, 400, { error: 'faltan posiciones' });
      let aceptadas = 0;
      const ahora = Date.now();
      for (const p of posiciones.slice(0, 1000).sort((x, y) => x.hora - y.hora)) {
        if (!posicionValida(p) || !Number.isFinite(p.hora) || p.hora > ahora + 5 * 60000 || p.hora < ahora - 30 * 86400000) continue;
        const limpia = { lat: p.lat, lon: p.lon, hora: p.hora, sog: Number.isFinite(p.sog) ? p.sog : null, cog: Number.isFinite(p.cog) ? p.cog : null };
        if (registrarPosicion(empresa, buque, limpia)) aceptadas++;
      }
      return responderJSON(res, 200, { ok: true, recibidas: posiciones.length, aceptadas });
    }
    if (ruta === '/api/flota/alerta' && req.method === 'POST') {
      const a = await leerJSON(req, 20000);
      const tipo = ['MOB', 'MAYDAY', 'PANPAN', 'FIN'].includes(a.alerta) ? a.alerta : null;
      if (!tipo) return responderJSON(res, 400, { error: 'alerta inválida' });
      const s = estado.get(buque.id) || { estela: [], sos: null };
      const registro = { alerta: tipo, hora: Number.isFinite(a.hora) ? a.hora : Date.now(), texto: String(a.texto || '').slice(0, 2000),
        ...(posicionValida(a) ? { lat: a.lat, lon: a.lon } : {}) };
      s.sos = tipo === 'FIN' ? null : registro;
      estado.set(buque.id, s);
      appendFile(path.join(CARPETA, 'alertas.jsonl'), `${JSON.stringify({ empresa: empresa.id, buque: buque.id, nombre: buque.nombre, ...registro })}\n`).catch(() => {});
      console.log(`🆘 ${empresa.nombre} · ${buque.nombre}: ${tipo}`);
      return responderJSON(res, 200, { ok: true });
    }
    return responderJSON(res, 404, { error: 'no existe' });
  }

  // --- Oficina ---
  if (ruta === '/api/login' && req.method === 'POST') {
    const ip = ipDe(req);
    if (bloqueado(ip)) return responderJSON(res, 429, { error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' });
    const { usuario, clave } = await leerJSON(req, 5000);
    for (const e of cuentas.empresas) {
      const u = e.usuarios.find((x) => x.usuario === usuario);
      if (u && typeof clave === 'string' && claveCorrecta(clave, u)) {
        const sid = crypto.randomBytes(32).toString('base64url');
        sesiones.set(sid, { empresaId: e.id, usuario, expira: Date.now() + HORAS_SESION * 3600000 });
        return responderJSON(res, 200, { ok: true, empresa: e.nombre }, { 'Set-Cookie': cookieSesion(req, sid, HORAS_SESION * 3600) });
      }
    }
    registrarFallo(ip);
    return responderJSON(res, 401, { error: 'Usuario o contraseña incorrectos' });
  }

  const sesion = sesionDe(req);
  if (ruta === '/api/logout' && req.method === 'POST') {
    const cookie = (req.headers.cookie || '').match(/trappi_sesion=([^;]+)/);
    if (cookie) sesiones.delete(cookie[1]);
    return responderJSON(res, 200, { ok: true }, { 'Set-Cookie': cookieSesion(req, '', 0) });
  }
  if (!sesion) return responderJSON(res, 401, { error: 'Iniciá sesión' });

  if (ruta === '/api/config') {
    return responderJSON(res, 200, { rol: 'central', empresa: sesion.empresa.nombre, usuario: sesion.usuario, buques: sesion.empresa.buques.length });
  }
  if (ruta === '/api/buques') {
    abrirEventos(res);
    const enviar = () => {
      const s = sesionDe(req);
      if (!s) { res.end(); return; }
      const buques = datosFlota(s.empresa);
      const ultimo = Math.max(0, ...buques.map((b) => b.hora));
      res.write(`data: ${JSON.stringify({ modo: 'flota', conectado: true, ahora: Date.now(), buques,
        fuentes: [{ nombre: `Flota ${s.empresa.nombre} (${buques.length} de ${s.empresa.buques.length} barcos con posición)`, conectado: true, ultimo: ultimo || null, mensajes: buques.length }] })}\n\n`);
    };
    enviar();
    const intervalo = setInterval(enviar, 3000);
    req.on('close', () => clearInterval(intervalo));
    return;
  }
  if (ruta === '/api/historial') {
    const buque = sesion.empresa.buques.find((b) => b.id === url.searchParams.get('buque'));
    if (!buque) return responderJSON(res, 404, { error: 'buque no encontrado' });
    const horas = Math.min(Math.max(Number(url.searchParams.get('horas')) || 24, 1), 24 * 31);
    const desde = Date.now() - horas * 3600000;
    const carpeta = carpetaHistorial(sesion.empresa, buque);
    let puntos = [];
    if (existsSync(carpeta)) {
      for (const f of readdirSync(carpeta).sort().filter((f) => f.slice(0, 10) >= dia(desde))) {
        const lineas = (await readFile(path.join(carpeta, f), 'utf8')).trim().split('\n').filter(Boolean);
        for (const l of lineas) {
          const p = JSON.parse(l);
          if (p[0] >= desde) puntos.push([p[1], p[2], p[0]]);
        }
      }
    }
    if (puntos.length > 5000) puntos = puntos.filter((_, i) => i % Math.ceil(puntos.length / 5000) === 0);
    return responderJSON(res, 200, { buque: buque.nombre, horas, puntos });
  }
  return responderJSON(res, 404, { error: 'no existe' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    // La carta de la oficina solo se ve con sesión iniciada
    if ((url.pathname === '/' || url.pathname === '/index.html') && !sesionDe(req)) {
      res.writeHead(302, { Location: '/login.html' });
      return res.end();
    }
    return servirArchivo(res, PUBLIC_DIR, url.pathname);
  } catch (e) {
    return responderJSON(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  const barcos = cuentas.empresas.reduce((n, e) => n + e.buques.length, 0);
  console.log(`🛰  Trappi Central · Trappi Tecnología → http://localhost:${PORT}`);
  console.log(`   ${cuentas.empresas.length} empresas, ${barcos} barcos registrados. Datos en ${CARPETA}`);
});
