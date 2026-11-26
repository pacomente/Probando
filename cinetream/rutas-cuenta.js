// Rutas para el público: cuenta, planes, pagos, ingreso en la tele con un código y publicidad.
import {
  activarPlan, buscarCuenta, buscarPlan, cancelarPlan, cookieSesion, crearCuenta, crearToken, cuentaDe, datosPublicos,
  estadoCodigo, guardarCuentas, listaPlanes, nuevoCodigoTV, planEfectivo, verificarCuenta, vincularCodigo,
} from './cuentas.js';
import { cancelarEnMercadoPago, consultarSuscripcion, crearSuscripcion, firmaValida, modoPrueba } from './pagos.js';
import { campanasVigentes, registrarEvento } from './publicidad.js';

const DIA = 86400000;
const fallos = new Map(); // ip → { n, desde }: freno a quien prueba contraseñas

function json(res, estado, datos, cabeceras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabeceras });
  res.end(JSON.stringify(datos));
}
function leerJSON(req, limite = 20000) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    req.on('data', (d) => { total += d.length; if (total > limite) { rechazar(new Error('Datos demasiado grandes')); req.destroy(); } else partes.push(d); });
    req.on('end', () => { try { resolver(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { rechazar(new Error('Datos inválidos')); } });
    req.on('error', rechazar);
  });
}
const ip = (req) => req.socket.remoteAddress || '';
const bloqueado = (req) => { const f = fallos.get(ip(req)); return f && Date.now() - f.desde < 15 * 60000 && f.n >= 10; };
const fallo = (req) => { const f = fallos.get(ip(req)); if (!f || Date.now() - f.desde > 15 * 60000) fallos.set(ip(req), { n: 1, desde: Date.now() }); else f.n++; };
const base = (req) => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

// Pago confirmado por Mercado Pago: se activa el plan hasta el próximo cobro (con 3 días de gracia)
function aplicarSuscripcion(s) {
  const cuenta = buscarCuenta(s.cuentaId);
  if (!cuenta || !buscarPlan(s.planId)) return null;
  if (s.autorizada) {
    activarPlan(cuenta, s.planId, { vence: s.proximoPago ? s.proximoPago + 3 * DIA : undefined, pago: { proveedor: 'mercadopago', id: s.id, estado: 'autorizada', plan: s.planId } });
  } else if (s.cancelada && cuenta.pago?.id === s.id) {
    cancelarPlan(cuenta);
  }
  return cuenta;
}

export async function rutasCuenta(req, res, url) {
  const ruta = url.pathname;
  try {
    if (ruta === '/api/planes') {
      return json(res, 200, { planes: listaPlanes().filter((p) => !p.oculto), modoPrueba: modoPrueba() });
    }

    // ---------- Cuenta ----------
    if (ruta === '/api/cuenta/yo') {
      const cuenta = cuentaDe(req);
      return json(res, 200, { cuenta: cuenta ? datosPublicos(cuenta) : null, modoPrueba: modoPrueba() });
    }
    if (ruta === '/api/cuenta/registrar' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const { email, clave, nombre } = await leerJSON(req);
      const cuenta = crearCuenta(email, clave, nombre);
      return json(res, 200, { cuenta: datosPublicos(cuenta) }, { 'Set-Cookie': cookieSesion(req, crearToken(cuenta)) });
    }
    if (ruta === '/api/cuenta/entrar' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const { email, clave } = await leerJSON(req);
      const cuenta = verificarCuenta(email, clave);
      if (!cuenta) { fallo(req); return json(res, 401, { error: 'El correo o la contraseña no coinciden.' }); }
      return json(res, 200, { cuenta: datosPublicos(cuenta) }, { 'Set-Cookie': cookieSesion(req, crearToken(cuenta)) });
    }
    if (ruta === '/api/cuenta/salir' && req.method === 'POST') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookieSesion(req, '', 0) });
    }

    // ---------- Ingresar en la tele con un código ----------
    if (ruta === '/api/cuenta/tv/codigo') {
      return json(res, 200, { codigo: nuevoCodigoTV(), url: `${base(req)}/activar.html` });
    }
    if (ruta === '/api/cuenta/tv/estado') {
      const r = estadoCodigo(url.searchParams.get('codigo'));
      if (r.estado !== 'listo' || !r.cuenta) return json(res, 200, { estado: r.estado });
      return json(res, 200, { estado: 'listo', cuenta: datosPublicos(r.cuenta) }, { 'Set-Cookie': cookieSesion(req, crearToken(r.cuenta)) });
    }

    // ---------- Publicidad ----------
    if (ruta === '/api/anuncios') {
      const plan = planEfectivo(cuentaDe(req));
      return json(res, 200, { campanas: plan.anuncios ? campanasVigentes() : [] });
    }
    if (ruta === '/api/anuncios/evento' && req.method === 'POST') {
      const { id, tipo } = await leerJSON(req, 2000);
      registrarEvento(String(id), String(tipo));
      return json(res, 200, { ok: true });
    }

    // ---------- Aviso de Mercado Pago ----------
    if (ruta === '/api/pagos/mercadopago' && req.method === 'POST') {
      const cuerpo = await leerJSON(req).catch(() => ({}));
      const tipo = cuerpo.type || url.searchParams.get('type') || url.searchParams.get('topic');
      const id = cuerpo.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
      if (!firmaValida(req, id)) return json(res, 401, { error: 'firma inválida' });
      if (id && /preapproval/.test(String(tipo)) && !modoPrueba()) aplicarSuscripcion(await consultarSuscripcion(id));
      return json(res, 200, { ok: true }); // Mercado Pago espera un 200 siempre que se recibió el aviso
    }

    // Todo lo que sigue requiere haber ingresado
    const cuenta = cuentaDe(req);
    if (!cuenta) return json(res, 401, { error: 'Ingresá a tu cuenta.' });

    if (ruta === '/api/cuenta/tv/vincular' && req.method === 'POST') {
      const { codigo } = await leerJSON(req);
      if (!vincularCodigo(codigo, cuenta)) return json(res, 400, { error: 'Ese código no existe o ya venció. Fijate el que muestra la tele.' });
      return json(res, 200, { ok: true });
    }
    if (ruta === '/api/cuenta/suscribir' && req.method === 'POST') {
      const { plan: planId } = await leerJSON(req);
      const plan = buscarPlan(planId);
      if (!plan || plan.oculto) return json(res, 400, { error: 'Ese plan no está disponible.' });
      if (plan.id === 'gratis') {
        await cancelarEnMercadoPago(cuenta.pago?.id).catch(() => {});
        cancelarPlan(cuenta);
        return json(res, 200, { cuenta: datosPublicos(cuenta) });
      }
      const pago = await crearSuscripcion({ cuenta, plan, urlRetorno: `${base(req)}/?pago=volver` });
      cuenta.pago = { proveedor: pago.prueba ? 'prueba' : 'mercadopago', id: pago.id || null, referencia: pago.referencia, estado: 'pendiente', plan: plan.id };
      guardarCuentas();
      return json(res, 200, { url: pago.url, prueba: Boolean(pago.prueba) });
    }
    if (ruta === '/api/cuenta/verificar' && req.method === 'POST') {
      // Al volver de Mercado Pago: se consulta el estado real antes de activar nada
      const id = (await leerJSON(req)).preapproval_id || cuenta.pago?.id;
      if (id && !modoPrueba()) {
        const s = await consultarSuscripcion(id);
        if (s.cuentaId === cuenta.id) aplicarSuscripcion(s);
      }
      return json(res, 200, { cuenta: datosPublicos(cuenta) });
    }
    if (ruta === '/api/pagos/prueba' && req.method === 'POST') {
      // Solo en modo prueba: simula que Mercado Pago aprobó el pago
      if (!modoPrueba()) return json(res, 403, { error: 'Los pagos de prueba están desactivados: Cinetream cobra con Mercado Pago.' });
      const { ref } = await leerJSON(req);
      const [cuentaId, planId] = String(ref || '').split(':');
      if (cuentaId !== cuenta.id || cuenta.pago?.referencia !== ref) return json(res, 400, { error: 'Ese pago no corresponde a tu cuenta.' });
      activarPlan(cuenta, planId, { pago: { estado: 'autorizada' } });
      return json(res, 200, { cuenta: datosPublicos(cuenta) });
    }
    if (ruta === '/api/cuenta/cancelar' && req.method === 'POST') {
      await cancelarEnMercadoPago(cuenta.pago?.id).catch(() => {});
      cancelarPlan(cuenta);
      return json(res, 200, { cuenta: datosPublicos(cuenta) });
    }
    return json(res, 404, { error: 'No existe.' });
  } catch (e) {
    return json(res, 400, { error: e.message || 'Error' });
  }
}
