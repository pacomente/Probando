// Reproducciones por película y estado de los links externos (datos/estadisticas.json).
import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CARPETA_DATOS } from './datos.js';

const ARCHIVO = path.join(CARPETA_DATOS, 'estadisticas.json');
const DIA = 86400000;
let datos = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : {};
datos.vistas ||= {};   // id → { total, dias: { 'AAAA-MM-DD': n } }
datos.enlaces ||= {};  // id → { ok, detalle, fecha }

let pendiente = null;
function guardar() {
  if (pendiente) return;
  pendiente = setTimeout(async () => {
    pendiente = null;
    try {
      await writeFile(`${ARCHIVO}.tmp`, JSON.stringify(datos));
      await rename(`${ARCHIVO}.tmp`, ARCHIVO);
    } catch (e) { console.error('No se pudieron guardar las estadísticas:', e.message); }
  }, 3000);
}

const hoy = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

// Una vista por persona y película cada 30 minutos: volver a abrirla o adelantar no suma
const recientes = new Map();
export function registrarVista(id, quien) {
  const clave = `${quien}|${id}`;
  if (Date.now() - (recientes.get(clave) || 0) < 30 * 60000) return false;
  recientes.set(clave, Date.now());
  if (recientes.size > 20000) for (const [k, t] of recientes) if (Date.now() - t > 30 * 60000) recientes.delete(k);
  const v = (datos.vistas[id] ||= { total: 0, dias: {} });
  v.total++;
  v.dias[hoy()] = (v.dias[hoy()] || 0) + 1;
  // Se guarda el detalle diario de los últimos 90 días
  const limite = hoy(Date.now() - 90 * DIA);
  for (const d of Object.keys(v.dias)) if (d < limite) delete v.dias[d];
  guardar();
  return true;
}

export function vistas(id, dias = 30) {
  const v = datos.vistas[id];
  if (!v) return { total: 0, recientes: 0 };
  const desde = hoy(Date.now() - (dias - 1) * DIA);
  return { total: v.total, recientes: Object.entries(v.dias).filter(([d]) => d >= desde).reduce((a, [, n]) => a + n, 0) };
}

// Reproducciones de todo el catálogo por día (para el gráfico del resumen)
export function vistasPorDia(dias = 30) {
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = hoy(Date.now() - i * DIA);
    serie.push({ dia: d, n: Object.values(datos.vistas).reduce((a, v) => a + (v.dias[d] || 0), 0) });
  }
  return serie;
}

export const estadoEnlace = (id) => datos.enlaces[id] || null;
export function guardarEnlace(id, resultado) { datos.enlaces[id] = { ...resultado, fecha: Date.now() }; guardar(); }
export function olvidarPelicula(id) { delete datos.vistas[id]; delete datos.enlaces[id]; guardar(); }

// ¿El link del video sigue andando? Se piden los primeros bytes, como haría el reproductor
export async function revisarEnlace(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023', 'User-Agent': 'Cinetream/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    r.body?.cancel().catch(() => {});
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok) return { ok: false, detalle: `El sitio respondió ${r.status}` };
    if (/text\/html/i.test(tipo)) return { ok: false, detalle: 'El link ya no lleva a un video (devuelve una página)' };
    return { ok: true, detalle: 'Funciona' };
  } catch (e) {
    return { ok: false, detalle: e.name === 'TimeoutError' ? 'El sitio no respondió a tiempo' : 'No se pudo conectar con el sitio' };
  }
}
