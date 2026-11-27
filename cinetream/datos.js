// Datos de Cinetream en el servidor: el catálogo y la clave del administrador, en la base de datos (base.js).
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PELICULAS } from './public/catalogo.js';
import { CARPETA_DATOS, coleccion, documento } from './base.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export { CARPETA_DATOS };
export const CARPETA_VIDEOS = process.env.CARPETA_VIDEOS || path.join(__dirname, 'videos');
export const CARPETA_PORTADAS = path.join(CARPETA_DATOS, 'portadas');
for (const c of [CARPETA_VIDEOS, CARPETA_PORTADAS]) mkdirSync(c, { recursive: true });

// ---------- Catálogo ----------
// La primera vez se arma con las películas de ejemplo de public/catalogo.js (o con el catalogo.json de antes)
const tablaPeliculas = coleccion('peliculas', {
  indices: [{ campo: 'estado' }],
  migrarDe: { archivo: 'catalogo.json', extraer: (c) => c.peliculas },
  inicial: () => PELICULAS.map((p, i) => ({ ...p, estado: 'publicada', alta: Date.now() - (PELICULAS.length - i) * 60000 })),
});
const catalogo = { peliculas: [...tablaPeliculas.todos()] };

export function guardarCatalogo() {
  try { tablaPeliculas.guardar(catalogo.peliculas); } catch (e) { console.error('No se pudo guardar el catálogo:', e.message); }
  return Promise.resolve();
}

export const todas = () => catalogo.peliculas;
export const publicadas = () => catalogo.peliculas.filter((p) => p.estado === 'publicada');
export const buscarPelicula = (id) => catalogo.peliculas.find((p) => p.id === id);

export function agregarPelicula(datos) {
  const p = { ...limpiar(datos), id: nuevoId(datos.titulo), alta: Date.now() };
  catalogo.peliculas.unshift(p);
  guardarCatalogo();
  return p;
}

export function actualizarPelicula(id, cambios) {
  const p = buscarPelicula(id);
  if (!p) return null;
  Object.assign(p, limpiar({ ...p, ...cambios }));
  guardarCatalogo();
  return p;
}

export function quitarPelicula(id) {
  const p = buscarPelicula(id);
  catalogo.peliculas = catalogo.peliculas.filter((x) => x.id !== id);
  guardarCatalogo();
  return p;
}

// Solo campos conocidos, con tipos y largos razonables: el catálogo lo lee la tele de cada usuario
const CLASIFICACIONES = ['ATP', '+13', '+16', '+18'];
const MOTIVOS = ['sol', 'luna', 'grilla', 'engranaje', 'montanas', 'ondas', 'anillos', 'triangulo', 'rayos', 'sombra', 'angulos'];
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const color = (c, porDefecto) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : porDefecto);
function limpiar(d) {
  return {
    id: d.id,
    titulo: texto(d.titulo, 120) || 'Sin título',
    anio: Math.min(Math.max(Number.parseInt(d.anio, 10) || new Date().getFullYear(), 1880), 2100),
    duracionMin: Math.min(Math.max(Math.round(Number(d.duracionMin) || 0), 0), 1000),
    clasificacion: CLASIFICACIONES.includes(d.clasificacion) ? d.clasificacion : '+13',
    generos: (Array.isArray(d.generos) ? d.generos : String(d.generos || '').split(','))
      .map((g) => texto(g, 30)).filter(Boolean).slice(0, 6),
    direccion: texto(d.direccion, 120),
    origen: texto(d.origen, 60),
    licencia: texto(d.licencia, 120),
    sinopsis: texto(d.sinopsis, 1200),
    video: d.video ? texto(d.video, 2000) : null,
    // Reproductor de otro sitio (YouTube, Vimeo…): la película se ve con él, sin descargar nada
    embed: /^https?:\/\//i.test(d.embed || '') ? texto(d.embed, 2000) : null,
    streamhg: /^[a-z0-9]{8,16}$/i.test(d.streamhg || '') ? d.streamhg : null, // código del video en tu cuenta de StreamHG
    portada: d.portada ? texto(d.portada, 2000) : null,
    colores: [color(d.colores?.[0], '#1c2030'), color(d.colores?.[1], '#ffb547')],
    motivo: MOTIVOS.includes(d.motivo) ? d.motivo : 'anillos',
    destacada: Boolean(d.destacada),
    plus: Boolean(d.plus), // solo para suscriptores Plus
    estado: ['publicada', 'oculta', 'descargando', 'error'].includes(d.estado) ? d.estado : 'publicada',
    fuente: d.fuente ? texto(d.fuente, 2000) : null,
    videoOriginal: d.videoOriginal ? texto(d.videoOriginal, 2000) : null, // link del que se bajó el video guardado
    tamano: Math.max(0, Math.round(Number(d.tamano) || 0)), // bytes del video en Cloudflare R2
    alta: Number(d.alta) || Date.now(),
  };
}

function nuevoId(titulo) {
  const base = String(titulo || 'pelicula').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pelicula';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

// ---------- Clave del administrador ----------
const docAdmin = documento('admin', { migrarDe: { archivo: 'admin.json' } });
let admin = docAdmin.leer();
// En un servidor en internet (Render) la primera contraseña viene de la variable ADMIN_CLAVE
if (!admin && process.env.ADMIN_CLAVE?.length >= 8) await definirClave(process.env.ADMIN_CLAVE);
export const adminConfigurado = () => Boolean(admin);

export async function definirClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  admin = { sal, hash: crypto.scryptSync(clave, sal, 64).toString('hex') };
  docAdmin.guardar(admin);
}

export function claveCorrecta(clave) {
  if (!admin || typeof clave !== 'string') return false;
  const calculado = crypto.scryptSync(clave, admin.sal, 64);
  return crypto.timingSafeEqual(calculado, Buffer.from(admin.hash, 'hex'));
}
