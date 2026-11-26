// Publicidad para el plan Gratis: anuncio antes de la película (con "Saltar") y banner en el inicio.
// Nunca se muestra en perfiles infantiles ni a suscriptores Plus (eso lo decide app.js y el servidor).
import { accionDeTecla, enfocar } from './navegacion.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Campañas propias de la demostración: promocionan Plus, sin anunciantes inventados
const DEMO = [
  { id: 'demo-previo', anunciante: 'Cinetream', tipo: 'previo', titulo: 'Mirá sin cortes con Cinetream Plus', texto: 'Sin publicidad y con los títulos Plus. Cambiá de plan desde Perfil y ajustes.', colores: ['#1d1203', '#ffb547'], duracion: 6, saltarTras: 3, peso: 1 },
  { id: 'demo-banner', anunciante: 'Cinetream', tipo: 'banner', titulo: 'Cinetream Plus', texto: 'Todo el catálogo sin publicidad y con estrenos Plus.', colores: ['#20160a', '#ffb547'], peso: 1 },
];

export function crearPublicidad({ conServidor }) {
  let campanas = [];

  async function cargar(conAnuncios) {
    campanas = [];
    if (!conAnuncios) return;
    if (!conServidor) { campanas = DEMO; return; }
    try { campanas = (await (await fetch('api/anuncios', { cache: 'no-store' })).json()).campanas || []; } catch { campanas = []; }
  }

  function evento(c, tipo) {
    if (!conServidor || !c) return;
    fetch('api/anuncios/evento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, tipo }), keepalive: true }).catch(() => {});
  }

  // Elige una campaña al azar según su peso
  function elegir(tipo) {
    const lista = campanas.filter((c) => c.tipo === tipo);
    let azar = Math.random() * lista.reduce((t, c) => t + (c.peso || 1), 0);
    return lista.find((c) => (azar -= c.peso || 1) < 0) || null;
  }

  // La pieza: imagen o video subidos por el administrador, o un aviso de texto con los colores de la campaña
  function pieza(c, { video = false } = {}) {
    if (c.pieza && c.piezaTipo === 'imagen') return `<img class="anuncio-medio" src="${esc(c.pieza)}" alt="${esc(c.titulo || 'Publicidad')}">`;
    if (c.pieza && c.piezaTipo === 'video' && video) return `<video class="anuncio-medio" src="${esc(c.pieza)}" playsinline autoplay></video>`;
    return `<div class="anuncio-texto" style="--a1:${esc(c.colores?.[0] || '#1d1203')};--a2:${esc(c.colores?.[1] || '#ffb547')}">
      <span class="anuncio-marca">${esc(c.anunciante)}</span><b>${esc(c.titulo)}</b><span>${esc(c.texto)}</span></div>`;
  }

  // Banner del inicio
  function banner() {
    const c = elegir('banner');
    if (!c) return '';
    setTimeout(() => evento(c, 'impresion'), 0);
    const contenido = `<span class="anuncio-etiqueta">Publicidad</span>${pieza(c)}${c.enlace ? '<span class="anuncio-mas">Más información ›</span>' : ''}`;
    return `<section class="fila fila-anuncio" aria-label="Publicidad">
      ${c.enlace
    ? `<a class="anuncio-banner" data-nav href="${esc(c.enlace)}" target="_blank" rel="noopener sponsored" data-campana="${esc(c.id)}">${contenido}</a>`
    : `<div class="anuncio-banner" data-campana="${esc(c.id)}">${contenido}</div>`}
    </section>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('a.anuncio-banner');
    if (b) evento(campanas.find((c) => c.id === b.dataset.campana), 'clic');
  });

  // Anuncio antes de la película. Resuelve 'visto', 'saltado' o 'cancelado' (Volver: no se ve la película)
  function previo(contenedor) {
    const c = elegir('previo');
    if (!c) return Promise.resolve('sin-anuncio');
    return new Promise((resolver) => {
      contenedor.innerHTML = `
        <div class="anuncio-previo">
          ${pieza(c, { video: true })}
          <div class="anuncio-barra"><span class="anuncio-etiqueta">Publicidad</span><span class="anuncio-cuenta"></span></div>
          <div class="anuncio-botones">
            ${c.enlace ? `<a class="btn" data-nav href="${esc(c.enlace)}" target="_blank" rel="noopener sponsored" id="anuncio-mas">Más información</a>` : ''}
            <button class="btn" data-nav id="anuncio-saltar" disabled>Saltar anuncio ›</button>
          </div>
          <div class="anuncio-progreso"><i></i></div>
        </div>`;
      evento(c, 'impresion');
      const video = contenedor.querySelector('video.anuncio-medio');
      const saltar = contenedor.querySelector('#anuncio-saltar');
      const inicio = Date.now();
      const duracion = () => (video && Number.isFinite(video.duration) ? video.duration : c.duracion || 6);
      const transcurrido = () => (video ? video.currentTime : (Date.now() - inicio) / 1000);
      let terminado = false;
      const terminar = (como) => {
        if (terminado) return;
        terminado = true;
        clearInterval(reloj);
        document.removeEventListener('keydown', tecla, true);
        video?.pause();
        if (como === 'visto') evento(c, 'completo');
        contenedor.innerHTML = '';
        resolver(como);
      };
      const reloj = setInterval(() => {
        const t = transcurrido();
        const quedan = Math.max(0, Math.ceil(duracion() - t));
        contenedor.querySelector('.anuncio-cuenta').textContent = `Termina en ${quedan} s`;
        contenedor.querySelector('.anuncio-progreso i').style.width = `${Math.min(100, (t / duracion()) * 100)}%`;
        const faltaSaltar = Math.ceil((c.saltarTras ?? 5) - t);
        saltar.disabled = faltaSaltar > 0;
        saltar.textContent = faltaSaltar > 0 ? `Podés saltar en ${faltaSaltar}` : 'Saltar anuncio ›';
        if (!saltar.disabled && document.activeElement !== saltar && !contenedor.querySelector('#anuncio-mas:focus')) enfocar(saltar, { inicial: true });
        if (t >= duracion()) terminar('visto');
      }, 250);
      video?.addEventListener('ended', () => terminar('visto'));
      video?.addEventListener('error', () => terminar('visto')); // si la pieza no carga, no se castiga a nadie
      saltar.addEventListener('click', () => terminar('saltado'));
      contenedor.querySelector('#anuncio-mas')?.addEventListener('click', () => evento(c, 'clic'));
      function tecla(e) {
        const a = accionDeTecla(e);
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        if (a === 'volver' || a === 'detener') terminar('cancelado');
        else if (a === 'ok') document.activeElement?.click();
        else if (['izquierda', 'derecha', 'arriba', 'abajo'].includes(a)) {
          const botones = [...contenedor.querySelectorAll('[data-nav]:not([disabled])')];
          const i = botones.indexOf(document.activeElement);
          enfocar(botones[(i + (a === 'derecha' || a === 'abajo' ? 1 : -1) + botones.length) % botones.length]);
        }
      }
      document.addEventListener('keydown', tecla, true);
    });
  }

  return { cargar, banner, previo };
}
