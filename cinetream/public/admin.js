// Administrador de Cinetream: agregar películas por link o subiendo el archivo, y editar el catálogo.
import { afiche } from './carteles.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tamano = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

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
  if (estado.sesion) mostrarPanel();
  else mostrarAcceso();
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
let catalogo = { peliculas: [], trabajos: {}, espacio: 0 };
const completadas = new Set();

async function cargar() {
  catalogo = await api('/catalogo');
  // Cuando termina una descarga, se completan solos la duración, la portada y los colores
  for (const [id, t] of Object.entries(catalogo.trabajos)) {
    const p = catalogo.peliculas.find((x) => x.id === id);
    if (t.estado === 'listo' && p && !completadas.has(id)) {
      completadas.add(id);
      completarAutomatico(p).then(() => { avisar(`«${p.titulo}» está lista. Revisala y publicala.`); cargar(); });
    }
  }
  pintar();
}

function pintar() {
  const ps = catalogo.peliculas;
  const cuenta = (e) => ps.filter((p) => p.estado === e).length;
  $('#resumen').innerHTML = [
    ['Publicadas', cuenta('publicada')],
    ['Ocultas', cuenta('oculta')],
    ['Descargando', cuenta('descargando')],
    ['Espacio en videos', tamano(catalogo.espacio)],
  ].map(([t, v]) => `<div class="dato"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join('');

  const texto = $('#filtro-texto').value.trim().toLowerCase();
  const estado = $('#filtro-estado').value;
  const lista = ps.filter((p) => (!estado || p.estado === estado) && (!texto || `${p.titulo} ${p.direccion}`.toLowerCase().includes(texto)));
  const ESTADOS = { publicada: 'Publicada', oculta: 'Oculta', descargando: 'Descargando', error: 'Error' };
  $('#catalogo').innerHTML = lista.length ? lista.map((p) => {
    const t = catalogo.trabajos[p.id];
    const origen = !p.video ? 'Sin archivo (señal de prueba)' : p.video.startsWith('videos/') ? 'Archivo en esta PC' : 'Desde un link';
    const avance = p.estado === 'descargando' && t
      ? `<div class="progreso-subida"><i style="width:${t.total ? (t.bytes / t.total) * 100 : 3}%"></i><span>${tamano(t.bytes)}${t.total ? ` de ${tamano(t.total)}` : ''}</span></div>` : '';
    return `<li class="fila-peli" data-id="${esc(p.id)}">
      <div class="fila-afiche">${afiche(p)}</div>
      <div class="fila-datos">
        <b>${esc(p.titulo)}</b>
        <span>${esc([p.anio, p.duracionMin ? `${p.duracionMin} min` : null, p.clasificacion, p.direccion].filter(Boolean).join(' · '))}</span>
        <span class="nota">${esc(origen)}${p.destacada ? ' · Destacada' : ''}</span>
        ${t?.error ? `<span class="error">${esc(t.error)}</span>` : ''}
        ${avance}
      </div>
      <span class="estado estado-${esc(p.estado)}">${ESTADOS[p.estado] || p.estado}</span>
      <div class="fila-acciones">
        ${p.estado === 'descargando'
    ? '<button class="btn" data-accion="cancelar">Cancelar</button>'
    : `<button class="btn" data-accion="editar">Editar</button>
           ${p.estado !== 'error' ? `<button class="btn" data-accion="${p.estado === 'publicada' ? 'ocultar' : 'publicar'}">${p.estado === 'publicada' ? 'Ocultar' : 'Publicar'}</button>` : ''}`}
        <button class="btn peligro" data-accion="eliminar">Eliminar</button>
      </div>
    </li>`;
  }).join('') : '<li class="vacio"><b>No hay películas con ese filtro</b></li>';
}
$('#filtro-texto').addEventListener('input', pintar);
$('#filtro-estado').addEventListener('change', pintar);

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
  $('#editor-video').textContent = editando.video ? `Video: ${editando.video.startsWith('videos/') ? 'archivo en esta PC' : editando.video}` : 'Sin archivo: se reproduce una señal de prueba.';
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
}

// Mientras haya descargas, el avance se actualiza solo
setInterval(() => {
  if (!$('#panel').hidden && catalogo.peliculas.some((p) => p.estado === 'descargando')) cargar().catch(() => {});
}, 1500);

iniciar().catch(() => {
  document.body.innerHTML = '<p class="vacio" style="margin:2rem">No se pudo conectar con el servidor de Cinetream. Abrí el administrador desde la PC donde está instalado.</p>';
});
