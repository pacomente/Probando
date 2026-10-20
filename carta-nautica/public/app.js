// Carta Náutica de Bahía Blanca: mapa, buques en movimiento, tiempo, mareas, alertas y emergencias.
// Funciona sin internet: la página queda guardada en el dispositivo (sw.js), la costa viene incluida
// (costa.js), el GPS y el MOB no necesitan red y el último pronóstico se guarda.
import { cpa, destino, distNM, rumbo, situacionRIPA } from './navegacion.js';
import { RegistroBuques } from './registro.js';
import { CANAL_PRINCIPAL, crearSimulacion } from './simulacion.js';
import { COSTA } from './costa.js';
import { PUERTOS } from './puertos.js';
import { alarma, crearGeneradorSocorro, crearMOB, emergencia, silenciarAlarma } from './emergencia.js';
import { $, esc, fmtPos, grados, guardar, hace, leer, leerJSON, num } from './util.js';

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const MINUTOS_VECTOR = 6;
const TCPA_MAX_MIN = 20;
const ESTIMA_MAX_MS = 3 * 60000; // más allá, no se adivina: se muestra la última posición recibida
const SENAL_VIEJA_MS = 6 * 60000; // sin señal hace más de esto: posición poco fiable
// Páginas de demostración: <meta name="trappi-modo" content="practica"> (a bordo) u "oficina" (Trappi Central simulada)
// También con ?demo=abordo u ?demo=oficina en la dirección (para abrirlas desde la portada demo.html)
const MODO_DEMO = document.querySelector('meta[name="trappi-modo"]')?.content
  || { abordo: 'practica', oficina: 'oficina' }[new URLSearchParams(location.search).get('demo')] || null;
if (MODO_DEMO) {
  const volver = document.createElement('a');
  volver.className = 'demo-volver';
  volver.href = document.querySelector('meta[name="trappi-demo-inicio"]')?.content || 'demo.html';
  volver.textContent = '← Demo';
  volver.title = 'Volver a la portada de la demostración';
  // Si se llegó desde la portada, se vuelve a ella tal cual (sirve también donde la dirección no se conoce)
  volver.addEventListener('click', (e) => {
    if (document.referrer && history.length > 1) { e.preventDefault(); history.back(); }
  });
  document.querySelector('.acciones').prepend(volver);
}
const PRACTICA = new URLSearchParams(location.search).has('practica') || MODO_DEMO === 'practica';
const DEMO_OFICINA = MODO_DEMO === 'oficina';

// Punto de referencia para distancias: el puerto o la ciudad costera más cercana
function referencia(p) {
  let mejor = PUERTOS[0];
  let d = Infinity;
  for (const q of PUERTOS) {
    const dq = distNM(q, p);
    if (dq < d) { d = dq; mejor = q; }
  }
  return { nombre: mejor.nombre, punto: mejor, d, r: rumbo(mejor, p) };
}
const desdeReferencia = (p) => { const r = referencia(p); return `${num(r.d)} MN al ${grados(r.r)} de ${r.nombre}`; };

const TIPOS = {
  emergencia: { color: '#ff0000', nombre: 'Emergencia (SART / MOB / EPIRB / SOS)' },
  flota: { color: '#7c5cff', nombre: 'Flota de la empresa' },
  carga: { color: '#2ecc71', nombre: 'Carga' },
  tanquero: { color: '#ff4d4f', nombre: 'Tanquero' },
  pasajeros: { color: '#3f8cff', nombre: 'Pasajeros' },
  pesca: { color: '#ff9f1a', nombre: 'Pesca' },
  servicio: { color: '#00d5e0', nombre: 'Práctico / autoridad / remolque' },
  recreo: { color: '#e056fd', nombre: 'Recreo / vela' },
  otro: { color: '#a0a8b0', nombre: 'Otro / sin datos' },
};

const ESTADOS_NAV = ['Navegando a motor', 'Fondeado', 'Sin gobierno', 'Maniobra restringida', 'Restringido por calado',
  'Amarrado', 'Varado', 'Pescando', 'Navegando a vela', 'Reservado', 'Reservado', 'Remolcando a popa',
  'Empujando / remolcando al costado', 'Reservado', 'AIS-SART: ¡emergencia!', 'Sin definir'];

const BANDERAS = { 701: 'Argentina', 710: 'Brasil', 770: 'Uruguay', 725: 'Chile', 760: 'Perú', 636: 'Liberia', 538: 'Islas Marshall',
  351: 'Panamá', 352: 'Panamá', 353: 'Panamá', 354: 'Panamá', 355: 'Panamá', 356: 'Panamá', 357: 'Panamá', 370: 'Panamá',
  371: 'Panamá', 372: 'Panamá', 373: 'Panamá', 563: 'Singapur', 564: 'Singapur', 565: 'Singapur', 566: 'Singapur',
  477: 'Hong Kong', 412: 'China', 413: 'China', 414: 'China', 248: 'Malta', 249: 'Malta', 256: 'Malta', 215: 'Malta',
  240: 'Grecia', 241: 'Grecia', 209: 'Chipre', 210: 'Chipre', 311: 'Bahamas', 308: 'Bahamas', 257: 'Noruega',
  258: 'Noruega', 259: 'Noruega', 219: 'Dinamarca', 220: 'Dinamarca', 224: 'España', 225: 'España', 366: 'EE. UU.',
  367: 'EE. UU.', 368: 'EE. UU.', 369: 'EE. UU.', 431: 'Japón', 440: 'Corea del Sur', 441: 'Corea del Sur' };

const BEAUFORT = ['Calma', 'Ventolina', 'Flojito', 'Flojo', 'Bonancible', 'Fresquito', 'Fresco', 'Frescachón',
  'Temporal', 'Temporal fuerte', 'Temporal duro', 'Temporal muy duro', 'Huracán'];
const LIMITES_BEAUFORT = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
const OLA_BEAUFORT = ['0', '0,1', '0,2', '0,6', '1', '2', '3', '4', '5,5', '7', '9', '11,5', '14 o más'];

const CODIGOS_TIEMPO = {
  0: ['☀️', 'Despejado'], 1: ['🌤', 'Mayormente despejado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
  45: ['🌫', 'Niebla'], 48: ['🌫', 'Niebla con escarcha'], 51: ['🌦', 'Llovizna débil'], 53: ['🌦', 'Llovizna'],
  55: ['🌧', 'Llovizna intensa'], 61: ['🌧', 'Lluvia débil'], 63: ['🌧', 'Lluvia'], 65: ['🌧', 'Lluvia fuerte'],
  66: ['🌧', 'Lluvia helada'], 67: ['🌧', 'Lluvia helada fuerte'], 71: ['🌨', 'Nevada débil'], 73: ['🌨', 'Nevada'],
  75: ['🌨', 'Nevada fuerte'], 80: ['🌦', 'Chaparrones'], 81: ['🌧', 'Chaparrones fuertes'], 82: ['⛈', 'Chaparrones violentos'],
  95: ['⛈', 'Tormenta eléctrica'], 96: ['⛈', 'Tormenta con granizo'], 99: ['⛈', 'Tormenta fuerte con granizo'],
};

// ---------- Mapa ----------
// Vista inicial: todo el Mar Argentino. En la práctica, la ría de Bahía Blanca, donde está el tráfico simulado
const map = L.map('mapa', { zoomControl: true, worldCopyJump: true, minZoom: 3 })
  .setView(PRACTICA ? [-38.97, -61.95] : [-41.5, -61], PRACTICA ? 10 : 5);

// La costa incluida en la página se dibuja debajo de las teselas: si no hay internet, se sigue viendo
map.createPane('costa');
map.getPane('costa').style.zIndex = 150;
L.geoJSON(COSTA, {
  pane: 'costa',
  interactive: false,
  renderer: L.canvas({ pane: 'costa' }), // en canvas, la costa de todo el país se mueve fluida también en el celular
  attribution: '© OpenStreetMap', // mismo texto que la carta: el mapa lo muestra una sola vez
  style: { color: '#6b5a3e', weight: 1, fillColor: '#efe6cf', fillOpacity: 1 },
}).addTo(map);

const capasBase = {
  'Carta (OpenStreetMap)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, crossOrigin: true, attribution: '© OpenStreetMap' }),
  'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, crossOrigin: true, attribution: 'Imágenes © Esri' }),
  'Oscuro': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap © CARTO' }),
  'Solo costa (sin internet)': L.layerGroup(),
};
capasBase['Carta (OpenStreetMap)'].addTo(map);
const marcasNauticas = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenSeaMap' }).addTo(map);
const capaEstelas = L.layerGroup().addTo(map);
const capaVectores = L.layerGroup().addTo(map);
const capaRiesgo = L.layerGroup().addTo(map);
const capaBuques = L.layerGroup().addTo(map);
const capaViento = L.layerGroup().addTo(map);
const capaPuertos = L.layerGroup().addTo(map);
const capaCanal = L.layerGroup(); // trazado aproximado: apagado por defecto para no confundirlo con el real

L.polyline(CANAL_PRINCIPAL, { color: '#d633ff', weight: 2, dashArray: '8 6', opacity: 0.8 })
  .bindTooltip('Canal Principal: trazado APROXIMADO. Guiate por las boyas reales (capa OpenSeaMap) y la carta del SHN.', { sticky: true })
  .addTo(capaCanal);
for (const p of PUERTOS) {
  const ciudad = p.tipo === 'ciudad';
  L.marker([p.lat, p.lon], { icon: L.divIcon({ className: `puerto-icono ${ciudad ? 'es-ciudad' : 'es-puerto'}`, html: ciudad ? '<i></i>' : '⚓', iconSize: ciudad ? [8, 8] : [20, 20] }) })
    .bindTooltip(esc(p.nombre), { permanent: true, direction: p.etiquetaIzquierda ? 'left' : 'right', offset: [(ciudad ? 4 : 8) * (p.etiquetaIzquierda ? -1 : 1), 0],
      className: `etiqueta-lugar ${ciudad ? 'lugar-ciudad' : 'lugar-puerto'} ${p.principal ? 'lugar-principal' : 'lugar-secundario'}` })
    .bindPopup(`<b>${esc(p.nombre)}</b><br>${esc(p.provincia)}${p.tipo === 'base' ? ' · Armada Argentina' : ''}<br>Prefectura: 106 · VHF canal 16<br><small>${fmtPos(p)} (posición aproximada)</small>`)
    .addTo(capaPuertos);
}

L.control.layers(capasBase, {
  'Balizas, boyas y faros (OpenSeaMap)': marcasNauticas,
  'Viento en la zona': capaViento,
  'Puertos (aprox.)': capaPuertos,
  'Canal Principal (aprox.)': capaCanal,
  'Riesgo de abordaje': capaRiesgo,
}, { collapsed: true }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

map.on('baselayerchange', (e) => map.getContainer().classList.toggle('mapa-oscuro', !e.name.startsWith('Carta')));
const actualizarEtiquetas = () => {
  const z = map.getZoom();
  const c = map.getContainer().classList;
  c.toggle('sin-etiquetas', z < 12); // nombres de buques
  c.toggle('lugares-ocultos', z < 6); // nombres de puertos
  c.toggle('secundarios-ocultos', z < 9); // puertos chicos y ciudades, solo de cerca
};
map.on('zoomend', actualizarEtiquetas);
actualizarEtiquetas();

function mostrarCoordenadas(latlng, prefijo = '') {
  const p = { lat: latlng.lat, lon: latlng.lng };
  $('#coordenadas').textContent = `${prefijo}${fmtPos(p)} · ${desdeReferencia(p)}`;
}
map.on('mousemove', (e) => mostrarCoordenadas(e.latlng));
map.on('move', () => { if (matchMedia('(hover: none)').matches) mostrarCoordenadas(map.getCenter(), 'Centro: '); });
mostrarCoordenadas(map.getCenter(), 'Centro: ');

// ---------- Buques ----------
const buques = new Map(); // mmsi → { datos, recibido, marcador, estela, vector, clave }
let seleccionado = null;
let siguiendo = false;
let riesgos = [];
let propio = null;
let estadoFuente = { modo: null, conectado: false, fuentes: [] };
let ultimoPaquete = null;
let config = { rol: 'abordo' };
let flotaEncuadrada = false;
let socorro = null;

// Las claves pueden ser MMSI (número) o barcos de la flota sin AIS ("trappi-…")
const claveBuque = (texto) => [...buques.keys()].find((k) => String(k) === String(texto));

function categoria(b) {
  const em = emergencia(b);
  if (em && !em.prueba) return 'emergencia';
  if (b.flota) return 'flota';
  const tipo = b.tipo;
  if (tipo >= 70 && tipo <= 79) return 'carga';
  if (tipo >= 80 && tipo <= 89) return 'tanquero';
  if (tipo >= 60 && tipo <= 69) return 'pasajeros';
  if (tipo === 30) return 'pesca';
  if ([31, 32, 33, 50, 51, 52, 53, 54, 55, 58, 59].includes(tipo)) return 'servicio';
  if (tipo === 36 || tipo === 37) return 'recreo';
  return 'otro';
}

function descripcionTipo(b) {
  const em = emergencia(b);
  if (em) return em.prueba ? `${em.tipo} (en PRUEBA)` : em.tipo;
  if (b.flota) return 'Barco de la flota · Trappi';
  const t = b.tipo;
  const nombres = { 30: 'Pesquero', 31: 'Remolcando', 32: 'Remolcando (grande)', 33: 'Draga', 34: 'Buceo', 35: 'Militar',
    36: 'Velero', 37: 'Embarcación de recreo', 50: 'Lancha de prácticos', 51: 'Búsqueda y rescate', 52: 'Remolcador',
    53: 'Servicio portuario', 54: 'Anticontaminación', 55: 'Autoridad / guardacostas', 58: 'Transporte sanitario' };
  if (nombres[t]) return nombres[t];
  if (t >= 40 && t <= 49) return 'Nave de alta velocidad';
  if (t >= 60 && t <= 69) return 'Buque de pasajeros';
  if (t >= 70 && t <= 79) return 'Buque de carga';
  if (t >= 80 && t <= 89) return 'Buque tanque';
  return t ? `Tipo AIS ${t}` : 'Tipo no informado';
}

const bandera = (mmsi) => BANDERAS[Number(String(mmsi).slice(0, 3))] || null;
const enMovimiento = (b) => b.sog != null && b.sog >= 0.5 && b.cog != null;
const edad = (e, ahora = Date.now()) => ahora - e.recibido;
const senalVieja = (e) => edad(e) > SENAL_VIEJA_MS;

function posicionEstimada(e, ahora = Date.now()) {
  const b = e.datos;
  const ms = edad(e, ahora);
  if (!enMovimiento(b) || ms > ESTIMA_MAX_MS || ms < 0) return { lat: b.lat, lon: b.lon };
  return destino(b, b.cog, (b.sog * ms) / 3600000);
}

function iconoBuque(b, sel, vieja) {
  const cat = categoria(b);
  const color = TIPOS[cat].color;
  let forma;
  if (emergencia(b)) {
    forma = '<circle r="8" fill="#fff" stroke="#ff0000" stroke-width="3"/><path d="M-5,-5 L5,5 M5,-5 L-5,5" stroke="#ff0000" stroke-width="3"/>';
  } else if (enMovimiento(b)) {
    forma = '<path d="M0,-12 L6,7 L0,3 L-6,7 Z" stroke="#06121d" stroke-width="1.2"/>';
  } else {
    forma = '<circle r="5" stroke="#06121d" stroke-width="1.2"/>';
  }
  const clases = ['buque', sel && 'sel', vieja && 'vieja', cat === 'emergencia' && 'emergencia', b.flota && 'flota'].filter(Boolean).join(' ');
  return L.divIcon({
    className: clases,
    html: `<svg width="26" height="26" viewBox="-13 -13 26 26" fill="${color}">${forma}</svg><span class="etiqueta">${esc(b.nombre || b.mmsi)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function procesar(paquete) {
  estadoFuente = paquete;
  ultimoPaquete = Date.now();
  ponerModo();
  const ahoraLocal = Date.now();
  const desfase = ahoraLocal - (paquete.ahora || ahoraLocal);
  const vistos = new Set();
  // GPS del barco (leído por Trappi a bordo): se usa si el dispositivo no tiene su propio GPS encendido
  if (paquete.propio && vigilancia == null) {
    const g = paquete.propio;
    actualizarPropio({ timestamp: g.hora + desfase, coords: { latitude: g.lat, longitude: g.lon, accuracy: null,
      speed: g.sog != null ? g.sog / 1.943844 : null, heading: g.cog } }, g.origen || 'GPS del barco');
  }

  for (const b of paquete.buques) {
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
    vistos.add(b.mmsi);
    let e = buques.get(b.mmsi);
    if (!e) {
      e = { marcador: L.marker([b.lat, b.lon]), estela: L.polyline([], { weight: 2, opacity: 0.55 }), vector: L.polyline([], { weight: 1.5, opacity: 0.9 }) };
      e.marcador.on('click', () => seleccionar(b.mmsi));
      e.marcador.addTo(capaBuques);
      e.estela.addTo(capaEstelas);
      e.vector.addTo(capaVectores);
      buques.set(b.mmsi, e);
    }
    if (!e.datos || e.datos.actualizado !== b.actualizado) e.recibido = (b.actualizado || ahoraLocal) + desfase;
    e.datos = b;
    const color = TIPOS[categoria(b)].color;
    e.estela.setStyle({ color });
    e.vector.setStyle({ color });
    e.estela.setLatLngs(b.estela || []);
  }
  for (const [mmsi, e] of buques) {
    if (!vistos.has(mmsi)) {
      capaBuques.removeLayer(e.marcador);
      capaEstelas.removeLayer(e.estela);
      capaVectores.removeLayer(e.vector);
      buques.delete(mmsi);
      if (seleccionado === mmsi) cerrarFicha();
    }
  }
  // La oficina arranca mostrando toda su flota
  if (config.rol === 'central' && !flotaEncuadrada && buques.size) {
    flotaEncuadrada = true;
    const limites = L.latLngBounds([...buques.values()].map((e) => [e.datos.lat, e.datos.lon]));
    map.fitBounds(limites.pad(0.3), { maxZoom: 11 });
  }
  refrescarIconos();
  calcularRiesgos();
  animar();
  renderLista();
  renderFicha();
  renderAlertas();
}

// Los iconos cambian si cambia el tipo, el estado, la selección o si la señal envejece
function refrescarIconos() {
  for (const [mmsi, e] of buques) {
    const b = e.datos;
    const vieja = senalVieja(e);
    const clave = `${categoria(b)}|${enMovimiento(b)}|${b.nombre}|${b.estado}|${seleccionado === mmsi}|${vieja}`;
    if (clave === e.clave) continue;
    e.marcador.setIcon(iconoBuque(b, seleccionado === mmsi, vieja));
    e.marcador.setZIndexOffset(categoria(b) === 'emergencia' ? 1000 : 0);
    e.marcador.bindTooltip(esc(b.nombre || `MMSI ${b.mmsi}`), { direction: 'top', offset: [0, -10] });
    e.clave = clave;
  }
}

function animar() {
  const ahora = Date.now();
  const verVectores = $('#ver-vectores').checked;
  for (const e of buques.values()) {
    const p = posicionEstimada(e, ahora);
    e.marcador.setLatLng([p.lat, p.lon]);
    const svg = e.marcador.getElement()?.querySelector('svg');
    const b = e.datos;
    const proa = b.rumbo ?? b.cog;
    if (svg) svg.style.transform = proa != null && enMovimiento(b) && !emergencia(b) ? `rotate(${proa}deg)` : '';
    if (verVectores && enMovimiento(b) && !senalVieja(e)) {
      const f = destino(p, b.cog, (b.sog * MINUTOS_VECTOR) / 60);
      e.vector.setLatLngs([[p.lat, p.lon], [f.lat, f.lon]]);
    } else {
      e.vector.setLatLngs([]);
    }
    const estela = b.estela || [];
    if (estela.length) e.estela.setLatLngs([...estela, [p.lat, p.lon]]);
  }
  for (const r of riesgos) {
    const pa = puntoActual(r.a);
    const pb = puntoActual(r.b);
    r.linea.setLatLngs([[pa.lat, pa.lon], [pb.lat, pb.lon]]);
  }
}
setInterval(animar, 500);

let ticksSeguir = 0;
setInterval(() => {
  mob.actualizar();
  if (!siguiendo || !seleccionado) return;
  const e = buques.get(seleccionado);
  if (e && ++ticksSeguir % 2 === 0) {
    const p = posicionEstimada(e);
    map.panTo([p.lat, p.lon], { animate: true, duration: 0.8 });
  }
}, 1000);

function puntoActual(b) {
  if (b === propio) return propio;
  const e = buques.get(b.mmsi);
  return e ? { ...e.datos, ...posicionEstimada(e) } : b;
}

// ---------- Riesgo de abordaje (CPA / TCPA) y reglas del RIPA ----------
function calcularRiesgos() {
  capaRiesgo.clearLayers();
  const umbral = Number($('#umbral-cpa').value);
  // Solo buques con señal reciente: con una posición vieja el CPA no es fiable
  const candidatos = [...buques.values()].filter((e) => !senalVieja(e) && !emergencia(e.datos))
    .map((e) => ({ ...e.datos, ...posicionEstimada(e) })).filter(enMovimiento);
  if (propio && enMovimiento(propio)) candidatos.push(propio);
  riesgos = [];
  for (let i = 0; i < candidatos.length; i++) {
    for (let j = i + 1; j < candidatos.length; j++) {
      const a = candidatos[i];
      const b = candidatos[j];
      if (distNM(a, b) > 12) continue;
      const r = cpa(a, b);
      if (r.tcpaMin > 0 && r.tcpaMin < TCPA_MAX_MIN && r.cpa < umbral) {
        const linea = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: '#ff2d2d', weight: 2.5, dashArray: '4 6' })
          .bindTooltip(`⚠ CPA ${num(r.cpa, 2)} MN en ${Math.round(r.tcpaMin)} min`, { sticky: true })
          .addTo(capaRiesgo);
        riesgos.push({ a, b, ...r, situacion: situacionRIPA(a, b), linea });
      }
    }
  }
  riesgos.sort((x, y) => x.tcpaMin - y.tcpaMin);
}
$('#umbral-cpa').addEventListener('change', () => { calcularRiesgos(); renderAlertas(); });

const nombreDe = (b) => (b === propio ? 'Tu embarcación' : b.nombre || `MMSI ${b.mmsi}`);

function explicarRIPA(r) {
  const s = r.situacion;
  if (s.cede === 'ambos') return `${s.tipo} (Regla ${s.regla}): ${s.motivo}.`;
  const cede = s.cede === 'a' ? r.a : r.b;
  const sigue = s.cede === 'a' ? r.b : r.a;
  const verbo = cede === propio ? 'VOS DEBÉS MANIOBRAR' : 'debe maniobrar';
  return `${s.tipo} (Regla ${s.regla}): ${nombreDe(cede)} ${s.motivo}, ${verbo} con tiempo y claramente (Regla 16). ` +
    `${nombreDe(sigue)} mantiene rumbo y velocidad, atento a maniobrar si hace falta (Regla 17).`;
}

// ---------- Lista y ficha ----------
// La lista se ordena por cercanía a mi posición o, si no hay GPS, al centro de la carta
const origenLista = () => propio || { lat: map.getCenter().lat, lon: map.getCenter().lng };

function renderLista() {
  const texto = $('#buscar').value.trim().toLowerCase();
  const tipo = $('#filtro-tipo').value;
  const prioridad = (b) => (categoria(b) === 'emergencia' ? 2 : enMovimiento(b) ? 1 : 0);
  const lista = [...buques.values()]
    .filter(({ datos: b }) => (!tipo || categoria(b) === tipo) && (!texto || `${b.nombre} ${b.mmsi}`.toLowerCase().includes(texto)))
    .map((e) => ({ e, b: e.datos, d: distNM(origenLista(), e.datos) }))
    .sort((x, y) => prioridad(y.b) - prioridad(x.b) || x.d - y.d);
  $('#cuenta-buques').textContent = buques.size;
  if (config.rol === 'central') renderResumenFlota();
  if (!lista.length) {
    let mensaje = 'Ningún buque coincide con el filtro.';
    if (!buques.size) {
      mensaje = estadoFuente.modo === 'sin-datos'
        ? 'No llegan datos AIS. Revisá la conexión o el receptor. <b>No se muestran buques inventados</b> para no darte información falsa.'
        : 'Esperando buques… La cobertura AIS en la ría depende de las estaciones receptoras; puede tardar unos minutos.';
    }
    $('#lista-buques').innerHTML = `<li class="vacio">${mensaje}</li>`;
    return;
  }
  $('#lista-buques').innerHTML = lista.map(({ e, b, d }) => `
    <li data-mmsi="${esc(b.mmsi)}" class="${seleccionado === b.mmsi ? 'sel' : ''}">
      <span class="punto" style="background:${TIPOS[categoria(b)].color}"></span>
      <div><div class="nombre">${esc(b.nombre || `MMSI ${b.mmsi}`)}</div>
      <div class="detalle">${esc(descripcionTipo(b))}${b.destino ? ` → ${esc(b.destino)}` : ''}</div></div>
      <div class="der">${enMovimiento(b) ? `${num(b.sog)} kn · ${grados(b.cog)}` : esc(ESTADOS_NAV[b.estado] || 'Detenido')}<br>
      <span class="detalle">${senalVieja(e) ? `⚠ sin señal ${hace(edad(e))}` : `${esc(referencia(b).nombre)}, ${num(referencia(b).d)} MN`}</span></div>
    </li>`).join('');
}
$('#lista-buques').addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-mmsi]');
  if (!li) return;
  irA(claveBuque(li.dataset.mmsi));
  if (matchMedia('(max-width: 760px)').matches) $('#panel').classList.remove('abierto');
});
$('#buscar').addEventListener('input', renderLista);
$('#filtro-tipo').addEventListener('change', renderLista);
$('#ver-vectores').addEventListener('change', animar);
$('#ver-estelas').addEventListener('change', (e) => (e.target.checked ? capaEstelas.addTo(map) : capaEstelas.remove()));

// Resumen para la oficina: cuántos barcos pescan, navegan, están en puerto o sin señal
function renderResumenFlota() {
  const cuenta = { alerta: 0, pescando: 0, navegando: 0, puerto: 0, sinSenal: 0 };
  for (const e of buques.values()) {
    const b = e.datos;
    if (categoria(b) === 'emergencia') cuenta.alerta++;
    else if (senalVieja(e)) cuenta.sinSenal++;
    else if (b.estado === 7) cuenta.pescando++;
    else if (enMovimiento(b)) cuenta.navegando++;
    else cuenta.puerto++;
  }
  const chip = (n, texto, clase) => `<span class="chip ${clase}"><b>${n}</b> ${texto}</span>`;
  $('#resumen-flota').innerHTML = [
    cuenta.alerta ? chip(cuenta.alerta, 'con alerta', 'chip-peligro') : '',
    chip(cuenta.pescando, 'pescando', 'chip-pesca'),
    chip(cuenta.navegando, 'navegando', 'chip-nav'),
    chip(cuenta.puerto, 'en puerto', 'chip-puerto'),
    cuenta.sinSenal ? chip(cuenta.sinSenal, 'sin señal', 'chip-aviso') : '',
  ].join('');
}

function irA(mmsi) {
  seleccionar(mmsi);
  const e = buques.get(mmsi);
  if (e) {
    const p = posicionEstimada(e);
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 13));
  }
}

function seleccionar(mmsi) {
  seleccionado = mmsi;
  siguiendo = false;
  refrescarIconos();
  animar();
  renderFicha();
  renderLista();
}

function cerrarFicha() {
  seleccionado = null;
  siguiendo = false;
  refrescarIconos();
  $('#ficha').hidden = true;
  renderLista();
}

function renderFicha() {
  const e = buques.get(seleccionado);
  if (!e) { $('#ficha').hidden = true; return; }
  const b = e.datos;
  const p = posicionEstimada(e);
  const ms = edad(e);
  const estimada = enMovimiento(b) && ms > 10000 && ms <= ESTIMA_MAX_MS;
  const riesgo = riesgos.find((r) => r.a.mmsi === b.mmsi || r.b.mmsi === b.mmsi);
  const em = emergencia(b);
  const filas = [
    ['MMSI', b.mmsi], ['IMO', b.imo], ['Indicativo', b.callsign], ['Bandera', bandera(b.mmsi)],
    ['Estado', ESTADOS_NAV[b.estado]], ['Velocidad', b.sog != null ? `${num(b.sog)} kn` : null],
    ['Rumbo (COG)', b.cog != null ? grados(b.cog) : null], ['Proa (HDG)', b.rumbo != null ? grados(b.rumbo) : null],
    [estimada ? 'Posición (estimada)' : 'Posición', fmtPos(p)],
    ['Precisión GPS', b.precision === 1 ? 'Alta (menos de 10 m)' : b.precision === 0 ? 'Normal (más de 10 m)' : null],
    ['Destino', b.destino], ['ETA', b.eta],
    ['Eslora × manga', b.eslora ? `${b.eslora} × ${b.manga ?? '—'} m` : null], ['Calado', b.calado ? `${num(b.calado)} m` : null],
    ['Referencia', desdeReferencia(p)],
    ['Desde mí', propio ? `${num(distNM(propio, p))} MN al ${grados(rumbo(propio, p))}` : null],
    ['Mensaje AIS', b.mensajeSeguridad],
    ['Datos descartados', b.saltosDescartados ? `${b.saltosDescartados} posiciones imposibles` : null],
    [b.flota ? 'Última posición' : 'Señal AIS', b.sim ? 'simulada (práctica)' : hace(ms)],
  ].filter(([, v]) => v != null && v !== '');
  $('#ficha').hidden = false;
  $('#ficha').innerHTML = `
    <button class="cerrar" id="ficha-cerrar" title="Cerrar">✕</button>
    <h2>${esc(b.nombre || `MMSI ${b.mmsi}`)}</h2>
    <div class="tipo"><span class="punto" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${TIPOS[categoria(b)].color}"></span>
      ${esc(descripcionTipo(b))}${b.claseB ? ' · AIS clase B' : ''}</div>
    ${em && !em.prueba ? '<div class="riesgo">🆘 EMERGENCIA: avisá a Prefectura (106 / VHF 16) con esta posición.</div>' : ''}
    ${senalVieja(e) ? `<div class="riesgo">⚠ Sin señal ${esc(hace(ms))}: la posición puede no ser la real.</div>` : ''}
    <dl>${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${riesgo ? `<div class="riesgo">⚠ Riesgo de abordaje: CPA ${num(riesgo.cpa, 2)} MN en ${Math.round(riesgo.tcpaMin)} min.<br>${esc(explicarRIPA(riesgo))}</div>` : ''}
    <div class="botones">
      <button id="ficha-seguir" class="${siguiendo ? 'activo' : ''}">🎯 ${siguiendo ? 'Siguiendo' : 'Seguir'}</button>
      <button id="ficha-centrar">⌖ Centrar</button>
      ${config.rol === 'central' && b.flota ? `<button id="ficha-historial" class="${historialDe === b.id ? 'activo' : ''}">🕑 Recorrido 24 h</button>` : ''}
    </div>
    <p class="nota">${historialDe === b.id ? esc(historialTexto) : ''}</p>`;
  $('#ficha-cerrar').onclick = cerrarFicha;
  $('#ficha-seguir').onclick = () => { siguiendo = !siguiendo; renderFicha(); };
  $('#ficha-centrar').onclick = () => map.setView([p.lat, p.lon], Math.max(map.getZoom(), 13));
  const botonHistorial = $('#ficha-historial');
  if (botonHistorial) botonHistorial.onclick = () => verRecorrido(b);
}

$('#leyenda').innerHTML = Object.values(TIPOS)
  .map((t) => `<span><span class="punto" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.color}"></span>${esc(t.nombre)}</span>`)
  .join('') + '<span>▲ navegando · ● detenido</span><span>Transparente: sin señal reciente</span><span style="color:#ff2d2d">- - riesgo de abordaje</span>';

// ---------- Fuente de datos ----------
function ponerModo() {
  const el = $('#modo');
  const { modo, conectado, local } = estadoFuente;
  if (modo === 'ais' && conectado) {
    el.textContent = 'AIS EN VIVO';
    el.className = 'modo vivo';
    el.title = (estadoFuente.fuentes || []).map((f) => f.nombre).join(' · ');
  } else if (modo === 'ais') {
    el.textContent = 'AIS: SIN SEÑAL';
    el.className = 'modo sin-datos';
    el.title = 'El servidor no recibe datos AIS en este momento';
  } else if (modo === 'flota') {
    el.textContent = 'FLOTA EN VIVO';
    el.className = 'modo vivo';
    el.title = 'Posiciones de los barcos de la empresa por Trappi Central';
  } else if (modo === 'simulacion') {
    el.textContent = local ? 'PRÁCTICA (simulación)' : 'SIMULACIÓN';
    el.className = 'modo sim';
    el.title = 'Buques de práctica, NO reales. Configurá una fuente AIS en el servidor para ver los reales.';
  } else if (modo === 'sin-datos') {
    el.textContent = 'SIN DATOS AIS';
    el.className = 'modo sin-datos';
    el.title = 'No hay conexión con el servidor AIS';
  }
}

function conectar() {
  if (PRACTICA) { simulacionLocal(); return; }
  if (DEMO_OFICINA) { simulacionOficina(); return; }
  if (!('EventSource' in window)) { estadoFuente = { modo: 'sin-datos' }; ponerModo(); return; }
  const fuente = new EventSource('api/buques');
  fuente.onmessage = (ev) => {
    try { procesar(JSON.parse(ev.data)); } catch { /* paquete dañado: se espera el siguiente */ }
  };
  // EventSource reintenta solo; mientras tanto se avisa y los buques se van marcando como "sin señal"
  fuente.onerror = () => {
    estadoFuente = { ...estadoFuente, modo: 'sin-datos', conectado: false };
    ponerModo();
    renderLista();
  };
  setTimeout(() => { if (!ultimoPaquete) { estadoFuente = { modo: 'sin-datos' }; ponerModo(); renderLista(); } }, 6000);
}

// Solo con ?practica en la dirección: nunca se inventan buques sin que se pida
function simulacionLocal() {
  const sim = crearSimulacion();
  const registro = new RegistroBuques();
  let anterior = Date.now();
  const paso = () => {
    const ahora = Date.now();
    sim.paso((ahora - anterior) / 1000);
    anterior = ahora;
    for (const b of sim.lista()) registro.actualizar(b);
    procesar({ modo: 'simulacion', local: true, conectado: true, ahora, buques: registro.lista() });
  };
  paso();
  setInterval(paso, 2000);
}

// Oficina de demostración: una flota simulada en lugar de Trappi Central
let flotaDemo = null;
async function simulacionOficina() {
  const { crearFlotaSimulada } = await import('./simulacion-flota.js');
  flotaDemo = crearFlotaSimulada();
  const paso = () => {
    flotaDemo.paso();
    const lista = flotaDemo.buques();
    procesar({ modo: 'flota', conectado: true, ahora: Date.now(), buques: lista,
      fuentes: [{ nombre: `Flota ${config.empresa} (simulada: ${lista.length} barcos)`, conectado: true, ultimo: Date.now(), mensajes: lista.length }] });
  };
  paso();
  setInterval(paso, 3000);
}

// ---------- Tiempo, olas y mareas ----------
let alertasTiempo = [];
let tiempoGuardado = null; // hora del pronóstico en uso
let tiempoSinConexion = false;
let tiempoEjemplo = false;
const notificadas = new Set();

const beaufort = (kn) => LIMITES_BEAUFORT.filter((l) => kn >= l).length;
function cardinal(g) {
  const puntos = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return puntos[Math.round(((g % 360) + 360) % 360 / 22.5) % 16];
}
const horaLocal = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA_HORARIA });
const diaHora = (ms) => new Date(ms).toLocaleString('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA_HORARIA });
const colorViento = (kn) => (kn < 11 ? '#3ddc97' : kn < 22 ? '#ffd23f' : kn < 34 ? '#ffb020' : '#ff4d4f');

$('#tabla-beaufort').innerHTML = '<tr><th>Fuerza</th><th>Nombre</th><th>Nudos</th><th>Ola m</th></tr>' + BEAUFORT.map((n, f) => {
  const desde = f === 0 ? 0 : LIMITES_BEAUFORT[f - 1];
  const hasta = LIMITES_BEAUFORT[f];
  return `<tr><td>${f}</td><td>${n}</td><td>${hasta ? (f === 0 ? 'menos de 1' : `${desde}–${hasta - 1}`) : `${desde} o más`}</td><td>${OLA_BEAUFORT[f]}</td></tr>`;
}).join('');

function serie(datos) {
  const h = datos?.hourly;
  if (!h?.time?.length) return null;
  const off = datos.utc_offset_seconds || 0;
  const ms = h.time.map((t) => Date.parse(`${t}Z`) - off * 1000);
  if (Date.now() > ms.at(-1)) return null; // pronóstico vencido: mejor no mostrarlo
  return { ...h, ms };
}

function indiceAhora(s) {
  const ahora = Date.now();
  let i = 0;
  while (i < s.ms.length - 1 && s.ms[i + 1] <= ahora) i++;
  return i;
}

async function obtener(url) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 15000);
  try {
    const r = await fetch(url, { signal: control.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(corte);
  }
}

// El pronóstico se pide para la posición del barco o, si no hay GPS, para el centro de la carta
let puntoTiempo = null;
let proximaCarga = null;
const lugarTiempo = () => (propio ? { lat: propio.lat, lon: propio.lon } : { lat: map.getCenter().lat, lon: map.getCenter().lng });
// Si la zona cambia más de 30 millas, se vuelve a pedir el pronóstico para la zona nueva
map.on('moveend', () => {
  if (puntoTiempo && !tiempoEjemplo && distNM(puntoTiempo, lugarTiempo()) > 30) {
    clearTimeout(proximaCarga);
    proximaCarga = setTimeout(cargarTiempo, 1500);
  }
});

async function cargarTiempo() {
  clearTimeout(proximaCarga);
  const lugar = lugarTiempo();
  puntoTiempo = lugar;
  const PUNTO_PRONOSTICO = lugar;
  const PUNTO_MAR = lugar;
  const comunes = { timezone: ZONA_HORARIA, past_days: '1', forecast_days: '4' };
  const urlPronostico = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: PUNTO_PRONOSTICO.lat, longitude: PUNTO_PRONOSTICO.lon, wind_speed_unit: 'kn', ...comunes,
    hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,weather_code,visibility,precipitation_probability',
  });
  const urlMar = 'https://marine-api.open-meteo.com/v1/marine?' + new URLSearchParams({
    latitude: PUNTO_MAR.lat, longitude: PUNTO_MAR.lon, ...comunes,
    hourly: 'wave_height,wave_direction,wave_period,sea_level_height_msl',
  });
  // Flechas de viento: una grilla de 3 × 3 sobre la zona que se está mirando
  const b = map.getBounds().pad(-0.2);
  const malla = [];
  for (const f of [0, 0.5, 1]) for (const g of [0, 0.5, 1]) {
    malla.push({ lat: +(b.getSouth() + (b.getNorth() - b.getSouth()) * f).toFixed(3), lon: +(b.getWest() + (b.getEast() - b.getWest()) * g).toFixed(3) });
  }
  const urlMalla = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: malla.map((p) => p.lat).join(','), longitude: malla.map((p) => p.lon).join(','),
    current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m', wind_speed_unit: 'kn',
  });

  const [pron, mar, viento] = await Promise.allSettled([obtener(urlPronostico), obtener(urlMar), obtener(urlMalla)]);
  let datos = {
    pron: pron.status === 'fulfilled' ? pron.value : null,
    mar: mar.status === 'fulfilled' ? mar.value : null,
    malla: viento.status === 'fulfilled' ? [].concat(viento.value) : null,
    guardado: Date.now(),
  };
  // En la demo sin conexión se usa un pronóstico de EJEMPLO, marcado como tal
  tiempoEjemplo = false;
  if ((PRACTICA || MODO_DEMO) && !datos.pron) {
    const { pronosticoEjemplo } = await import('./tiempo-ejemplo.js');
    datos = { ...pronosticoEjemplo(), guardado: Date.now() };
    tiempoEjemplo = true;
  }
  tiempoSinConexion = !datos.pron;
  if (tiempoEjemplo) {
    // no se guarda: no es un pronóstico real
  } else if (datos.pron && datos.mar) {
    guardar('carta-tiempo', JSON.stringify(datos));
  } else {
    // Sin conexión: se usa el último pronóstico guardado (cubre hasta 4 días)
    const previo = leerJSON('carta-tiempo');
    if (previo) datos = { pron: datos.pron || previo.pron, mar: datos.mar || previo.mar, malla: datos.malla, guardado: datos.pron ? datos.guardado : previo.guardado };
  }
  tiempoGuardado = datos.pron ? datos.guardado : null;

  const f = serie(datos.pron);
  const m = serie(datos.mar);
  if (f) renderTiempo(f, m);
  else $('#tiempo-actual').innerHTML = '<p class="nota">Sin pronóstico: no hay conexión y no hay ninguno guardado vigente. Reintento en 2 minutos.</p>';
  if (m) renderMareas(m);
  else $('#mareas-resumen').innerHTML = '<p class="nota">Sin datos de olas y marea. Reintento en 2 minutos.</p>';
  capaViento.clearLayers();
  if (datos.malla) renderVientoMapa(malla, datos.malla); // el viento "actual" guardado no se muestra: ya no sería actual

  const origen = $('#tiempo-origen');
  origen.hidden = !(tiempoSinConexion || tiempoEjemplo) || !f;
  origen.textContent = tiempoEjemplo
    ? '⚠ DEMOSTRACIÓN: pronóstico de ejemplo con un temporal, para mostrar las alertas. No es el tiempo real.'
    : `⚠ Sin conexión: pronóstico guardado ${hace(Date.now() - tiempoGuardado)} (${diaHora(tiempoGuardado)}). Puede haber cambiado.`;

  alertasTiempo = f ? analizarTiempo(f, m) : [];
  renderAlertas();
  $('#tiempo-lugar').textContent = `Pronóstico para ${fmtPos(lugar)} · ${desdeReferencia(lugar)}${propio ? ' (posición del barco)' : ' (centro de la carta)'}`;
  $('#marea-lugar').textContent = $('#tiempo-lugar').textContent;
  proximaCarga = setTimeout(cargarTiempo, !tiempoSinConexion && datos.mar ? 15 * 60000 : 2 * 60000);
}

function renderTiempo(f, m) {
  const i = indiceAhora(f);
  const kn = f.wind_speed_10m[i];
  const dir = f.wind_direction_10m[i];
  const bft = beaufort(kn);
  const presion = f.pressure_msl[i];
  const tendencia = i >= 3 ? presion - f.pressure_msl[i - 3] : null;
  const [icono, cielo] = CODIGOS_TIEMPO[f.weather_code[i]] || ['❔', '—'];
  const im = m ? indiceAhora(m) : null;
  const ola = m ? m.wave_height[im] : null;
  const vis = f.visibility?.[i];
  $('#tiempo-actual').innerHTML = `
    <div class="tarjeta ancha"><div class="etq">Viento ${tiempoSinConexion ? 'previsto para ahora' : 'ahora'}</div>
      <div class="valor" style="color:${colorViento(kn)}"><span class="flecha" style="transform:rotate(${dir + 180}deg)">⬆</span>
        ${num(kn, 0)} kn del ${cardinal(dir)}</div>
      <div class="extra">Fuerza ${bft} Beaufort · ${BEAUFORT[bft]} · ráfagas ${num(f.wind_gusts_10m[i], 0)} kn · ${grados(dir)}</div></div>
    <div class="tarjeta"><div class="etq">Presión</div><div class="valor">${num(presion, 0)}</div>
      <div class="extra">hPa · ${tendencia == null ? '' : `${tendencia > 0.5 ? '↑ sube' : tendencia < -0.5 ? '↓ baja' : '→ estable'} ${num(tendencia)} en 3 h`}</div></div>
    <div class="tarjeta"><div class="etq">Cielo</div><div class="valor">${icono}</div><div class="extra">${cielo} · ${num(f.temperature_2m[i], 0)} °C</div></div>
    <div class="tarjeta"><div class="etq">Olas (afuera)</div><div class="valor">${ola == null ? '—' : `${num(ola)} m`}</div>
      <div class="extra">${m ? `período ${num(m.wave_period[im], 0)} s · del ${cardinal(m.wave_direction[im])}` : ''}</div></div>
    <div class="tarjeta"><div class="etq">Visibilidad</div><div class="valor">${vis == null ? '—' : `${num(vis / 1852)} MN`}</div>
      <div class="extra">${vis == null ? '' : vis < 1000 ? 'Niebla: ¡usá radar y señales fónicas!' : vis < 4000 ? 'Reducida' : 'Buena'}</div></div>`;

  const filas = [];
  for (let k = i; k < Math.min(i + 48, f.ms.length); k += 3) {
    const v = f.wind_speed_10m[k];
    const r = f.wind_gusts_10m[k];
    const km = m ? m.ms.indexOf(f.ms[k]) : -1;
    const clase = (x) => (x >= 34 ? 'f8' : x >= 22 ? 'f6' : '');
    filas.push(`<tr><td>${diaHora(f.ms[k])}</td><td class="${clase(v)}">${num(v, 0)}</td><td class="${clase(r)}">${num(r, 0)}</td>
      <td><span class="flecha" style="transform:rotate(${f.wind_direction_10m[k] + 180}deg)">⬆</span> ${cardinal(f.wind_direction_10m[k])}</td>
      <td>${beaufort(v)}</td><td>${km >= 0 ? num(m.wave_height[km]) : '—'}</td>
      <td title="${esc((CODIGOS_TIEMPO[f.weather_code[k]] || [])[1] || '')}">${(CODIGOS_TIEMPO[f.weather_code[k]] || ['❔'])[0]}</td></tr>`);
  }
  $('#tabla-pronostico').innerHTML = `<tr><th>Hora</th><th>Viento kn</th><th>Ráfaga</th><th>Dir.</th><th>Bft</th><th>Olas m</th><th></th></tr>${filas.join('')}`;
}

function renderVientoMapa(malla, datos) {
  datos.forEach((d, k) => {
    const c = d?.current;
    if (!c || !malla[k]) return;
    const kn = c.wind_speed_10m;
    const color = colorViento(kn);
    const html = `<div class="flecha-viento" style="transform:rotate(${c.wind_direction_10m + 180}deg)">
        <svg width="22" height="34" viewBox="-11 -17 22 34"><path d="M0,-16 L8,-4 L3,-4 L3,16 L-3,16 L-3,-4 L-8,-4 Z" fill="${color}" stroke="#06121d" stroke-width="1.2" opacity="0.9"/></svg>
      </div><span class="kn">${num(kn, 0)} kn${c.wind_gusts_10m >= kn + 8 ? ` (${num(c.wind_gusts_10m, 0)})` : ''}</span>`;
    L.marker([malla[k].lat, malla[k].lon], { icon: L.divIcon({ className: 'viento', html, iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: true })
      .bindTooltip(`Viento del ${cardinal(c.wind_direction_10m)} (${grados(c.wind_direction_10m)}), ${num(kn, 0)} kn, ráfagas ${num(c.wind_gusts_10m, 0)} kn · Fuerza ${beaufort(kn)}`)
      .addTo(capaViento);
  });
}

function analizarTiempo(f, m) {
  const alertas = [];
  const i0 = indiceAhora(f);
  const fin = Math.min(i0 + 24, f.ms.length - 1);
  let peor = { v: -1 };
  let tormenta = null;
  let niebla = null;
  let caida = { d: 0 };
  for (let k = i0; k <= fin; k++) {
    const v = Math.max(f.wind_speed_10m[k], f.wind_gusts_10m[k] - 7); // ráfagas pesan algo menos que el viento medio
    if (v > peor.v) peor = { v, k };
    if (tormenta == null && [95, 96, 99].includes(f.weather_code[k])) tormenta = k;
    if (niebla == null && f.visibility?.[k] != null && f.visibility[k] < 1000) niebla = k;
    if (k >= 3) {
      const d = f.pressure_msl[k] - f.pressure_msl[k - 3];
      if (d < caida.d) caida = { d, k };
    }
  }
  const cuando = (k) => (k === i0 ? 'AHORA' : diaHora(f.ms[k]));

  if (peor.v >= 0) {
    const k = peor.k;
    const viento = f.wind_speed_10m[k];
    const rafaga = f.wind_gusts_10m[k];
    const dir = f.wind_direction_10m[k];
    const sector = dir >= 180 && dir <= 270 ? ' Viento del sector S-SO: posible pampero, con cambio brusco de viento y bajada de temperatura.'
      : dir >= 90 && dir < 180 ? ' Viento del sector SE: posible sudestada, con mar de fondo y crecida de la marea.' : '';
    if (viento >= 34 || rafaga >= 41) {
      alertas.push({ nivel: 'peligro', icono: '🌪', clave: `temporal-${f.ms[k]}`,
        titulo: viento >= 48 || rafaga >= 56 ? 'TEMPORAL DURO' : 'TEMPORAL',
        texto: `${cuando(k)}: viento ${num(viento, 0)} kn del ${cardinal(dir)}, ráfagas ${num(rafaga, 0)} kn (Fuerza ${beaufort(viento)}). Embarcaciones menores: no salir o buscar abrigo.${sector}` });
    } else if (viento >= 22 || rafaga >= 30) {
      alertas.push({ nivel: 'aviso', icono: '💨', clave: `fuerte-${f.ms[k]}`, titulo: 'Viento fuerte',
        texto: `${cuando(k)}: viento ${num(viento, 0)} kn del ${cardinal(dir)}, ráfagas ${num(rafaga, 0)} kn (Fuerza ${beaufort(viento)}). Precaución en embarcaciones menores.${sector}` });
    }
  }
  if (tormenta != null) {
    alertas.push({ nivel: 'peligro', icono: '⛈', clave: `tormenta-${f.ms[tormenta]}`, titulo: 'TORMENTA ELÉCTRICA',
      texto: `${cuando(tormenta)}: ${CODIGOS_TIEMPO[f.weather_code[tormenta]][1]}. Riesgo de rayos, ráfagas súbitas y chaparrones con poca visibilidad.` });
  }
  if (caida.d <= -4) {
    alertas.push({ nivel: caida.d <= -6 ? 'peligro' : 'aviso', icono: '📉', clave: `presion-${f.ms[caida.k]}`, titulo: 'Caída rápida de presión',
      texto: `${num(caida.d)} hPa en 3 horas (hasta ${diaHora(f.ms[caida.k])}). Señal clásica de que se acerca mal tiempo.` });
  }
  if (niebla != null) {
    alertas.push({ nivel: 'aviso', icono: '🌫', clave: `niebla-${f.ms[niebla]}`, titulo: 'Niebla',
      texto: `${cuando(niebla)}: visibilidad menor a 0,5 MN. Navegar con radar, velocidad de seguridad y señales fónicas (RIPA Reglas 19 y 35).` });
  }
  if (m) {
    const j0 = indiceAhora(m);
    let olaMax = { h: 0 };
    for (let k = j0; k <= Math.min(j0 + 24, m.ms.length - 1); k++) {
      if ((m.wave_height[k] ?? 0) > olaMax.h) olaMax = { h: m.wave_height[k], k };
    }
    if (olaMax.h >= 2.5) {
      alertas.push({ nivel: olaMax.h >= 4 ? 'peligro' : 'aviso', icono: '🌊', clave: `olas-${m.ms[olaMax.k]}`,
        titulo: olaMax.h >= 4 ? 'MAR MUY GRUESA' : 'Mar gruesa',
        texto: `Olas de ${num(olaMax.h)} m en la zona (${diaHora(m.ms[olaMax.k])}).` });
    }
  }
  if (tiempoEjemplo) for (const a of alertas) a.texto += ' (EJEMPLO de demostración, no es el tiempo real.)';
  else if (tiempoSinConexion) for (const a of alertas) a.texto += ' (Pronóstico guardado, sin conexión.)';
  return alertas;
}

function renderMareas(m) {
  const nivel = m.sea_level_height_msl;
  if (!nivel || nivel.every((v) => v == null)) {
    $('#mareas-resumen').innerHTML = '<p class="nota">El modelo no tiene datos de marea para este punto.</p>';
    $('#grafico-marea').innerHTML = '';
    return;
  }
  const i0 = indiceAhora(m);
  const desde = Math.max(0, i0 - 6);
  const hasta = Math.min(m.ms.length - 1, i0 + 42);

  const extremos = [];
  for (let k = Math.max(1, desde); k < hasta; k++) {
    const [a, b, c] = [nivel[k - 1], nivel[k], nivel[k + 1]];
    if (a == null || b == null || c == null) continue;
    const pleamar = b > a && b >= c;
    if (pleamar || (b < a && b <= c)) {
      const curva = a - 2 * b + c;
      const desplazamiento = curva ? (a - c) / (2 * curva) : 0; // ajuste parabólico entre horas
      extremos.push({ pleamar, ms: m.ms[k] + desplazamiento * 3600000, v: b - ((a - c) * desplazamiento) / 4 });
    }
  }

  const ahora = Date.now();
  const fr = (ahora - m.ms[i0]) / 3600000;
  const vAhora = nivel[i0] + ((nivel[i0 + 1] ?? nivel[i0]) - nivel[i0]) * fr;
  const subiendo = (nivel[i0 + 1] ?? nivel[i0]) > nivel[i0];
  const proxPlea = extremos.find((e) => e.pleamar && e.ms > ahora);
  const proxBaja = extremos.find((e) => !e.pleamar && e.ms > ahora);
  const signo = (v) => `${v >= 0 ? '+' : ''}${num(v, 2)} m`;
  $('#mareas-resumen').innerHTML = `
    <div class="tarjeta ancha"><div class="etq">Ahora (modelo)</div><div class="valor">${signo(vAhora)}</div>
      <div class="extra">${subiendo ? '↑ Creciente (marea subiendo)' : '↓ Bajante (marea bajando)'}</div></div>
    <div class="tarjeta"><div class="etq">Próxima pleamar</div><div class="valor">${proxPlea ? horaLocal(proxPlea.ms) : '—'}</div>
      <div class="extra">${proxPlea ? signo(proxPlea.v) : ''}</div></div>
    <div class="tarjeta"><div class="etq">Próxima bajamar</div><div class="valor">${proxBaja ? horaLocal(proxBaja.ms) : '—'}</div>
      <div class="extra">${proxBaja ? signo(proxBaja.v) : ''}</div></div>`;

  const W = 340;
  const H = 185;
  const pad = { l: 34, r: 8, t: 16, b: 36 };
  const valores = nivel.slice(desde, hasta + 1).filter((v) => v != null);
  const min = Math.min(...valores) - 0.1;
  const max = Math.max(...valores) + 0.1;
  const x = (ms) => pad.l + ((ms - m.ms[desde]) / (m.ms[hasta] - m.ms[desde])) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  let trazo = '';
  for (let k = desde; k <= hasta; k++) if (nivel[k] != null) trazo += `${trazo ? 'L' : 'M'}${x(m.ms[k]).toFixed(1)},${y(nivel[k]).toFixed(1)}`;
  const relleno = `${trazo}L${x(m.ms[hasta]).toFixed(1)},${H - pad.b}L${x(m.ms[desde]).toFixed(1)},${H - pad.b}Z`;
  const marcasHora = [];
  for (let k = desde; k <= hasta; k++) {
    const h = Number(new Date(m.ms[k]).toLocaleString('es-AR', { hour: 'numeric', hourCycle: 'h23', timeZone: ZONA_HORARIA }));
    if (h % 6 === 0) marcasHora.push(`<line x1="${x(m.ms[k])}" x2="${x(m.ms[k])}" y1="${pad.t}" y2="${H - pad.b}" stroke="currentColor" opacity="0.12"/>
      <text x="${x(m.ms[k])}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">${h === 0 ? new Date(m.ms[k]).toLocaleDateString('es-AR', { weekday: 'short', timeZone: ZONA_HORARIA }) : `${h} h`}</text>`);
  }
  const etiquetas = extremos.map((e) => `<circle cx="${x(e.ms)}" cy="${y(e.v)}" r="3" fill="var(--acento)"/>
    <text x="${x(e.ms)}" y="${y(e.v) + (e.pleamar ? -6 : 14)}" text-anchor="middle" font-size="10" fill="currentColor">${horaLocal(e.ms)}</text>`).join('');
  $('#grafico-marea').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="color:var(--texto)" role="img" aria-label="Curva de marea de las próximas 42 horas">
      ${marcasHora.join('')}
      ${min < 0 && max > 0 ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" stroke-dasharray="3 3" opacity="0.4"/>` : ''}
      <path d="${relleno}" fill="var(--acento)" opacity="0.18"/>
      <path d="${trazo}" fill="none" stroke="var(--acento)" stroke-width="2"/>
      ${etiquetas}
      <line x1="${x(ahora)}" x2="${x(ahora)}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--aviso)" stroke-width="1.5"/>
      <circle cx="${x(ahora)}" cy="${y(vAhora)}" r="4" fill="var(--aviso)"/>
      <text x="4" y="${y(max - 0.1) + 4}" font-size="10" fill="currentColor" opacity="0.7">${num(max - 0.1)} m</text>
      <text x="4" y="${y(min + 0.1) + 4}" font-size="10" fill="currentColor" opacity="0.7">${num(min + 0.1)} m</text>
    </svg>`;
}

// ---------- Alertas ----------
function alertasEmergencia() {
  const lista = [];
  for (const e of buques.values()) {
    const b = e.datos;
    const em = emergencia(b);
    const p = posicionEstimada(e);
    const desdeMi = propio ? ` A ${num(distNM(propio, p), 2)} MN al ${grados(rumbo(propio, p))} de vos.` : '';
    if (em) {
      lista.push({
        nivel: em.prueba ? 'info' : 'peligro', icono: em.prueba ? '🧪' : '🆘', mmsi: b.mmsi, activa: !em.prueba,
        clave: `emergencia-${b.mmsi}-${em.prueba}`,
        titulo: em.prueba ? `${em.tipo}: prueba del equipo` : em.tipo.toUpperCase(),
        texto: `${b.nombre || `MMSI ${b.mmsi}`} en ${fmtPos(p)} (${desdeReferencia(p)}).${desdeMi}` +
          (b.sos ? ` Alerta enviada ${hace(Date.now() - b.sos.hora)}${b.sos.lat != null ? `, posición del evento ${fmtPos(b.sos)}` : ''}.${b.sos.texto ? ` «${b.sos.texto.split('\n').slice(0, 3).join(' / ')}…»` : ''}` : '') +
          (em.prueba ? ' Es una prueba, no una emergencia.' : ' Avisá a Prefectura: 106 o VHF canal 16.') + (senalVieja(e) ? ` Última señal ${hace(edad(e))}.` : ''),
      });
    } else if (b.mensajeSeguridad && b.horaMensaje && Date.now() - b.horaMensaje < 30 * 60000) {
      lista.push({ nivel: 'aviso', icono: '📢', clave: `seguridad-${b.mmsi}-${b.horaMensaje}`,
        titulo: `Mensaje de seguridad AIS de ${b.nombre || b.mmsi}`, texto: `«${b.mensajeSeguridad}» ${hace(Date.now() - b.horaMensaje)}.` });
    }
  }
  return lista;
}

function renderAlertas() {
  const emergencias = alertasEmergencia();
  const alertasAbordaje = riesgos.map((r) => {
    const conmigo = r.a === propio || r.b === propio;
    return {
      nivel: r.cpa < Number($('#umbral-cpa').value) / 2 || conmigo ? 'peligro' : 'aviso',
      icono: '⚠',
      clave: `cpa-${r.a.mmsi}-${r.b.mmsi}`,
      titulo: conmigo ? 'RIESGO DE ABORDAJE CON TU EMBARCACIÓN' : 'Riesgo de abordaje',
      texto: `${nombreDe(r.a)} y ${nombreDe(r.b)}: se acercarán a ${num(r.cpa, 2)} MN dentro de ${Math.round(r.tcpaMin)} min (ahora a ${num(r.distancia, 2)} MN). ${explicarRIPA(r)}`,
      conmigo,
    };
  });
  const todas = [...emergencias, ...alertasTiempo, ...alertasAbordaje];
  $('#cuenta-alertas').textContent = todas.filter((a) => a.nivel !== 'info').length;
  $('#lista-alertas').innerHTML = todas.length
    ? todas.map((a) => `<li class="${a.nivel}" ${a.mmsi ? `data-mmsi="${esc(a.mmsi)}"` : ''}><span class="icono">${a.icono}</span><div><b>${esc(a.titulo)}</b><br>${esc(a.texto)}</div></li>`).join('')
    : '<li class="vacio">Sin alertas: sin avisos de mal tiempo ni riesgos de abordaje a la vista.</li>';

  // Emergencia activa: barra roja intermitente y alarma sonora hasta que se silencie
  const activas = emergencias.filter((a) => a.activa);
  const peligroPropio = alertasAbordaje.filter((a) => a.conmigo);
  const barra = $('#alerta-emergencia');
  const principal = activas[0] || peligroPropio[0];
  barra.hidden = !principal;
  if (principal) {
    $('#alerta-emergencia-texto').textContent = `${principal.icono} ${principal.titulo}: ${principal.texto}`;
    barra.dataset.mmsi = principal.mmsi || '';
  }
  alarma(Boolean(principal));

  const banner = $('#alerta-tormenta');
  const tormenta = alertasTiempo.find((a) => a.nivel === 'peligro') || alertasTiempo.find((a) => a.nivel === 'aviso');
  banner.hidden = !tormenta;
  if (tormenta) {
    banner.className = `alerta-tormenta ${tormenta.nivel}`;
    banner.textContent = `${tormenta.icono} ${tormenta.titulo}: ${tormenta.texto}`;
  }

  for (const a of [...activas, ...alertasTiempo.filter((x) => x.nivel === 'peligro'), ...peligroPropio]) {
    if (notificadas.has(a.clave)) continue;
    notificadas.add(a.clave);
    navigator.vibrate?.([300, 150, 300, 150, 600]);
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(`${a.icono} ${a.titulo}`, { body: a.texto, tag: a.clave, requireInteraction: a.nivel === 'peligro' }))
        .catch(() => { try { new Notification(`${a.icono} ${a.titulo}`, { body: a.texto, tag: a.clave }); } catch { /* sin avisos */ } });
    }
  }
}
$('#alerta-tormenta').addEventListener('click', () => abrirPestana('alertas'));
$('#alerta-emergencia').addEventListener('click', (ev) => {
  if (ev.target.id === 'btn-silenciar') return;
  const clave = claveBuque($('#alerta-emergencia').dataset.mmsi);
  if (clave != null) irA(clave);
  else abrirPestana('alertas');
});
$('#btn-silenciar').addEventListener('click', () => silenciarAlarma(5));
$('#lista-alertas').addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-mmsi]');
  if (li) irA(claveBuque(li.dataset.mmsi));
});

// ---------- Estado de los datos ----------
let teselasGuardadas = null;
async function contarTeselas() {
  try {
    let total = 0;
    for (const nombre of ['teselas', 'teselas-opacas']) total += (await (await caches.open(nombre)).keys()).length;
    teselasGuardadas = total;
  } catch { teselasGuardadas = null; }
}

function renderEstado() {
  const conInternet = navigator.onLine;
  $('#conexion').hidden = conInternet;
  const fila = (luz, texto) => `<div><span class="luz ${luz}"></span><span>${texto}</span></div>`;
  const filas = [fila(conInternet ? 'ok' : 'mal', conInternet ? 'Con internet' : '<b>Sin internet</b>: funcionan la carta guardada, GPS, MOB, guía OMI y el último pronóstico')];
  const { modo, fuentes = [] } = estadoFuente;
  if (modo === 'simulacion') filas.push(fila('med', '<b>Buques simulados</b> (práctica): no son reales'));
  else if (modo === 'sin-datos' || !fuentes.length) filas.push(fila('mal', 'Sin conexión con el servidor de datos. No se muestran buques nuevos.'));
  for (const f of fuentes.filter((x) => x.central)) {
    const antiguedad = f.ultimo ? estadoFuente.ahora - f.ultimo + (Date.now() - ultimoPaquete) : null;
    filas.push(fila(f.conectado ? 'ok' : 'mal', `${esc(f.nombre)}: ${f.conectado ? 'conectado' : `<b>sin conexión</b>${f.error ? ` (${esc(f.error)})` : ''}`}` +
      `${antiguedad != null ? `, último envío ${hace(antiguedad)}` : ''}${f.pendientes ? `, <b>${f.pendientes} datos esperando para enviarse</b>` : ', nada pendiente'}`));
  }
  for (const f of fuentes.filter((x) => !x.central)) {
    // f.ultimo viene con el reloj del servidor: se compara con la hora del servidor en el último paquete
    const antiguedad = f.ultimo ? estadoFuente.ahora - f.ultimo + (Date.now() - ultimoPaquete) : null;
    const extra = f.descartados ? `, ${f.descartados} sentencias corruptas descartadas` : '';
    filas.push(fila(f.conectado && antiguedad != null && antiguedad < 120000 ? 'ok' : 'mal',
      `${esc(f.nombre)}: ${antiguedad != null ? `último dato ${hace(antiguedad)}` : 'sin datos todavía'} (${f.mensajes} mensajes${extra})${f.error ? ` · ${esc(f.error)}` : ''}`));
  }
  if (tiempoGuardado) {
    filas.push(fila(tiempoSinConexion ? 'med' : 'ok', `Pronóstico: ${tiempoSinConexion ? 'guardado' : 'actualizado'} ${hace(Date.now() - tiempoGuardado)}`));
  } else {
    filas.push(fila('mal', 'Pronóstico: sin datos'));
  }
  if (config.rol !== 'central') {
    filas.push(propio
      ? fila(propio.precisionM == null || propio.precisionM <= 20 ? 'ok' : 'med',
        `${esc(propio.origen)}: ${propio.precisionM != null ? `±${Math.round(propio.precisionM)} m, ` : ''}${hace(Date.now() - propio.hora)}`)
      : fila('med', 'GPS: sin datos (conectá el GPS del barco o tocá 📍 Mi posición)'));
  }
  if (teselasGuardadas != null) filas.push(fila(teselasGuardadas ? 'ok' : 'med', `Carta sin internet: ${teselasGuardadas} teselas guardadas + costa incluida`));
  $('#estado-datos').innerHTML = filas.join('');
}
window.addEventListener('online', () => { renderEstado(); cargarTiempo(); });
window.addEventListener('offline', renderEstado);

// Guarda las teselas de la zona visible. Máximo 250 por pedido, como pide la política de uso de OpenStreetMap
$('#btn-guardar-zona').addEventListener('click', async () => {
  const estado = $('#guardar-zona-estado');
  if (!navigator.onLine) { estado.textContent = 'Necesitás internet para guardar la zona.'; return; }
  const z0 = Math.round(map.getZoom());
  const urls = [];
  for (let z = z0; z <= Math.min(z0 + 2, 16); z++) {
    const b = map.getPixelBounds(map.getCenter(), z);
    const min = b.min.divideBy(256).floor();
    const max = b.max.divideBy(256).floor();
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        urls.push([`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, 'cors'], [`https://tiles.openseamap.org/seamark/${z}/${x}/${y}.png`, 'no-cors']);
      }
    }
  }
  const lote = urls.slice(0, 500); // 250 de la carta + 250 de balizas
  let hechas = 0;
  let fallas = 0;
  $('#btn-guardar-zona').disabled = true;
  const trabajar = async () => {
    while (lote.length) {
      const [url, mode] = lote.shift();
      try { await fetch(url, { mode }); hechas++; } catch { fallas++; }
      estado.textContent = `Guardando… ${hechas + fallas} de ${Math.min(urls.length, 500)}`;
    }
  };
  await Promise.all([trabajar(), trabajar()]);
  $('#btn-guardar-zona').disabled = false;
  estado.textContent = `Listo: ${hechas} teselas guardadas${fallas ? `, ${fallas} fallaron` : ''}${urls.length > 500 ? '. La zona era grande: acercate más y guardá por partes.' : '.'}`;
  contarTeselas().then(renderEstado);
});

// ---------- Mi posición (GPS) ----------
let marcadorPropio = null;
let circuloPrecision = null;
let vigilancia = null;
let primeraPosicion = true;

function actualizarPropio(pos, origen = 'GPS de este dispositivo') {
  const c = pos.coords;
  const nuevo = { lat: c.latitude, lon: c.longitude };
  // Un GPS que salta a una posición imposible (más de 60 nudos) se ignora
  if (propio && distNM(propio, nuevo) > 0.5 && distNM(propio, nuevo) / Math.max((pos.timestamp - propio.hora) / 3600000, 1 / 3600) > 60) return;
  propio = { mmsi: 'PROPIO', nombre: 'Mi posición', ...nuevo, hora: pos.timestamp, precisionM: c.accuracy, origen,
    sog: c.speed != null ? c.speed * 1.943844 : null, cog: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null };
  const ll = [c.latitude, c.longitude];
  if (!marcadorPropio) {
    marcadorPropio = L.marker(ll, { zIndexOffset: 1500, icon: L.divIcon({ className: 'propio', iconSize: [22, 22],
      html: '<svg width="22" height="22" viewBox="-11 -11 22 22"><circle r="9" fill="#3fb6ff" fill-opacity="0.3" stroke="#3fb6ff" stroke-width="2"/><circle r="4" fill="#fff" stroke="#3fb6ff" stroke-width="2"/></svg>' }) })
      .bindTooltip('Mi posición').addTo(map);
    circuloPrecision = L.circle(ll, { radius: c.accuracy || 0, color: '#3fb6ff', weight: 1, fillOpacity: 0.08 }).addTo(map);
  }
  marcadorPropio.setLatLng(ll);
  circuloPrecision.setLatLng(ll).setRadius(c.accuracy || 0);
  marcadorPropio.setTooltipContent(`Mi posición (${origen}) · ${fmtPos(propio)}${c.accuracy ? ` · ±${Math.round(c.accuracy)} m` : ''}${propio.sog != null ? ` · ${num(propio.sog)} kn ${grados(propio.cog)}` : ''}`);
  if (primeraPosicion) { map.setView(ll, Math.max(map.getZoom(), 12)); primeraPosicion = false; }
  socorro?.generar();
}

function encenderGPS() {
  if (vigilancia != null || !navigator.geolocation) return;
  $('#btn-gps').classList.add('activo');
  vigilancia = navigator.geolocation.watchPosition(actualizarPropio, (err) => {
    alert(`No se pudo obtener tu posición: ${err.message}`);
    apagarGPS();
  }, { enableHighAccuracy: true, maximumAge: 5000 });
}

function apagarGPS() {
  if (vigilancia != null) navigator.geolocation.clearWatch(vigilancia);
  vigilancia = null;
  propio = null;
  primeraPosicion = true;
  marcadorPropio?.remove();
  circuloPrecision?.remove();
  marcadorPropio = circuloPrecision = null;
  $('#btn-gps').classList.remove('activo');
  socorro?.generar();
}

$('#btn-gps').addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Este dispositivo no tiene GPS disponible.'); return; }
  if (vigilancia != null) apagarGPS();
  else encenderGPS();
});

// Para el MOB: una posición en pocos segundos, aunque el GPS estuviera apagado
function obtenerPosicionRapida() {
  return new Promise((resolver) => {
    if (!navigator.geolocation) return resolver(null);
    navigator.geolocation.getCurrentPosition((pos) => {
      actualizarPropio(pos);
      encenderGPS();
      resolver({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    }, () => resolver(null), { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 });
  });
}

// ---------- Hombre al agua y mensajes de socorro ----------
const mob = crearMOB({ map, obtenerPropio: () => propio, obtenerPosicionRapida, alAvisar: avisarOficina });
socorro = crearGeneradorSocorro({
  obtenerPropio: () => propio,
  obtenerMOB: () => mob.actual(),
  referencia: (p) => { const r = referencia(p); return { punto: r.punto, nombre: r.nombre.toUpperCase() }; },
});
$('#btn-mob').addEventListener('click', () => mob.marcar());
$('#mob-fin').addEventListener('click', () => mob.terminar());
$('#mob-mayday').addEventListener('click', () => {
  $('#sos-naturaleza').value = 'mob';
  document.querySelector('input[name="sos-tipo"][value="mayday"]').checked = true;
  socorro.generar();
  abrirPestana('sos');
});
mob.actualizar();


// ---------- Avisos a la oficina (Trappi Central) ----------
async function avisarOficina(tipo, posicion = null, texto = '') {
  if (config.rol !== 'abordo' || !config.central) return { enviada: false, motivo: 'Este equipo no está vinculado a Trappi Central' };
  try {
    const r = await fetch('api/alerta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, ...(posicion ? { lat: posicion.lat, lon: posicion.lon } : {}), texto }) });
    return await r.json();
  } catch {
    return { enviada: false, motivo: 'Sin conexión con Trappi a bordo' };
  }
}

$('#sos-enviar').addEventListener('click', async () => {
  const tipo = document.querySelector('input[name="sos-tipo"]:checked').value;
  if (tipo === 'securite') { $('#sos-enviar-estado').textContent = 'Los avisos SÉCURITÉ se transmiten por radio; a la oficina se envían MAYDAY y PAN-PAN.'; return; }
  if (!confirm(`¿Enviar ${tipo === 'mayday' ? 'MAYDAY' : 'PAN-PAN'} a la oficina? Esto NO reemplaza la llamada por VHF canal 16 ni el aviso a Prefectura.`)) return;
  const lugar = $('#sos-naturaleza').value === 'mob' && mob.actual() ? mob.actual() : propio;
  const r = await avisarOficina(tipo === 'mayday' ? 'MAYDAY' : 'PANPAN', lugar, $('#sos-mensaje').textContent);
  $('#sos-enviar-estado').textContent = r.ok
    ? (r.enviada ? '✓ Enviado a la oficina.' : '⏳ Sin conexión ahora: quedó guardado y se envía apenas vuelva internet.')
    : `No se pudo enviar: ${r.motivo || r.error}`;
});

// ---------- Recorrido histórico (oficina) ----------
const capaHistorial = L.layerGroup().addTo(map);
let historialDe = null;
let historialTexto = '';
async function verRecorrido(b, horas = 24) {
  capaHistorial.clearLayers();
  if (historialDe === b.id) { historialDe = null; renderFicha(); return; }
  try {
    let datos;
    if (flotaDemo) {
      datos = { puntos: flotaDemo.historial(b.id, horas) };
    } else {
      const r = await fetch(`api/historial?buque=${encodeURIComponent(b.id)}&horas=${horas}`);
      datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
    }
    historialDe = b.id;
    if (datos.puntos.length) {
      const linea = L.polyline(datos.puntos.map(([la, lo]) => [la, lo]), { color: '#7c5cff', weight: 3, opacity: 0.85 }).addTo(capaHistorial);
      const [la0, lo0, h0] = datos.puntos[0];
      L.circleMarker([la0, lo0], { radius: 5, color: '#7c5cff', fillOpacity: 1 }).bindTooltip(`Inicio: ${diaHora(h0)}`).addTo(capaHistorial);
      map.fitBounds(linea.getBounds(), { padding: [40, 40], maxZoom: 13 });
    }
    historialTexto = datos.puntos.length
      ? `Recorrido de ${horas} h: ${datos.puntos.length} posiciones, ${num(recorrido(datos.puntos))} MN navegadas.`
      : `Sin posiciones en las últimas ${horas} h.`;
    renderFicha();
  } catch (e) {
    alert(`No se pudo cargar el recorrido: ${e.message}`);
  }
}
const recorrido = (puntos) => puntos.reduce((t, p, i) => (i ? t + distNM({ lat: puntos[i - 1][0], lon: puntos[i - 1][1] }, { lat: p[0], lon: p[1] }) : 0), 0);

// ---------- Configuración según dónde corre: PC del barco u oficina ----------
async function cargarConfig() {
  if (DEMO_OFICINA) {
    const { EMPRESA_DEMO } = await import('./simulacion-flota.js');
    config = { rol: 'central', empresa: EMPRESA_DEMO, usuario: 'demostración', demo: true };
  } else if (!PRACTICA) {
    try {
      const r = await fetch('api/config');
      if (r.status === 401) { location.href = 'login.html'; return; }
      if (r.ok) config = await r.json();
    } catch { /* sin servidor: se queda como equipo de a bordo */ }
  }
  if (config.rol === 'central') {
    $('#titulo-producto').textContent = '· Monitoreo de flota';
    $('#sesion').hidden = false;
    $('#sesion').textContent = `${config.empresa} · ${config.usuario}`;
    $('#btn-salir').hidden = Boolean(config.demo);
    $('#btn-demo-sos').hidden = !config.demo;
    $('#resumen-flota').hidden = false;
    $('#btn-mob').hidden = true;
    $('#btn-gps').hidden = true;
    $('#filtro-tipo').value = '';
  } else if (config.central) {
    $('#titulo-producto').textContent = `· A bordo${config.buque ? ` · ${config.buque.nombre}` : ''}`;
    $('#sos-enviar').hidden = false;
  }
  renderEstado();
}
// Demostración: simular que un barco envía un hombre al agua, y terminarlo
$('#btn-demo-sos').addEventListener('click', () => {
  if (!flotaDemo) return;
  if (flotaDemo.hayAlerta()) flotaDemo.terminarSOS();
  else flotaDemo.simularSOS();
  $('#btn-demo-sos').innerHTML = flotaDemo.hayAlerta() ? '✓<span> Terminar SOS</span>' : '🧪<span> Simular SOS</span>';
});

$('#btn-salir').addEventListener('click', async () => {
  try { await fetch('api/logout', { method: 'POST' }); } catch { /* igual se sale */ }
  location.href = 'login.html';
});

// ---------- Regla: distancia y rumbo ----------
let regla = null;
$('#btn-regla').addEventListener('click', () => (regla ? terminarRegla() : empezarRegla()));
function empezarRegla() {
  regla = { puntos: [], linea: L.polyline([], { color: '#ffd23f', weight: 3, dashArray: '2 6' }).addTo(map), marcas: L.layerGroup().addTo(map) };
  $('#btn-regla').classList.add('activo');
  map.doubleClickZoom.disable();
  map.getContainer().style.cursor = 'crosshair';
  $('#regla-info').hidden = false;
  $('#regla-info').textContent = 'Tocá la carta para marcar puntos. Pulsá 📏 otra vez para terminar.';
}
function terminarRegla() {
  regla.linea.remove();
  regla.marcas.remove();
  regla = null;
  $('#btn-regla').classList.remove('activo');
  map.doubleClickZoom.enable();
  map.getContainer().style.cursor = '';
  $('#regla-info').hidden = true;
}
map.on('click', (e) => {
  if (!regla) return;
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  regla.puntos.push(p);
  regla.linea.addLatLng(e.latlng);
  L.circleMarker(e.latlng, { radius: 4, color: '#ffd23f', fillOpacity: 1 }).addTo(regla.marcas);
  const n = regla.puntos.length;
  if (n < 2) return;
  let total = 0;
  for (let k = 1; k < n; k++) total += distNM(regla.puntos[k - 1], regla.puntos[k]);
  const ult = distNM(regla.puntos[n - 2], p);
  const r = rumbo(regla.puntos[n - 2], p);
  const tiempo = (kn) => { const min = Math.round((total / kn) * 60); return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`; };
  $('#regla-info').textContent = `Tramo: ${num(ult, 2)} MN al ${grados(r)} · Total: ${num(total, 2)} MN · a 6 kn: ${tiempo(6)} · a 10 kn: ${tiempo(10)}`;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && regla) terminarRegla(); });

// ---------- Interfaz ----------
function abrirPestana(nombre) {
  document.querySelectorAll('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.pestana === nombre));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${nombre}`));
  $('#panel').classList.add('abierto');
  if (nombre === 'alertas') contarTeselas().then(renderEstado);
}
document.querySelectorAll('.pestanas button').forEach((b) => b.addEventListener('click', () => abrirPestana(b.dataset.pestana)));
$('#btn-panel').addEventListener('click', () => $('#panel').classList.toggle('abierto'));

$('#btn-noche').addEventListener('click', () => {
  const noche = document.body.classList.toggle('noche');
  $('#btn-noche').classList.toggle('activo', noche);
  guardar('carta-noche', noche ? '1' : '0');
});
if (leer('carta-noche') === '1') { document.body.classList.add('noche'); $('#btn-noche').classList.add('activo'); }

$('#btn-avisos').addEventListener('click', async () => {
  if (!('Notification' in window)) { alert('Este navegador no permite avisos. Las alertas igual aparecen en las barras de arriba, con sonido, y en la pestaña ⚠ Alertas.'); return; }
  const permiso = await Notification.requestPermission();
  $('#btn-avisos').classList.toggle('activo', permiso === 'granted');
  if (permiso === 'granted') {
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification('⚓ Avisos activados', { body: 'Te aviso si viene temporal, tormenta, una emergencia AIS o riesgo de abordaje mientras la carta esté abierta.' }))
      .catch(() => {});
  }
});
if ('Notification' in window && Notification.permission === 'granted') $('#btn-avisos').classList.add('activo');

function reloj() {
  const ahora = new Date();
  $('#reloj').textContent = `${horaLocal(ahora)} hora local · ${ahora.toISOString().slice(11, 16)} UTC`;
}
setInterval(reloj, 1000);
reloj();
// Cada 5 s se reevalúa la edad de las señales, aunque no lleguen datos nuevos
setInterval(() => { refrescarIconos(); renderEstado(); if (!ultimoPaquete || Date.now() - ultimoPaquete > 5000) { calcularRiesgos(); renderLista(); renderAlertas(); } }, 5000);

// La página queda guardada en el dispositivo para abrirla sin internet
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => contarTeselas().then(renderEstado)).catch(() => {});
}

cargarConfig().then(conectar);
cargarTiempo();
renderEstado();
