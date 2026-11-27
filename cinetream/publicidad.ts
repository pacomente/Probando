// Publicidad de Cinetream: campañas, sus piezas (imagen, video o texto) y las estadísticas.
// Formatos: "previo" (antes de la película, se puede saltar) y "banner" (en el inicio).
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CARPETA_DATOS, coleccion } from './base.ts';
import type { Campana } from './tipos.ts';

export const CARPETA_PIEZAS = path.join(CARPETA_DATOS, 'anuncios');
mkdirSync(CARPETA_PIEZAS, { recursive: true });

// Para arrancar: campañas propias de Cinetream (promocionan el plan Plus), sin anunciantes inventados
const INICIALES: Campana[] = [
  {
    id: 'cinetream-plus-previo', nombre: 'Pasate a Plus (antes de la película)', anunciante: 'Cinetream', tipo: 'previo',
    titulo: 'Mirá sin cortes con Cinetream Plus', texto: 'Sin publicidad y con los títulos Plus. Cambiá de plan desde Perfil y ajustes.',
    pieza: null, piezaTipo: null, enlace: '', colores: ['#1d1203', '#ffb547'], duracion: 6, saltarTras: 3, peso: 1,
    activa: true, desde: null, hasta: null, stats: { impresiones: 0, clics: 0, completos: 0 },
  },
  {
    id: 'cinetream-plus-banner', nombre: 'Pasate a Plus (banner)', anunciante: 'Cinetream', tipo: 'banner',
    titulo: 'Cinetream Plus', texto: 'Todo el catálogo sin publicidad y con estrenos Plus.',
    pieza: null, piezaTipo: null, enlace: '', colores: ['#20160a', '#ffb547'], duracion: 0, saltarTras: 0, peso: 1,
    activa: true, desde: null, hasta: null, stats: { impresiones: 0, clics: 0, completos: 0 },
  },
];

// Una fila por campaña en la base de datos
const tablaCampanas = coleccion<Campana>('campanas', {
  indices: [{ campo: 'activa' }],
  migrarDe: { archivo: 'publicidad.json', extraer: (x) => x.campanas },
  inicial: () => INICIALES,
});
let datos = { campanas: [...tablaCampanas.todos()] };
let pendiente: NodeJS.Timeout | null = null;
function guardar() {
  try { tablaCampanas.guardar(datos.campanas); } catch (e) { console.error('No se pudo guardar la publicidad:', e.message); }
  return Promise.resolve();
}
// Las estadísticas llegan seguido: se guardan como mucho cada 5 segundos
const guardarLuego = () => { if (!pendiente) pendiente = setTimeout(() => { pendiente = null; guardar(); }, 5000); };

export const campanas = () => datos.campanas;
export const buscarCampana = (id: string): Campana | undefined => datos.campanas.find((c) => c.id === id);

const vigente = (c: Campana, ahora = Date.now()) => c.activa && (!c.desde || c.desde <= ahora) && (!c.hasta || c.hasta + 86400000 > ahora);
// Lo que ve el reproductor y el inicio: sin estadísticas ni datos internos
export const campanasVigentes = () => datos.campanas.filter((c) => vigente(c)).map(({ stats, nombre, desde, hasta, activa, ...c }) => c);

const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const fecha = (v: unknown): number | null => (v ? Date.parse(String(v)) || Number(v) || null : null);
const color = (c: unknown, d: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d);
type DatosCampana = Omit<Campana, 'id' | 'pieza' | 'piezaTipo' | 'stats'>;
function limpiar(d: Record<string, any>, previo: Partial<Campana> = {}): DatosCampana {
  let enlace = texto(d.enlace, 500);
  if (enlace && !/^https?:\/\//i.test(enlace)) enlace = ''; // solo enlaces web
  return {
    ...previo,
    nombre: texto(d.nombre, 80) || 'Campaña sin nombre',
    anunciante: texto(d.anunciante, 80),
    tipo: d.tipo === 'banner' ? 'banner' as const : 'previo' as const,
    titulo: texto(d.titulo, 80),
    texto: texto(d.texto, 200),
    enlace,
    colores: [color(d.colores?.[0], '#1d1203'), color(d.colores?.[1], '#ffb547')] as [string, string],
    duracion: Math.min(Math.max(Math.round(Number(d.duracion) || 6), 3), 60),
    saltarTras: Number.isFinite(Number(d.saltarTras)) && d.saltarTras !== '' ? Math.min(Math.max(Math.round(Number(d.saltarTras)), 0), 30) : 5,
    peso: Math.min(Math.max(Math.round(Number(d.peso) || 1), 1), 10),
    activa: Boolean(d.activa),
    desde: fecha(d.desde),
    hasta: fecha(d.hasta),
  };
}

export function crearCampana(d: Record<string, any>): Campana {
  const c: Campana = { ...limpiar(d), id: `c-${crypto.randomBytes(5).toString('hex')}`, pieza: null, piezaTipo: null, stats: { impresiones: 0, clics: 0, completos: 0 } };
  datos.campanas.unshift(c);
  guardar();
  return c;
}
export function actualizarCampana(id: string, d: Record<string, any>): Campana | null {
  const c = buscarCampana(id);
  if (!c) return null;
  Object.assign(c, limpiar({ ...c, ...d }, c));
  guardar();
  return c;
}
export function ponerPieza(id: string, pieza: string | null, piezaTipo: Campana['piezaTipo']) {
  const c = buscarCampana(id);
  if (!c) return null;
  const anterior = c.pieza;
  Object.assign(c, { pieza, piezaTipo });
  guardar();
  return { campana: c, anterior };
}
export function quitarCampana(id: string) {
  const c = buscarCampana(id);
  datos.campanas = datos.campanas.filter((x) => x.id !== id);
  guardar();
  return c;
}

export function registrarEvento(id: string, tipo: string): boolean {
  const c = buscarCampana(id);
  const campo = ({ impresion: 'impresiones', clic: 'clics', completo: 'completos' } as const)[tipo as 'impresion' | 'clic' | 'completo'];
  if (!c || !campo) return false;
  c.stats[campo]++;
  guardarLuego();
  return true;
}
