// Flota pesquera SIMULADA para la demostración de la oficina (Trappi Central sin servidor).
// Barcos y empresa inventados, repartidos por el Mar Argentino. Genera también las últimas 24 h de recorrido.
import { CANAL_PRINCIPAL, crearSimulacion } from './simulacion.js';

const DESDE_BAHIA_BLANCA = [...CANAL_PRINCIPAL].reverse(); // de Ing. White hacia la entrada del canal
const DESDE_MAR_DEL_PLATA = [[-38.045, -57.525], [-38.07, -57.43], [-38.25, -57.15], [-38.5, -56.95]];

// Zonas de pesca de ejemplo en el Mar Argentino (centro y radio en millas)
const FLOTA = [
  { id: 'antares', mmsi: 701990001, nombre: 'ANTARES (SIM)', tipo: 30, sog: 3.5, centro: [-38.62, -56.85], radio: 5, estado: 7, eslora: 32, manga: 8 },
  { id: 'lucero', mmsi: 701990004, nombre: 'LUCERO (SIM)', tipo: 30, sog: 9, estado: 0, eslora: 30, manga: 8,
    ruta: DESDE_MAR_DEL_PLATA, avance: 0.6, sentido: -1, destino: 'MAR DEL PLATA' },
  { id: 'amanecer', mmsi: 701990005, nombre: 'NUEVO AMANECER (SIM)', tipo: 30, sog: 0, fijo: [-38.043, -57.533], estado: 5, eslora: 26, manga: 7 },
  { id: 'cruz', mmsi: 701990003, nombre: 'CRUZ DEL SUR (SIM)', tipo: 30, sog: 9.5, estado: 0, eslora: 35, manga: 8.5,
    ruta: [...DESDE_BAHIA_BLANCA, [-39.35, -61.25], [-39.55, -60.95]], avance: 0.35, destino: 'CALADERO' },
  { id: 'patagonia', mmsi: 701990007, nombre: 'PATAGONIA I (SIM)', tipo: 30, sog: 3.4, centro: [-43.35, -63.85], radio: 4, estado: 7, eslora: 38, manga: 9 },
  { id: 'maria', mmsi: 701990002, nombre: 'MARÍA DEL MAR (SIM)', tipo: 30, sog: 3.2, centro: [-45.95, -66.35], radio: 5, estado: 7, eslora: 28, manga: 7.5 },
  // Este barco perdió la conexión hace 25 minutos: la oficina lo ve transparente, con su última posición
  { id: 'siempre', mmsi: 701990006, nombre: 'SIEMPRE ADELANTE (SIM)', tipo: 30, sog: 3.8, centro: [-47.9, -64.6], radio: 5, estado: 7, eslora: 29, manga: 7.5, cortaA: 25 },
  { id: 'estrella', mmsi: 701990008, nombre: 'ESTRELLA AUSTRAL (SIM)', tipo: 30, sog: 3.6, centro: [-50.6, -66.3], radio: 6, estado: 7, eslora: 42, manga: 10 },
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
