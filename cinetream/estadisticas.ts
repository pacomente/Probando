// Reproducciones por película y estado de los links externos (en la base de datos, documento «estadisticas»).
import { documento } from './base.ts';

const DIA = 86400000;
interface Vistas { total: number; dias: Record<string, number> }
interface EstadoEnlace { ok: boolean; detalle: string; fecha?: number }
interface Estadisticas { vistas: Record<string, Vistas>; enlaces: Record<string, EstadoEnlace> }
const doc = documento<Partial<Estadisticas>>('estadisticas', { migrarDe: { archivo: 'estadisticas.json' }, inicial: () => ({}) });
const datos = doc.leer() as Estadisticas;
datos.vistas ||= {};   // id → { total, dias: { 'AAAA-MM-DD': n } }
datos.enlaces ||= {};  // id → { ok, detalle, fecha }

let pendiente: NodeJS.Timeout | null = null;
function guardar() {
  if (pendiente) return;
  pendiente = setTimeout(async () => {
    pendiente = null;
    try { doc.guardar(datos); } catch (e) { console.error('No se pudieron guardar las estadísticas:', e.message); }
  }, 3000);
}

const hoy = (ms = Date.now()): string => new Date(ms).toISOString().slice(0, 10);

// Una vista por persona y película cada 30 minutos: volver a abrirla o adelantar no suma
const recientes = new Map<string, number>();
export function registrarVista(id: string, quien: string): boolean {
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

export function vistas(id: string, dias = 30): { total: number; recientes: number } {
  const v = datos.vistas[id];
  if (!v) return { total: 0, recientes: 0 };
  const desde = hoy(Date.now() - (dias - 1) * DIA);
  return { total: v.total, recientes: Object.entries(v.dias).filter(([d]) => d >= desde).reduce((a, [, n]) => a + n, 0) };
}

// Reproducciones de todo el catálogo por día (para el gráfico del resumen)
export function vistasPorDia(dias = 30) {
  const serie: { dia: string; n: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = hoy(Date.now() - i * DIA);
    serie.push({ dia: d, n: Object.values(datos.vistas).reduce((a, v) => a + (v.dias[d] || 0), 0) });
  }
  return serie;
}

export const estadoEnlace = (id: string): EstadoEnlace | null => datos.enlaces[id] || null;
export function guardarEnlace(id: string, resultado: EstadoEnlace) { datos.enlaces[id] = { ...resultado, fecha: Date.now() }; guardar(); }
export function olvidarPelicula(id: string) { delete datos.vistas[id]; delete datos.enlaces[id]; guardar(); }

// ¿El link del video sigue andando? Se piden los primeros bytes, como haría el reproductor
export async function revisarEnlace(url: string): Promise<EstadoEnlace> {
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
