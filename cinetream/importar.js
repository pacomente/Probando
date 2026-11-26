// Importar películas a Cinetream desde un link.
//  - Internet Archive (archive.org/details/…): video, título, año, director, sinopsis, licencia y portada.
//  - Link directo a un archivo de video (.mp4, .webm, .m4v…).
//  - Página web que publica su video con etiquetas Open Graph (og:video, og:title, og:image…).
//  - Página con su propio reproductor (YouTube, Vimeo, Dailymotion, Google Drive u otra): no se descarga nada,
//    la película se ve con el reproductor oficial de ese sitio dentro de Cinetream (lo que esos sitios permiten).
// No descarga de YouTube ni de plataformas de streaming: sus condiciones de uso no lo permiten.
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { once } from 'node:events';

// Se puede cambiar para pruebas; en uso normal es Internet Archive
const ARCHIVE = (process.env.ARCHIVE_URL || 'https://archive.org').replace(/\/$/, '');
const HOST_ARCHIVE = new URL(ARCHIVE).host;
// Plataformas pagas con DRM: no se pueden mostrar en otras páginas
const PLATAFORMAS_PROHIBIDAS = /(^|\.)(netflix\.com|disneyplus\.com|primevideo\.com|amazon\.com|max\.com|hbomax\.com|paramountplus\.com|starplus\.com|appletv\.apple\.com|crunchyroll\.com|flow\.com\.ar|tiktok\.com|instagram\.com|facebook\.com)$/i;
// Sitios que permiten ver sus videos en otras páginas con su reproductor oficial, pero no descargarlos
const SOLO_REPRODUCTOR = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|drive\.google\.com|twitch\.tv)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)(\?|#|$)/i;

export class ErrorImportar extends Error {}

function validarLink(url) {
  let u;
  try { u = new URL(url); } catch { throw new ErrorImportar('Ese link no es válido. Copialo completo, empezando por https://'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ErrorImportar('El link tiene que empezar con http:// o https://');
  if (PLATAFORMAS_PROHIBIDAS.test(u.hostname)) {
    throw new ErrorImportar(`${u.hostname} no permite mostrar sus películas en otras páginas (están protegidas). Usá Internet Archive, un link directo al archivo, una página con reproductor (YouTube, Vimeo…) o subí el archivo.`);
  }
  return u;
}

// ---------- Reproductores oficiales (no se descarga nada) ----------
const sitioDe = (url) => new URL(url).hostname.replace(/^www\./, '');
function reproductorConocido(u) {
  const h = u.hostname.replace(/^(www|m)\./, '');
  let id;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (/youtube(-nocookie)?\.com$/.test(h)) id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1];
  if (id && /^[\w-]{6,20}$/.test(id)) {
    const desde = Number.parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '0', 10) || 0;
    return {
      proveedor: 'youtube', id,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1${desde ? `&start=${desde}` : ''}`,
      oembed: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      portadas: [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`],
    };
  }
  const vimeo = h.endsWith('vimeo.com') && u.pathname.match(/(?:^|\/)(?:video\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/);
  if (vimeo) {
    return {
      proveedor: 'vimeo', id: vimeo[1],
      embed: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1${vimeo[2] ? `&h=${vimeo[2]}` : ''}`,
      oembed: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u.href)}`,
    };
  }
  const dm = (h === 'dai.ly' && u.pathname.slice(1)) || (h.endsWith('dailymotion.com') && u.pathname.match(/\/(?:embed\/)?video\/([a-z0-9]+)/i)?.[1]);
  if (dm) {
    return {
      proveedor: 'dailymotion', id: dm,
      embed: `https://www.dailymotion.com/embed/video/${dm}?autoplay=1`,
      oembed: `https://www.dailymotion.com/services/oembed?format=json&url=${encodeURIComponent(`https://www.dailymotion.com/video/${dm}`)}`,
    };
  }
  const drive = h === 'drive.google.com' && (u.pathname.match(/\/file\/d\/([\w-]{10,})/)?.[1] || u.searchParams.get('id'));
  if (drive) return { proveedor: 'drive', id: drive, embed: `https://drive.google.com/file/d/${drive}/preview` };
  return null;
}

async function analizarReproductor(r, original) {
  const datos = { tipo: 'embed', embed: r.embed, fuente: original, sitio: { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', drive: 'Google Drive' }[r.proveedor] || sitioDe(r.embed) };
  if (r.oembed) {
    const o = await pedir(r.oembed).catch(() => null);
    if (o && (o.status === 401 || o.status === 403)) throw new ErrorImportar(`El dueño de ese video no permite verlo en otras páginas (${datos.sitio} lo bloquea). Probá con otro link.`);
    if (o && o.status === 404) throw new ErrorImportar(`Ese video no existe o es privado en ${datos.sitio}.`);
    const j = o?.ok ? await o.json().catch(() => null) : null;
    if (j) {
      datos.titulo = sinEtiquetas(j.title);
      datos.direccion = sinEtiquetas(j.author_name || '');
      if (j.duration) datos.duracionMin = Math.round(Number(j.duration) / 60);
      if (j.description) datos.sinopsis = sinEtiquetas(j.description).slice(0, 1200);
      datos.portada = j.thumbnail_url || null;
    }
  }
  // YouTube: la portada en alta calidad si existe
  for (const p of r.portadas || []) {
    const ok = await pedir(p, { method: 'HEAD' }, 8000).then((x) => x.ok).catch(() => false);
    if (ok) { datos.portada = p; break; }
  }
  datos.titulo ||= 'Película';
  return datos;
}

// ¿Se puede mostrar esta página dentro de Cinetream? (algunas lo prohíben)
function permiteMostrarse(r) {
  const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;
  const fa = (r.headers.get('content-security-policy') || '').match(/frame-ancestors([^;]*)/i)?.[1]?.trim().toLowerCase();
  if (fa && !fa.split(/\s+/).includes('*')) return false;
  return true;
}

/** ¿Sigue andando el reproductor de esta película? (para «Revisar links») */
export async function revisarReproductor(embed) {
  try {
    const u = new URL(embed);
    const r = reproductorConocido(u);
    if (r?.oembed) {
      const o = await pedir(r.oembed, {}, 15000);
      if (o.status === 401 || o.status === 403) return { ok: false, detalle: 'El dueño ya no permite verlo en otras páginas' };
      if (o.status === 404) return { ok: false, detalle: 'El video fue borrado o es privado' };
      return o.ok ? { ok: true, detalle: 'Funciona' } : { ok: false, detalle: `El sitio respondió ${o.status}` };
    }
    const p = await pedir(embed, {}, 15000);
    p.body?.cancel().catch(() => {});
    return p.ok ? { ok: true, detalle: 'Funciona' } : { ok: false, detalle: `El sitio respondió ${p.status}` };
  } catch (e) {
    return { ok: false, detalle: e.message || 'No se pudo conectar con el sitio' };
  }
}

async function pedir(url, opciones = {}, ms = 20000) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(url, { redirect: 'follow', ...opciones, signal: control.signal, headers: { 'User-Agent': 'Cinetream/0.3', ...opciones.headers } });
    return r;
  } catch (e) {
    throw new ErrorImportar(e.name === 'AbortError' ? 'El sitio tardó demasiado en responder.' : 'No se pudo conectar con ese link. Revisá la conexión a internet.');
  } finally {
    clearTimeout(corte);
  }
}

const sinEtiquetas = (t) => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();
const primero = (v) => (Array.isArray(v) ? v[0] : v);
const titulo = (nombre) => decodeURIComponent(nombre).replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

// Los temas de Internet Archive vienen en inglés y mezclados: se pasan a los géneros de Cinetream
const GENEROS = {
  horror: 'Terror', 'silent film': 'Cine mudo', silent: 'Cine mudo', classic: 'Clásicos', 'classic film': 'Clásicos', comedy: 'Comedia',
  drama: 'Drama', 'science fiction': 'Ciencia ficción', 'sci-fi': 'Ciencia ficción', animation: 'Animación', cartoon: 'Animación',
  western: 'Western', documentary: 'Documental', 'film noir': 'Cine negro', noir: 'Cine negro', romance: 'Romance',
  adventure: 'Aventura', mystery: 'Misterio', thriller: 'Suspenso', war: 'Bélica', musical: 'Musical', fantasy: 'Fantasía',
  crime: 'Policial', family: 'Familia', action: 'Acción', 'short film': 'Cortometraje', short: 'Cortometraje',
};
const traducirGenero = (s) => GENEROS[String(s).trim().toLowerCase()] || null;

// ---------- Análisis del link ----------
export async function analizar(url) {
  const u = validarLink(url);
  const conocido = reproductorConocido(u);
  if (conocido) return analizarReproductor(conocido, u.href);
  if (SOLO_REPRODUCTOR.test(u.hostname)) throw new ErrorImportar(`No reconocimos ese link de ${sitioDe(u.href)}. Copiá el link del video (el que aparece al tocar «Compartir»).`);
  const ia = (u.host === HOST_ARCHIVE || u.hostname.endsWith('archive.org')) && u.pathname.match(/^\/(?:details|download|embed)\/([^/?#]+)/);
  if (ia) return analizarArchive(decodeURIComponent(ia[1]));

  // Se piden los primeros bytes para saber qué es sin descargar todo
  const r = await pedir(u.href, { headers: { Range: 'bytes=0-0' } });
  if (!r.ok && r.status !== 206) throw new ErrorImportar(`El link respondió con un error (${r.status}). Revisá que sea público.`);
  const tipo = (r.headers.get('content-type') || '').toLowerCase();
  if (tipo.startsWith('video/') || (VIDEO_EXT.test(u.pathname) && !tipo.includes('html'))) {
    await r.body?.cancel();
    const tamano = Number((r.headers.get('content-range') || '').split('/')[1]) || Number(r.headers.get('content-length')) || null;
    return { tipo: 'directo', video: u.href, titulo: titulo(u.pathname.split('/').pop() || 'Película'), tamano, formato: tipo || 'video' };
  }
  if (tipo.includes('html')) return analizarPagina(u, await leerTexto(r, 2_000_000), permiteMostrarse(r));
  await r.body?.cancel();
  throw new ErrorImportar('El link no lleva a un video ni a una página con video. Probá con el link directo al archivo (.mp4) o con una página de Internet Archive.');
}

async function leerTexto(r, limite) {
  let texto = '';
  const decoder = new TextDecoder();
  for await (const parte of r.body) {
    texto += decoder.decode(parte, { stream: true });
    if (texto.length > limite) { await r.body.cancel?.().catch(() => {}); break; }
  }
  return texto;
}

// Internet Archive: la API de metadatos da todo lo necesario
async function analizarArchive(id) {
  const r = await pedir(`${ARCHIVE}/metadata/${encodeURIComponent(id)}`);
  if (!r.ok) throw new ErrorImportar('Internet Archive no respondió. Probá de nuevo en un rato.');
  const datos = await r.json();
  if (!datos?.metadata) throw new ErrorImportar('Ese elemento de Internet Archive no existe o no es público.');
  const m = datos.metadata;
  const archivos = datos.files || [];
  // El mejor archivo que reproducen todas las teles y celulares: H.264 / MPEG4
  const preferencia = ['h.264', 'mpeg4', 'h.264 ia', '512kb mpeg4', 'h.264 720p', 'webm'];
  const videos = archivos.filter((f) => VIDEO_EXT.test(f.name) && !/\.(ogv)$/i.test(f.name));
  videos.sort((a, b) => {
    const pa = preferencia.indexOf(String(a.format || '').toLowerCase());
    const pb = preferencia.indexOf(String(b.format || '').toLowerCase());
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || Number(b.size || 0) - Number(a.size || 0);
  });
  const video = videos[0];
  if (!video) throw new ErrorImportar('Ese elemento de Internet Archive no tiene un video que se pueda reproducir en la tele (MP4 o WebM).');
  const segundos = Number(video.length) || (String(m.runtime || '').split(':').reduce((t, x) => t * 60 + Number(x), 0)) || 0;
  const anio = Number.parseInt(primero(m.year) || primero(m.date), 10) || null;
  const licencia = primero(m.licenseurl)
    ? (/publicdomain/i.test(primero(m.licenseurl)) ? 'Dominio público' : `Licencia: ${primero(m.licenseurl)}`)
    : (/public domain/i.test(JSON.stringify(m)) ? 'Dominio público' : 'Verificar licencia en Internet Archive');
  return {
    tipo: 'archive',
    fuente: `${ARCHIVE}/details/${id}`,
    video: `${ARCHIVE}/download/${encodeURIComponent(id)}/${video.name.split('/').map(encodeURIComponent).join('/')}`,
    portada: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`,
    titulo: sinEtiquetas(primero(m.title)) || id,
    anio,
    direccion: sinEtiquetas([].concat(m.director || m.creator || []).join(', ')),
    sinopsis: sinEtiquetas(primero(m.description)).slice(0, 1200),
    duracionMin: segundos ? Math.round(segundos / 60) : 0,
    generos: [...new Set([].concat(m.subject || []).flatMap((s) => String(s).split(/[;,]/)).map(traducirGenero).filter(Boolean))].slice(0, 3),
    licencia,
    tamano: Number(video.size) || null,
    formato: video.format || 'video',
  };
}

// Página web con etiquetas Open Graph
function analizarPagina(u, html, mostrable) {
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
    const etiqueta = html.match(re)?.[0];
    return etiqueta?.match(/content=["']([^"']*)["']/i)?.[1] || null;
  };
  const absoluto = (v) => { try { return v ? new URL(v, u).href : null; } catch { return null; } };
  const video = absoluto(meta('og:video:secure_url') || meta('og:video:url') || meta('og:video'))
    || absoluto(html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1] || html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m4v))["']/i)?.[1]);
  if (!video || !VIDEO_EXT.test(new URL(video).pathname)) {
    // Sin archivo de video: se usa el reproductor de la página (el que ella misma muestra)
    const datosPagina = {
      fuente: u.href,
      portada: absoluto(meta('og:image')),
      titulo: sinEtiquetas(meta('og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || u.hostname),
      sinopsis: sinEtiquetas(meta('og:description') || meta('description') || '').slice(0, 1200),
    };
    // Marcos de la página que parecen un reproductor: los que permiten pantalla completa o tienen nombre de reproductor
    const PUBLICIDAD = /(^|[./-])ads?[./-]|doubleclick|googlesyndication|adservice|facebook\.com\/plugins|twitter\.com|disqus|recaptcha/i;
    const PALABRAS = /embed|player|play|video|reproductor|reprodutor|lecteur|watch|stream|pelicula|movie/i;
    const marcos = [...html.matchAll(/<iframe\b[^>]*>/gi)].map(([etiqueta]) => {
      const src = absoluto(etiqueta.match(/\ssrc=["']([^"']+)["']/i)?.[1]);
      const puntos = (/allowfullscreen|allow=["'][^"']*fullscreen/i.test(etiqueta) ? 3 : 0) + (src && PALABRAS.test(src) ? 2 : 0);
      return { src, puntos };
    });
    const candidatos = [{ src: absoluto(meta('twitter:player')), puntos: 4 }, { src: video, puntos: 4 }, ...marcos]
      .filter((c) => c.src && /^https?:/i.test(c.src) && !PUBLICIDAD.test(c.src));
    for (const c of candidatos) {
      const conocido = reproductorConocido(new URL(c.src));
      if (conocido) return { ...datosPagina, tipo: 'embed', embed: conocido.embed, sitio: sitioDe(conocido.embed) };
    }
    const reproductor = candidatos.filter((c) => c.puntos > 0).sort((x, y) => y.puntos - x.puntos)[0]?.src;
    if (reproductor) return { ...datosPagina, tipo: 'embed', embed: reproductor, sitio: sitioDe(reproductor) };
    if (!mostrable) throw new ErrorImportar('Esa página no tiene un video que Cinetream pueda mostrar y no permite mostrarse dentro de otra. Buscá el link directo del video o del reproductor.');
    return { ...datosPagina, tipo: 'embed', embed: u.href, sitio: sitioDe(u.href), paginaEntera: true };
  }
  validarLink(video);
  return {
    tipo: 'pagina',
    fuente: u.href,
    video,
    portada: absoluto(meta('og:image')),
    titulo: sinEtiquetas(meta('og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || titulo(new URL(video).pathname.split('/').pop())),
    sinopsis: sinEtiquetas(meta('og:description') || meta('description') || '').slice(0, 1200),
    formato: 'video',
  };
}

// ---------- Descarga ----------
// Descarga a un archivo .parcial y lo renombra al terminar: un corte nunca deja un video roto en el catálogo
export async function descargar(url, destino, { alProgreso, tipos = ['video/', 'application/octet-stream'], maxBytes = 50 * 1024 ** 3, senal } = {}) {
  validarLink(url);
  const r = await fetch(url, { redirect: 'follow', signal: senal, headers: { 'User-Agent': 'Cinetream/0.3' } }).catch((e) => {
    throw new ErrorImportar(e.name === 'AbortError' ? 'Descarga cancelada.' : 'No se pudo conectar para descargar.');
  });
  if (!r.ok) throw new ErrorImportar(`La descarga respondió con un error (${r.status}).`);
  const tipo = (r.headers.get('content-type') || '').toLowerCase();
  if (tipos.length && !tipos.some((t) => tipo.startsWith(t)) && !VIDEO_EXT.test(new URL(r.url).pathname)) {
    await r.body?.cancel();
    throw new ErrorImportar(`El archivo no es del tipo esperado (${tipo || 'desconocido'}).`);
  }
  const total = Number(r.headers.get('content-length')) || 0;
  const parcial = `${destino}.parcial`;
  const archivo = createWriteStream(parcial);
  let bytes = 0;
  try {
    for await (const parte of r.body) {
      bytes += parte.length;
      if (bytes > maxBytes) throw new ErrorImportar('El archivo es demasiado grande.');
      if (!archivo.write(parte)) await once(archivo, 'drain');
      alProgreso?.(bytes, total);
    }
    archivo.end();
    await once(archivo, 'finish');
    await rename(parcial, destino);
    return { bytes, tipo };
  } catch (e) {
    archivo.destroy();
    await rm(parcial, { force: true });
    if (e instanceof ErrorImportar) throw e;
    throw new ErrorImportar(e.name === 'AbortError' ? 'Descarga cancelada.' : 'La descarga se cortó. Probá de nuevo.');
  }
}
