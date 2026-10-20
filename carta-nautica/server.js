// Servidor de la Carta Náutica de Bahía Blanca: sirve la página y retransmite los buques.
// Con AISSTREAM_API_KEY recibe posiciones AIS reales de aisstream.io; sin clave, simula el tráfico.
// Sin dependencias externas: solo módulos nativos de Node (>= 22, que trae WebSocket).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegistroBuques } from './public/registro.js';
import { crearSimulacion } from './public/simulacion.js';

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
// Zona que se escucha: toda la ría de Bahía Blanca y su acceso desde el mar
const ZONA = [[-39.6, -62.6], [-38.6, -60.9]];

const registro = new RegistroBuques();
const estado = { modo: API_KEY && typeof WebSocket !== 'undefined' ? 'ais' : 'simulacion', conectado: false, ultimoMensaje: null };

// ---------- Datos AIS reales ----------
let espera = 2000;
function conectarAIS() {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    estado.conectado = true;
    espera = 2000;
    console.log('⚓ Conectado a aisstream.io');
    ws.send(JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: [ZONA],
      FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData', 'StaticDataReport'],
    }));
  };
  ws.onmessage = (evento) => {
    const texto = typeof evento.data === 'string' ? evento.data : Buffer.from(evento.data).toString('utf8');
    try {
      const msg = JSON.parse(texto);
      if (msg.error) return console.error('aisstream.io:', msg.error);
      procesarAIS(msg);
      estado.ultimoMensaje = Date.now();
    } catch { /* mensaje no válido: se ignora */ }
  };
  ws.onclose = () => {
    estado.conectado = false;
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

if (estado.modo === 'ais') conectarAIS();
else {
  if (API_KEY) console.warn('Esta versión de Node no trae WebSocket: usa Node 22 o superior. Arranco en simulación.');
  arrancarSimulacion();
}

// ---------- HTTP ----------
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function enviarBuques(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const enviar = () => {
    const buques = registro.lista().map(({ ultimaEstela, ...b }) => b);
    res.write(`data: ${JSON.stringify({ modo: estado.modo, conectado: estado.conectado, ultimoMensaje: estado.ultimoMensaje, ahora: Date.now(), buques })}\n\n`);
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(ruta)] || 'application/octet-stream' });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`🧭 Carta Náutica de Bahía Blanca en http://localhost:${PORT}`);
  console.log(estado.modo === 'ais' ? '   Modo: AIS en vivo (aisstream.io)' : '   Modo: SIMULACIÓN (pon AISSTREAM_API_KEY en .env para ver buques reales)');
});
