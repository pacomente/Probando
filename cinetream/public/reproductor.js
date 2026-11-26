// Reproductor de Cinetream: controles para control remoto, teclado y pantalla táctil.
// Si la película no tiene archivo o no carga, reproduce una señal de prueba con la misma duración,
// para que la plataforma se pueda probar igual (y nunca quede una pantalla negra sin explicación).
import { accionDeTecla, enfocar, moverFoco } from './navegacion.js';

const SALTO = 10; // segundos con las flechas o los botones
const OCULTAR_MS = 3500;

// ---------- Fuente: video real ----------
function fuenteVideo(video, url) {
  video.src = url;
  return {
    tipo: 'video',
    play: () => video.play(),
    pause: () => video.pause(),
    get paused() { return video.paused; },
    get currentTime() { return video.currentTime; },
    set currentTime(t) { video.currentTime = t; },
    get duration() { return Number.isFinite(video.duration) ? video.duration : 0; },
    get muted() { return video.muted; },
    set muted(m) { video.muted = m; },
    get velocidad() { return video.playbackRate; },
    set velocidad(v) { video.playbackRate = v; },
    destruir() { video.pause(); video.removeAttribute('src'); video.load(); },
  };
}

// ---------- Fuente: señal de prueba dibujada en un canvas ----------
function fuenteSimulada(canvas, pelicula, avisar) {
  const ctx = canvas.getContext('2d');
  const duracion = pelicula.duracionMin * 60;
  let tiempo = 0;
  let pausado = true;
  let ultimo = performance.now();
  let cuadro = null;
  let velocidad = 1;
  const [fondo, acento] = pelicula.colores;

  function dibujar(ahora) {
    if (!pausado) {
      tiempo = Math.min(duracion, tiempo + ((ahora - ultimo) / 1000) * velocidad);
      if (tiempo >= duracion) { pausado = true; avisar('ended'); }
      avisar('timeupdate');
    }
    ultimo = ahora;
    const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, fondo);
    g.addColorStop(1, '#050507');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Barrido de luz que avanza con el tiempo de la película
    const x = ((tiempo * 0.15) % 1) * w * 1.4 - w * 0.2;
    const luz = ctx.createLinearGradient(x - w * 0.2, 0, x + w * 0.2, 0);
    luz.addColorStop(0, 'transparent');
    luz.addColorStop(0.5, `${acento}33`);
    luz.addColorStop(1, 'transparent');
    ctx.fillStyle = luz;
    ctx.fillRect(0, 0, w, h);
    // Barras de color
    const colores = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    const alto = h * 0.08;
    colores.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((w / 7) * i, h - alto, w / 7 + 1, alto); });
    // Textos
    const u = Math.min(w, h * 1.78) / 100;
    ctx.textAlign = 'center';
    ctx.fillStyle = acento;
    ctx.font = `600 ${u * 1.6}px system-ui, sans-serif`;
    ctx.fillText('SEÑAL DE PRUEBA · CINETREAM', w / 2, h * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${u * 5.5}px system-ui, sans-serif`;
    ctx.fillText(pelicula.titulo, w / 2, h * 0.47);
    ctx.font = `500 ${u * 1.8}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffffb0';
    ctx.fillText(`${pelicula.direccion} · ${pelicula.anio}`, w / 2, h * 0.55);
    const s = Math.floor(tiempo);
    const tc = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, Math.floor((tiempo % 1) * 24)].map((n) => String(n).padStart(2, '0')).join(':');
    ctx.font = `600 ${u * 3}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tc, w / 2, h * 0.7);
    cuadro = requestAnimationFrame(dibujar);
  }
  cuadro = requestAnimationFrame(dibujar);
  setTimeout(() => avisar('loadedmetadata'), 0);

  return {
    tipo: 'simulada',
    play() { if (tiempo >= duracion) tiempo = 0; pausado = false; avisar('play'); return Promise.resolve(); },
    pause() { pausado = true; avisar('pause'); },
    get paused() { return pausado; },
    get currentTime() { return tiempo; },
    set currentTime(t) { tiempo = Math.max(0, Math.min(duracion, t)); avisar('timeupdate'); },
    get duration() { return duracion; },
    get muted() { return true; },
    set muted(_) {},
    get velocidad() { return velocidad; },
    set velocidad(v) { velocidad = v; },
    destruir() { cancelAnimationFrame(cuadro); },
  };
}

// ---------- Reproductor ----------
const formato = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2];
const SEGUNDOS_SIGUIENTE = 10;

// siguiente: película que se ofrece al terminar; autoSiguiente: si arranca sola al terminar la cuenta regresiva
export function abrirReproductor(contenedor, pelicula, { desde = 0, alGuardar, alSalir, siguiente = null, autoSiguiente = true, alSiguiente }) {
  contenedor.innerHTML = `
    <video class="rep-video" playsinline preload="metadata"></video>
    <canvas class="rep-canvas" hidden></canvas>
    <div class="rep-aviso" hidden></div>
    <div class="rep-icono" aria-hidden="true"></div>
    <div class="rep-info-pausa" aria-hidden="true">
      <span class="etiqueta">Estás viendo</span>
      <b class="rep-info-titulo"></b>
      <span class="rep-info-datos"></span>
      <p class="rep-info-sinopsis"></p>
      <span class="rep-info-fin"></span>
    </div>
    <div class="rep-siguiente" hidden>
      <span class="etiqueta">A continuación</span>
      <b class="rep-siguiente-titulo"></b>
      <span class="rep-siguiente-cuenta"></span>
      <div class="rep-siguiente-botones">
        <button data-nav data-siguiente="ver" class="principal">▶ Ver ahora</button>
        <button data-nav data-siguiente="cancelar">Seguir aquí</button>
      </div>
    </div>
    <div class="rep-capa">
      <div class="rep-arriba">
        <button class="rep-volver" data-nav aria-label="Volver">← Volver</button>
        <div class="rep-titulo"><b></b><span></span></div>
      </div>
      <div class="rep-abajo">
        <div class="rep-linea">
          <span class="rep-tiempo rep-actual">0:00</span>
          <div class="rep-barra" data-nav tabindex="0" role="slider" aria-label="Posición en la película" aria-valuemin="0">
            <div class="rep-cargado"></div><div class="rep-avance"></div><div class="rep-punto"></div>
          </div>
          <span class="rep-tiempo rep-total">0:00</span>
        </div>
        <div class="rep-botones">
          <button data-nav data-accion="retroceder" aria-label="Retroceder 10 segundos">⟲ 10</button>
          <button data-nav data-accion="play" class="rep-play" aria-label="Reproducir">▶</button>
          <button data-nav data-accion="adelantar" aria-label="Adelantar 10 segundos">10 ⟳</button>
          <span class="rep-espacio"></span>
          <button data-nav data-accion="velocidad" class="rep-velocidad" aria-label="Velocidad de reproducción">1×</button>
          <button data-nav data-accion="sonido" aria-label="Silenciar">🔊</button>
          <button data-nav data-accion="pantalla" aria-label="Pantalla completa">⛶</button>
        </div>
      </div>
    </div>`;
  const $ = (s) => contenedor.querySelector(s);
  $('.rep-titulo b').textContent = pelicula.titulo;
  $('.rep-titulo span').textContent = `${pelicula.anio} · ${pelicula.clasificacion}`;
  $('.rep-info-titulo').textContent = pelicula.titulo;
  $('.rep-info-datos').textContent = `${pelicula.anio} · ${pelicula.clasificacion} · ${pelicula.direccion}`;
  $('.rep-info-sinopsis').textContent = pelicula.sinopsis;
  const video = $('.rep-video');
  const canvas = $('.rep-canvas');
  let fuente;
  let ultimoGuardado = 0;
  // Estado del reproductor: se declara antes de arrancar la fuente, que ya lo usa al empezar
  let temporizador = null; // para ocultar los controles
  let cerrado = false;
  let infoPausa = null; // la información aparece tras unos segundos en pausa
  let siguienteMostrado = false;
  let cuentaSiguiente = null;

  const avisar = (evento) => manejar(evento);
  function usarSimulada(motivo) {
    const posicion = fuente?.currentTime || desde;
    fuente?.destruir();
    video.hidden = true;
    canvas.hidden = false;
    fuente = fuenteSimulada(canvas, pelicula, avisar);
    fuente.currentTime = posicion;
    const aviso = $('.rep-aviso');
    aviso.hidden = false;
    aviso.textContent = motivo;
    setTimeout(() => aviso.classList.add('oculto'), 7000); // se lee y se va
    fuente.play();
  }

  if (pelicula.video) {
    fuente = fuenteVideo(video, pelicula.video);
    for (const ev of ['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata', 'progress', 'waiting', 'playing']) video.addEventListener(ev, () => manejar(ev));
    video.addEventListener('error', () => usarSimulada('No se pudo cargar el video (sin conexión o archivo no disponible). Se muestra una señal de prueba.'), { once: true });
    video.addEventListener('loadedmetadata', () => { if (desde > 5 && desde < video.duration - 10) video.currentTime = desde; }, { once: true });
    fuente.play().catch(() => manejar('pause')); // algunos navegadores piden un toque antes de reproducir
  } else {
    usarSimulada('Esta película todavía no tiene su archivo cargado en el catálogo. Se muestra una señal de prueba.');
  }

  // ---------- Interfaz ----------
  function manejar(evento) {
    if (cerrado) return; // el video puede avisar algo después de cerrar el reproductor
    const d = fuente.duration;
    const t = fuente.currentTime;
    if (evento === 'timeupdate' || evento === 'loadedmetadata' || evento === 'progress') {
      $('.rep-actual').textContent = formato(t);
      $('.rep-total').textContent = formato(d);
      const pct = d ? (t / d) * 100 : 0;
      $('.rep-avance').style.width = `${pct}%`;
      $('.rep-punto').style.left = `${pct}%`;
      const barra = $('.rep-barra');
      barra.setAttribute('aria-valuemax', String(Math.round(d)));
      barra.setAttribute('aria-valuenow', String(Math.round(t)));
      barra.setAttribute('aria-valuetext', `${formato(t)} de ${formato(d)}`);
      if (fuente.tipo === 'video' && video.buffered.length && d) {
        $('.rep-cargado').style.width = `${(video.buffered.end(video.buffered.length - 1) / d) * 100}%`;
      }
      if (Math.abs(t - ultimoGuardado) >= 5) { ultimoGuardado = t; alGuardar(t, d); }
      // Ya en los créditos: se ofrece la película siguiente
      if (siguiente && !siguienteMostrado && d > 60 && t >= d - 15) mostrarSiguiente();
    }
    if (evento === 'play' || evento === 'pause' || evento === 'playing') {
      const pausado = fuente.paused;
      $('.rep-play').textContent = pausado ? '▶' : '❚❚';
      $('.rep-play').setAttribute('aria-label', pausado ? 'Reproducir' : 'Pausar');
      contenedor.classList.toggle('pausado', pausado);
      clearTimeout(infoPausa);
      contenedor.classList.remove('con-info');
      if (pausado) {
        infoPausa = setTimeout(() => {
          const fin = new Date(Date.now() + ((fuente.duration - fuente.currentTime) / (fuente.velocidad || 1)) * 1000);
          $('.rep-info-fin').textContent = `Termina a las ${fin.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
          contenedor.classList.add('con-info');
        }, 4000);
      }
      mostrarControles();
    }
    if (evento === 'waiting') contenedor.classList.add('cargando');
    if (evento === 'playing') contenedor.classList.remove('cargando');
    if (evento === 'ended') {
      alGuardar(d, d);
      if (siguiente && !siguienteMostrado) mostrarSiguiente();
      mostrarControles();
    }
  }

  // ---------- A continuación ----------
  function mostrarSiguiente() {
    siguienteMostrado = true;
    const caja = $('.rep-siguiente');
    caja.hidden = false;
    $('.rep-siguiente-titulo').textContent = siguiente.titulo;
    let quedan = SEGUNDOS_SIGUIENTE;
    const pintar = () => { $('.rep-siguiente-cuenta').textContent = autoSiguiente ? `Empieza en ${quedan} s` : `${siguiente.anio} · ${siguiente.duracionMin} min`; };
    pintar();
    if (autoSiguiente) {
      cuentaSiguiente = setInterval(() => {
        quedan--;
        pintar();
        if (quedan <= 0) irASiguiente();
      }, 1000);
    }
    enfocar(caja.querySelector('[data-siguiente="ver"]'), { inicial: true });
  }
  function cancelarSiguiente() {
    clearInterval(cuentaSiguiente);
    $('.rep-siguiente').hidden = true;
  }
  function irASiguiente() {
    clearInterval(cuentaSiguiente);
    salir();
    alSiguiente?.(siguiente);
  }
  contenedor.querySelector('[data-siguiente="ver"]').addEventListener('click', irASiguiente);
  contenedor.querySelector('[data-siguiente="cancelar"]').addEventListener('click', cancelarSiguiente);

  function mostrarControles() {
    contenedor.classList.add('con-controles');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { if (!fuente.paused) contenedor.classList.remove('con-controles'); }, OCULTAR_MS);
  }
  const controlesVisibles = () => contenedor.classList.contains('con-controles');

  function destello(texto) {
    const icono = $('.rep-icono');
    icono.textContent = texto;
    icono.classList.remove('ver');
    void icono.offsetWidth;
    icono.classList.add('ver');
  }

  function alternar() {
    if (fuente.paused) { fuente.play().catch(() => {}); destello('▶'); } else { fuente.pause(); destello('❚❚'); }
  }
  function saltar(seg) {
    fuente.currentTime = Math.max(0, Math.min(fuente.duration || 0, fuente.currentTime + seg));
    destello(seg > 0 ? `+${seg} s` : `${seg} s`);
    manejar('timeupdate');
    mostrarControles();
  }

  const acciones = {
    play: alternar,
    retroceder: () => saltar(-SALTO),
    adelantar: () => saltar(SALTO),
    velocidad: () => {
      const v = VELOCIDADES[(VELOCIDADES.indexOf(fuente.velocidad) + 1) % VELOCIDADES.length] ?? 1;
      fuente.velocidad = v;
      const texto = `${String(v).replace('.', ',')}×`;
      contenedor.querySelector('[data-accion="velocidad"]').textContent = texto;
      destello(texto);
    },
    sonido: () => {
      fuente.muted = !fuente.muted;
      contenedor.querySelector('[data-accion="sonido"]').textContent = fuente.muted ? '🔇' : '🔊';
    },
    pantalla: () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else contenedor.requestFullscreen?.().catch(() => {});
    },
  };
  contenedor.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => { acciones[b.dataset.accion](); mostrarControles(); }));
  if (!document.fullscreenEnabled) contenedor.querySelector('[data-accion="pantalla"]').hidden = true;
  $('.rep-volver').addEventListener('click', salir);

  // Tocar la barra para ir a ese punto (dedo o mouse)
  const barra = $('.rep-barra');
  const irA = (clienteX) => {
    const r = barra.getBoundingClientRect();
    fuente.currentTime = Math.max(0, Math.min(1, (clienteX - r.left) / r.width)) * (fuente.duration || 0);
    manejar('timeupdate');
  };
  barra.addEventListener('pointerdown', (e) => { irA(e.clientX); barra.setPointerCapture(e.pointerId); mostrarControles(); });
  barra.addEventListener('pointermove', (e) => { if (barra.hasPointerCapture(e.pointerId)) irA(e.clientX); });

  // Tocar la imagen: muestra u oculta los controles (en el celular); doble toque a los costados salta 10 s
  let ultimoToque = 0;
  contenedor.addEventListener('pointerup', (e) => {
    if (e.target.closest('button, .rep-barra')) return;
    const ahora = Date.now();
    const r = contenedor.getBoundingClientRect();
    if (ahora - ultimoToque < 300) {
      const lado = (e.clientX - r.left) / r.width;
      if (lado < 0.35) saltar(-SALTO);
      else if (lado > 0.65) saltar(SALTO);
      ultimoToque = 0;
      return;
    }
    ultimoToque = ahora;
    if (controlesVisibles()) contenedor.classList.remove('con-controles');
    else mostrarControles();
  });
  contenedor.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mostrarControles(); });

  // Control remoto y teclado
  // Atajos de computadora, como en los reproductores web habituales
  const ATAJOS = { k: 'play', j: 'retroceder', l: 'adelantar', f: 'pantalla', m: 'sonido' };
  function tecla(e) {
    const atajo = !e.ctrlKey && !e.metaKey && !e.altKey && ATAJOS[e.key?.toLowerCase()];
    if (atajo) { e.preventDefault(); e.stopPropagation(); acciones[atajo](); mostrarControles(); return; }
    const accion = accionDeTecla(e);
    if (!accion) return;
    e.preventDefault();
    e.stopPropagation(); // el reproductor atiende sus teclas; la navegación general no se entera
    if (accion === 'volver' && !$('.rep-siguiente').hidden) { cancelarSiguiente(); return; }
    if (accion === 'volver' || accion === 'detener') { salir(); return; }
    if (accion === 'playPausa') { alternar(); mostrarControles(); return; }
    if (accion === 'adelantar') { saltar(SALTO * 3); return; }
    if (accion === 'retroceder') { saltar(-SALTO * 3); return; }
    // "A continuación" en pantalla: el control maneja esa tarjeta aunque los controles estén ocultos
    const caja = $('.rep-siguiente');
    if (!caja.hidden && ['ok', 'izquierda', 'derecha', 'arriba', 'abajo'].includes(accion)) {
      if (!caja.contains(document.activeElement)) enfocar(caja.querySelector('[data-siguiente="ver"]'));
      else if (accion === 'ok') document.activeElement.click();
      else moverFoco(accion, caja);
      return;
    }
    if (!controlesVisibles()) {
      // Con los controles ocultos: izquierda/derecha saltan, OK pausa, cualquier otra muestra los controles
      if (accion === 'izquierda') saltar(-SALTO);
      else if (accion === 'derecha') saltar(SALTO);
      else if (accion === 'ok') { alternar(); mostrarControles(); enfocar($('.rep-play')); }
      else { mostrarControles(); enfocar($('.rep-play')); }
      return;
    }
    mostrarControles();
    if (document.activeElement === barra && (accion === 'izquierda' || accion === 'derecha')) { saltar(accion === 'derecha' ? SALTO : -SALTO); return; }
    if (accion === 'ok') { document.activeElement?.click(); return; }
    // Con "A continuación" en pantalla, las flechas se mueven entre sus botones
    const siguienteCaja = $('.rep-siguiente');
    moverFoco(accion, siguienteCaja.hidden ? contenedor : siguienteCaja);
  }
  document.addEventListener('keydown', tecla, true);

  function salir() {
    if (cerrado) return;
    alGuardar(fuente.currentTime, fuente.duration);
    cerrado = true;
    document.removeEventListener('keydown', tecla, true);
    clearTimeout(temporizador);
    clearTimeout(infoPausa);
    clearInterval(cuentaSiguiente);
    fuente.destruir();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    contenedor.innerHTML = '';
    alSalir();
  }

  mostrarControles();
  enfocar($('.rep-play'), { inicial: true });
  return { salir };
}

// ---------- Películas con el reproductor de otro sitio (YouTube, Vimeo, Google Drive…) ----------
// No hay archivo de video propio: se muestra el reproductor oficial de ese sitio dentro de Cinetream.
export function abrirReproductorExterno(contenedor, pelicula, { alSalir }) {
  const sitio = (() => { try { return new URL(pelicula.embed).hostname.replace(/^www\./, ''); } catch { return 'otro sitio'; } })();
  contenedor.innerHTML = `
    <div class="rep rep-externo">
      <iframe class="rep-iframe" tabindex="0" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="rep-cargando-externo" aria-hidden="true"><span></span></div>
      <div class="rep-externo-zona" aria-hidden="true"></div>
      <div class="rep-externo-barra">
        <button class="rep-volver" data-nav aria-label="Volver">← Volver</button>
        <div class="rep-titulo"><b></b><span></span></div>
      </div>
    </div>`;
  const $ = (s) => contenedor.querySelector(s);
  const marco = $('.rep-iframe');
  $('.rep-titulo b').textContent = pelicula.titulo;
  $('.rep-titulo span').textContent = `Reproductor de ${sitio}`;
  marco.title = pelicula.titulo;
  marco.addEventListener('load', () => contenedor.querySelector('.rep-cargando-externo')?.remove(), { once: true });
  marco.src = pelicula.embed;

  // La barra de arriba se esconde sola; vuelve al mover el mouse o tocar arriba
  const caja = $('.rep-externo');
  let temporizador;
  const mostrarBarra = () => {
    caja.classList.add('con-barra');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => caja.classList.remove('con-barra'), 4000);
  };
  // El reproductor del otro sitio se queda con el mouse: la franja de arriba es la que muestra la barra
  $('.rep-externo-zona').addEventListener('pointermove', mostrarBarra);
  $('.rep-externo-zona').addEventListener('pointerdown', mostrarBarra);
  caja.addEventListener('pointermove', mostrarBarra);
  mostrarBarra();

  let cerrado = false;
  function tecla(e) {
    if (cerrado) return;
    const accion = accionDeTecla(e);
    if (!accion) return;
    e.stopPropagation(); // la navegación general no se entera mientras se ve la película
    if (accion === 'volver' || accion === 'detener') { e.preventDefault(); salir(); return; }
    mostrarBarra();
    // Abajo: el control pasa al reproductor del sitio (pausa, adelantar…); arriba: vuelve al botón Volver
    if (accion === 'abajo') { e.preventDefault(); marco.focus(); }
    if (accion === 'arriba') { e.preventDefault(); enfocar($('.rep-volver'), { inicial: true }); }
  }
  document.addEventListener('keydown', tecla, true);
  $('.rep-volver').addEventListener('click', salir);

  function salir() {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    document.removeEventListener('keydown', tecla, true);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    contenedor.innerHTML = '';
    alSalir();
  }

  enfocar($('.rep-volver'), { inicial: true });
  return { salir };
}
