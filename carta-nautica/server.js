// Trappi a bordo · Trappi Tecnología
// Corre en la PC del puente: sirve la carta y junta los datos del barco.
//  - GPS y AIS del barco por puerto serie/USB (SERIAL), UDP (AIS_UDP_PORT) o TCP (AIS_TCP): funcionan sin internet.
//  - AIS de las estaciones en tierra por internet (AISSTREAM_API_KEY).
//  - Enlace con Trappi Central por Starlink/4G (TRAPPI_CENTRAL_URL + TRAPPI_TOKEN): envía la posición del barco
//    y las alertas a la oficina, y trae a los demás barcos de la empresa.
// Sin ninguna fuente, muestra buques SIMULADOS de práctica, marcados como tales.
import http from 'node:http';
import dgram from 'node:dgram';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegistroBuques } from './public/registro.js';
import { crearSimulacion } from './public/simulacion.js';
import { checksumValido, crearDecodificador, parsearRMC } from './ais-nmea.js';
import { crearEnlaceCentral } from './enlace-central.js';
import { abrirEventos, cargarEnv, leerJSON, posicionValida, responderJSON, servirArchivo } from './comun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
cargarEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1'; // solo esta PC; HOST=0.0.0.0 para verla desde otras pantallas del barco
const API_KEY = (process.env.AISSTREAM_API_KEY || '').trim();
const UDP_PORT = Number(process.env.AIS_UDP_PORT) || null;
const TCP = (process.env.AIS_TCP || '').trim(); // host:puerto
const SERIAL = (process.env.SERIAL || '').trim(); // COM3:4800,COM4:38400
const CENTRAL_URL = (process.env.TRAPPI_CENTRAL_URL || '').trim();
const TOKEN = (process.env.TRAPPI_TOKEN || '').trim();
const CARPETA_DATOS = process.env.CARPETA_DATOS || path.join(__dirname, 'datos');
// Zona que se escucha en aisstream.io: AIS_ZONA=latSur,lonOeste,latNorte,lonEste (por defecto, la ría de Bahía Blanca)
const ZONA = (() => {
  const v = (process.env.AIS_ZONA || '').split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? [[v[0], v[1]], [v[2], v[3]]] : [[-39.6, -62.6], [-38.6, -60.9]];
})();

const registro = new RegistroBuques();
const fuentes = {};
if (API_KEY && typeof WebSocket !== 'undefined') fuentes.internet = { nombre: 'aisstream.io (internet)', conectado: false, ultimo: null, mensajes: 0 };
if (UDP_PORT) fuentes.udp = { nombre: `Equipos del barco (UDP ${UDP_PORT})`, conectado: false, ultimo: null, mensajes: 0, descartados: 0 };
if (TCP) fuentes.tcp = { nombre: `Equipos del barco (TCP ${TCP})`, conectado: false, ultimo: null, mensajes: 0, descartados: 0 };
for (const def of SERIAL ? SERIAL.split(',') : []) {
  const [puerto, baudios] = def.trim().split(':');
  fuentes[`serie-${puerto}`] = { nombre: `Puerto ${puerto} (${baudios || 4800} baudios)`, puerto, baudios: Number(baudios) || 4800, conectado: false, ultimo: null, mensajes: 0, descartados: 0 };
}
const conCentral = Boolean(CENTRAL_URL && TOKEN);
// Nunca se mezclan buques simulados con datos reales
const modo = Object.keys(fuentes).length ? 'ais' : conCentral ? 'flota' : 'simulacion';
const recibido = (f) => { f.ultimo = Date.now(); f.mensajes++; };

// Posición del propio barco (GPS o AIS propio). Se usa en la carta, el MOB, el MAYDAY y se envía a la central
let propio = null;
function actualizarPropio(datos, origen) {
  if (!posicionValida(datos)) return;
  propio = { ...propio, ...datos, hora: Date.now(), origen };
}

// ---------- AIS de estaciones en tierra (internet) ----------
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

// ---------- Simulación (solo sin ninguna fuente real) ----------
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

// ---------- Equipos del barco: GPS y AIS (sin internet) ----------
function procesarNMEA(texto, fuente) {
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim().replace(/^\\[^\\]*\\/, '');
    if (!limpia) continue;
    if (/^[!$]/.test(limpia) && /\*[0-9A-Fa-f]{2}$/.test(limpia) && !checksumValido(limpia)) {
      fuente.descartados++; // sentencia corrupta: no se usa
      continue;
    }
    const gps = parsearRMC(limpia);
    if (gps) {
      actualizarPropio(gps, `GPS (${fuente.nombre})`);
      recibido(fuente);
      continue;
    }
    const datos = fuente.decodificar(limpia);
    if (!datos) continue;
    recibido(fuente);
    if (datos.propio) {
      // AIS propio (!AIVDO): da posición si no hay GPS más reciente, y el MMSI del barco
      const { propio: _, ...resto } = datos;
      if (!propio?.origen?.startsWith('GPS') || Date.now() - propio.hora > 10000) actualizarPropio(resto, 'AIS propio');
      else if (resto.mmsi) propio.mmsi = resto.mmsi;
    } else if (!propio?.mmsi || datos.mmsi !== propio.mmsi) {
      registro.actualizar(datos);
    }
  }
}

function lectorDeLineas(fuente) {
  let resto = '';
  return (d) => {
    const texto = resto + d.toString('latin1');
    const corte = texto.lastIndexOf('\n');
    resto = corte < 0 ? texto.slice(-2000) : texto.slice(corte + 1);
    if (corte >= 0) procesarNMEA(texto.slice(0, corte), fuente);
  };
}

function escucharUDP() {
  const f = fuentes.udp;
  f.decodificar = crearDecodificador();
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (msg) => procesarNMEA(msg.toString('latin1'), f));
  socket.on('error', (e) => console.error('UDP:', e.message));
  socket.bind(UDP_PORT, () => { f.conectado = true; console.log(`📡 Escuchando NMEA por UDP en el puerto ${UDP_PORT}`); });
}

function conectarTCP() {
  const f = fuentes.tcp;
  f.decodificar ??= crearDecodificador();
  const [host, puerto] = TCP.split(':');
  const socket = net.connect(Number(puerto), host, () => { f.conectado = true; console.log(`📡 Conectado a ${TCP}`); });
  socket.on('data', lectorDeLineas(f));
  socket.on('error', () => {});
  socket.on('close', () => { f.conectado = false; setTimeout(conectarTCP, 5000); });
}

// El puerto serie/USB necesita el paquete opcional "serialport" (npm install)
async function abrirSerie(f) {
  f.decodificar ??= crearDecodificador();
  let SerialPort;
  try {
    ({ SerialPort } = await import('serialport'));
  } catch {
    f.error = 'falta instalar el módulo serialport (ejecutá npm install)';
    console.error(`Puerto ${f.puerto}: ${f.error}`);
    return;
  }
  const puerto = new SerialPort({ path: f.puerto, baudRate: f.baudios, autoOpen: false });
  puerto.on('data', lectorDeLineas(f));
  puerto.on('close', () => { f.conectado = false; setTimeout(() => abrirSerie(f), 5000); });
  puerto.on('error', () => {});
  puerto.open((err) => {
    if (err) {
      f.error = err.message;
      setTimeout(() => abrirSerie(f), 5000);
      return;
    }
    f.conectado = true;
    f.error = null;
    console.log(`🔌 Leyendo ${f.puerto} a ${f.baudios} baudios`);
  });
}

// ---------- Enlace con Trappi Central (Starlink / 4G) ----------
const enlace = conCentral ? crearEnlaceCentral({
  url: CENTRAL_URL,
  token: TOKEN,
  carpetaDatos: CARPETA_DATOS,
  intervaloMs: (Number(process.env.TRAPPI_INTERVALO_SEG) || 60) * 1000,
  obtenerPropio: () => propio,
  alRecibirFlota(flota) {
    for (const b of flota) {
      if (!posicionValida(b)) continue;
      registro.actualizar({ ...b, mmsi: b.mmsi || `trappi-${b.id}`, flota: true });
    }
  },
}) : null;

if (fuentes.internet) conectarAIS();
if (fuentes.udp) escucharUDP();
if (fuentes.tcp) conectarTCP();
for (const f of Object.values(fuentes)) if (f.puerto) abrirSerie(f);
if (modo === 'simulacion') arrancarSimulacion();

function resumenFuentes() {
  const lista = Object.values(fuentes).map(({ nombre, conectado, ultimo, mensajes, descartados, error }) => ({ nombre, conectado, ultimo, mensajes, descartados, error }));
  if (enlace) {
    const e = enlace.estado;
    lista.push({ nombre: e.nombre, central: true, conectado: e.conectado, ultimo: e.ultimoEnvio, pendientes: e.pendientes, error: e.ultimoError });
  }
  return lista;
}

// ---------- HTTP ----------
const PUBLIC_DIR = path.join(__dirname, 'public');

function enviarBuques(req, res) {
  abrirEventos(res);
  const enviar = () => {
    const buques = registro.lista().filter((b) => !propio?.mmsi || b.mmsi !== propio.mmsi).map(({ ultimaEstela, saltos, ...b }) => b);
    const lista = resumenFuentes();
    const conectado = modo === 'simulacion' || lista.some((f) => f.conectado && f.ultimo && Date.now() - f.ultimo < 120000);
    const gps = propio && Date.now() - propio.hora < 60000 ? propio : null;
    res.write(`data: ${JSON.stringify({ modo, conectado, fuentes: lista, propio: gps, ahora: Date.now(), buques })}\n\n`);
  };
  enviar();
  const intervalo = setInterval(enviar, 2000);
  req.on('close', () => clearInterval(intervalo));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/buques') return enviarBuques(req, res);
  if (url.pathname === '/api/config') {
    return responderJSON(res, 200, { rol: 'abordo', central: conCentral, buque: enlace?.estado.buque || null });
  }
  if (url.pathname === '/api/alerta' && req.method === 'POST') {
    // MOB o MAYDAY marcados en la carta: se avisan a la oficina por la central
    try {
      const a = await leerJSON(req, 20000);
      const tipo = ['MOB', 'MAYDAY', 'PANPAN', 'FIN'].includes(a.tipo) ? a.tipo : null;
      if (!tipo) return responderJSON(res, 400, { error: 'tipo de alerta inválido' });
      const posicion = posicionValida(a) ? { lat: a.lat, lon: a.lon } : propio ? { lat: propio.lat, lon: propio.lon } : {};
      console.log(`🆘 Alerta ${tipo} marcada a bordo`);
      if (!enlace) return responderJSON(res, 200, { ok: true, enviada: false, motivo: 'sin enlace con Trappi Central' });
      enlace.alerta({ alerta: tipo, ...posicion, texto: String(a.texto || '').slice(0, 2000) });
      return responderJSON(res, 200, { ok: true, enviada: enlace.estado.conectado, pendientes: enlace.estado.pendientes });
    } catch (e) {
      return responderJSON(res, 400, { error: e.message });
    }
  }
  return servirArchivo(res, PUBLIC_DIR, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`🧭 Trappi a bordo · Trappi Tecnología → http://localhost:${PORT}`);
  if (modo === 'ais') console.log(`   Fuentes: ${resumenFuentes().map((f) => f.nombre).join(', ')}`);
  else if (modo === 'flota') console.log('   Sin fuentes AIS: se muestran solo los barcos de la flota desde Trappi Central');
  else console.log('   Modo: SIMULACIÓN (configurá el .env para ver datos reales)');
});
