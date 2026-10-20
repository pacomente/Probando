// Tráfico simulado en la ría de Bahía Blanca, para usar la carta sin clave AIS.
// Los nombres y MMSI son inventados; las rutas siguen el Canal Principal de forma aproximada.
import { destino, distNM, rumbo } from './navegacion.js';

// Canal Principal, desde la entrada (afuera) hasta Puerto Ingeniero White. Trazado aproximado.
export const CANAL_PRINCIPAL = [
  [-39.2, -61.55], [-39.08, -61.8], [-38.99, -61.95], [-38.95, -62.05],
  [-38.88, -62.13], [-38.83, -62.21], [-38.795, -62.27],
];

const ROSALES = [[-38.99, -61.95], [-38.95, -62.02], [-38.925, -62.065]];
const DARSENA_WHITE = [[-38.806, -62.255], [-38.8, -62.24], [-38.815, -62.225], [-38.83, -62.21]];

const FLOTA = [
  { mmsi: 701000101, nombre: 'PAMPA GRAIN (SIM)', tipo: 70, sog: 10, ruta: CANAL_PRINCIPAL, avance: 0.05, destino: 'ING WHITE', eslora: 225, manga: 32, calado: 12.2, callsign: 'LW0001' },
  { mmsi: 701000102, nombre: 'PATAGONIA STAR (SIM)', tipo: 80, sog: 11, ruta: CANAL_PRINCIPAL, avance: 0.9, sentido: -1, destino: 'BUENOS AIRES', eslora: 183, manga: 32, calado: 10.5, callsign: 'LW0002' },
  { mmsi: 701000103, nombre: 'AUSTRAL BOX (SIM)', tipo: 71, sog: 12.5, ruta: CANAL_PRINCIPAL, avance: 0.45, destino: 'ING WHITE', eslora: 260, manga: 40, calado: 11.8, callsign: 'LW0003' },
  { mmsi: 701000104, nombre: 'REM COLORADA (SIM)', tipo: 52, sog: 6, ruta: DARSENA_WHITE, avance: 0.3, destino: 'ING WHITE', eslora: 32, manga: 11, calado: 4.5 },
  { mmsi: 701000105, nombre: 'PRACTICO 1 (SIM)', tipo: 50, sog: 15, ruta: CANAL_PRINCIPAL, avance: 0.6, sentido: -1, destino: 'RECALADA', eslora: 18, manga: 5 },
  { mmsi: 701000106, nombre: 'GUARDACOSTAS SIM', tipo: 55, sog: 9, ruta: ROSALES, avance: 0.5, destino: 'PTO ROSALES', eslora: 28, manga: 6 },
  { mmsi: 701000107, nombre: 'DON VICENTE (SIM)', tipo: 30, flota: true, sog: 4, centro: [-39.3, -61.75], radio: 5, estado: 7, eslora: 24, manga: 7 },
  { mmsi: 701000108, nombre: 'SANTA ROSA II (SIM)', tipo: 30, flota: true, sog: 3.5, centro: [-39.28, -61.62], radio: 7, estado: 7, eslora: 20, manga: 6 },
  { mmsi: 701000109, nombre: 'ALBATROS (SIM)', tipo: 36, sog: 5, centro: [-38.92, -62.17], radio: 2, eslora: 11, manga: 3.5 },
  { mmsi: 970999001, nombre: 'SART TEST (SIM)', tipo: null, sog: 0.4, centro: [-39.1, -61.96], radio: 0.3, estado: 15, mensajeSeguridad: 'SART TEST' },
  { mmsi: 701000110, nombre: 'RIO NEGRO TRADER (SIM)', tipo: 70, sog: 0.1, fijo: [-39.06, -61.86], cog: 210, estado: 1, destino: 'ING WHITE', eslora: 199, manga: 30, calado: 9.8 },
];

const DESVIO_ESTRIBOR_MN = 0.12; // cada buque navega por su mitad del canal

// flota: lista de buques a simular (por defecto, el tráfico de práctica de la ría)
export function crearSimulacion(flota = FLOTA) {
  const buques = flota.map((d) => {
    const b = { ...d, sim: true, sentido: d.sentido || 1 };
    if (d.ruta) {
      b.tramos = longitudes(d.ruta);
      b.total = b.tramos.at(-1);
      b.s = d.avance * b.total;
    } else if (d.centro) {
      b.lat = d.centro[0];
      b.lon = d.centro[1];
      b.cog = Math.random() * 360;
    } else {
      [b.lat, b.lon] = d.fijo;
    }
    return b;
  });

  function paso(dtSeg) {
    const dtH = dtSeg / 3600;
    for (const b of buques) {
      if (b.ruta) seguirRuta(b, dtH);
      else if (b.centro) deambular(b, dtSeg, dtH);
    }
  }

  function lista() {
    return buques.map((b) => ({
      id: b.id, mmsi: b.mmsi, nombre: b.nombre, tipo: b.tipo, lat: b.lat, lon: b.lon,
      sog: Math.round((b.sogActual ?? b.sog) * 10) / 10,
      cog: Math.round(b.cog ?? 0), rumbo: Math.round(b.cog ?? 0), estado: b.estado ?? 0,
      destino: b.destino, eslora: b.eslora, manga: b.manga, calado: b.calado, callsign: b.callsign, sim: true,
      precision: 1, mensajeSeguridad: b.mensajeSeguridad, flota: b.flota,
    }));
  }

  paso(0);
  return { paso, lista };
}

function longitudes(ruta) {
  const acum = [0];
  for (let i = 1; i < ruta.length; i++) {
    acum.push(acum[i - 1] + distNM(punto(ruta[i - 1]), punto(ruta[i])));
  }
  return acum;
}

function seguirRuta(b, dtH) {
  b.sogActual = b.sog + (Math.random() - 0.5) * 0.4;
  b.s += b.sentido * b.sogActual * dtH;
  if (b.s > b.total) { b.s = 2 * b.total - b.s; b.sentido = -1; }
  if (b.s < 0) { b.s = -b.s; b.sentido = 1; }
  let i = 1;
  while (i < b.tramos.length - 1 && b.tramos[i] < b.s) i++;
  const a = punto(b.ruta[i - 1]);
  const c = punto(b.ruta[i]);
  const f = (b.s - b.tramos[i - 1]) / (b.tramos[i] - b.tramos[i - 1] || 1);
  const sobreEje = { lat: a.lat + (c.lat - a.lat) * f, lon: a.lon + (c.lon - a.lon) * f };
  const rumboTramo = b.sentido > 0 ? rumbo(a, c) : rumbo(c, a);
  const p = destino(sobreEje, rumboTramo + 90, DESVIO_ESTRIBOR_MN);
  b.lat = p.lat;
  b.lon = p.lon;
  b.cog = (rumboTramo + (Math.random() - 0.5) * 3 + 360) % 360;
}

function deambular(b, dtSeg, dtH) {
  const centro = punto(b.centro);
  if (distNM(b, centro) > b.radio) {
    const hacia = rumbo(b, centro);
    const giro = ((hacia - b.cog + 540) % 360) - 180;
    b.cog += Math.sign(giro) * Math.min(Math.abs(giro), 3 * dtSeg);
  } else {
    b.cog += (Math.random() - 0.5) * 0.6 * dtSeg;
  }
  b.cog = (b.cog + 360) % 360;
  b.sogActual = Math.max(0.5, b.sog + (Math.random() - 0.5) * 0.6);
  const p = destino(b, b.cog, b.sogActual * dtH);
  b.lat = p.lat;
  b.lon = p.lon;
}

const punto = ([lat, lon]) => ({ lat, lon });
