// Integración con las apps de Android (celular y tele). En el navegador no hace nada.
const nativa = window.CinetreamApp;
export const enApp = Boolean(nativa);
export const esTeleApp = enApp && nativa.esTele();
export const versionApp = enApp ? nativa.version() : '';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinEsquema = (u) => String(u).replace(/^https?:\/\//, '');

// Que la pantalla no se apague mientras se ve una película
if (enApp) {
  document.addEventListener('playing', () => nativa.pantallaEncendida(true), true);
  for (const ev of ['pause', 'ended', 'emptied']) document.addEventListener(ev, () => nativa.pantallaEncendida(false), true);
}

/** Pinta el formulario para conectar la app con un servidor de Cinetream (en Ajustes o en la bienvenida). */
export function pintarConexion(contenedor, { alVolver, enfocar } = {}) {
  const actual = nativa.servidor();
  contenedor.innerHTML = `
    <div class="conexion">
      <h2>Servidor de Cinetream</h2>
      <p class="acerca">${actual ? `Conectada a <b>${esc(sinEsquema(actual))}</b>.` : 'Ahora ves la <b>demostración</b>, con las películas de ejemplo.'}
        Escribí la dirección que muestra la PC al arrancar Cinetream (por ejemplo <code>192.168.0.10:3500</code>) o buscala en tu wifi.</p>
      <form class="conexion-form">
        <input data-nav name="direccion" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
          aria-label="Dirección del servidor" placeholder="192.168.0.10:3500 o cine.tudominio.com" value="${esc(sinEsquema(actual))}">
        <button class="btn principal" data-nav>Conectar</button>
      </form>
      <div class="acciones">
        <button type="button" class="btn" data-nav data-conexion="buscar">Buscar en mi wifi</button>
        ${actual ? '<button type="button" class="btn" data-nav data-conexion="demo">Ver la demostración</button>' : ''}
        ${alVolver ? '<button type="button" class="btn" data-nav data-conexion="volver">Volver</button>' : ''}
      </div>
      <ul class="conexion-encontrados" aria-live="polite"></ul>
      <p class="nota-prueba">App Cinetream ${esc(versionApp)}${esTeleApp ? ' para tele' : ''}</p>
    </div>`;
  const lista = contenedor.querySelector('.conexion-encontrados');
  contenedor.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = contenedor.querySelector('[name="direccion"]').value.trim();
    if (v) nativa.conectar(v);
  });
  contenedor.querySelector('[data-conexion="demo"]')?.addEventListener('click', () => nativa.usarDemo());
  contenedor.querySelector('[data-conexion="volver"]')?.addEventListener('click', alVolver);
  contenedor.querySelector('[data-conexion="buscar"]').addEventListener('click', () => {
    lista.innerHTML = '<li class="nota">Buscando en tu wifi… puede tardar unos segundos.</li>';
    window.cinetreamServidores = (urls) => {
      lista.innerHTML = urls.length
        ? urls.map((u) => `<li><button class="btn principal" data-nav data-url="${esc(u)}">Conectar con ${esc(sinEsquema(u))}</button></li>`).join('')
        : '<li class="nota">No encontramos ningún Cinetream en esta wifi. Fijate que la PC esté prendida y con el servidor andando.</li>';
      lista.querySelectorAll('[data-url]').forEach((b) => b.addEventListener('click', () => nativa.conectar(b.dataset.url)));
      if (urls.length) enfocar?.(lista.querySelector('[data-url]'), { inicial: true });
    };
    nativa.buscarServidores();
  });
}
