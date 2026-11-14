// Cinetream: pantallas, perfiles, "Seguir viendo", Mi lista y búsqueda.
// Funciona igual con control remoto (tele), teclado, mouse o el dedo (celular).
import { FILAS, PELICULAS } from './catalogo.js';
import { afiche, fondoApaisado } from './carteles.js';
import { accionDeTecla, enfocar, moverFoco, navegables } from './navegacion.js';
import { abrirReproductor } from './reproductor.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const porId = new Map(PELICULAS.map((p) => [p.id, p]));
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Datos guardados en este dispositivo ----------
function leer(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: se usa en memoria */ }
}

const PERFILES = [
  { id: 'familia', nombre: 'Familia', color: '#ffb547' },
  { id: 'invitado', nombre: 'Invitado', color: '#7fc8f8' },
  { id: 'ninos', nombre: 'Niños', color: '#9be07a', ninos: true },
];
let perfil = null;
let datos = { lista: [], progreso: {} };

function elegirPerfil(id) {
  perfil = PERFILES.find((p) => p.id === id) || PERFILES[0];
  datos = leer(`cinetream-${perfil.id}`, { lista: [], progreso: {} });
  try { sessionStorage.setItem('cinetream-perfil', perfil.id); } catch { /* sin almacenamiento */ }
  for (const el of [$('#avatar-actual'), $('#avatar-movil')]) {
    el.textContent = perfil.nombre[0];
    el.style.background = perfil.color;
  }
}
const guardarDatos = () => guardar(`cinetream-${perfil.id}`, datos);

// El perfil Niños solo ve películas aptas para todo público
const catalogo = () => PELICULAS.filter((p) => !perfil?.ninos || p.clasificacion === 'ATP');

function progresoDe(id) {
  const p = datos.progreso[id];
  if (!p || !p.d) return null;
  return { ...p, pct: Math.min(100, (p.t / p.d) * 100) };
}
const enCurso = (id) => { const p = progresoDe(id); return p && p.pct > 2 && p.pct < 95; };

// ---------- Navegación entre pantallas ----------
const VISTAS = ['perfiles', 'inicio', 'ficha', 'buscar', 'lista'];
let pila = [];

function mostrar(nombre, parametro, { apilar = true } = {}) {
  if (apilar) {
    pila.push({ nombre, parametro });
    try { history.pushState({ cinetream: pila.length }, ''); } catch { /* algunos visores no lo permiten */ }
  }
  for (const v of VISTAS) $(`#vista-${v}`).hidden = v !== nombre;
  $('#barra').hidden = nombre === 'perfiles';
  document.querySelector('.pestanas-movil').hidden = nombre === 'perfiles';
  document.querySelectorAll('[data-ir]').forEach((b) => b.classList.toggle('activo', b.dataset.ir === nombre));
  window.scrollTo(0, 0);
  ({ perfiles: pintarPerfiles, inicio: pintarInicio, ficha: pintarFicha, buscar: pintarBuscar, lista: pintarLista })[nombre](parametro);
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
  return `<button class="tarjeta" data-nav data-id="${esc(p.id)}" aria-label="${esc(`${p.titulo}, ${p.anio}`)}">
    ${afiche(p)}
    ${p.video ? '' : '<span class="sello">PRÓXIMAMENTE</span>'}
    ${prog && prog.pct > 2 && prog.pct < 95 ? `<span class="progreso"><i style="width:${prog.pct}%"></i></span>` : ''}
  </button>`;
}

function fila(titulo, lista, clave) {
  if (!lista.length) return '';
  return `<section class="fila" data-fila="${esc(clave)}"><h3>${esc(titulo)}</h3><div class="carril">${lista.map(tarjeta).join('')}</div></section>`;
}

// Un toque, clic u OK en una tarjeta abre su ficha
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tarjeta');
  if (t) mostrar('ficha', t.dataset.id);
});

// ---------- Perfiles ----------
function pintarPerfiles() {
  $('#perfiles-lista').innerHTML = PERFILES.map((p) => `
    <button class="perfil" data-nav data-perfil="${p.id}">
      <span class="avatar" style="background:${p.color}">${esc(p.nombre[0])}</span>
      <span>${esc(p.nombre)}</span>
      ${p.ninos ? '<span class="nota-ninos">Solo películas ATP</span>' : ''}
    </button>`).join('');
  $('#perfiles-lista').querySelectorAll('[data-perfil]').forEach((b) => b.addEventListener('click', () => {
    elegirPerfil(b.dataset.perfil);
    pila = [];
    mostrar('inicio');
  }));
  enfocar($('#perfiles-lista [data-perfil]'), { inicial: true });
}

// ---------- Inicio ----------
let rotacion = null;
let destacadaActual = 0;

function pintarInicio() {
  const lista = catalogo();
  const destacadas = lista.filter((p) => p.destacada);
  destacadaActual = destacadaActual % Math.max(1, destacadas.length);
  pintarPortada(destacadas);
  clearInterval(rotacion);
  // La portada rota sola, salvo mientras alguien tiene el foco en ella
  rotacion = setInterval(() => {
    if ($('#vista-inicio').hidden) return;
    if (document.activeElement?.closest('#portada')) return;
    destacadaActual = (destacadaActual + 1) % destacadas.length;
    pintarPortada(destacadas);
  }, 9000);

  const seguir = Object.entries(datos.progreso)
    .filter(([id]) => enCurso(id) && porId.has(id) && lista.includes(porId.get(id)))
    .sort((a, b) => b[1].fecha - a[1].fecha)
    .map(([id]) => porId.get(id));
  const miLista = datos.lista.map((id) => porId.get(id)).filter((p) => p && lista.includes(p));
  $('#filas').innerHTML = [
    fila(`Seguir viendo como ${perfil.nombre}`, seguir, 'seguir'),
    fila('Mi lista', miLista, 'lista'),
    ...FILAS.map((f, i) => fila(f.titulo, lista.filter(f.filtro), `f${i}`)),
  ].join('');
  enfocar($('#portada [data-nav]'), { inicial: true });
}

function pintarPortada(destacadas) {
  const p = destacadas[destacadaActual];
  if (!p) { $('#portada').innerHTML = ''; return; }
  const prog = progresoDe(p.id);
  $('#portada').innerHTML = `
    <div class="portada-fondo">${fondoApaisado(p)}</div>
    <div class="portada-texto">
      <span class="etiqueta">Destacada en Cinetream</span>
      <h2>${esc(p.titulo)}</h2>
      ${datosDe(p)}
      <p>${esc(p.sinopsis)}</p>
      <div class="acciones">
        <button class="btn principal" data-nav data-ver="${esc(p.id)}">▶ ${enCurso(p.id) ? `Seguir desde ${formatoMin(prog.t)}` : 'Reproducir'}</button>
        <button class="btn" data-nav data-info="${esc(p.id)}">ⓘ Más información</button>
      </div>
    </div>
    <div class="puntos" aria-hidden="true">${destacadas.map((_, i) => `<i class="${i === destacadaActual ? 'activo' : ''}"></i>`).join('')}</div>`;
  $('#portada [data-ver]').addEventListener('click', () => reproducir(p.id));
  $('#portada [data-info]').addEventListener('click', () => mostrar('ficha', p.id));
}

function datosDe(p) {
  return `<div class="datos"><span>${p.anio}</span><span>${p.duracionMin} min</span><span class="clasif">${esc(p.clasificacion)}</span><span>${esc(p.generos.slice(0, 3).join(' · '))}</span></div>`;
}
const formatoMin = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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
      <h1>${esc(p.titulo)}</h1>
      ${datosDe(p)}
      ${enCurso(id) ? `<div class="barra-reanudar"><span>Viste ${formatoMin(prog.t)} de ${formatoMin(prog.d)}</span><span class="progreso"><i style="width:${prog.pct}%"></i></span></div>` : ''}
      <div class="acciones">
        <button class="btn principal" data-nav data-accion="ver">▶ ${enCurso(id) ? 'Seguir viendo' : 'Reproducir'}</button>
        ${enCurso(id) ? '<button class="btn" data-nav data-accion="desde-cero">↺ Desde el principio</button>' : ''}
        <button class="btn" data-nav data-accion="lista">${enLista ? '✓ En mi lista' : '＋ Mi lista'}</button>
      </div>
      <p class="sinopsis">${esc(p.sinopsis)}</p>
      <dl>
        <dt>Dirección</dt><dd>${esc(p.direccion)}</dd>
        <dt>Origen</dt><dd>${esc(p.origen)}</dd>
        <dt>Géneros</dt><dd>${esc(p.generos.join(', '))}</dd>
        <dt>Licencia</dt><dd>${esc(p.licencia)}</dd>
        ${p.video ? '' : '<dt>Archivo</dt><dd>Próximamente. Mientras tanto se reproduce una señal de prueba.</dd>'}
      </dl>
    </div>
    ${fila('Más como esta', parecidas, 'parecidas')}`;
  const accion = (a) => $(`#vista-ficha [data-accion="${a}"]`);
  accion('ver').addEventListener('click', () => reproducir(id));
  accion('desde-cero')?.addEventListener('click', () => reproducir(id, 0));
  accion('lista').addEventListener('click', () => {
    datos.lista = datos.lista.includes(id) ? datos.lista.filter((x) => x !== id) : [id, ...datos.lista];
    guardarDatos();
    pintarFicha(id);
    enfocar(accion('lista'), { inicial: true });
  });
  enfocar(accion('ver'), { inicial: true });
}

// ---------- Buscar ----------
const TECLAS_TV = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ1234567890'.split('');
const modoTV = () => !matchMedia('(pointer: coarse)').matches && innerWidth >= 1000;

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
  buscar();
  if (modoTV()) enfocar(teclado.querySelector('[data-tecla]'), { inicial: true });
  else entrada.focus();
}

function buscar() {
  const texto = sinTildes($('#buscar-texto').value.trim());
  const lista = catalogo();
  const resultados = texto
    ? lista.filter((p) => sinTildes(`${p.titulo} ${p.direccion} ${p.generos.join(' ')} ${p.anio} ${p.origen}`).includes(texto))
    : lista;
  $('#buscar-estado').textContent = texto
    ? (resultados.length ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} para «${$('#buscar-texto').value.trim()}»` : `No encontramos nada para «${$('#buscar-texto').value.trim()}». Probá con otro título, un director o un género.`)
    : 'Todo el catálogo';
  $('#buscar-resultados').innerHTML = resultados.map(tarjeta).join('');
}
$('#buscar-texto').addEventListener('input', buscar);

// ---------- Mi lista ----------
function pintarLista() {
  const lista = datos.lista.map((id) => porId.get(id)).filter((p) => p && catalogo().includes(p));
  $('#lista-grilla').innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<p class="vacio">Todavía no agregaste películas. En la ficha de cualquier película elegí «＋ Mi lista» y aparece acá.</p>';
  enfocar($('#lista-grilla [data-nav]') || $('[data-ir="lista"]'), { inicial: true });
}

// ---------- Reproducir ----------
let quitarEntradaHistorial = () => {};
function reproducir(id, desde) {
  const p = porId.get(id);
  const prog = progresoDe(id);
  const inicio = desde ?? (enCurso(id) ? prog.t : 0);
  const contenedor = $('#vista-reproductor');
  const anterior = document.activeElement;
  contenedor.hidden = false;
  document.body.style.overflow = 'hidden';
  try { history.pushState({ cinetream: 'reproductor' }, ''); } catch { /* sin historial */ }
  const rep = abrirReproductor(contenedor, p, {
    desde: inicio,
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

// En la tele, si nada tiene el foco, la primera flecha lo pone en algo útil
document.addEventListener('focusout', () => setTimeout(() => {
  if (document.activeElement === document.body) {
    const vista = VISTAS.map((v) => $(`#vista-${v}`)).find((v) => !v.hidden);
    if (vista && modoTV()) enfocar(navegables(vista)[0], { inicial: true });
  }
}, 0));

// ---------- Arranque ----------
let guardado = null;
try { guardado = sessionStorage.getItem('cinetream-perfil'); } catch { /* sin almacenamiento */ }
if (guardado) {
  elegirPerfil(guardado);
  mostrar('inicio');
} else {
  mostrar('perfiles');
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
