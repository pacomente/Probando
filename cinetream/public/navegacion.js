// Navegación con control remoto o teclado (televisores, TV boxes y computadoras).
// Las flechas mueven el foco al elemento más cercano en esa dirección; OK/Enter lo activa; Volver regresa.
// Los elementos navegables llevan el atributo data-nav. Una fila recuerda la última tarjeta enfocada.

// Teclas de los controles remotos más comunes
const TECLAS = {
  arriba: ['ArrowUp', 38], abajo: ['ArrowDown', 40], izquierda: ['ArrowLeft', 37], derecha: ['ArrowRight', 39],
  ok: ['Enter', 13],
  // Escape, Backspace, Samsung Tizen (10009), LG webOS (461), navegadores
  volver: ['Escape', 'GoBack', 'BrowserBack', 'Backspace', 27, 10009, 461, 8],
  playPausa: ['MediaPlayPause', ' ', 179, 415, 19, 10252],
  adelantar: ['MediaFastForward', 417, 228],
  retroceder: ['MediaRewind', 412, 227],
  detener: ['MediaStop', 413, 178],
};

export function accionDeTecla(e) {
  for (const [accion, lista] of Object.entries(TECLAS)) {
    if (lista.includes(e.key) || lista.includes(e.keyCode)) return accion;
  }
  return null;
}

const visible = (el) => {
  if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function navegables(raiz = document) {
  return [...raiz.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && visible(el) && !el.closest('[hidden], [inert]'));
}

// Elige el elemento siguiente en una dirección: el más cercano, castigando el desvío lateral
export function moverFoco(direccion, raiz = document) {
  const actual = document.activeElement?.matches?.('[data-nav]') ? document.activeElement : null;
  const lista = navegables(raiz);
  if (!lista.length) return false;
  if (!actual || !lista.includes(actual)) { enfocar(lista[0]); return true; }

  // Dentro de la misma fila, izquierda y derecha van a la tarjeta vecina
  const fila = actual.closest('[data-fila]');
  if (fila && (direccion === 'izquierda' || direccion === 'derecha')) {
    const tarjetas = navegables(fila);
    const i = tarjetas.indexOf(actual) + (direccion === 'derecha' ? 1 : -1);
    if (tarjetas[i]) { enfocar(tarjetas[i]); return true; }
    if (direccion === 'derecha') return true; // fin de la fila: no saltar a otra parte
  }

  const a = actual.getBoundingClientRect();
  const ca = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let mejor = null;
  for (const el of lista) {
    if (el === actual) continue;
    const r = el.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    let principal;
    let lateral;
    if (direccion === 'derecha') { if (r.left < a.right - 4) continue; principal = r.left - a.right; lateral = c.y - ca.y; }
    if (direccion === 'izquierda') { if (r.right > a.left + 4) continue; principal = a.left - r.right; lateral = c.y - ca.y; }
    if (direccion === 'abajo') { if (r.top < a.bottom - 4) continue; principal = r.top - a.bottom; lateral = c.x - ca.x; }
    if (direccion === 'arriba') { if (r.bottom > a.top + 4) continue; principal = a.top - r.bottom; lateral = c.x - ca.x; }
    const puntaje = Math.max(0, principal) + Math.abs(lateral) * 2.5;
    if (!mejor || puntaje < mejor.puntaje) mejor = { el, puntaje };
  }
  if (!mejor) return false;

  // Al entrar a una fila, se vuelve a la tarjeta que tenía el foco la última vez
  const filaDestino = mejor.el.closest('[data-fila]');
  if (filaDestino && filaDestino !== fila && filaDestino.dataset.ultima) {
    const recordada = filaDestino.querySelector(`[data-id="${CSS.escape(filaDestino.dataset.ultima)}"]`);
    if (recordada && visible(recordada)) { enfocar(recordada); return true; }
  }
  enfocar(mejor.el);
  return true;
}

// Se recuerda si la última interacción fue con el dedo o el mouse: entonces no se pone el foco solo
// al abrir una pantalla (el borde de foco es para quien usa control remoto o teclado)
let ultimaConPuntero = false;
addEventListener('pointerdown', () => { ultimaConPuntero = true; }, true);
addEventListener('keydown', () => { ultimaConPuntero = false; }, true);

// inicial: foco que se pone al abrir una pantalla, solo si se está usando control o teclado
export function enfocar(el, { inicial = false } = {}) {
  if (!el) return;
  if (inicial && ultimaConPuntero) return;
  el.focus({ preventScroll: true });
  const fila = el.closest('[data-fila]');
  if (fila && el.dataset.id) fila.dataset.ultima = el.dataset.id;
  // Las filas se desplazan para que la tarjeta quede a la vista, y la página para que la fila entre entera
  const carril = el.closest('.carril');
  if (carril) {
    const r = el.getBoundingClientRect();
    const c = carril.getBoundingClientRect();
    if (r.left < c.left + 40 || r.right > c.right - 40) carril.scrollBy({ left: r.left - c.left - 48, behavior: suave() });
  }
  (fila || el).scrollIntoView({ block: 'nearest', behavior: suave() });
}

const suave = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
