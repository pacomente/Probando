// Cuenta del espectador: bienvenida con los planes, crear cuenta o ingresar, ingreso en la tele con un código
// y cambio de plan. Sin servidor (demostración), todo se simula en este dispositivo y no se cobra nada.
import { enfocar } from './navegacion.js';
import { enApp, pintarConexion } from './app-nativa.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const precio = (p) => `$ ${p.precio.toLocaleString('es-AR')}`;
const porPeriodo = (p) => (p.precio ? ` por ${p.periodo}` : ' para siempre');

// Planes de la demostración (en la versión instalada los define el administrador)
const PLANES_DEMO = [
  { id: 'gratis', nombre: 'Gratis', precio: 0, periodo: 'mes', anuncios: true, plus: false, pantallas: 1, descripcion: 'Todo el catálogo libre, con publicidad.' },
  { id: 'plus', nombre: 'Plus', precio: 2999, periodo: 'mes', anuncios: false, plus: true, pantallas: 2, descripcion: 'Sin publicidad y con los títulos Plus.' },
  { id: 'plus-anual', nombre: 'Plus anual', precio: 29990, periodo: 'año', anuncios: false, plus: true, pantallas: 2, descripcion: 'Lo mismo que Plus, pagando una vez al año: dos meses de regalo.' },
];

function leerLocal(clave) { try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; } }
function guardarLocal(clave, v) { try { if (v === null) localStorage.removeItem(clave); else localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

export function crearCuenta({ conServidor, alCambiar }) {
  let planes = PLANES_DEMO;
  let modoPrueba = true;
  let cuenta = null;

  async function api(ruta, cuerpo) {
    const r = await fetch(`api/${ruta}`, cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'No se pudo completar. Probá de nuevo.');
    return datos;
  }

  async function cargar() {
    if (!conServidor) {
      const local = leerLocal('cinetream-demo-cuenta');
      if (local) {
        const plan = PLANES_DEMO.find((p) => p.id === local.plan) || PLANES_DEMO[0];
        cuenta = { ...local, planNombre: plan.nombre, anuncios: plan.anuncios, plus: plan.plus, demo: true };
      }
      return cuenta;
    }
    const [yo, p] = await Promise.all([api('cuenta/yo'), api('planes')]);
    planes = p.planes;
    modoPrueba = yo.modoPrueba;
    cuenta = yo.cuenta;
    return cuenta;
  }

  // ---------- Bienvenida ----------
  function tarjetasPlanes(actual, accion) {
    return planes.map((p) => `
      <button class="plan ${p.plus ? 'plan-plus' : ''} ${actual === p.id ? 'plan-actual' : ''}" data-nav data-plan="${esc(p.id)}">
        <span class="plan-nombre">${esc(p.nombre)}</span>
        <span class="plan-precio"><b>${esc(precio(p))}</b>${esc(porPeriodo(p))}</span>
        <span class="plan-desc">${esc(p.descripcion)}</span>
        <ul>
          <li>${p.anuncios ? 'Con publicidad' : '✓ Sin publicidad'}</li>
          <li>${p.plus ? '✓ Títulos Plus' : 'Catálogo libre'}</li>
          <li>✓ En la tele, la compu y el celular</li>
          <li>${(p.pantallas || 1) > 1 ? `✓ ${p.pantallas} pantallas a la vez` : '1 pantalla a la vez'}</li>
        </ul>
        <span class="plan-boton">${actual === p.id ? 'Tu plan actual' : esc(accion(p))}</span>
      </button>`).join('');
  }

  const notaPrueba = () => (!conServidor
    ? 'Demostración: no se crea una cuenta real ni se cobra nada.'
    : modoPrueba ? 'Modo prueba: los pagos se simulan y no se cobra nada.' : 'Pagos seguros con Mercado Pago. Cancelás cuando quieras.');

  // Links legales obligatorios (Botón de baja: Res. 316/2018; Botón de arrepentimiento: Res. 424/2020)
  const piePagina = () => `<nav class="pie-legal" aria-label="Información legal">
      <a href="legal.html?doc=terminos">Términos y condiciones</a><a href="legal.html?doc=privacidad">Privacidad</a>
      <a href="tramites.html?tipo=baja">Botón de baja</a><a href="tramites.html?tipo=arrepentimiento">Botón de arrepentimiento</a></nav>`;

  function pintarBienvenida(vista, { modoTV }) {
    vista.innerHTML = `
      <div class="bienvenida-fondo" aria-hidden="true"></div>
      <div class="bienvenida-cuerpo">
        <span class="logo bienvenida-logo"><span class="logo-marca">CINE</span><span class="logo-sub">TREAM</span></span>
        <h1>Cine para la tele y el celular</h1>
        <p class="bienvenida-bajada">Clásicos, animación y películas abiertas. Empezá gratis y pasate a Plus cuando quieras.</p>
        <div class="planes">${tarjetasPlanes(null, (p) => (p.precio ? `Elegir ${p.nombre}` : 'Empezar gratis'))}</div>
        <div class="acciones bienvenida-acciones">
          <button class="btn" data-nav data-ir-cuenta="ingresar">Ya tengo cuenta</button>
          ${conServidor && modoTV ? '<button class="btn" data-nav data-ir-cuenta="tv">Ingresar con el celular</button>' : ''}
          ${enApp && !conServidor ? '<button class="btn" data-nav data-ir-cuenta="servidor">Conectar con mi servidor</button>' : ''}
        </div>
        <p class="nota-prueba">${esc(notaPrueba())}</p>
        ${conServidor ? piePagina() : ''}
      </div>`;
    vista.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => pintarAcceso(vista, 'registro', b.dataset.plan)));
    $('[data-ir-cuenta="ingresar"]', vista).addEventListener('click', () => pintarAcceso(vista, 'ingresar'));
    $('[data-ir-cuenta="tv"]', vista)?.addEventListener('click', () => pintarTV(vista));
    $('[data-ir-cuenta="servidor"]', vista)?.addEventListener('click', () => {
      vista.innerHTML = '<div class="bienvenida-fondo" aria-hidden="true"></div><div class="bienvenida-cuerpo conexion-cuerpo"></div>';
      pintarConexion($('.conexion-cuerpo', vista), { enfocar, alVolver: () => pintarBienvenida(vista, { modoTV }) });
      enfocar($('.conexion-cuerpo [data-nav]', vista), { inicial: true });
    });
    enfocar($('[data-plan]', vista), { inicial: true });
  }

  // ---------- Crear cuenta o ingresar ----------
  function pintarAcceso(vista, modo, planId = 'gratis') {
    const plan = planes.find((p) => p.id === planId) || planes[0];
    const registro = modo === 'registro';
    vista.innerHTML = `
      <div class="bienvenida-fondo" aria-hidden="true"></div>
      <form class="acceso-espectador" id="acceso-espectador" novalidate>
        <span class="logo"><span class="logo-marca">CINE</span><span class="logo-sub">TREAM</span></span>
        <h1>${registro ? 'Creá tu cuenta' : 'Ingresá a tu cuenta'}</h1>
        ${registro ? `<p class="plan-elegido">Plan elegido: <b>${esc(plan.nombre)}</b> · ${esc(precio(plan))}${esc(porPeriodo(plan))} <button type="button" class="enlace" data-nav id="cambiar-plan">Cambiar</button></p>` : ''}
        ${registro ? '<label for="cuenta-nombre">Tu nombre</label><input id="cuenta-nombre" data-nav autocomplete="given-name" maxlength="40">' : ''}
        <label for="cuenta-email">Correo</label>
        <input id="cuenta-email" data-nav type="email" autocomplete="email" required>
        <label for="cuenta-clave">Contraseña${registro ? ' (al menos 8 caracteres)' : ''}</label>
        <input id="cuenta-clave" data-nav type="password" autocomplete="${registro ? 'new-password' : 'current-password'}" required>
        <button class="btn principal" data-nav>${registro ? (plan.precio ? 'Crear cuenta y pagar' : 'Crear cuenta gratis') : 'Ingresar'}</button>
        <p class="error-cuenta" id="cuenta-error" role="alert"></p>
        ${!registro && conServidor ? '<button type="button" class="enlace" data-nav id="olvide">¿Olvidaste tu contraseña?</button>' : ''}
        <button type="button" class="enlace" data-nav id="cambiar-modo">${registro ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Creá una gratis'}</button>
        <button type="button" class="enlace" data-nav id="volver-planes">← Ver los planes</button>
        <p class="nota-prueba">${esc(notaPrueba())}</p>
      </form>`;
    $('#cambiar-modo', vista).addEventListener('click', () => pintarAcceso(vista, registro ? 'ingresar' : 'registro', planId));
    $('#olvide', vista)?.addEventListener('click', () => pintarOlvide(vista, $('#cuenta-email', vista).value));
    $('#volver-planes', vista).addEventListener('click', () => pintarBienvenida(vista, { modoTV: false }));
    $('#cambiar-plan', vista)?.addEventListener('click', () => pintarBienvenida(vista, { modoTV: false }));
    $('#acceso-espectador', vista).addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = $('#cuenta-error', vista);
      error.textContent = '';
      const email = $('#cuenta-email', vista).value.trim();
      const clave = $('#cuenta-clave', vista).value;
      try {
        if (!conServidor) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Escribí un correo válido.');
          if (clave.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
          guardarLocal('cinetream-demo-cuenta', { email, nombre: $('#cuenta-nombre', vista)?.value || '', plan: registro ? plan.id : 'gratis' });
          alCambiar(registro && plan.precio ? `Demostración: se activó ${plan.nombre} sin cobrar nada` : null);
          return;
        }
        await api(registro ? 'cuenta/registrar' : 'cuenta/entrar', { email, clave, nombre: $('#cuenta-nombre', vista)?.value });
        if (registro && plan.precio) { await suscribir(plan.id); return; }
        alCambiar(null);
      } catch (err) {
        error.textContent = err.message;
      }
    });
    enfocar($('#cuenta-nombre, #cuenta-email', vista), { inicial: true });
  }

  // ---------- Ingresar en la tele con un código ----------
  let consulta = null;
  // ---------- Olvidé mi contraseña ----------
  function pintarOlvide(vista, email = '') {
    vista.innerHTML = `
      <div class="bienvenida-fondo" aria-hidden="true"></div>
      <form class="acceso-espectador" id="olvide-form" novalidate>
        <span class="logo"><span class="logo-marca">CINE</span><span class="logo-sub">TREAM</span></span>
        <h1>Crear una contraseña nueva</h1>
        <p class="acceso-ayuda">Escribí el correo de tu cuenta y te mandamos un link para crear una contraseña nueva.</p>
        <label for="olvide-email">Correo</label>
        <input id="olvide-email" data-nav type="email" autocomplete="email" required value="${esc(email)}">
        <button class="btn principal" data-nav>Mandarme el link</button>
        <p class="error-cuenta" id="olvide-error" role="alert"></p>
        <button type="button" class="enlace" data-nav id="olvide-volver">← Volver a ingresar</button>
      </form>`;
    $('#olvide-volver', vista).addEventListener('click', () => pintarAcceso(vista, 'ingresar'));
    $('#olvide-form', vista).addEventListener('submit', async (e) => {
      e.preventDefault();
      const correo = $('#olvide-email', vista).value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { $('#olvide-error', vista).textContent = 'Escribí un correo válido.'; return; }
      try {
        const r = await api('cuenta/olvide', { email: correo });
        $('#olvide-form', vista).innerHTML = `
          <span class="logo"><span class="logo-marca">CINE</span><span class="logo-sub">TREAM</span></span>
          <h1>${r.correo ? 'Revisá tu correo' : 'Pedí el link'}</h1>
          <p class="acceso-ayuda">${r.correo
    ? `Si <b>${esc(correo)}</b> tiene una cuenta, te llega un correo con un link para crear una contraseña nueva. Vale por 1 hora. Fijate también en «Spam».`
    : `Escribile a ${r.contacto ? `<b>${esc(r.contacto)}</b>` : 'quien te dio acceso a Cinetream'} desde <b>${esc(correo)}</b> y te mandamos un link para crear una contraseña nueva.`}</p>
          <button type="button" class="btn" data-nav id="olvide-listo">Volver a ingresar</button>`;
        $('#olvide-listo', vista).addEventListener('click', () => pintarAcceso(vista, 'ingresar'));
        enfocar($('#olvide-listo', vista), { inicial: true });
      } catch (err) { $('#olvide-error', vista).textContent = err.message; }
    });
    enfocar($('#olvide-email', vista), { inicial: true });
  }

  async function pintarTV(vista) {
    clearInterval(consulta);
    try {
      const { codigo, url } = await api('cuenta/tv/codigo');
      vista.innerHTML = `
        <div class="bienvenida-fondo" aria-hidden="true"></div>
        <div class="tv-codigo">
          <span class="logo"><span class="logo-marca">CINE</span><span class="logo-sub">TREAM</span></span>
          <h1>Ingresá con tu celular</h1>
          <ol>
            <li>En el celular o la compu, abrí <b>${esc(url)}</b></li>
            <li>Ingresá a tu cuenta (o creala)</li>
            <li>Escribí este código:</li>
          </ol>
          <div class="codigo" aria-label="Código ${esc(codigo.split('').join(' '))}">${esc(codigo)}</div>
          <p class="nota-prueba" id="tv-estado">Esperando… El código vence en 10 minutos.</p>
          <button class="btn" data-nav id="tv-volver">← Volver</button>
        </div>`;
      $('#tv-volver', vista).addEventListener('click', () => { clearInterval(consulta); pintarBienvenida(vista, { modoTV: true }); });
      enfocar($('#tv-volver', vista), { inicial: true });
      consulta = setInterval(async () => {
        if (!vista.isConnected || vista.hidden) { clearInterval(consulta); return; }
        const r = await api(`cuenta/tv/estado?codigo=${encodeURIComponent(codigo)}`).catch(() => null);
        if (r?.estado === 'listo') { clearInterval(consulta); alCambiar('¡Listo! Ya ingresaste en la tele'); }
        if (r?.estado === 'vencido') { clearInterval(consulta); pintarTV(vista); }
      }, 3000);
    } catch (err) {
      vista.innerHTML = `<p class="vacio">${esc(err.message)}</p>`;
    }
  }

  // ---------- Cambiar de plan ----------
  function pintarPlanes(vista) {
    vista.innerHTML = `
      <h1 class="titulo-vista">Planes</h1>
      <p class="bajada-vista">Tu plan: <b>${esc(cuenta.planNombre)}</b>${cuenta.vence ? ` · ${cuenta.estado === 'cancelada' ? 'termina' : 'se renueva'} el ${new Date(cuenta.vence).toLocaleDateString('es-AR')}` : ''}</p>
      <div class="planes planes-pagina">${tarjetasPlanes(cuenta.plan, (p) => (p.precio ? `Cambiar a ${p.nombre}` : 'Volver a Gratis'))}</div>
      <p class="error-cuenta" id="planes-error" role="alert"></p>
      <p class="nota-prueba">${esc(notaPrueba())}</p>`;
    vista.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.plan === cuenta.plan) return;
      try { await suscribir(b.dataset.plan); } catch (err) { $('#planes-error', vista).textContent = err.message; }
    }));
    enfocar($('[data-plan]:not(.plan-actual)', vista) || $('[data-plan]', vista), { inicial: true });
  }

  async function suscribir(planId) {
    const plan = planes.find((p) => p.id === planId);
    if (!conServidor) {
      guardarLocal('cinetream-demo-cuenta', { ...leerLocal('cinetream-demo-cuenta'), plan: planId });
      alCambiar(plan.precio ? `Demostración: se activó ${plan.nombre} sin cobrar nada` : 'Volviste al plan Gratis');
      return;
    }
    const r = await api('cuenta/suscribir', { plan: planId });
    if (r.url) { location.href = r.url; return; } // Mercado Pago (o la página de pago de prueba)
    alCambiar('Volviste al plan Gratis. Seguís con Plus hasta la fecha que ya pagaste.');
  }

  async function cancelar() {
    if (!conServidor) { await suscribir('gratis'); return; }
    await api('cuenta/cancelar', {});
    alCambiar('Listo: tu plan no se va a renovar. Seguís con Plus hasta la fecha que ya pagaste.');
  }

  async function salir() {
    if (conServidor) await api('cuenta/salir', {}).catch(() => {});
    else guardarLocal('cinetream-demo-cuenta', null);
    alCambiar(null);
  }

  // Al volver de Mercado Pago: se confirma el pago con el servidor
  async function verificarRetorno() {
    const q = new URLSearchParams(location.search);
    if (!q.has('pago')) return null;
    history.replaceState(null, '', location.pathname);
    if (!conServidor) return null;
    const r = await api('cuenta/verificar', { preapproval_id: q.get('preapproval_id') }).catch(() => null);
    if (r?.cuenta) cuenta = r.cuenta;
    if (cuenta?.plus) return `¡Bienvenido a ${cuenta.planNombre}! Ya podés ver sin publicidad.`;
    return q.get('pago') === 'cancelado' ? 'El pago no se completó. Seguís en el plan Gratis.' : 'Tu pago se está procesando. En unos minutos se activa el plan.';
  }

  return {
    cargar, verificarRetorno, pintarBienvenida, pintarPlanes, cancelar, salir,
    get actual() { return cuenta; },
    get planes() { return planes; },
  };
}
