// Rutas para el público: cuenta, planes, pagos, ingreso en la tele con un código y publicidad.
import {
  activarPlan, buscarCuenta, buscarPorCorreo, crearRestablecimiento, eliminarCuenta, restablecerClave, buscarPlan, cancelarPlan, cookieSesion, crearCuenta, crearToken, cuentaDe, datosPublicos,
  estadoCodigo, guardarCuentas, listaPlanes, nuevoCodigoTV, planEfectivo, verificarCuenta, vincularCodigo,
} from './cuentas.ts';
import { cancelarEnMercadoPago, consultarSuscripcion, crearSuscripcion, firmaValida, modoPrueba } from './pagos.ts';
import { campanasVigentes, registrarEvento } from './publicidad.ts';
import { direccionPublica, ipCliente } from './red.ts';
import { json, leerJSON, type Pedido, type Respuesta } from './http.ts';
import type { EstadoSuscripcion } from './pagos.ts';
import { cortar, empezar, latido, pantallasActivas, terminar } from './pantallas.ts';
import { correoConfigurado, correoRestablecer, enviarCorreo } from './correo.ts';
import { datosLegales, listaTramites, registrarTramite } from './legal.ts';

const DIA = 86400000;
const fallos = new Map<string, { n: number; desde: number }>(); // ip → intentos: freno a quien prueba contraseñas

const ip = ipCliente;
const bloqueado = (req: Pedido) => { const f = fallos.get(ip(req)); return Boolean(f && Date.now() - f.desde < 15 * 60000 && f.n >= 10); };
const fallo = (req: Pedido) => { const f = fallos.get(ip(req)); if (!f || Date.now() - f.desde > 15 * 60000) fallos.set(ip(req), { n: 1, desde: Date.now() }); else f.n++; };
// Dirección pública de Cinetream (PUBLIC_BASE_URL o la que da Render); si no, la del pedido
const base = (req: Pedido) => direccionPublica(req) || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

// Pago confirmado por Mercado Pago: se activa el plan hasta el próximo cobro (con 3 días de gracia)
function aplicarSuscripcion(s: EstadoSuscripcion) {
  const cuenta = buscarCuenta(s.cuentaId);
  if (!cuenta || !buscarPlan(s.planId)) return null;
  if (s.autorizada) {
    activarPlan(cuenta, s.planId, { vence: s.proximoPago ? s.proximoPago + 3 * DIA : undefined, pago: { proveedor: 'mercadopago', id: s.id, estado: 'autorizada', plan: s.planId } });
  } else if (s.cancelada && cuenta.pago?.id === s.id) {
    cancelarPlan(cuenta);
  }
  return cuenta;
}

export async function rutasCuenta(req: Pedido, res: Respuesta, url: URL): Promise<void> {
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

    // ---------- Olvidé mi contraseña ----------
    if (ruta === '/api/cuenta/olvide' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      fallo(req); // cuenta como intento: frena a quien prueba correos
      const { email } = await leerJSON(req);
      const cuenta = buscarPorCorreo(String(email || ''));
      if (cuenta && correoConfigurado()) {
        const link = `${base(req)}/restablecer.html?token=${crearRestablecimiento(cuenta, 1)}`;
        const c = correoRestablecer({ nombre: cuenta.nombre, link });
        enviarCorreo({ para: cuenta.email, asunto: c.asunto, html: c.html, texto: c.texto }).catch((e) => console.error('No se pudo mandar el correo:', e.message));
      }
      // Misma respuesta exista o no la cuenta: así no se puede averiguar qué correos están registrados
      return json(res, 200, { ok: true, correo: correoConfigurado(), contacto: datosLegales().correo || null });
    }
    if (ruta === '/api/cuenta/restablecer' && req.method === 'POST') {
      if (bloqueado(req)) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const { token, clave } = await leerJSON(req);
      let cuenta;
      try { cuenta = restablecerClave(String(token || ''), clave); } catch (e) { fallo(req); throw e; }
      return json(res, 200, { cuenta: datosPublicos(cuenta) }, { 'Set-Cookie': cookieSesion(req, crearToken(cuenta)) });
    }

    // ---------- Datos legales (Términos, Privacidad, Botón de baja) ----------
    if (ruta === '/api/legal') {
      const { actualizado, ...datos } = datosLegales();
      return json(res, 200, { ...datos, actualizado });
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
      const cuerpo = await leerJSON(req).catch((): Record<string, any> => ({}));
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
    // ---------- Pantallas a la vez ----------
    if (ruta === '/api/pantallas' && req.method === 'GET') return json(res, 200, { pantallas: pantallasActivas(cuenta) });
    if (ruta === '/api/pantallas/empezar' && req.method === 'POST') return json(res, 200, empezar(cuenta, await leerJSON(req, 2000)));
    if (ruta === '/api/pantallas/latido' && req.method === 'POST') return json(res, 200, latido(cuenta, (await leerJSON(req, 2000)).dispositivo));
    if (ruta === '/api/pantallas/terminar' && req.method === 'POST') { terminar(cuenta, (await leerJSON(req, 2000)).dispositivo); return json(res, 200, { ok: true }); }
    if (ruta === '/api/pantallas/cortar' && req.method === 'POST') return json(res, 200, { ok: cortar(cuenta, (await leerJSON(req, 2000)).dispositivo) });

    // ---------- Botón de baja, Botón de arrepentimiento y eliminar la cuenta ----------
    if (ruta === '/api/cuenta/tramites') return json(res, 200, { tramites: listaTramites().filter((t) => t.cuentaId === cuenta.id) });
    if (ruta === '/api/cuenta/baja' && req.method === 'POST') {
      // Res. 316/2018: la baja tiene que ser tan simple como el alta. Se deja de renovar y queda constancia con un código.
      const plan = planEfectivo(cuenta);
      if (plan.id === 'gratis') return json(res, 400, { error: 'No tenés una suscripción paga para dar de baja.' });
      await cancelarEnMercadoPago(cuenta.pago?.id).catch(() => {});
      cancelarPlan(cuenta);
      const t = registrarTramite('baja', cuenta, { plan: plan.nombre, hasta: cuenta.vence });
      return json(res, 200, { codigo: t.codigo, cuenta: datosPublicos(cuenta) });
    }
    if (ruta === '/api/cuenta/arrepentimiento' && req.method === 'POST') {
      // Res. 424/2020: dentro de los 10 días de contratado se puede revocar y pedir la devolución del dinero
      const plan = planEfectivo(cuenta);
      if (plan.id === 'gratis') return json(res, 400, { error: 'No tenés una suscripción paga contratada.' });
      const dias = cuenta.contratado ? (Date.now() - cuenta.contratado) / DIA : Infinity;
      if (dias > 10) return json(res, 400, { error: 'Pasaron más de 10 días desde que contrataste. Podés usar el Botón de baja: tu plan sigue hasta la fecha pagada y no se renueva.' });
      await cancelarEnMercadoPago(cuenta.pago?.id).catch(() => {});
      const t = registrarTramite('arrepentimiento', cuenta, { plan: plan.nombre, precio: plan.precio, contratado: cuenta.contratado, pago: cuenta.pago?.id || null });
      activarPlan(cuenta, 'gratis');
      return json(res, 200, { codigo: t.codigo, cuenta: datosPublicos(cuenta) });
    }
    if (ruta === '/api/cuenta/eliminar' && req.method === 'POST') {
      const { clave } = await leerJSON(req);
      if (!verificarCuenta(cuenta.email, clave)) { fallo(req); return json(res, 401, { error: 'La contraseña no es correcta.' }); }
      await cancelarEnMercadoPago(cuenta.pago?.id).catch(() => {});
      const t = registrarTramite('eliminacion', cuenta, { estado: 'resuelto' });
      eliminarCuenta(cuenta);
      return json(res, 200, { codigo: t.codigo }, { 'Set-Cookie': cookieSesion(req, '', 0) });
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
