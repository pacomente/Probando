// Cinetream: pantallas, perfiles, "Seguir viendo", Mi lista, Explorar, búsqueda y ajustes.
// Funciona igual con control remoto (tele), teclado, mouse o el dedo (celular).
import { estudio, FILAS, IMPRESCINDIBLES, PELICULAS as PELICULAS_EJEMPLO } from './catalogo.js';
import { afiche, avatar, fondoApaisado, miniatura } from './carteles.js';
import { accionDeTecla, enfocar, moverFoco, navegables } from './navegacion.js';
import { abrirReproductor } from './reproductor.js';
import { crearCuenta } from './cuenta.js';
import { crearPublicidad } from './anuncios.js';
import { enApp, esTeleApp, pintarConexion } from './app-nativa.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// El catálogo lo arma el administrador en el servidor; sin servidor (demo), se usa el de ejemplo
let PELICULAS = PELICULAS_EJEMPLO;
let conServidor = false;
try {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 5000);
  const r = await fetch('api/catalogo', { cache: 'no-cache', signal: control.signal });
  clearTimeout(corte);
  if (r.ok) { PELICULAS = (await r.json()).peliculas; conServidor = true; }
} catch { /* sin servidor: catálogo de ejemplo */ }
const porId = new Map(PELICULAS.map((p) => [p.id, p]));

// ---------- Cuenta y publicidad ----------
// Al ingresar, salir o cambiar de plan se recarga la plataforma: el catálogo y la publicidad dependen del plan
const cuentas = crearCuenta({
  conServidor,
  alCambiar(mensaje) {
    try { if (mensaje) sessionStorage.setItem('cinetream-aviso', mensaje); } catch { /* sin almacenamiento */ }
    location.reload();
  },
});
await cuentas.cargar().catch(() => null);
const mensajePago = await cuentas.verificarRetorno().catch(() => null);
const cuenta = () => cuentas.actual;
const publicidad = crearPublicidad({ conServidor });
await publicidad.cargar(Boolean(cuenta()?.anuncios));
// Un título Plus se ve solo con un plan Plus
const bloqueada = (p) => Boolean(p.plus && !cuenta()?.plus);
// Sin publicidad en perfiles infantiles
const conPublicidad = () => Boolean(cuenta()?.anuncios && !perfil?.ninos);
let ultimoPrevio = 0;
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const modoTV = () => esTeleApp || (!matchMedia('(pointer: coarse)').matches && innerWidth >= 1000);

// ---------- Datos guardados en este dispositivo ----------
function leer(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: se usa en memoria */ }
}

// ---------- Perfiles ----------
const MAX_PERFILES = 5;
const COLORES = ['#ffb547', '#7fc8f8', '#9be07a', '#ff8a7a', '#c4a1ff', '#f2ead8'];
const ESTILOS = ['puntos', 'lineas', 'grandes', 'guino'];
const PERFILES_INICIALES = [
  { id: 'familia', nombre: 'Familia', color: '#ffb547', estilo: 'puntos' },
  { id: 'invitado', nombre: 'Invitado', color: '#7fc8f8', estilo: 'lineas' },
  { id: 'ninos', nombre: 'Niños', color: '#9be07a', estilo: 'grandes', ninos: true },
];
let perfiles = leer('cinetream-perfiles', PERFILES_INICIALES);
const guardarPerfiles = () => guardar('cinetream-perfiles', perfiles);
let perfil = null;
let datos = { lista: [], progreso: {} };
let ajustes = { autoSiguiente: true, animaciones: true, ...leer('cinetream-ajustes', {}) };
document.body.classList.toggle('sin-animaciones', !ajustes.animaciones);

function elegirPerfil(id) {
  perfil = perfiles.find((p) => p.id === id) || perfiles[0];
  datos = leer(`cinetream-${perfil.id}`, { lista: [], progreso: {} });
  try { sessionStorage.setItem('cinetream-perfil', perfil.id); } catch { /* sin almacenamiento */ }
  for (const el of document.querySelectorAll('.avatar-actual')) el.innerHTML = avatar(perfil);
}
const guardarDatos = () => guardar(`cinetream-${perfil.id}`, datos);

// El perfil infantil solo ve películas aptas para todo público
const catalogo = () => PELICULAS.filter((p) => !perfil?.ninos || p.clasificacion === 'ATP');

function progresoDe(id) {
  const p = datos.progreso[id];
  if (!p || !p.d) return null;
  return { ...p, pct: Math.min(100, (p.t / p.d) * 100), quedan: Math.max(0, p.d - p.t) };
}
const enCurso = (id) => { const p = progresoDe(id); return p && p.pct > 2 && p.pct < 95; };

const duracion = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
const quedanTexto = (seg) => (seg >= 60 ? `Quedan ${Math.round(seg / 60)} min` : 'Últimos segundos');
const formatoMin = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Navegación entre pantallas ----------
const VISTAS = ['bienvenida', 'perfiles', 'editar', 'inicio', 'explorar', 'genero', 'ficha', 'buscar', 'lista', 'ajustes', 'planes'];
const SIN_BARRA = ['bienvenida', 'perfiles', 'editar'];
let pila = [];

function mostrar(nombre, parametro, { apilar = true } = {}) {
  if (apilar) {
    pila.push({ nombre, parametro });
    try { history.pushState({ cinetream: pila.length }, ''); } catch { /* algunos visores no lo permiten */ }
  }
  for (const v of VISTAS) $(`#vista-${v}`).hidden = v !== nombre;
  $('#barra').hidden = SIN_BARRA.includes(nombre);
  document.querySelector('.pestanas-movil').hidden = SIN_BARRA.includes(nombre);
  const seccion = nombre === 'genero' ? 'explorar' : nombre;
  document.querySelectorAll('[data-ir]').forEach((b) => b.classList.toggle('activo', b.dataset.ir === seccion));
  window.scrollTo(0, 0);
  ({ perfiles: pintarPerfiles, editar: pintarEditar, inicio: pintarInicio, explorar: pintarExplorar, genero: pintarGenero,
    ficha: pintarFicha, buscar: pintarBuscar, lista: pintarLista, ajustes: pintarAjustes,
    bienvenida: () => cuentas.pintarBienvenida($('#vista-bienvenida'), { modoTV: modoTV() }),
    planes: () => cuentas.pintarPlanes($('#vista-planes')) })[nombre](parametro);
}

function volver() {
  if (pila.length <= 1) return;
  pila.pop();
  const anterior = pila.at(-1);
  mostrar(anterior.nombre, anterior.parametro, { apilar: false });
}
// Botón "atrás" del celular o del navegador
let ignorarAtras = 0;
window.addEventListener('popstate', () => {
  if (ignorarAtras) { ignorarAtras--; return; }
  if (!$('#vista-reproductor').hidden) return;
  volver();
});

document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
  const destino = b.dataset.ir;
  if (destino === 'inicio') pila = [];
  mostrar(destino);
}));

// La barra se vuelve sólida al bajar
window.addEventListener('scroll', () => $('#barra').classList.toggle('solida', scrollY > 40), { passive: true });

// ---------- Tarjetas y filas ----------
function tarjeta(p) {
  const prog = progresoDe(p.id);
  return `<button class="tarjeta" data-nav data-id="${esc(p.id)}" aria-label="${esc(`${p.titulo}, ${p.anio}, ${duracion(p.duracionMin)}`)}">
    ${afiche(p, estudio(p))}
    ${p.plus ? '<span class="sello sello-plus">Plus</span>' : p.video || p.bloqueada ? '' : '<span class="sello">Próximamente</span>'}
    ${prog && enCurso(p.id) ? `<span class="progreso"><i style="width:${prog.pct}%"></i></span>` : ''}
  </button>`;
}

// "Seguir viendo": apaisada, con lo que falta; un toque sigue la película directamente
function tarjetaSeguir(p) {
  const prog = progresoDe(p.id);
  return `<button class="tarjeta tarjeta-ancha" data-nav data-id="${esc(p.id)}" data-reanudar aria-label="${esc(`Seguir viendo ${p.titulo}, ${quedanTexto(prog.quedan)}`)}">
    ${miniatura(p)}
    <span class="tarjeta-play" aria-hidden="true">▶</span>
    <span class="progreso"><i style="width:${prog.pct}%"></i></span>
    <span class="tarjeta-pie"><b>${esc(p.titulo)}</b><span>${quedanTexto(prog.quedan)}</span></span>
  </button>`;
}

// Las 10 imprescindibles: el puesto en números grandes, detrás del afiche
function tarjetaTop(p, puesto) {
  return `<button class="tarjeta tarjeta-top" data-nav data-id="${esc(p.id)}" aria-label="${esc(`Puesto ${puesto}: ${p.titulo}`)}">
    <span class="puesto" aria-hidden="true">${puesto}</span>${afiche(p, estudio(p))}
  </button>`;
}

function fila(titulo, contenido, clave, { clase = '', subtitulo = '' } = {}) {
  if (!contenido) return '';
  return `<section class="fila ${clase}" data-fila="${esc(clave)}"><h3>${esc(titulo)}${subtitulo ? `<small>${esc(subtitulo)}</small>` : ''}</h3><div class="carril">${contenido}</div></section>`;
}
const filaDe = (titulo, lista, clave, opciones) => fila(titulo, lista.map(tarjeta).join(''), clave, opciones);

// Un toque, clic u OK en una tarjeta abre su ficha (o sigue la película, en "Seguir viendo")
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tarjeta');
  if (!t) return;
  if (t.hasAttribute('data-reanudar')) reproducir(t.dataset.id);
  else mostrar('ficha', t.dataset.id);
});

// ---------- Elegir perfil ----------
let administrando = false;

function pintarPerfiles() {
  const tarjetas = perfiles.map((p) => `
    <button class="perfil ${administrando ? 'editable' : ''}" data-nav data-perfil="${esc(p.id)}" aria-label="${esc(administrando ? `Editar ${p.nombre}` : p.nombre)}">
      <span class="avatar">${avatar(p)}${administrando ? '<span class="lapiz" aria-hidden="true">✎</span>' : ''}</span>
      <span>${esc(p.nombre)}</span>
      ${p.ninos ? '<span class="nota-ninos">Infantil · solo ATP</span>' : ''}
    </button>`).join('');
  const agregar = perfiles.length < MAX_PERFILES
    ? '<button class="perfil" data-nav data-perfil="nuevo"><span class="avatar agregar" aria-hidden="true">＋</span><span>Agregar perfil</span></button>'
    : '';
  $('#vista-perfiles h1').textContent = administrando ? 'Administrar perfiles' : '¿Quién está mirando?';
  $('#perfiles-lista').innerHTML = tarjetas + agregar;
  $('#perfiles-administrar').textContent = administrando ? 'Listo' : 'Administrar perfiles';
  $('#perfiles-lista').querySelectorAll('[data-perfil]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.perfil;
    if (id === 'nuevo' || administrando) { mostrar('editar', id); return; }
    elegirPerfil(id);
    pila = [];
    mostrar('inicio');
  }));
  enfocar($('#perfiles-lista [data-perfil]'), { inicial: true });
}
$('#perfiles-administrar').addEventListener('click', () => {
  administrando = !administrando;
  pintarPerfiles();
  enfocar($('#perfiles-administrar'), { inicial: true });
});

// ---------- Crear o editar un perfil ----------
let borrador = null;
let confirmarBorrado = null;

function pintarEditar(id) {
  const existente = perfiles.find((p) => p.id === id);
  borrador = existente ? { ...existente } : { id: `p${Date.now().toString(36)}`, nombre: '', color: COLORES[perfiles.length % COLORES.length], estilo: ESTILOS[perfiles.length % ESTILOS.length] };
  const nuevo = !existente;
  $('#vista-editar').innerHTML = `
    <h1>${nuevo ? 'Nuevo perfil' : 'Editar perfil'}</h1>
    <div class="editar-cuerpo">
      <span class="avatar grande" id="editar-avatar">${avatar(borrador)}</span>
      <form class="editar-form" id="editar-form" novalidate>
        <label for="perfil-nombre">Nombre</label>
        <input id="perfil-nombre" data-nav maxlength="16" autocomplete="off" value="${esc(borrador.nombre)}" placeholder="Por ejemplo, Ana">
        <span class="editar-error" id="editar-error" role="alert"></span>
        <span class="editar-etiqueta">Color</span>
        <div class="opciones" id="editar-colores">${COLORES.map((c) => `<button type="button" data-nav data-color="${c}" class="muestra ${c === borrador.color ? 'elegida' : ''}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === borrador.color}"></button>`).join('')}</div>
        <span class="editar-etiqueta">Cara</span>
        <div class="opciones" id="editar-estilos">${ESTILOS.map((e) => `<button type="button" data-nav data-estilo="${e}" class="cara ${e === borrador.estilo ? 'elegida' : ''}" aria-label="Cara ${e}" aria-pressed="${e === borrador.estilo}">${avatar({ ...borrador, estilo: e })}</button>`).join('')}</div>
        <button type="button" data-nav class="interruptor" id="editar-ninos" aria-pressed="${Boolean(borrador.ninos)}">
          <span class="interruptor-caja" aria-hidden="true"></span>
          <span><b>Perfil infantil</b><small>Muestra solo películas aptas para todo público (ATP)</small></span>
        </button>
        <div class="acciones">
          <button type="submit" data-nav class="btn principal">Guardar</button>
          <button type="button" data-nav class="btn" id="editar-cancelar">Cancelar</button>
          ${nuevo || perfiles.length <= 1 ? '' : '<button type="button" data-nav class="btn peligro" id="editar-borrar">Eliminar perfil</button>'}
        </div>
      </form>
    </div>`;
  const actualizarVista = () => { $('#editar-avatar').innerHTML = avatar(borrador); };
  $('#perfil-nombre').addEventListener('input', (e) => { borrador.nombre = e.target.value; $('#editar-error').textContent = ''; });
  $('#editar-colores').addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]')?.dataset.color;
    if (!c) return;
    borrador.color = c;
    $('#editar-colores').querySelectorAll('[data-color]').forEach((b) => { b.classList.toggle('elegida', b.dataset.color === c); b.setAttribute('aria-pressed', String(b.dataset.color === c)); });
    $('#editar-estilos').querySelectorAll('[data-estilo]').forEach((b) => { b.innerHTML = avatar({ ...borrador, estilo: b.dataset.estilo }); });
    actualizarVista();
  });
  $('#editar-estilos').addEventListener('click', (e) => {
    const s = e.target.closest('[data-estilo]')?.dataset.estilo;
    if (!s) return;
    borrador.estilo = s;
    $('#editar-estilos').querySelectorAll('[data-estilo]').forEach((b) => { b.classList.toggle('elegida', b.dataset.estilo === s); b.setAttribute('aria-pressed', String(b.dataset.estilo === s)); });
    actualizarVista();
  });
  $('#editar-ninos').addEventListener('click', (e) => {
    borrador.ninos = !borrador.ninos;
    e.currentTarget.setAttribute('aria-pressed', String(borrador.ninos));
  });
  $('#editar-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = borrador.nombre.trim();
    if (!nombre) { $('#editar-error').textContent = 'Escribí un nombre para el perfil.'; enfocar($('#perfil-nombre')); return; }
    if (perfiles.some((p) => p.id !== borrador.id && p.nombre.toLowerCase() === nombre.toLowerCase())) {
      $('#editar-error').textContent = 'Ya hay un perfil con ese nombre.';
      enfocar($('#perfil-nombre'));
      return;
    }
    borrador.nombre = nombre;
    perfiles = nuevo ? [...perfiles, borrador] : perfiles.map((p) => (p.id === borrador.id ? borrador : p));
    guardarPerfiles();
    if (perfil?.id === borrador.id) elegirPerfil(borrador.id);
    volver();
  });
  $('#editar-cancelar').addEventListener('click', volver);
  // Eliminar se confirma con un segundo toque, sin ventanas del navegador
  $('#editar-borrar')?.addEventListener('click', (e) => {
    const boton = e.currentTarget;
    if (!confirmarBorrado) {
      boton.textContent = `¿Eliminar «${borrador.nombre}» y su historial? Tocá de nuevo`;
      confirmarBorrado = setTimeout(() => { confirmarBorrado = null; boton.textContent = 'Eliminar perfil'; }, 4000);
      return;
    }
    clearTimeout(confirmarBorrado);
    confirmarBorrado = null;
    perfiles = perfiles.filter((p) => p.id !== borrador.id);
    guardarPerfiles();
    try { localStorage.removeItem(`cinetream-${borrador.id}`); } catch { /* sin almacenamiento */ }
    if (perfil?.id === borrador.id) {
      // Se eliminó el perfil en uso: hay que elegir otro
      perfil = null;
      try { sessionStorage.removeItem('cinetream-perfil'); } catch { /* sin almacenamiento */ }
      pila = [];
      mostrar('perfiles');
      return;
    }
    volver();
  });
  enfocar($('#perfil-nombre'), { inicial: true });
}

// ---------- Inicio ----------
let rotacion = null;
let destacadaActual = 0;
let portadaActual = null;
let tvTocada = false; // en la tele, una vez que se navega, la portada sigue al foco y deja de rotar sola

function pintarInicio() {
  const lista = catalogo();
  const destacadas = lista.filter((p) => p.destacada);
  destacadaActual %= Math.max(1, destacadas.length);
  portadaActual = null;
  pintarPortada(destacadas[destacadaActual], destacadas);
  clearInterval(rotacion);
  // La portada rota sola, salvo mientras alguien tiene el foco en ella o ya navega con el control
  rotacion = setInterval(() => {
    if ($('#vista-inicio').hidden || tvTocada || document.activeElement?.closest('#portada')) return;
    destacadaActual = (destacadaActual + 1) % destacadas.length;
    pintarPortada(destacadas[destacadaActual], destacadas);
  }, 9000);

  const seguir = Object.entries(datos.progreso)
    .filter(([id]) => enCurso(id) && porId.has(id) && lista.includes(porId.get(id)))
    .sort((a, b) => b[1].fecha - a[1].fecha)
    .map(([id]) => porId.get(id));
  const miLista = datos.lista.map((id) => porId.get(id)).filter((p) => p && lista.includes(p));
  const top = IMPRESCINDIBLES.map((id) => porId.get(id)).filter((p) => p && lista.includes(p));
  // Lo último que subió el administrador
  const recientes = conServidor ? [...lista].filter((p) => p.alta).sort((a, b) => b.alta - a.alta).slice(0, 12) : [];
  $('#filas').innerHTML = [
    fila(`Seguir viendo como ${perfil.nombre}`, seguir.map(tarjetaSeguir).join(''), 'seguir', { clase: 'fila-ancha' }),
    filaDe('Mi lista', miLista, 'lista'),
    filaDe('Recién agregadas', recientes, 'recientes'),
    conPublicidad() ? publicidad.banner() : '',
    fila(`Las ${top.length} imprescindibles`, top.map((p, i) => tarjetaTop(p, i + 1)).join(''), 'top', { clase: 'fila-top', subtitulo: 'Selección de Cinetream' }),
    ...FILAS.map((f, i) => filaDe(f.titulo, lista.filter(f.filtro), `f${i}`)),
  ].join('');
  enfocar($('#portada [data-nav]'), { inicial: true });
}

// En la tele, la portada muestra la película que tiene el foco (como Google TV o Apple TV)
let esperaPortada = null;
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('#vista-inicio .tarjeta');
  if (!t || !modoTV()) return;
  tvTocada = true;
  clearTimeout(esperaPortada);
  esperaPortada = setTimeout(() => pintarPortada(porId.get(t.dataset.id)), 220);
});

function pintarPortada(p, destacadas = null) {
  const portada = $('#portada');
  if (!p) { portada.innerHTML = ''; return; }
  if (portadaActual === p.id) return;
  portadaActual = p.id;
  const prog = progresoDe(p.id);
  // El fondo nuevo entra encima del anterior con un fundido
  const fondo = document.createElement('div');
  fondo.className = 'portada-fondo';
  fondo.innerHTML = fondoApaisado(p);
  portada.querySelectorAll('.portada-fondo').forEach((viejo) => { viejo.classList.add('saliendo'); setTimeout(() => viejo.remove(), 700); });
  portada.prepend(fondo);
  requestAnimationFrame(() => fondo.classList.add('visible'));
  // El texto se reemplaza; si el foco estaba en sus botones, se conserva en el equivalente
  const focoEnPortada = document.activeElement?.closest('#portada')?.dataset?.boton;
  portada.querySelector('.portada-texto')?.remove();
  portada.querySelector('.puntos')?.remove();
  portada.insertAdjacentHTML('beforeend', `
    <div class="portada-texto">
      <span class="etiqueta">${esc(estudio(p))}${p.destacada ? ' · Destacada' : ''}</span>
      <h2>${esc(p.titulo)}</h2>
      ${datosDe(p)}
      <p>${esc(p.sinopsis)}</p>
      <div class="acciones">
        <button class="btn principal" data-nav data-boton="ver">▶ ${enCurso(p.id) ? `Seguir · ${quedanTexto(prog.quedan).toLowerCase()}` : 'Reproducir'}</button>
        <button class="btn" data-nav data-boton="info">ⓘ Más información</button>
      </div>
    </div>
    ${destacadas ? `<div class="puntos" aria-hidden="true">${destacadas.map((d) => `<i class="${d.id === p.id ? 'activo' : ''}"></i>`).join('')}</div>` : ''}`);
  portada.querySelector('[data-boton="ver"]').addEventListener('click', () => reproducir(p.id));
  portada.querySelector('[data-boton="info"]').addEventListener('click', () => mostrar('ficha', p.id));
  if (focoEnPortada) enfocar(portada.querySelector(`[data-boton="${focoEnPortada}"]`));
}

function datosDe(p) {
  return `<div class="datos"><span>${p.anio}</span><span>${duracion(p.duracionMin)}</span><span class="clasif">${esc(p.clasificacion)}</span><span>${esc(p.generos.slice(0, 3).join(' · '))}</span></div>`;
}

// ---------- Explorar por género ----------
function generos() {
  const cuenta = new Map();
  for (const p of catalogo()) for (const g of p.generos) cuenta.set(g, [...(cuenta.get(g) || []), p]);
  return [...cuenta.entries()].sort((a, b) => b[1].length - a[1].length);
}

function pintarExplorar() {
  // Cada género se ilustra con una película distinta, para que no se repitan las imágenes
  const usadas = new Set();
  const imagenDe = (lista) => {
    const p = lista.find((q) => !usadas.has(q.id)) || lista[0];
    usadas.add(p.id);
    return p;
  };
  $('#explorar-grilla').innerHTML = generos().map(([g, lista]) => `
    <button class="genero" data-nav data-genero="${esc(g)}" aria-label="${esc(`${g}, ${lista.length} películas`)}">
      ${miniatura({ ...imagenDe(lista), titulo: '' })}
      <span class="genero-nombre">${esc(g)}</span>
      <span class="genero-cuenta">${lista.length} ${lista.length === 1 ? 'película' : 'películas'}</span>
    </button>`).join('');
  $('#explorar-grilla').querySelectorAll('[data-genero]').forEach((b) => b.addEventListener('click', () => mostrar('genero', b.dataset.genero)));
  enfocar($('#explorar-grilla [data-nav]'), { inicial: true });
}

function pintarGenero(g) {
  const lista = catalogo().filter((p) => p.generos.includes(g));
  $('#genero-titulo').textContent = g;
  $('#genero-cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'película' : 'películas'}`;
  $('#genero-grilla').innerHTML = lista.map(tarjeta).join('');
  enfocar($('#genero-grilla [data-nav]'), { inicial: true });
}

// ---------- Ficha ----------
function pintarFicha(id) {
  const p = porId.get(id);
  if (!p) { volver(); return; }
  const prog = progresoDe(id);
  const enLista = datos.lista.includes(id);
  const parecidas = catalogo().filter((q) => q.id !== id && q.generos.some((g) => p.generos.includes(g))).slice(0, 10);
  $('#vista-ficha').innerHTML = `
    <div class="ficha-fondo">${fondoApaisado(p)}</div>
    <div class="ficha-cuerpo">
      <span class="etiqueta">${esc(estudio(p))}</span>
      <h1>${esc(p.titulo)}</h1>
      ${datosDe(p)}
      ${enCurso(id) ? `<div class="barra-reanudar"><span class="progreso"><i style="width:${prog.pct}%"></i></span><span>${quedanTexto(prog.quedan)} · viste ${formatoMin(prog.t)}</span></div>` : ''}
      <div class="acciones">
        ${bloqueada(p)
    ? '<button class="btn principal" data-nav data-accion="plus">★ Ver con Plus</button>'
    : `<button class="btn principal" data-nav data-accion="ver">▶ ${enCurso(id) ? 'Seguir viendo' : 'Reproducir'}</button>
        ${enCurso(id) ? '<button class="btn" data-nav data-accion="desde-cero">↺ Desde el principio</button>' : ''}`}
        <button class="btn" data-nav data-accion="lista" aria-pressed="${enLista}">${enLista ? '✓ En mi lista' : '＋ Mi lista'}</button>
      </div>
      ${bloqueada(p) ? '<p class="aviso-plus">Este título es parte de <b>Cinetream Plus</b>: sin publicidad y con títulos exclusivos.</p>' : ''}
      <p class="sinopsis">${esc(p.sinopsis)}</p>
      <dl>
        ${[['Dirección', p.direccion], ['Origen', p.origen], ['Géneros', p.generos.join(', ')], ['Licencia', p.licencia]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}
        ${p.video || bloqueada(p) ? '' : '<dt>Archivo</dt><dd>Próximamente. Mientras tanto se reproduce una señal de prueba.</dd>'}
      </dl>
    </div>
    ${filaDe('Más como esta', parecidas, 'parecidas')}`;
  const accion = (a) => $(`#vista-ficha [data-accion="${a}"]`);
  accion('ver')?.addEventListener('click', () => reproducir(id));
  accion('desde-cero')?.addEventListener('click', () => reproducir(id, 0));
  accion('plus')?.addEventListener('click', () => mostrar('planes'));
  accion('lista').addEventListener('click', () => {
    datos.lista = datos.lista.includes(id) ? datos.lista.filter((x) => x !== id) : [id, ...datos.lista];
    guardarDatos();
    const b = accion('lista');
    const ahora = datos.lista.includes(id);
    b.textContent = ahora ? '✓ En mi lista' : '＋ Mi lista';
    b.setAttribute('aria-pressed', String(ahora));
    avisar(ahora ? `«${p.titulo}» se agregó a Mi lista` : `«${p.titulo}» se quitó de Mi lista`);
  });
  enfocar(accion('ver') || accion('plus'), { inicial: true });
}

// Aviso breve abajo de la pantalla
let esperaAviso = null;
function avisar(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.hidden = false;
  a.classList.remove('visible');
  void a.offsetWidth;
  a.classList.add('visible');
  clearTimeout(esperaAviso);
  esperaAviso = setTimeout(() => { a.classList.remove('visible'); }, 2600);
}

// ---------- Buscar ----------
const TECLAS_TV = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ1234567890'.split('');
const SUGERENCIAS = ['Animación', 'Ciencia ficción', 'Terror', 'Blender', 'Méliès', 'Familia'];

function pintarBuscar() {
  const entrada = $('#buscar-texto');
  const teclado = $('#teclado');
  // En la tele, teclado en pantalla para escribir con el control; en el celular, el teclado del sistema
  teclado.hidden = !modoTV();
  if (!teclado.hidden && !teclado.children.length) {
    teclado.innerHTML = TECLAS_TV.map((t) => `<button data-nav data-tecla="${t}">${t}</button>`).join('')
      + '<button data-nav data-tecla=" " class="ancha">Espacio</button><button data-nav data-tecla="borrar" class="ancha">⌫ Borrar</button><button data-nav data-tecla="limpiar" class="ancha">Limpiar</button>';
    teclado.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tecla]')?.dataset.tecla;
      if (!t) return;
      if (t === 'borrar') entrada.value = entrada.value.slice(0, -1);
      else if (t === 'limpiar') entrada.value = '';
      else entrada.value += t.toLowerCase();
      buscar();
    });
  }
  $('#sugerencias').innerHTML = SUGERENCIAS.map((s) => `<button data-nav data-sugerencia="${esc(s)}">${esc(s)}</button>`).join('');
  buscar();
  if (modoTV()) enfocar(teclado.querySelector('[data-tecla]'), { inicial: true });
  else entrada.focus();
}
$('#sugerencias').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sugerencia]')?.dataset.sugerencia;
  if (!s) return;
  $('#buscar-texto').value = s;
  buscar();
});

function buscar() {
  const crudo = $('#buscar-texto').value.trim();
  const texto = sinTildes(crudo);
  const lista = catalogo();
  const resultados = texto
    ? lista.filter((p) => sinTildes(`${p.titulo} ${p.direccion} ${p.generos.join(' ')} ${p.anio} ${p.origen} ${p.licencia}`).includes(texto))
    : lista;
  $('#sugerencias').hidden = Boolean(texto);
  $('#buscar-estado').textContent = texto
    ? (resultados.length ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} para «${crudo}»` : `No encontramos nada para «${crudo}». Probá con otro título, un director o un género.`)
    : 'Todo el catálogo';
  $('#buscar-resultados').innerHTML = resultados.map(tarjeta).join('');
}
$('#buscar-texto').addEventListener('input', buscar);

// ---------- Mi lista ----------
function pintarLista() {
  const lista = datos.lista.map((id) => porId.get(id)).filter((p) => p && catalogo().includes(p));
  $('#lista-grilla').innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<div class="vacio"><b>Tu lista está vacía</b><p>En la ficha de cualquier película elegí «＋ Mi lista» para guardarla y verla después.</p></div>';
  enfocar($('#lista-grilla [data-nav]') || $('[data-ir="lista"]'), { inicial: true });
}

// ---------- Ajustes ----------
let confirmarHistorial = null;

function pintarAjustes() {
  $('#ajustes-perfil').innerHTML = `<span class="avatar">${avatar(perfil)}</span><span><b>${esc(perfil.nombre)}</b><small>${perfil.ninos ? 'Perfil infantil · solo ATP' : 'Perfil'}</small></span>`;
  const interruptor = (id, activo) => { const b = $(id); b.setAttribute('aria-pressed', String(activo)); };
  interruptor('#ajuste-siguiente', ajustes.autoSiguiente);
  interruptor('#ajuste-animaciones', ajustes.animaciones);
  $('#ajuste-historial').textContent = 'Borrar el historial de este perfil';
  $('#ajustes-admin').hidden = !conServidor || enApp;
  $('#ajustes-app').hidden = !enApp;
  if (enApp) pintarConexion($('#ajustes-app'), { enfocar });
  $('#ajustes-descargar').hidden = enApp || !conServidor;
  const c = cuenta();
  $('#ajustes-cuenta').hidden = !c;
  if (c) {
    const fecha = c.vence ? new Date(c.vence).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    $('#cuenta-resumen').innerHTML = `<b>${esc(c.planNombre)}</b>${c.plus ? '<span class="sello-plus en-linea">Plus</span>' : ''}<small>${esc(c.email)}${c.demo ? ' · demostración' : ''}</small>
      <small>${c.vence ? (c.estado === 'cancelada' ? `No se renueva. Tenés ${esc(c.planNombre)} hasta el ${fecha}.` : `Se renueva el ${fecha}.`) : 'Con publicidad. Pasate a Plus para ver sin cortes.'}</small>`;
    $('#cuenta-cancelar').hidden = !(c.plus && c.estado === 'activa');
    $('#cuenta-cancelar').textContent = 'Cancelar la renovación';
    $('#cuenta-planes').textContent = c.plus ? 'Cambiar de plan' : '★ Pasate a Plus';
  }
  enfocar($('#ajustes-cambiar'), { inicial: true });
}
$('#cuenta-planes').addEventListener('click', () => mostrar('planes'));
$('#cuenta-salir').addEventListener('click', () => cuentas.salir());
let confirmarCancelar = null;
$('#cuenta-cancelar').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!confirmarCancelar) {
    b.textContent = '¿Cancelar la renovación? Tocá de nuevo';
    confirmarCancelar = setTimeout(() => { confirmarCancelar = null; b.textContent = 'Cancelar la renovación'; }, 4000);
    return;
  }
  clearTimeout(confirmarCancelar);
  confirmarCancelar = null;
  try { await cuentas.cancelar(); } catch (err) { avisar(err.message); }
});
$('#ajustes-cambiar').addEventListener('click', () => { administrando = false; mostrar('perfiles'); });
$('#ajustes-editar').addEventListener('click', () => mostrar('editar', perfil.id));
$('#ajuste-siguiente').addEventListener('click', () => {
  ajustes.autoSiguiente = !ajustes.autoSiguiente;
  guardar('cinetream-ajustes', ajustes);
  pintarAjustes();
  enfocar($('#ajuste-siguiente'), { inicial: true });
});
$('#ajuste-animaciones').addEventListener('click', () => {
  ajustes.animaciones = !ajustes.animaciones;
  guardar('cinetream-ajustes', ajustes);
  document.body.classList.toggle('sin-animaciones', !ajustes.animaciones);
  pintarAjustes();
  enfocar($('#ajuste-animaciones'), { inicial: true });
});
$('#ajuste-historial').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!confirmarHistorial) {
    b.textContent = '¿Borrar «Seguir viendo» de este perfil? Tocá de nuevo';
    confirmarHistorial = setTimeout(() => { confirmarHistorial = null; b.textContent = 'Borrar el historial de este perfil'; }, 4000);
    return;
  }
  clearTimeout(confirmarHistorial);
  confirmarHistorial = null;
  datos.progreso = {};
  guardarDatos();
  b.textContent = 'Borrar el historial de este perfil';
  avisar('Se borró el historial de este perfil');
});

// ---------- Reproducir ----------
// La siguiente: una película parecida que todavía no se vio entera, mejor si ya tiene su archivo
function siguienteDe(p) {
  const candidatas = catalogo().filter((q) => q.id !== p.id && !(progresoDe(q.id)?.pct >= 95));
  const puntaje = (q) => q.generos.filter((g) => p.generos.includes(g)).length * 2 + (q.video ? 1 : 0);
  return candidatas.sort((a, b) => puntaje(b) - puntaje(a))[0] || null;
}

let quitarEntradaHistorial = () => {};
async function reproducir(id, desde) {
  const p = porId.get(id);
  if (bloqueada(p)) { mostrar('planes'); avisar(`«${p.titulo}» es parte de Cinetream Plus`); return; }
  const prog = progresoDe(id);
  const inicio = desde ?? (enCurso(id) ? prog.t : 0);
  const contenedor = $('#vista-reproductor');
  const anterior = document.activeElement;
  contenedor.hidden = false;
  document.body.style.overflow = 'hidden';
  try { history.pushState({ cinetream: 'reproductor' }, ''); } catch { /* sin historial */ }

  // Plan Gratis: un anuncio antes de la película (como mucho uno cada 15 minutos)
  if (conPublicidad() && Date.now() - ultimoPrevio > 15 * 60000) {
    let porAtras = false;
    const atrasEnAnuncio = () => { porAtras = true; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
    window.addEventListener('popstate', atrasEnAnuncio);
    const resultado = await publicidad.previo(contenedor);
    window.removeEventListener('popstate', atrasEnAnuncio);
    if (resultado !== 'sin-anuncio') ultimoPrevio = Date.now();
    if (resultado === 'cancelado') {
      contenedor.hidden = true;
      document.body.style.overflow = '';
      if (!porAtras) { ignorarAtras++; try { history.back(); } catch { ignorarAtras--; } }
      if (anterior?.isConnected) enfocar(anterior, { inicial: true });
      return;
    }
  }
  let siguientePedida = null;
  // Cuenta la reproducción para las estadísticas del administrador
  if (conServidor) fetch('/api/vista', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }), keepalive: true }).catch(() => {});
  const rep = abrirReproductor(contenedor, p, {
    desde: inicio,
    siguiente: siguienteDe(p),
    autoSiguiente: ajustes.autoSiguiente,
    alSiguiente(q) { siguientePedida = q; },
    alGuardar(t, d) {
      if (!d) return;
      datos.progreso[id] = { t, d, fecha: Date.now() };
      guardarDatos();
    },
    alSalir() {
      contenedor.hidden = true;
      document.body.style.overflow = '';
      window.removeEventListener('popstate', alAtras);
      quitarEntradaHistorial();
      const actual = pila.at(-1);
      mostrar(actual.nombre, actual.parametro, { apilar: false });
      if (anterior?.isConnected) enfocar(anterior, { inicial: true });
      // "A continuación": se abre la siguiente apenas se cerró esta
      setTimeout(() => { if (siguientePedida) reproducir(siguientePedida.id, 0); }, 0);
    },
  });
  // El "atrás" del celular cierra el reproductor
  let cerradoConAtras = false;
  const alAtras = () => { cerradoConAtras = true; rep.salir(); };
  window.addEventListener('popstate', alAtras);
  quitarEntradaHistorial = () => {
    // Si se cerró con el botón Volver o el control, se descarta la entrada que se agregó al abrir
    if (!cerradoConAtras) { ignorarAtras++; try { history.back(); } catch { ignorarAtras--; } }
  };
}

// ---------- Control remoto y teclado ----------
document.addEventListener('keydown', (e) => {
  if (!$('#vista-reproductor').hidden) return;
  if (!$('#intro').hidden) { cerrarIntro(); e.preventDefault(); return; }
  const accion = accionDeTecla(e);
  if (!accion) return;
  const enTexto = e.target.matches?.('input');
  if (enTexto && ['izquierda', 'derecha', 'playPausa'].includes(accion)) return; // se está escribiendo
  if (enTexto && e.key === 'Backspace') return;
  if (accion === 'volver') { e.preventDefault(); volver(); return; }
  if (['arriba', 'abajo', 'izquierda', 'derecha'].includes(accion)) {
    e.preventDefault();
    moverFoco(accion);
    return;
  }
  if (accion === 'ok' && !e.target.matches?.('button, a, input')) {
    e.preventDefault();
    document.activeElement?.click();
  }
});

// En la tele, si nada tiene el foco, se pone en algo útil
document.addEventListener('focusout', () => setTimeout(() => {
  if (document.activeElement === document.body) {
    const vista = VISTAS.map((v) => $(`#vista-${v}`)).find((v) => !v.hidden);
    if (vista && modoTV()) enfocar(navegables(vista)[0], { inicial: true });
  }
}, 0));

// ---------- Apertura ----------
function cerrarIntro() {
  const intro = $('#intro');
  if (intro.hidden) return;
  intro.classList.add('saliendo');
  setTimeout(() => { intro.hidden = true; }, 450);
}
let vioIntro = false;
try { vioIntro = sessionStorage.getItem('cinetream-intro') === '1'; sessionStorage.setItem('cinetream-intro', '1'); } catch { /* sin almacenamiento */ }
if (vioIntro || !ajustes.animaciones || matchMedia('(prefers-reduced-motion: reduce)').matches) {
  $('#intro').hidden = true;
} else {
  $('#intro').addEventListener('pointerdown', cerrarIntro);
  setTimeout(cerrarIntro, 1900);
}

// ---------- Arranque ----------
let guardado = null;
try { guardado = sessionStorage.getItem('cinetream-perfil'); } catch { /* sin almacenamiento */ }
$('#insignia-plus').hidden = !cuenta()?.plus;
if (!cuenta()) {
  mostrar('bienvenida'); // sin cuenta: bienvenida con los planes
} else if (guardado && perfiles.some((p) => p.id === guardado)) {
  elegirPerfil(guardado);
  mostrar('inicio');
} else {
  mostrar('perfiles');
}
// Avisos pendientes: el resultado de un pago o de un cambio de plan
let avisoPendiente = mensajePago;
try { avisoPendiente ||= sessionStorage.getItem('cinetream-aviso'); sessionStorage.removeItem('cinetream-aviso'); } catch { /* sin almacenamiento */ }
if (avisoPendiente) setTimeout(() => avisar(avisoPendiente), 1200);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
