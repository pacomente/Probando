// Servidor de la Carta Náutica de Bahía Blanca: sirve la página y retransmite los buques.
// Fuentes AIS reales: aisstream.io por internet (AISSTREAM_API_KEY) y/o un receptor AIS a bordo
// por UDP (AIS_UDP_PORT) o TCP (AIS_TCP), que funciona sin internet. Sin ninguna, simula el tráfico.
// Sin dependencias externas: solo módulos nativos de Node (>= 22, que trae WebSocket).
import http from 'node:http';
import dgram from 'node:dgram';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegistroBuques } from './public/registro.js';
import { crearSimulacion } from './public/simulacion.js';
import { checksumValido, crearDecodificador } from './ais-nmea.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga simple de .env (clave=valor) si existe
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = (process.env.AISSTREAM_API_KEY || '').trim();
const UDP_PORT = Number(process.env.AIS_UDP_PORT) || null;
const TCP = (process.env.AIS_TCP || '').trim(); // host:puerto
// Zona que se escucha: toda la ría de Bahía Blanca y su acceso desde el mar
const ZONA = [[-39.6, -62.6], [-38.6, -60.9]];

const registro = new RegistroBuques();
const fuentes = {};
if (API_KEY && typeof WebSocket !== 'undefined') fuentes.internet = { nombre: 'aisstream.io (internet)', conectado: false, ultimo: null, mensajes: 0 };
if (UDP_PORT) fuentes.udp = { nombre: `Receptor a bordo (UDP ${UDP_PORT})`, conectado: false, ultimo: null, mensajes: 0, descartados: 0 };
if (TCP) fuentes.tcp = { nombre: `Receptor a bordo (TCP ${TCP})`, conectado: false, ultimo: null, mensajes: 0, descartados: 0 };
const modo = Object.keys(fuentes).length ? 'ais' : 'simulacion';
const recibido = (f) => { f.ultimo = Date.now(); f.mensajes++; };

// ---------- Datos AIS reales ----------
let espera = 2000;
function conectarAIS() {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    fuentes.internet.conectado = true;
    espera = 2000;
    console.log('⚓ Conectado a aisstream.io');
    ws.send(JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: [ZONA],
      FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData', 'StaticDataReport', 'SafetyBroadcastMessage'],
    }));
  };
  ws.onmessage = (evento) => {
    const texto = typeof evento.data === 'string' ? evento.data : Buffer.from(evento.data).toString('utf8');
    try {
      const msg = JSON.parse(texto);
      if (msg.error) return console.error('aisstream.io:', msg.error);
      procesarAIS(msg);
      recibido(fuentes.internet);
    } catch { /* mensaje no válido: se ignora */ }
  };
  ws.onclose = () => {
    fuentes.internet.conectado = false;
    console.log(`AIS desconectado; reintento en ${espera / 1000} s`);
    setTimeout(conectarAIS, espera);
    espera = Math.min(espera * 2, 60000);
  };
  ws.onerror = () => {};
}

function procesarAIS(msg) {
  const meta = msg.MetaData || {};
  const mmsi = meta.MMSI;
  const tipoMsg = msg.MessageType;
  const m = msg.Message?.[tipoMsg];
  if (!mmsi || !m) return;
  const nombre = limpiar(meta.ShipName);

  if (tipoMsg.endsWith('PositionReport')) {
    if (Math.abs(m.Latitude) > 90 || Math.abs(m.Longitude) > 180) return;
    registro.actualizar({
      mmsi, nombre, lat: m.Latitude, lon: m.Longitude,
      sog: m.Sog < 102.3 ? m.Sog : null,
      cog: m.Cog < 360 ? m.Cog : null,
      rumbo: m.TrueHeading < 360 ? m.TrueHeading : null,
      precision: m.PositionAccuracy ? 1 : 0,
      estado: tipoMsg === 'PositionReport' ? m.NavigationalStatus : null,
      claseB: tipoMsg !== 'PositionReport',
    });
  } else if (tipoMsg === 'ShipStaticData') {
    const d = m.Dimension || {};
    registro.actualizar({
      mmsi, nombre: limpiar(m.Name) || nombre, tipo: m.Type, destino: limpiar(m.Destination),
      callsign: limpiar(m.CallSign), imo: m.ImoNumber || null, calado: m.MaximumStaticDraught || null,
      eslora: d.A + d.B || null, manga: d.C + d.D || null, eta: eta(m.Eta),
    });
  } else if (tipoMsg === 'SafetyBroadcastMessage') {
    registro.actualizar({ mmsi, nombre, mensajeSeguridad: limpiar(m.Text), horaMensaje: Date.now() });
  } else if (tipoMsg === 'StaticDataReport') {
    const d = m.ReportB?.Dimension || {};
    registro.actualizar({
      mmsi, nombre: limpiar(m.ReportA?.Name) || nombre, tipo: m.ReportB?.ShipType || null,
      callsign: limpiar(m.ReportB?.CallSign), eslora: d.A + d.B || null, manga: d.C + d.D || null,
    });
  }
}

const limpiar = (t) => (typeof t === 'string' ? t.replace(/@+/g, '').trim() : '') || null;
function eta(e) {
  if (!e || !e.Month || !e.Day) return null;
  const dosCifras = (n) => String(n).padStart(2, '0');
  return `${dosCifras(e.Day)}/${dosCifras(e.Month)} ${dosCifras(e.Hour % 24)}:${dosCifras(e.Minute % 60)} UTC`;
}

// ---------- Simulación ----------
function arrancarSimulacion() {
  const sim = crearSimulacion();
  let anterior = Date.now();
  setInterval(() => {
    const ahora = Date.now();
    sim.paso((ahora - anterior) / 1000);
    anterior = ahora;
    for (const b of sim.lista()) registro.actualizar(b);
  }, 1000);
}

// ---------- Receptor AIS a bordo (sin internet) ----------
function procesarNMEA(texto, fuente) {
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim().replace(/^\\[^\\]*\\/, '');
    if (!limpia) continue;
    if (/^!..VD[MO]/.test(limpia) && !checksumValido(limpia)) {
      fuente.descartados++; // sentencia corrupta: no se usa
      continue;
    }
    const datos = fuente.decodificar(limpia);
    if (datos) {
      registro.actualizar(datos);
      recibido(fuente);
    }
  }
}

function escucharUDP() {
  const f = fuentes.udp;
  f.decodificar = crearDecodificador();
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (msg) => procesarNMEA(msg.toString('latin1'), f));
  socket.on('error', (e) => console.error('UDP AIS:', e.message));
  socket.bind(UDP_PORT, () => { f.conectado = true; console.log(`📡 Escuchando AIS por UDP en el puerto ${UDP_PORT}`); });
}

function conectarTCP() {
  const f = fuentes.tcp;
  f.decodificar = crearDecodificador();
  const [host, puerto] = TCP.split(':');
  let resto = '';
  const socket = net.connect(Number(puerto), host, () => { f.conectado = true; console.log(`📡 Conectado al receptor AIS ${TCP}`); });
  socket.on('data', (d) => {
    const texto = resto + d.toString('latin1');
    const corte = texto.lastIndexOf('\n');
    resto = corte < 0 ? texto : texto.slice(corte + 1);
    if (corte >= 0) procesarNMEA(texto.slice(0, corte), f);
  });
  socket.on('error', () => {});
  socket.on('close', () => { f.conectado = false; setTimeout(conectarTCP, 5000); });
}

if (fuentes.internet) conectarAIS();
if (fuentes.udp) escucharUDP();
if (fuentes.tcp) conectarTCP();
if (modo === 'simulacion') {
  if (API_KEY) console.warn('Esta versión de Node no trae WebSocket: usa Node 22 o superior.');
  arrancarSimulacion();
}

function resumenFuentes() {
  return Object.values(fuentes).map(({ nombre, conectado, ultimo, mensajes, descartados }) => ({ nombre, conectado, ultimo, mensajes, descartados }));
}

// ---------- HTTP ----------
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function enviarBuques(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const enviar = () => {
    const buques = registro.lista().map(({ ultimaEstela, ...b }) => b);
    const lista = resumenFuentes();
    const conectado = modo === 'simulacion' || lista.some((f) => f.conectado && f.ultimo && Date.now() - f.ultimo < 120000);
    res.write(`data: ${JSON.stringify({ modo, conectado, fuentes: lista, ahora: Date.now(), buques })}\n\n`);
  };
  enviar();
  const intervalo = setInterval(enviar, 2000);
  req.on('close', () => clearInterval(intervalo));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/buques') return enviarBuques(req, res);

  const ruta = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!ruta.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const contenido = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(ruta)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`🧭 Carta Náutica de Bahía Blanca en http://localhost:${PORT}`);
  console.log(modo === 'ais' ? `   Fuentes AIS: ${resumenFuentes().map((f) => f.nombre).join(', ')}` : '   Modo: SIMULACIÓN (configurá AISSTREAM_API_KEY o AIS_UDP_PORT en .env para ver buques reales)');
});
