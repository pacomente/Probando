// Publicidad de Cinetream: campañas, sus piezas (imagen, video o texto) y las estadísticas.
// Formatos: "previo" (antes de la película, se puede saltar) y "banner" (en el inicio).
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CARPETA_DATOS } from './datos.js';

const ARCHIVO = path.join(CARPETA_DATOS, 'publicidad.json');
export const CARPETA_PIEZAS = path.join(CARPETA_DATOS, 'anuncios');
mkdirSync(CARPETA_PIEZAS, { recursive: true });

// Para arrancar: campañas propias de Cinetream (promocionan el plan Plus), sin anunciantes inventados
const INICIALES = [
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

let datos = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : { campanas: INICIALES };
let cola = Promise.resolve();
let pendiente = null;
function guardar() {
  const copia = JSON.stringify(datos, null, 2);
  cola = cola.then(async () => {
    await writeFile(`${ARCHIVO}.tmp`, copia);
    await rename(`${ARCHIVO}.tmp`, ARCHIVO);
  }).catch((e) => console.error('No se pudo guardar la publicidad:', e.message));
  return cola;
}
if (!existsSync(ARCHIVO)) guardar();
// Las estadísticas llegan seguido: se guardan como mucho cada 5 segundos
const guardarLuego = () => { if (!pendiente) pendiente = setTimeout(() => { pendiente = null; guardar(); }, 5000); };

export const campanas = () => datos.campanas;
export const buscarCampana = (id) => datos.campanas.find((c) => c.id === id);

const vigente = (c, ahora = Date.now()) => c.activa && (!c.desde || c.desde <= ahora) && (!c.hasta || c.hasta + 86400000 > ahora);
// Lo que ve el reproductor y el inicio: sin estadísticas ni datos internos
export const campanasVigentes = () => datos.campanas.filter((c) => vigente(c)).map(({ stats, nombre, desde, hasta, activa, ...c }) => c);

const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const fecha = (v) => (v ? Date.parse(v) || Number(v) || null : null);
const color = (c, d) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d);
function limpiar(d, previo = {}) {
  let enlace = texto(d.enlace, 500);
  if (enlace && !/^https?:\/\//i.test(enlace)) enlace = ''; // solo enlaces web
  return {
    ...previo,
    nombre: texto(d.nombre, 80) || 'Campaña sin nombre',
    anunciante: texto(d.anunciante, 80),
    tipo: d.tipo === 'banner' ? 'banner' : 'previo',
    titulo: texto(d.titulo, 80),
    texto: texto(d.texto, 200),
    enlace,
    colores: [color(d.colores?.[0], '#1d1203'), color(d.colores?.[1], '#ffb547')],
    duracion: Math.min(Math.max(Math.round(Number(d.duracion) || 6), 3), 60),
    saltarTras: Number.isFinite(Number(d.saltarTras)) && d.saltarTras !== '' ? Math.min(Math.max(Math.round(Number(d.saltarTras)), 0), 30) : 5,
    peso: Math.min(Math.max(Math.round(Number(d.peso) || 1), 1), 10),
    activa: Boolean(d.activa),
    desde: fecha(d.desde),
    hasta: fecha(d.hasta),
  };
}

export function crearCampana(d) {
  const c = { ...limpiar(d), id: `c-${crypto.randomBytes(5).toString('hex')}`, pieza: null, piezaTipo: null, stats: { impresiones: 0, clics: 0, completos: 0 } };
  datos.campanas.unshift(c);
  guardar();
  return c;
}
export function actualizarCampana(id, d) {
  const c = buscarCampana(id);
  if (!c) return null;
  Object.assign(c, limpiar({ ...c, ...d }, c));
  guardar();
  return c;
}
export function ponerPieza(id, pieza, piezaTipo) {
  const c = buscarCampana(id);
  if (!c) return null;
  const anterior = c.pieza;
  Object.assign(c, { pieza, piezaTipo });
  guardar();
  return { campana: c, anterior };
}
export function quitarCampana(id) {
  const c = buscarCampana(id);
  datos.campanas = datos.campanas.filter((x) => x.id !== id);
  guardar();
  return c;
}

export function registrarEvento(id, tipo) {
  const c = buscarCampana(id);
  const campo = { impresion: 'impresiones', clic: 'clics', completo: 'completos' }[tipo];
  if (!c || !campo) return false;
  c.stats[campo]++;
  guardarLuego();
  return true;
}
