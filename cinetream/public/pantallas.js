// Límite de pantallas a la vez: antes de reproducir se pide lugar; mientras se ve, se avisa cada 30 s que sigue mirando.
import { accionDeTecla, enfocar, moverFoco } from './navegacion.js';
import { esTeleApp } from './app-nativa.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cada equipo tiene un identificador propio (queda guardado en el navegador o en la app)
function idDispositivo() {
  try {
    let id = localStorage.getItem('cinetream-dispositivo');
    if (!id) { id = crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; localStorage.setItem('cinetream-dispositivo', id); }
    return id;
  } catch {
    idDispositivo.temporal ||= `t-${Math.random().toString(36).slice(2)}`;
    return idDispositivo.temporal;
  }
}

function nombreEquipo(modoTV) {
  const ua = navigator.userAgent;
  if (esTeleApp || modoTV || /SmartTV|Tizen|Web0S|BRAVIA|AFT|GoogleTV|Android TV/i.test(ua)) return 'Tele';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'Celular';
  return /Mac/i.test(ua) ? 'Mac' : 'Compu';
}

const hace = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;
};

export function crearPantallas({ activo, modoTV, alVerPlanes }) {
  const dispositivo = idDispositivo();
  const enviar = (ruta, datos = {}) => fetch(`/api/pantallas/${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispositivo, ...datos }), keepalive: true,
  }).then((r) => r.json()).catch(() => null);

  /**
   * Pide lugar para ver «pelicula» en este equipo. Si la cuenta ya está en el límite, muestra quién está mirando
   * y deja cortar en otro equipo. Devuelve 'ok', 'cancelado' o 'planes'.
   */
  async function pedirPermiso(contenedor, pelicula) {
    if (!activo()) return 'ok';
    const datos = { equipo: nombreEquipo(modoTV()), titulo: pelicula.titulo };
    let r = await enviar('empezar', datos);
    if (!r || r.ok || r.error) return 'ok'; // sin respuesta del servidor no se impide ver
    return new Promise((resolver) => {
      const pintar = () => {
        contenedor.innerHTML = `
          <div class="limite-pantallas" role="dialog" aria-labelledby="limite-titulo">
            <div class="limite-caja">
              <span class="limite-icono" aria-hidden="true">📺</span>
              <h2 id="limite-titulo">Ya se está viendo en ${r.limite === 1 ? 'otra pantalla' : `${r.limite} pantallas`}</h2>
              <p>Tu plan permite ver en <b>${r.limite} ${r.limite === 1 ? 'pantalla' : 'pantallas'} a la vez</b>. Para ver acá, cortá en otro equipo:</p>
              <ul class="limite-lista">${r.otras.map((o) => `
                <li><span><b>${esc(o.equipo)}</b><small>${esc(o.titulo || 'Viendo una película')} · ${esc(hace(o.desde))}</small></span>
                  <button class="btn" data-nav data-cortar="${esc(o.dispositivo)}">Cortar ahí y ver acá</button></li>`).join('')}
              </ul>
              <div class="acciones">
                ${r.limite < 2 ? '<button class="btn principal" data-nav data-limite="planes">Ver en 2 pantallas con Plus</button>' : ''}
                <button class="btn" data-nav data-limite="cancelar">Ahora no</button>
              </div>
            </div>
          </div>`;
        enfocar(contenedor.querySelector('[data-cortar], [data-limite]'), { inicial: true });
      };
      const terminarCon = (resultado) => {
        document.removeEventListener('keydown', tecla, true);
        contenedor.removeEventListener('click', clic);
        contenedor.innerHTML = '';
        resolver(resultado);
      };
      // Control remoto: flechas entre los botones, OK elige y Volver cierra
      const tecla = (e) => {
        const accion = accionDeTecla(e);
        if (!accion) return;
        e.preventDefault();
        e.stopPropagation();
        if (accion === 'volver' || accion === 'detener') terminarCon('cancelado');
        else if (['arriba', 'abajo', 'izquierda', 'derecha'].includes(accion)) moverFoco(accion, contenedor);
        else if (accion === 'ok') document.activeElement?.closest?.('.limite-pantallas button')?.click();
      };
      const clic = async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.limite) { terminarCon(b.dataset.limite); return; }
        b.disabled = true;
        b.textContent = 'Cortando…';
        await enviar('cortar', { dispositivo: b.dataset.cortar });
        r = await enviar('empezar', datos);
        if (!r || r.ok) terminarCon('ok'); else pintar();
      };
      document.addEventListener('keydown', tecla, true);
      contenedor.addEventListener('click', clic);
      pedirPermiso.cancelar = () => terminarCon('cancelado');
      pintar();
    });
  }

  /** Mientras se ve: avisa cada 30 s. Si cortaron este equipo desde otro, llama a «alCortar». */
  function vigilar(alCortar) {
    if (!activo()) return () => {};
    const intervalo = setInterval(async () => {
      const r = await enviar('latido');
      if (r && r.seguir === false) { clearInterval(intervalo); alCortar(r.motivo); }
    }, 30000);
    const alIrse = () => navigator.sendBeacon?.('/api/pantallas/terminar', new Blob([JSON.stringify({ dispositivo })], { type: 'application/json' }));
    window.addEventListener('pagehide', alIrse);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('pagehide', alIrse);
      enviar('terminar');
    };
  }

  return { pedirPermiso, vigilar, cancelarPermiso: () => pedirPermiso.cancelar?.(), alVerPlanes };
}
