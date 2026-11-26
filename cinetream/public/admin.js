// Administrador de Cinetream: agregar películas por link o subiendo el archivo, y editar el catálogo.
import { afiche } from './carteles.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tamano = (b) => (!b ? '0 MB' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

async function api(ruta, opciones = {}) {
  const r = await fetch(`api/admin${ruta}`, {
    ...opciones,
    headers: opciones.body && typeof opciones.body === 'string' ? { 'Content-Type': 'application/json', ...opciones.headers } : opciones.headers,
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && ruta !== '/entrar') { mostrarAcceso(); throw new Error(datos.error); }
  if (!r.ok) throw new Error(datos.error || 'Algo salió mal. Probá de nuevo.');
  return datos;
}
const enviar = (ruta, metodo, cuerpo) => api(ruta, { method: metodo, body: JSON.stringify(cuerpo) });

let esperaAviso = null;
function avisar(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.hidden = false;
  a.classList.add('visible');
  clearTimeout(esperaAviso);
  esperaAviso = setTimeout(() => a.classList.remove('visible'), 3200);
}

// ---------- Acceso ----------
let configurado = true;
async function iniciar() {
  const estado = await api('/estado');
  configurado = estado.configurado;
  estadoServidor = estado;
  aplicarLugar(estado);
  if (estado.sesion) mostrarPanel();
  else mostrarAcceso();
}

// Textos según dónde corre Cinetream: en internet (Render) o en una PC de la casa
let enInternet = false;
function aplicarLugar(estado) {
  enInternet = Boolean(estado.enInternet);
  const lugar = (n) => document.querySelectorAll(`[data-lugar="${n}"]`);
  const dir = estado.direccion || location.origin;
  $('#admin-lugar').textContent = enInternet ? `En internet · ${dir.replace(/^https?:\/\//, '')}` : 'En esta PC';
  $('#admin-lugar').classList.toggle('en-internet', enInternet);
  $('#pagos-webhook').textContent = `${dir}/api/pagos/mercadopago`;
  if (!enInternet) return;
  // En internet conviene reproducir desde el link: no llena el disco del servidor
  lugar('recomendado-guardar').forEach((e) => { e.hidden = true; });
  lugar('recomendado-link').forEach((e) => { e.hidden = false; });
  lugar('guardar-nota').forEach((e) => { e.textContent = 'Ocupa espacio en el disco del servidor.'; });
  lugar('subir-nota').forEach((e) => { e.textContent = ' al servidor (ocupa espacio en el disco)'; });
  const link = $('#link-alta [name="modo"][value="link"]');
  if (link) link.checked = true;
  lugar('paso-token').forEach((e) => {
    e.innerHTML = estado.render
      ? 'En Render, entrá al servicio → <b>Environment</b> y cargá <code>MP_ACCESS_TOKEN</code> con tu token. Render reinicia Cinetream solo.'
      : 'Cargá la variable <code>MP_ACCESS_TOKEN</code> con tu token en tu servicio de hosting y reiniciá Cinetream.';
  });
  lugar('paso-https').forEach((e) => { e.innerHTML = `Listo: Cinetream ya está en internet con HTTPS en <b>${esc(dir)}</b>.`; });
}

function mostrarAcceso() {
  $('#panel').hidden = true;
  $('#acceso').hidden = false;
  $('#acceso-titulo').textContent = configurado ? 'Administrador' : 'Crear la contraseña';
  $('#acceso-nota').textContent = configurado
    ? 'Ingresá la contraseña del administrador.'
    : 'Es la primera vez. Elegí una contraseña de al menos 8 caracteres para administrar el catálogo.';
  $('#acceso-repetir').hidden = configurado;
  $('#acceso-repetir-etiqueta').hidden = configurado;
  $('#acceso-boton').textContent = configurado ? 'Entrar' : 'Crear y entrar';
  $('#acceso-clave').autocomplete = configurado ? 'current-password' : 'new-password';
  $('#acceso-clave').focus();
}

$('#acceso-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('#acceso-clave').value;
  $('#acceso-error').textContent = '';
  if (!configurado && clave !== $('#acceso-repetir').value) { $('#acceso-error').textContent = 'Las contraseñas no coinciden.'; return; }
  try {
    await enviar(configurado ? '/entrar' : '/configurar', 'POST', { clave });
    $('#acceso-clave').value = '';
    $('#acceso-repetir').value = '';
    configurado = true;
    mostrarPanel();
  } catch (err) {
    $('#acceso-error').textContent = err.message;
  }
});

$('#salir').addEventListener('click', async () => {
  await enviar('/salir', 'POST', {}).catch(() => {});
  mostrarAcceso();
});

// ---------- Campos de una película (alta y edición) ----------
const CLASIFICACIONES = ['ATP', '+13', '+16', '+18'];
function campos(d = {}) {
  return `
    <label class="ancho">Título<input name="titulo" required maxlength="120" value="${esc(d.titulo)}"></label>
    <label>Año<input name="anio" type="number" min="1880" max="2100" value="${esc(d.anio || '')}"></label>
    <label>Duración (minutos)<input name="duracionMin" type="number" min="0" max="1000" value="${esc(d.duracionMin || '')}" placeholder="Se calcula sola"></label>
    <label>Clasificación<select name="clasificacion">${CLASIFICACIONES.map((c) => `<option ${c === (d.clasificacion || '+13') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Dirección<input name="direccion" maxlength="120" value="${esc(d.direccion)}"></label>
    <label>Origen<input name="origen" maxlength="60" value="${esc(d.origen)}" placeholder="Ej.: Argentina"></label>
    <label class="ancho">Géneros (separados por coma)<input name="generos" maxlength="200" value="${esc((d.generos || []).join(', '))}" placeholder="Drama, Clásicos"></label>
    <label class="ancho">Licencia<input name="licencia" maxlength="120" value="${esc(d.licencia)}" placeholder="Dominio público, CC BY 4.0…"></label>
    <label class="ancho">Sinopsis<textarea name="sinopsis" rows="4" maxlength="1200">${esc(d.sinopsis)}</textarea></label>
    <label class="tilde"><input type="checkbox" name="destacada" ${d.destacada ? 'checked' : ''}> Destacada en la portada</label>
    <label class="tilde"><input type="checkbox" name="plus" ${d.plus ? 'checked' : ''}> Solo para suscriptores Plus</label>
    ${d.publicar === undefined ? '' : `<label class="tilde"><input type="checkbox" name="publicar" ${d.publicar ? 'checked' : ''}> Publicar apenas esté lista</label>`}`;
}
function leerCampos(raiz) {
  const v = (n) => raiz.querySelector(`[name="${n}"]`);
  return {
    titulo: v('titulo').value.trim(),
    anio: v('anio').value,
    duracionMin: v('duracionMin').value,
    clasificacion: v('clasificacion').value,
    direccion: v('direccion').value.trim(),
    origen: v('origen').value.trim(),
    generos: v('generos').value.split(',').map((g) => g.trim()).filter(Boolean),
    licencia: v('licencia').value.trim(),
    sinopsis: v('sinopsis').value.trim(),
    destacada: v('destacada').checked,
    plus: v('plus').checked,
    ...(v('publicar') ? { publicar: v('publicar').checked } : {}),
  };
}

// ---------- Pestañas ----------
document.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-pestana]').forEach((x) => { x.classList.toggle('activa', x === b); x.setAttribute('aria-selected', String(x === b)); });
  $('#pestana-link').hidden = b.dataset.pestana !== 'link';
  $('#pestana-archivo').hidden = b.dataset.pestana !== 'archivo';
}));

// ---------- Agregar con un link ----------
let analizado = null;
$('#link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#link-buscar');
  $('#link-error').textContent = '';
  $('#link-alta').hidden = true;
  boton.disabled = true;
  boton.textContent = 'Buscando…';
  try {
    analizado = await enviar('/analizar', 'POST', { url: $('#link-url').value });
    const fuente = { archive: 'Internet Archive', directo: 'Archivo de video', pagina: 'Página web' }[analizado.tipo];
    $('#link-portada').innerHTML = analizado.portada ? `<img src="${esc(analizado.portada)}" alt="Portada encontrada">` : '<span>Sin portada: se toma un cuadro del video o se usa una ilustración</span>';
    $('#link-detalle').innerHTML = `<b>${esc(fuente)}</b>${analizado.tamano ? ` · ${tamano(analizado.tamano)}` : ''}${analizado.formato ? ` · ${esc(analizado.formato)}` : ''}<br>Revisá los datos antes de agregarla.`;
    $('#link-campos').innerHTML = campos({ ...analizado, publicar: false });
    $('#link-derechos').checked = false;
    $('#link-alta').hidden = false;
    $('#link-alta [name="titulo"]').focus();
  } catch (err) {
    $('#link-error').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Buscar';
  }
});
$('#link-cancelar').addEventListener('click', () => { $('#link-alta').hidden = true; analizado = null; });
$('#link-alta').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#link-alta-error').textContent = '';
  const datos = leerCampos($('#link-campos'));
  if (!datos.titulo) { $('#link-alta-error').textContent = 'Falta el título.'; return; }
  if (!$('#link-derechos').checked) { $('#link-alta-error').textContent = 'Confirmá que tenés derecho a publicar esta película.'; return; }
  try {
    const modo = $('#link-alta [name="modo"]:checked').value;
    const { pelicula } = await enviar('/importar', 'POST', { info: analizado, datos, modo, derechos: true });
    avisar(modo === 'descargar' ? `Descargando «${pelicula.titulo}»…` : `«${pelicula.titulo}» se agregó`);
    $('#link-alta').hidden = true;
    $('#link-url').value = '';
    analizado = null;
    await cargar();
  } catch (err) {
    $('#link-alta-error').textContent = err.message;
  }
});

// ---------- Subir un archivo ----------
$('#archivo-campos').innerHTML = campos({ publicar: false });
const elegirArchivo = (archivo) => {
  if (!archivo) return;
  $('#archivo-nombre').innerHTML = `<b>${esc(archivo.name)}</b> · ${tamano(archivo.size)}`;
  const titulo = $('#archivo-campos [name="titulo"]');
  if (!titulo.value) titulo.value = archivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
};
$('#archivo-video').addEventListener('change', (e) => elegirArchivo(e.target.files[0]));
const zona = $('#archivo-soltar');
zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('encima');
  const archivo = e.dataTransfer.files[0];
  if (archivo) { const dt = new DataTransfer(); dt.items.add(archivo); $('#archivo-video').files = dt.files; elegirArchivo(archivo); }
});

// Con XMLHttpRequest para mostrar el avance de la subida
function subirArchivo(archivo, base, alProgreso) {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `api/admin/subir?base=${encodeURIComponent(base)}`);
    xhr.setRequestHeader('Content-Type', archivo.type || 'video/mp4');
    xhr.upload.onprogress = (e) => alProgreso(e.loaded, e.total);
    xhr.onload = () => {
      const datos = JSON.parse(xhr.responseText || '{}');
      if (xhr.status === 200) resolver(datos);
      else rechazar(new Error(datos.error || 'La subida falló.'));
    };
    xhr.onerror = () => rechazar(new Error('Se cortó la conexión con Cinetream.'));
    xhr.send(archivo);
  });
}

$('#archivo-alta').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#archivo-error').textContent = '';
  const archivo = $('#archivo-video').files[0];
  const datos = leerCampos($('#archivo-campos'));
  if (!archivo) { $('#archivo-error').textContent = 'Elegí el archivo de la película.'; return; }
  if (!datos.titulo) { $('#archivo-error').textContent = 'Falta el título.'; return; }
  if (!$('#archivo-derechos').checked) { $('#archivo-error').textContent = 'Confirmá que tenés derecho a publicar esta película.'; return; }
  const barra = $('#archivo-progreso');
  const boton = $('#archivo-boton');
  barra.hidden = false;
  boton.disabled = true;
  try {
    const base = datos.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { video } = await subirArchivo(archivo, base, (cargado, total) => {
      const pct = total ? (cargado / total) * 100 : 0;
      barra.querySelector('i').style.width = `${pct}%`;
      barra.querySelector('span').textContent = `Subiendo… ${Math.floor(pct)}% (${tamano(cargado)} de ${tamano(total)})`;
    });
    const { publicar, ...resto } = datos;
    const { pelicula } = await enviar('/peliculas', 'POST', { datos: { ...resto, video, estado: publicar ? 'publicada' : 'oculta' }, derechos: true });
    barra.querySelector('span').textContent = 'Preparando la portada y la duración…';
    await completarAutomatico(pelicula);
    avisar(`«${pelicula.titulo}» se agregó al catálogo`);
    $('#archivo-alta').reset();
    $('#archivo-campos').innerHTML = campos({ publicar: false });
    $('#archivo-nombre').innerHTML = '<b>Elegí el archivo</b> o arrastralo acá';
    barra.hidden = true;
    await cargar();
  } catch (err) {
    $('#archivo-error').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});

// ---------- Completar solo: duración, portada de un cuadro del video y colores ----------
function cargarVideo(src) {
  return new Promise((resolver, rechazar) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = src;
    v.addEventListener('loadedmetadata', () => resolver(v), { once: true });
    v.addEventListener('error', () => rechazar(new Error('Este navegador no puede abrir el video (¿formato no compatible?).')), { once: true });
  });
}

async function cuadroDelVideo(src, momento = 0.1) {
  const v = await cargarVideo(src);
  v.currentTime = Math.min(v.duration * momento, 300);
  await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.min(1280, v.videoWidth || 1280);
  lienzo.height = Math.round(lienzo.width * ((v.videoHeight || 720) / (v.videoWidth || 1280)));
  lienzo.getContext('2d').drawImage(v, 0, 0, lienzo.width, lienzo.height);
  return new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.86));
}

// Colores de la portada: fondo oscuro a partir del tono promedio y acento del color más vivo
function coloresDeImagen(src) {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 40;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 40, 40);
      let datos;
      try { datos = ctx.getImageData(0, 0, 40, 40).data; } catch { resolver(null); return; }
      let [r, g, b, n] = [0, 0, 0, 0];
      let vivo = { s: -1, c: [255, 181, 71] };
      for (let i = 0; i < datos.length; i += 4) {
        const [x, y, z] = [datos[i], datos[i + 1], datos[i + 2]];
        r += x; g += y; b += z; n++;
        const max = Math.max(x, y, z);
        const s = max ? (max - Math.min(x, y, z)) / max : 0;
        if (max > 110 && s > vivo.s) vivo = { s, c: [x, y, z] };
      }
      const hex = (arr) => `#${arr.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      resolver([hex([r / n * 0.45, g / n * 0.45, b / n * 0.45]), hex(vivo.c)]);
    };
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

async function completarAutomatico(p) {
  const cambios = {};
  const local = p.video?.startsWith('videos/');
  if (p.video && !p.duracionMin) {
    try { cambios.duracionMin = Math.round((await cargarVideo(p.video)).duration / 60); } catch { /* sin duración */ }
  }
  let actual = p;
  if (!p.portada && local) {
    try {
      const imagen = await cuadroDelVideo(p.video);
      actual = (await api(`/peliculas/${p.id}/portada`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: imagen })).pelicula;
    } catch { /* se queda con la ilustración */ }
  }
  if (actual.portada) {
    const colores = await coloresDeImagen(actual.portada);
    if (colores) cambios.colores = colores;
  }
  if (Object.keys(cambios).length) await enviar(`/peliculas/${p.id}`, 'PUT', { datos: cambios });
}

// ---------- Catálogo ----------
let catalogo = { peliculas: [], trabajos: {}, espacio: 0, extra: {}, disco: null };
const completadas = new Set();

async function cargar() {
  catalogo = await api('/catalogo');
  // Cuando termina una descarga, se completan solos la duración, la portada y los colores
  for (const [id, t] of Object.entries(catalogo.trabajos)) {
    const p = catalogo.peliculas.find((x) => x.id === id);
    if (t.estado === 'listo' && p && !completadas.has(id)) {
      completadas.add(id);
      if (t.tipo === 'guardar') avisar(`«${p.titulo}» ya está guardada en el servidor`);
      else completarAutomatico(p).then(() => { avisar(`«${p.titulo}» está lista. Revisala y publicala.`); cargar(); });
    }
  }
  pintar();
}

// Dónde está el video de cada película
const esLink = (v) => /^https?:\/\//i.test(v || '');
const sitio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'otro sitio'; } };
function origenDe(p) {
  const x = catalogo.extra[p.id] || {};
  if (!p.video) return { clase: 'origen-ninguno', texto: 'Sin video: se ve una señal de prueba' };
  if (p.video.startsWith('videos/')) return { clase: 'origen-servidor', texto: `Guardada en ${enInternet ? 'el servidor' : 'esta PC'} · ${tamano(x.bytes || 0)}` };
  if (x.enlace?.ok === false) return { clase: 'origen-caido', texto: `Link caído · ${sitio(p.video)}`, detalle: x.enlace.detalle };
  return { clase: 'origen-link', texto: `Desde un link · ${sitio(p.video)} · no ocupa lugar` };
}

function barraDisco(d) {
  if (!d) return '';
  const usado = d.videos + d.portadas + d.anuncios;
  if (!d.total) return `<p class="nota">Cinetream ocupa ${tamano(usado)} (videos ${tamano(d.videos)}, portadas ${tamano(d.portadas)}, publicidad ${tamano(d.anuncios)}).</p>`;
  const pct = (n) => `${Math.max(0.4, (n / d.total) * 100)}%`;
  const otros = Math.max(0, d.total - d.libre - usado);
  const ocupado = (d.total - d.libre) / d.total;
  return `<div class="disco ${ocupado > 0.9 ? 'disco-lleno' : ''}">
    <div class="disco-barra" role="img" aria-label="Disco: ${tamano(d.libre)} libres de ${tamano(d.total)}">
      <i class="d-videos" style="width:${pct(d.videos)}"></i><i class="d-portadas" style="width:${pct(d.portadas + d.anuncios)}"></i><i class="d-otros" style="width:${pct(otros)}"></i>
    </div>
    <div class="disco-leyenda">
      <span><i class="d-videos"></i>Videos ${tamano(d.videos)}</span>
      <span><i class="d-portadas"></i>Portadas y publicidad ${tamano(d.portadas + d.anuncios)}</span>
      <span><b>${tamano(d.libre)} libres</b> de ${tamano(d.total)}</span>
    </div>
    ${ocupado > 0.9 ? '<p class="error">El disco está casi lleno. Pasá películas a «desde un link» con «Liberar espacio» o ampliá el disco.</p>' : ''}
  </div>`;
}

function pintar() {
  const ps = catalogo.peliculas;
  const cuenta = (e) => ps.filter((p) => p.estado === e).length;
  const enServidor = ps.filter((p) => p.video?.startsWith('videos/'));
  const conLink = ps.filter((p) => esLink(p.video));
  const caidos = conLink.filter((p) => catalogo.extra[p.id]?.enlace?.ok === false).length;
  $('#resumen').innerHTML = [
    ['Publicadas', cuenta('publicada'), cuenta('oculta') ? `${cuenta('oculta')} ocultas` : ''],
    ['Desde un link', conLink.length, caidos ? `${caidos} con el link caído` : 'no ocupan lugar en el disco'],
    ['Guardadas en el servidor', enServidor.length, tamano(catalogo.espacio)],
    ['Descargando', cuenta('descargando') + Object.values(catalogo.trabajos).filter((t) => t.tipo === 'guardar' && t.estado === 'descargando').length, ''],
  ].map(([t, v, d]) => dato(t, v, d)).join('');
  $('#almacenamiento').innerHTML = `<p class="nota"><b>Desde un link:</b> el video no se guarda en ${enInternet ? 'el servidor' : 'esta PC'}; se reproduce directo desde el sitio original
    (por ejemplo archive.org). En Cinetream solo quedan la ficha y la portada. <b>Guardada:</b> el archivo entero está en el disco.</p>${barraDisco(catalogo.disco)}`;

  const texto = $('#filtro-texto').value.trim().toLowerCase();
  const filtro = $('#filtro-estado').value;
  const FILTROS = {
    servidor: (p) => p.video?.startsWith('videos/'),
    link: (p) => esLink(p.video),
    caido: (p) => esLink(p.video) && catalogo.extra[p.id]?.enlace?.ok === false,
  };
  const pasa = FILTROS[filtro] || ((p) => !filtro || p.estado === filtro);
  const lista = ps.filter((p) => pasa(p) && (!texto || `${p.titulo} ${p.direccion} ${(p.generos || []).join(' ')}`.toLowerCase().includes(texto)));
  const orden = $('#filtro-orden').value;
  const x = (p) => catalogo.extra[p.id] || {};
  if (orden === 'vistas') lista.sort((a, b) => (x(b).vistas?.total || 0) - (x(a).vistas?.total || 0));
  if (orden === 'titulo') lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  if (orden === 'tamano') lista.sort((a, b) => (x(b).bytes || 0) - (x(a).bytes || 0));
  const ESTADOS = { publicada: 'Publicada', oculta: 'Oculta', descargando: 'Descargando', error: 'Error' };
  $('#catalogo').innerHTML = lista.length ? lista.map((p) => {
    const t = catalogo.trabajos[p.id];
    const o = origenDe(p);
    const v = x(p).vistas || { total: 0, recientes: 0 };
    const guardando = t?.tipo === 'guardar' && t.estado === 'descargando';
    const bajando = (p.estado === 'descargando' || guardando) && t;
    const avance = bajando
      ? `<div class="progreso-subida"><i style="width:${t.total ? (t.bytes / t.total) * 100 : 3}%"></i><span>${guardando ? 'Guardando en el servidor: ' : ''}${tamano(t.bytes)}${t.total ? ` de ${tamano(t.total)}` : ''}</span></div>` : '';
    const acciones = [];
    if (p.estado === 'descargando' || guardando) acciones.push('<button class="btn" data-accion="cancelar">Cancelar</button>');
    else {
      acciones.push('<button class="btn" data-accion="editar">Editar</button>');
      if (p.estado !== 'error') acciones.push(`<button class="btn" data-accion="${p.estado === 'publicada' ? 'ocultar' : 'publicar'}">${p.estado === 'publicada' ? 'Ocultar' : 'Publicar'}</button>`);
      if (esLink(p.video)) acciones.push('<button class="btn" data-accion="guardar" title="Baja el video al disco: se ve aunque el link deje de funcionar">Guardar en el servidor</button>');
      if (p.video?.startsWith('videos/') && esLink(p.videoOriginal)) acciones.push('<button class="btn" data-accion="liberar" title="Borra el archivo y vuelve a reproducirse desde el link original">Liberar espacio</button>');
    }
    acciones.push('<button class="btn peligro" data-accion="eliminar">Eliminar</button>');
    return `<li class="fila-peli" data-id="${esc(p.id)}">
      <div class="fila-afiche">${afiche(p)}</div>
      <div class="fila-datos">
        <b>${esc(p.titulo)}${p.plus ? ' <span class="sello-mini">Plus</span>' : ''}${p.destacada ? ' <span class="sello-mini sello-destacada">Destacada</span>' : ''}</b>
        <span>${esc([p.anio, p.duracionMin ? `${p.duracionMin} min` : null, p.clasificacion, p.direccion].filter(Boolean).join(' · '))}</span>
        <span class="origen ${o.clase}" ${o.detalle ? `title="${esc(o.detalle)}"` : ''}>${esc(o.texto)}${o.detalle ? ` — ${esc(o.detalle)}` : ''}</span>
        <span class="nota">${v.total ? `${v.total.toLocaleString('es-AR')} reproducciones${v.recientes ? ` · ${v.recientes.toLocaleString('es-AR')} en 30 días` : ''}` : 'Sin reproducciones todavía'}</span>
        ${t?.error ? `<span class="error">${esc(t.error)}</span>` : ''}
        ${avance}
      </div>
      <span class="estado estado-${esc(p.estado)}">${ESTADOS[p.estado] || p.estado}</span>
      <div class="fila-acciones">${acciones.join('')}</div>
    </li>`;
  }).join('') : '<li class="vacio"><b>No hay películas con ese filtro</b></li>';
}
$('#filtro-texto').addEventListener('input', pintar);
$('#filtro-estado').addEventListener('change', pintar);
$('#filtro-orden').addEventListener('change', pintar);
$('#revisar-links').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  b.textContent = 'Revisando…';
  try {
    const r = await enviar('/enlaces/revisar', 'POST', {});
    avisar(!r.revisados ? 'No hay películas desde un link' : r.caidos ? `${r.caidos} de ${r.revisados} links no funcionan` : `Los ${r.revisados} links funcionan`);
    if (r.caidos) $('#filtro-estado').value = 'caido';
    await cargar();
  } catch (err) { avisar(err.message); }
  b.disabled = false;
  b.textContent = 'Revisar links';
});

const confirmar = new Map();
$('#catalogo').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const id = boton.closest('[data-id]').dataset.id;
  const p = catalogo.peliculas.find((x) => x.id === id);
  try {
    switch (boton.dataset.accion) {
      case 'editar': abrirEditor(p); break;
      case 'publicar': await enviar(`/peliculas/${id}`, 'PUT', { datos: { estado: 'publicada' } }); avisar(`«${p.titulo}» ya se ve en la plataforma`); break;
      case 'ocultar': await enviar(`/peliculas/${id}`, 'PUT', { datos: { estado: 'oculta' } }); avisar(`«${p.titulo}» se ocultó`); break;
      case 'cancelar': await enviar(`/peliculas/${id}/cancelar`, 'POST', {}); break;
      case 'guardar':
        await enviar(`/peliculas/${id}/guardar`, 'POST', {});
        completadas.delete(id);
        avisar(`Guardando «${p.titulo}» en el servidor. Mientras tanto se sigue viendo desde el link.`);
        break;
      case 'liberar':
        if (!confirmar.has(`l-${id}`)) {
          boton.textContent = '¿Liberar? Clic de nuevo';
          confirmar.set(`l-${id}`, setTimeout(() => { confirmar.delete(`l-${id}`); boton.textContent = 'Liberar espacio'; }, 4000));
          return;
        }
        clearTimeout(confirmar.get(`l-${id}`));
        confirmar.delete(`l-${id}`);
        boton.textContent = 'Revisando el link…';
        await enviar(`/peliculas/${id}/liberar`, 'POST', {});
        avisar(`«${p.titulo}» ahora se ve desde el link y se liberó su espacio`);
        break;
      case 'eliminar':
        // Se confirma con un segundo clic
        if (!confirmar.has(id)) {
          boton.textContent = '¿Seguro? Clic de nuevo';
          confirmar.set(id, setTimeout(() => { confirmar.delete(id); boton.textContent = 'Eliminar'; }, 4000));
          return;
        }
        clearTimeout(confirmar.get(id));
        confirmar.delete(id);
        await api(`/peliculas/${id}`, { method: 'DELETE' });
        avisar(`«${p.titulo}» se eliminó, con su archivo y su portada`);
        break;
      default: return;
    }
    await cargar();
  } catch (err) {
    avisar(err.message);
  }
});

// ---------- Editor ----------
let editando = null;
function abrirEditor(p) {
  editando = structuredClone(p);
  $('#editor-campos').innerHTML = campos(editando);
  $('#editor-color-fondo').value = editando.colores?.[0] || '#1c2030';
  $('#editor-color-acento').value = editando.colores?.[1] || '#ffb547';
  $('#editor-motivo').value = editando.motivo || 'anillos';
  $('#editor-error').textContent = '';
  $('#editor-cuadro').hidden = !editando.video?.startsWith('videos/');
  $('#editor-video').textContent = editando.video ? `Video: ${editando.video.startsWith('videos/') ? (enInternet ? 'guardada en el servidor' : 'archivo en esta PC') : editando.video}` : 'Sin archivo: se reproduce una señal de prueba.';
  pintarAficheEditor();
  $('#editor').showModal();
}
function pintarAficheEditor() {
  editando.colores = [$('#editor-color-fondo').value, $('#editor-color-acento').value];
  editando.motivo = $('#editor-motivo').value;
  $('#editor-afiche').innerHTML = afiche({ ...editando, titulo: $('#editor-campos [name="titulo"]')?.value || editando.titulo });
}
for (const id of ['#editor-color-fondo', '#editor-color-acento', '#editor-motivo']) $(id).addEventListener('input', pintarAficheEditor);
$('#editor-campos').addEventListener('input', (e) => { if (e.target.name === 'titulo') pintarAficheEditor(); });
const cerrarEditor = () => $('#editor').close();
$('#editor-cerrar').addEventListener('click', cerrarEditor);
$('#editor-cancelar').addEventListener('click', cerrarEditor);

async function cambiarPortada(imagen, tipo) {
  const { pelicula } = await api(`/peliculas/${editando.id}/portada`, { method: 'PUT', headers: { 'Content-Type': tipo }, body: imagen });
  editando.portada = pelicula.portada;
  const colores = await coloresDeImagen(pelicula.portada);
  if (colores) { [$('#editor-color-fondo').value, $('#editor-color-acento').value] = colores; }
  pintarAficheEditor();
}
$('#editor-imagen').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try { await cambiarPortada(archivo, archivo.type); } catch (err) { $('#editor-error').textContent = err.message; }
  e.target.value = '';
});
$('#editor-cuadro').addEventListener('click', async () => {
  const boton = $('#editor-cuadro');
  boton.disabled = true;
  boton.textContent = 'Tomando un cuadro…';
  try {
    // Cada clic toma un momento distinto de la película
    const momento = 0.08 + Math.random() * 0.5;
    await cambiarPortada(await cuadroDelVideo(editando.video, momento), 'image/jpeg');
  } catch (err) {
    $('#editor-error').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Tomar otro cuadro del video';
  }
});
$('#editor-ilustracion').addEventListener('click', () => { editando.portada = null; pintarAficheEditor(); });

$('#editor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = { ...leerCampos($('#editor-campos')), colores: editando.colores, motivo: editando.motivo, portada: editando.portada ?? null };
  if (!datos.titulo) { $('#editor-error').textContent = 'Falta el título.'; return; }
  try {
    await enviar(`/peliculas/${editando.id}`, 'PUT', { datos });
    cerrarEditor();
    avisar('Cambios guardados');
    await cargar();
  } catch (err) {
    $('#editor-error').textContent = err.message;
  }
});

function mostrarPanel() {
  $('#acceso').hidden = true;
  $('#panel').hidden = false;
  cargar();
  cargarNegocio();
}

// ---------- Secciones ----------
const pesos = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`;
const fechaCorta = (ms) => (ms ? new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const dato = (titulo, valor, detalle = '') => `<div class="dato"><b>${esc(valor)}</b><span>${esc(titulo)}</span>${detalle ? `<small>${esc(detalle)}</small>` : ''}</div>`;

document.querySelectorAll('[data-seccion]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-seccion]').forEach((x) => { x.classList.toggle('activa', x === b); x.setAttribute('aria-selected', String(x === b)); });
  document.querySelectorAll('.seccion').forEach((sec) => { sec.hidden = sec.id !== `seccion-${b.dataset.seccion}`; });
  ({ negocio: cargarNegocio, catalogo: cargar, suscriptores: cargarCuentas, publicidad: cargarPublicidad, planes: cargarPlanes, ajustes: cargarAjustes })[b.dataset.seccion]?.();
}));

// ---------- Resumen del negocio ----------
let negocio = null;
async function cargarNegocio() {
  negocio = await api('/resumen');
  const plus = (negocio.porPlan.plus || 0) + (negocio.porPlan['plus-anual'] || 0);
  const p = negocio.publicidad;
  $('#negocio-prueba').hidden = !negocio.modoPrueba;
  const vistas30 = negocio.vistasPorDia.reduce((a, d) => a + d.n, 0);
  $('#negocio-datos').innerHTML = [
    dato('Suscriptores Plus', plus, `de ${negocio.cuentas} cuentas`),
    dato('Reproducciones', vistas30.toLocaleString('es-AR'), 'últimos 30 días'),
    dato('Cuentas nuevas', negocio.nuevas30, 'últimos 30 días'),
    dato('Ingreso mensual estimado', pesos(negocio.ingresoMensual), negocio.modoPrueba ? 'con pagos de prueba' : 'planes vigentes'),
    dato('Avisos mostrados', p.impresiones.toLocaleString('es-AR'), `${negocio.campanasActivas} campañas activas`),
    dato('Clics en avisos', p.clics.toLocaleString('es-AR'), p.impresiones ? `${((p.clics / p.impresiones) * 100).toFixed(1).replace('.', ',')}% de los mostrados` : 'sin datos todavía'),
  ].join('');
  const total = Math.max(1, negocio.cuentas);
  $('#negocio-planes').innerHTML = negocio.planes.map((pl) => {
    const n = negocio.porPlan[pl.id] || 0;
    return `<div class="barra-plan"><span>${esc(pl.nombre)}</span><div><i style="width:${(n / total) * 100}%"></i></div><b>${n}</b></div>`;
  }).join('') || '<p class="nota">Todavía no hay cuentas.</p>';

  // Reproducciones por día: columnas con el valor al pasar el mouse
  const maximo = Math.max(1, ...negocio.vistasPorDia.map((d) => d.n));
  const diaCorto = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  $('#negocio-grafico').setAttribute('aria-label', `Reproducciones por día: ${vistas30} en 30 días`);
  $('#negocio-grafico').innerHTML = `<div class="columnas">${negocio.vistasPorDia.map((d) => `<i style="height:${Math.max(2, (d.n / maximo) * 100)}%" class="${d.n ? '' : 'vacia'}" title="${esc(diaCorto(d.dia))}: ${d.n} reproducciones"></i>`).join('')}</div>
    <div class="ejes"><span>${esc(diaCorto(negocio.vistasPorDia[0].dia))}</span><span>máximo ${maximo === 1 && !vistas30 ? 0 : maximo} por día</span><span>Hoy</span></div>`;
  $('#negocio-mas-vistas').innerHTML = negocio.masVistas.length
    ? negocio.masVistas.map((p) => `<li><span>${esc(p.titulo)} <small>${esc(p.anio)}</small></span><b>${p.recientes.toLocaleString('es-AR')}</b></li>`).join('')
    : '<li class="nota">Todavía nadie vio películas este mes.</li>';
  $('#negocio-disco').innerHTML = barraDisco(negocio.disco)
    + `<p class="nota">${negocio.catalogo.desdeLink} películas desde un link (no ocupan lugar) · ${negocio.catalogo.enServidor} guardadas en el servidor${negocio.catalogo.linksCaidos ? ` · <b class="error">${negocio.catalogo.linksCaidos} con el link caído</b>` : ''}</p>`;
}

// ---------- Suscriptores ----------
let cuentasLista = [];
async function cargarCuentas() {
  cuentasLista = (await api('/cuentas')).cuentas;
  if (!negocio) await cargarNegocio();
  const filtroPlan = $('#cuentas-plan');
  if (filtroPlan.options.length === 1) filtroPlan.insertAdjacentHTML('beforeend', negocio.planes.map((pl) => `<option value="${esc(pl.id)}">${esc(pl.nombre)}</option>`).join(''));
  pintarCuentas();
}
function pintarCuentas() {
  const texto = $('#cuentas-filtro').value.trim().toLowerCase();
  const plan = $('#cuentas-plan').value;
  const nombrePlan = (id) => negocio?.planes.find((p) => p.id === id)?.nombre || id;
  const lista = cuentasLista.filter((c) => (!plan || c.planEfectivo === plan) && (!texto || `${c.email} ${c.nombre}`.toLowerCase().includes(texto)));
  const ESTADOS = { activa: 'Activa', cancelada: 'No renueva', vencida: 'Vencida' };
  $('#cuentas-tabla').innerHTML = `<thead><tr><th>Cuenta</th><th>Plan</th><th>Estado</th><th>Vence</th><th>Alta</th><th>Pago</th><th>Cambiar a mano</th></tr></thead>
    <tbody>${lista.length ? lista.map((c) => `<tr data-id="${esc(c.id)}">
      <td><b>${esc(c.email)}</b>${c.nombre ? `<small>${esc(c.nombre)}</small>` : ''}</td>
      <td><span class="estado ${c.planEfectivo === 'gratis' ? 'estado-oculta' : 'estado-publicada'}">${esc(nombrePlan(c.planEfectivo))}</span></td>
      <td>${esc(c.planEfectivo === 'gratis' ? '—' : ESTADOS[c.estado] || c.estado)}</td>
      <td>${esc(c.planEfectivo === 'gratis' ? '—' : fechaCorta(c.vence))}</td>
      <td>${esc(fechaCorta(c.alta))}</td>
      <td>${esc(c.pago ? `${{ mercadopago: 'Mercado Pago', prueba: 'Prueba', manual: 'Manual' }[c.pago.proveedor] || c.pago.proveedor}` : '—')}</td>
      <td class="cambiar"><select aria-label="Plan">${negocio.planes.map((pl) => `<option value="${esc(pl.id)}" ${pl.id === c.planEfectivo ? 'selected' : ''}>${esc(pl.nombre)}</option>`).join('')}</select>
        <input type="number" min="1" max="3660" value="30" aria-label="Días"> días <button class="btn" data-accion="aplicar">Aplicar</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="nota">No hay cuentas con ese filtro.</td></tr>'}</tbody>`;
}
$('#cuentas-filtro').addEventListener('input', pintarCuentas);
$('#cuentas-plan').addEventListener('change', pintarCuentas);
$('#cuentas-tabla').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-accion="aplicar"]')) return;
  const fila = e.target.closest('tr');
  try {
    await enviar(`/cuentas/${fila.dataset.id}`, 'PUT', { plan: fila.querySelector('select').value, dias: fila.querySelector('input').value });
    avisar('Plan actualizado');
    await cargarCuentas();
    await cargarNegocio();
  } catch (err) { avisar(err.message); }
});

// ---------- Publicidad ----------
let campanasLista = [];
async function cargarPublicidad() {
  campanasLista = (await api('/publicidad')).campanas;
  const t = campanasLista.reduce((a, c) => ({ i: a.i + c.stats.impresiones, c: a.c + c.stats.clics, v: a.v + c.stats.completos }), { i: 0, c: 0, v: 0 });
  $('#publicidad-datos').innerHTML = [
    dato('Avisos mostrados', t.i.toLocaleString('es-AR')),
    dato('Clics', t.c.toLocaleString('es-AR'), t.i ? `${((t.c / t.i) * 100).toFixed(1).replace('.', ',')}% de los mostrados` : ''),
    dato('Vistos completos', t.v.toLocaleString('es-AR'), 'avisos antes de la película'),
    dato('Campañas activas', campanasLista.filter((c) => c.activa).length, `de ${campanasLista.length}`),
  ].join('');
  $('#campanas').innerHTML = campanasLista.length ? campanasLista.map((c) => `<li class="campana" data-id="${esc(c.id)}">
      <div class="campana-mini">${vistaCampana(c)}</div>
      <div class="fila-datos">
        <b>${esc(c.nombre)}</b>
        <span>${esc([c.anunciante, c.tipo === 'banner' ? 'Banner en el inicio' : 'Antes de la película', c.desde || c.hasta ? `${fechaCorta(c.desde)} → ${fechaCorta(c.hasta)}` : 'Sin fechas'].filter(Boolean).join(' · '))}</span>
        <span class="nota">${c.stats.impresiones.toLocaleString('es-AR')} mostrados · ${c.stats.clics.toLocaleString('es-AR')} clics${c.tipo === 'previo' ? ` · ${c.stats.completos.toLocaleString('es-AR')} completos` : ''}</span>
      </div>
      <span class="estado ${c.activa ? 'estado-publicada' : 'estado-oculta'}">${c.activa ? 'Activa' : 'Pausada'}</span>
      <div class="fila-acciones">
        <button class="btn" data-accion="editar">Editar</button>
        <button class="btn" data-accion="${c.activa ? 'pausar' : 'activar'}">${c.activa ? 'Pausar' : 'Activar'}</button>
        <button class="btn peligro" data-accion="eliminar">Eliminar</button>
      </div></li>`).join('') : '<li class="vacio"><b>Todavía no hay campañas</b></li>';
}

function vistaCampana(c) {
  if (c.pieza && c.piezaTipo === 'imagen') return `<img src="${esc(c.pieza)}" alt="">`;
  if (c.pieza && c.piezaTipo === 'video') return `<video src="${esc(c.pieza)}" muted preload="metadata"></video>`;
  return `<div class="anuncio-texto" style="--a1:${esc(c.colores?.[0])};--a2:${esc(c.colores?.[1])}"><span class="anuncio-marca">${esc(c.anunciante)}</span><b>${esc(c.titulo || c.nombre)}</b><span>${esc(c.texto)}</span></div>`;
}

const confirmarCampana = new Map();
$('#campanas').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const id = boton.closest('[data-id]').dataset.id;
  const c = campanasLista.find((x) => x.id === id);
  try {
    if (boton.dataset.accion === 'editar') { abrirCampana(c); return; }
    if (boton.dataset.accion === 'pausar' || boton.dataset.accion === 'activar') await enviar(`/publicidad/${id}`, 'PUT', { datos: { activa: boton.dataset.accion === 'activar' } });
    if (boton.dataset.accion === 'eliminar') {
      if (!confirmarCampana.has(id)) {
        boton.textContent = '¿Seguro? Clic de nuevo';
        confirmarCampana.set(id, setTimeout(() => { confirmarCampana.delete(id); boton.textContent = 'Eliminar'; }, 4000));
        return;
      }
      clearTimeout(confirmarCampana.get(id));
      confirmarCampana.delete(id);
      await api(`/publicidad/${id}`, { method: 'DELETE' });
      avisar(`Se eliminó «${c.nombre}»`);
    }
    await cargarPublicidad();
  } catch (err) { avisar(err.message); }
});

let campana = null;
const aFecha = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
function abrirCampana(c = null) {
  campana = c ? structuredClone(c) : { activa: true, tipo: 'previo', duracion: 6, saltarTras: 5, peso: 1, colores: ['#1d1203', '#ffb547'] };
  const f = $('#campana-form');
  $('#campana-titulo').textContent = c ? 'Editar campaña' : 'Nueva campaña';
  for (const n of ['nombre', 'anunciante', 'tipo', 'titulo', 'texto', 'enlace', 'duracion', 'saltarTras', 'peso']) f.elements[n].value = campana[n] ?? '';
  f.elements.desde.value = aFecha(campana.desde);
  f.elements.hasta.value = aFecha(campana.hasta);
  f.elements.activa.checked = Boolean(campana.activa);
  f.elements.color0.value = campana.colores?.[0] || '#1d1203';
  f.elements.color1.value = campana.colores?.[1] || '#ffb547';
  $('#campana-error').textContent = '';
  $('#campana-pieza-botones').hidden = !c; // la pieza se sube después de crear la campaña
  $('#campana-pieza-nota').textContent = c ? 'Sin imagen ni video, se muestra un aviso de texto con los colores de la campaña.' : 'Guardá la campaña para poder subir una imagen o un video.';
  pintarVistaCampana();
  $('#campana-editor').showModal();
}
function datosCampana() {
  const f = $('#campana-form').elements;
  return {
    nombre: f.nombre.value.trim(), anunciante: f.anunciante.value.trim(), tipo: f.tipo.value, titulo: f.titulo.value.trim(), texto: f.texto.value.trim(),
    enlace: f.enlace.value.trim(), duracion: f.duracion.value, saltarTras: f.saltarTras.value, peso: f.peso.value,
    desde: f.desde.value || null, hasta: f.hasta.value || null, activa: f.activa.checked, colores: [f.color0.value, f.color1.value],
  };
}
function pintarVistaCampana() { $('#campana-vista').innerHTML = vistaCampana({ ...campana, ...datosCampana() }); }
$('#campana-form').addEventListener('input', pintarVistaCampana);
$('#campana-nueva').addEventListener('click', () => abrirCampana());
$('#campana-cerrar').addEventListener('click', () => $('#campana-editor').close());
$('#campana-cancelar').addEventListener('click', () => $('#campana-editor').close());
$('#campana-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = datosCampana();
  if (!datos.nombre) { $('#campana-error').textContent = 'Poné un nombre a la campaña.'; return; }
  try {
    if (campana.id) await enviar(`/publicidad/${campana.id}`, 'PUT', { datos });
    else campana = (await enviar('/publicidad', 'POST', { datos })).campana;
    $('#campana-editor').close();
    avisar('Campaña guardada');
    await cargarPublicidad();
  } catch (err) { $('#campana-error').textContent = err.message; }
});
$('#campana-pieza').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo || !campana?.id) return;
  $('#campana-pieza-nota').textContent = 'Subiendo…';
  try {
    campana = (await api(`/publicidad/${campana.id}/pieza`, { method: 'PUT', headers: { 'Content-Type': archivo.type }, body: archivo })).campana;
    $('#campana-pieza-nota').textContent = `Pieza cargada: ${archivo.type.startsWith('video') ? 'video' : 'imagen'}.`;
    pintarVistaCampana();
    cargarPublicidad();
  } catch (err) { $('#campana-pieza-nota').textContent = err.message; }
  e.target.value = '';
});
$('#campana-quitar-pieza').addEventListener('click', async () => {
  if (!campana?.id) return;
  campana = (await api(`/publicidad/${campana.id}/pieza`, { method: 'DELETE' })).campana;
  pintarVistaCampana();
  cargarPublicidad();
});

// ---------- Planes y pagos ----------
async function cargarPlanes() {
  negocio = await api('/resumen');
  $('#planes-form').innerHTML = negocio.planes.map((pl) => `
    <fieldset class="plan-admin" data-id="${esc(pl.id)}">
      <legend>${esc(pl.id === 'gratis' ? 'Gratis (con publicidad)' : pl.id === 'plus' ? 'Plus mensual' : 'Plus anual')}</legend>
      <label>Nombre<input name="nombre" maxlength="40" value="${esc(pl.nombre)}"></label>
      <label>Precio ($ por ${esc(pl.periodo)})<input name="precio" type="number" min="0" step="1" value="${esc(pl.precio)}" ${pl.id === 'gratis' ? 'disabled' : ''}></label>
      <label class="ancho">Descripción<input name="descripcion" maxlength="200" value="${esc(pl.descripcion)}"></label>
      ${pl.id === 'gratis' ? '' : `<label class="tilde"><input type="checkbox" name="oculto" ${pl.oculto ? 'checked' : ''}> No ofrecer este plan por ahora</label>`}
    </fieldset>`).join('') + '<div class="acciones"><button class="btn principal">Guardar planes</button></div>';
  $('#pagos-estado').innerHTML = negocio.modoPrueba
    ? '<p class="aviso-prueba"><b>Modo prueba activo:</b> nadie paga de verdad; el pago se simula en una página de prueba.</p>'
    : '<p class="aviso-ok"><b>Mercado Pago conectado:</b> las suscripciones se cobran y se renuevan solas.</p>';
}
$('#planes-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const planes = [...document.querySelectorAll('.plan-admin')].map((f) => ({
    id: f.dataset.id,
    nombre: f.querySelector('[name="nombre"]').value,
    precio: f.querySelector('[name="precio"]').value,
    descripcion: f.querySelector('[name="descripcion"]').value,
    oculto: f.querySelector('[name="oculto"]')?.checked || false,
  }));
  try { await enviar('/planes', 'PUT', { planes }); avisar('Planes guardados'); await cargarPlanes(); } catch (err) { avisar(err.message); }
});

// ---------- Seguridad ----------
const sesionesCerradas = (n) => (n === 1 ? 'Se cerró 1 sesión en otro equipo' : `Se cerraron ${n} sesiones en otros equipos`);
let estadoServidor = {};
function fuerzaClave(c) {
  let puntos = 0;
  if (c.length >= 10) puntos++;
  if (c.length >= 14) puntos++;
  if (/[a-z]/.test(c) && /[A-Z]/.test(c)) puntos++;
  if (/\d/.test(c)) puntos++;
  if (/[^A-Za-z0-9]/.test(c)) puntos++;
  return Math.min(4, puntos);
}
$('#clave-form [name="nueva"]').addEventListener('input', (e) => {
  const f = e.target.value ? fuerzaClave(e.target.value) : -1;
  const m = $('#clave-medidor');
  m.dataset.nivel = f;
  m.querySelector('span').textContent = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'][f] || '';
});
$('#clave-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const f = form.elements;
  $('#clave-error').textContent = '';
  if (f.nueva.value !== f.repetir.value) { $('#clave-error').textContent = 'Las contraseñas nuevas no coinciden.'; return; }
  if (fuerzaClave(f.nueva.value) < 2) { $('#clave-error').textContent = 'Elegí una contraseña más fuerte: más larga, con números o símbolos.'; return; }
  try {
    const r = await enviar('/clave', 'POST', { actual: f.actual.value, nueva: f.nueva.value });
    form.reset();
    $('#clave-medidor').dataset.nivel = -1;
    avisar(`Contraseña cambiada${r.cerradas ? `. ${sesionesCerradas(r.cerradas)}` : ''}`);
  } catch (err) { $('#clave-error').textContent = err.message; }
});
$('#cerrar-sesiones').addEventListener('click', async () => {
  try {
    const r = await enviar('/sesiones/cerrar', 'POST', {});
    avisar(r.cerradas ? sesionesCerradas(r.cerradas) : 'No había otras sesiones abiertas');
  } catch (err) { avisar(err.message); }
});
async function cargarAjustes() {
  const [n, c] = await Promise.all([api('/resumen'), api('/catalogo')]);
  const d = n.disco;
  const filas = [
    ['Dónde corre', estadoServidor.enInternet ? `En internet${estadoServidor.render ? ' (Render)' : ''}` : 'En esta PC'],
    ['Dirección', estadoServidor.direccion || location.origin],
    ['Cobros', n.modoPrueba ? 'Modo prueba (no se cobra)' : 'Mercado Pago conectado'],
    ['Películas', `${c.peliculas.length} en total · ${n.catalogo.publicadas} publicadas`],
    ['Cuentas', `${n.cuentas}`],
    ['Disco', d.total ? `${tamano(d.libre)} libres de ${tamano(d.total)}` : `${tamano(d.videos + d.portadas + d.anuncios)} usados`],
  ];
  $('#ficha-servidor').innerHTML = filas.map(([t, v]) => `<dt>${esc(t)}</dt><dd>${esc(v)}</dd>`).join('');
}

// Mientras haya descargas, el avance se actualiza solo
setInterval(() => {
  const activas = catalogo.peliculas.some((p) => p.estado === 'descargando') || Object.values(catalogo.trabajos).some((t) => t.estado === 'descargando');
  if (!$('#panel').hidden && activas) cargar().catch(() => {});
}, 1500);

iniciar().catch(() => {
  document.body.innerHTML = '<p class="vacio" style="margin:2rem">No se pudo conectar con el servidor de Cinetream. Revisá que esté andando y volvé a cargar la página.</p>';
});
