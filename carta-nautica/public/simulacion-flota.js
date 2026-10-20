// Flota pesquera SIMULADA para la demostración de la oficina (Trappi Central sin servidor).
// Barcos y empresa inventados. Genera también las últimas 24 h de recorrido de cada barco.
import { CANAL_PRINCIPAL, crearSimulacion } from './simulacion.js';

const DESDE_PUERTO = [...CANAL_PRINCIPAL].reverse(); // de Ing. White hacia la entrada del canal
const CALADERO_NORTE = [-39.55, -60.95];
const CALADERO_SUR = [-39.95, -60.45];

const FLOTA = [
  { id: 'antares', mmsi: 701990001, nombre: 'ANTARES (SIM)', tipo: 30, sog: 3.5, centro: CALADERO_NORTE, radio: 4, estado: 7, eslora: 32, manga: 8 },
  { id: 'maria', mmsi: 701990002, nombre: 'MARÍA DEL MAR (SIM)', tipo: 30, sog: 3.2, centro: CALADERO_SUR, radio: 5, estado: 7, eslora: 28, manga: 7.5 },
  { id: 'cruz', mmsi: 701990003, nombre: 'CRUZ DEL SUR (SIM)', tipo: 30, sog: 9.5, estado: 0, eslora: 35, manga: 8.5,
    ruta: [...DESDE_PUERTO, [-39.35, -61.25], CALADERO_NORTE], avance: 0.35, destino: 'CALADERO' },
  { id: 'lucero', mmsi: 701990004, nombre: 'LUCERO (SIM)', tipo: 30, sog: 9, estado: 0, eslora: 30, manga: 8,
    ruta: [...DESDE_PUERTO, [-39.5, -61.0], CALADERO_SUR], avance: 0.8, sentido: -1, destino: 'ING WHITE' },
  { id: 'amanecer', mmsi: 701990005, nombre: 'NUEVO AMANECER (SIM)', tipo: 30, sog: 0, fijo: [-38.7925, -62.2735], estado: 5, eslora: 26, manga: 7 },
  // Este barco perdió la conexión hace 25 minutos: la oficina lo ve transparente, con su última posición
  { id: 'siempre', mmsi: 701990006, nombre: 'SIEMPRE ADELANTE (SIM)', tipo: 30, sog: 3.8, centro: [-39.75, -60.75], radio: 4, estado: 7, eslora: 29, manga: 7.5, cortaA: 25 },
];

export const EMPRESA_DEMO = 'Pesquera Demo (SIM)';

export function crearFlotaSimulada() {
  const sim = crearSimulacion(FLOTA);
  const historial = new Map(FLOTA.map((b) => [b.id, []])); // id → [[lat, lon, hora]]
  const corte = new Map(FLOTA.filter((b) => b.cortaA).map((b) => [b.id, b.cortaA * 60000]));
  const sos = new Map();
  let ultimas = new Map();

  function registrar(hora) {
    for (const b of sim.lista()) {
      const ms = corte.get(b.id);
      if (ms && hora > Date.now() - ms) continue; // sin conexión: no llegan posiciones
      ultimas.set(b.id, { ...b, hora });
      const h = historial.get(b.id);
      if (!h.length || hora - h.at(-1)[2] >= 60000) h.push([b.lat, b.lon, hora]);
    }
  }

  // Las últimas 24 h, a paso de un minuto
  const inicio = Date.now() - 24 * 3600000;
  for (let t = inicio; t < Date.now(); t += 60000) {
    sim.paso(60);
    registrar(t);
  }

  let anterior = Date.now();
  return {
    paso() {
      const ahora = Date.now();
      sim.paso((ahora - anterior) / 1000);
      anterior = ahora;
      registrar(ahora);
    },
    // Mismo formato que manda Trappi Central a la oficina
    buques() {
      const limite = Date.now() - 3 * 3600000;
      return [...ultimas.values()].map((b) => ({
        ...b, flota: true, actualizado: b.hora, sos: sos.get(b.id) || null,
        estela: historial.get(b.id).filter((p) => p[2] >= limite).map(([la, lo]) => [la, lo]),
      }));
    },
    historial(id, horas) {
      const desde = Date.now() - horas * 3600000;
      return (historial.get(id) || []).filter((p) => p[2] >= desde);
    },
    simularSOS(id = 'antares', alerta = 'MOB') {
      const b = ultimas.get(id);
      sos.set(id, { alerta, hora: Date.now(), lat: b.lat, lon: b.lon, texto: '' });
    },
    terminarSOS() { sos.clear(); },
    hayAlerta: () => sos.size > 0,
    total: FLOTA.length,
  };
}
