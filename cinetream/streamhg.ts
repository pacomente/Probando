// Videos en StreamHG (tu cuenta): listar, ver datos, subir por link y armar el reproductor para insertar.
// Se configura con variables de entorno (en Render: Environment):
//   STREAMHG_CLAVE        la API key de tu cuenta (StreamHG → Account → API)
//   STREAMHG_REPRODUCTOR  (opcional) dirección del reproductor, por ejemplo https://algo.com — si no, se toma del link de cada video
//   STREAMHG_API          (opcional) dirección de la API; por defecto https://streamhgapi.com
// La clave nunca sale del servidor: el navegador solo recibe el reproductor de cada película.

import type { InfoImportada } from './tipos.ts';

const cfg = () => ({
  clave: process.env.STREAMHG_CLAVE || '',
  api: (process.env.STREAMHG_API || 'https://streamhgapi.com').replace(/\/$/, ''),
  reproductor: (process.env.STREAMHG_REPRODUCTOR || '').replace(/\/$/, ''),
});

export const streamhgConfigurado = () => Boolean(cfg().clave);
export const CODIGO = /^[a-z0-9]{8,16}$/i;

export class ErrorStreamHG extends Error {}

async function api(ruta, params = {}) {
  const c = cfg();
  if (!c.clave) throw new ErrorStreamHG('Falta la API key de StreamHG (variable STREAMHG_CLAVE).');
  const q = new URLSearchParams({ key: c.clave, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')) });
  let r;
  try {
    r = await fetch(`${c.api}/api/${ruta}?${q}`, { headers: { 'User-Agent': 'Cinetream/1.0' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new ErrorStreamHG(e.name === 'TimeoutError' ? 'StreamHG tardó demasiado en responder.' : 'No se pudo conectar con StreamHG.');
  }
  const datos = await r.json().catch(() => null);
  if (!datos) throw new ErrorStreamHG(`StreamHG respondió algo inesperado (${r.status}).`);
  if (Number(datos.status) !== 200) {
    const msg = String(datos.msg || '');
    if (/key|auth|login/i.test(msg)) throw new ErrorStreamHG('La API key de StreamHG no es válida (revisá STREAMHG_CLAVE).');
    throw new ErrorStreamHG(`StreamHG: ${msg || `error ${datos.status}`}`);
  }
  return datos;
}

// Dominio del reproductor: lo da la API en el link de cada video (puede cambiar con el tiempo)
let dominioVisto = '';
function recordarDominio(link) {
  try { if (link) dominioVisto = new URL(link).origin.replace(/^http:/, 'https:'); } catch { /* link raro */ }
}

/** Link del reproductor para insertar (el que sí se deja mostrar dentro de Cinetream). */
export function reproductorDe(codigo, link) {
  recordarDominio(link);
  const base = cfg().reproductor || dominioVisto || 'https://streamhg.com';
  return `${base}/e/${codigo}`;
}

const numero = (v) => Number(v) || 0;
const imagenSegura = (u) => (u ? String(u).replace(/^http:/, 'https:') : null);

function archivo(f) {
  const codigo = f.file_code || f.filecode;
  recordarDominio(f.link);
  return {
    codigo,
    titulo: f.title || f.file_title || codigo,
    segundos: numero(f.length || f.file_length),
    miniatura: imagenSegura(f.player_img || f.thumbnail),
    listo: numero(f.canplay) === 1,
    publico: String(f.public ?? f.file_public) === '1',
    subido: f.uploaded || f.file_created || null,
    vistas: numero(f.views || f.file_views),
    link: f.link || null,
    reproductor: reproductorDe(codigo, f.link),
  };
}

export async function cuenta() {
  const { result: r } = await api('account/info');
  return {
    usuario: r.login, archivos: numero(r.files_total), usado: numero(r.storage_used), libre: numero(r.storage_left),
    premium: numero(r.premium) === 1, vence: r.premium_expire || null,
  };
}

export async function archivos({ pagina = 1, titulo = '', porPagina = 24 } = {}) {
  const { result: r } = await api('file/list', { page: pagina, per_page: porPagina, title: titulo });
  return { archivos: (r.files || []).map(archivo), total: numero(r.results_total), paginas: Math.max(1, numero(r.pages)) };
}

export async function infoArchivo(codigo) {
  if (!CODIGO.test(codigo)) throw new ErrorStreamHG('Ese código de video de StreamHG no es válido.');
  const { result } = await api('file/info', { file_code: codigo });
  const f = Array.isArray(result) ? result[0] : null;
  if (!f || Number(f.status) === 404) return null;
  return archivo(f);
}

/** StreamHG baja el video de un link a tu cuenta (sin pasar por Cinetream). */
export async function subirPorLink(url) {
  const { result } = await api('upload/url', { url });
  return { codigo: result?.filecode || null };
}

export async function subidasPendientes() {
  const datos = await api('file/url_uploads');
  return (datos.result || []).map((s) => ({ url: s.remote_url, progreso: numero(s.progress), estado: s.status, codigo: s.file_code || null }));
}

/** Datos para «Agregar con un link» a partir del código de un video de tu cuenta. */
export async function datosParaImportar(codigo: string, linkPegado?: string): Promise<InfoImportada> {
  const f = streamhgConfigurado() ? await infoArchivo(codigo) : null;
  if (streamhgConfigurado() && !f) throw new ErrorStreamHG('Ese video no está en tu cuenta de StreamHG o fue borrado.');
  if (f && !f.listo) throw new ErrorStreamHG('StreamHG todavía está procesando ese video. Probá en unos minutos.');
  const pegadoEsReproductor = /\/e\/[a-z0-9]+/i.test(linkPegado || '');
  return {
    tipo: 'embed' as const,
    sitio: 'StreamHG',
    streamhg: codigo,
    embed: pegadoEsReproductor ? linkPegado : reproductorDe(codigo, f?.link),
    fuente: f?.link || linkPegado,
    titulo: f?.titulo || 'Película',
    duracionMin: f?.segundos ? Math.round(f.segundos / 60) : 0,
    portada: f?.miniatura || null,
  };
}

/** ¿Sigue disponible? (para «Revisar links») */
export async function revisarStreamHG(codigo) {
  try {
    const f = await infoArchivo(codigo);
    if (!f) return { ok: false, detalle: 'El video fue borrado de StreamHG' };
    if (!f.listo) return { ok: false, detalle: 'StreamHG todavía lo está procesando' };
    return { ok: true, detalle: 'Funciona' };
  } catch (e) {
    return { ok: false, detalle: e.message };
  }
}
