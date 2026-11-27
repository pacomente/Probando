// Cuentas de espectadores, planes de suscripción y vinculación de la tele con un código.
// Las sesiones van en una cookie firmada (HMAC): sobreviven a un reinicio del servidor sin guardar sesiones.
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CARPETA_DATOS } from './datos.js';

const ARCHIVO_CUENTAS = path.join(CARPETA_DATOS, 'cuentas.json');
const ARCHIVO_PLANES = path.join(CARPETA_DATOS, 'planes.json');
const ARCHIVO_SECRETO = path.join(CARPETA_DATOS, 'secreto');
const DIAS_SESION = 60;
const DIA = 86400000;

// ---------- Planes ----------
// Precios en pesos, de ejemplo: el administrador los cambia
const PLANES_INICIALES = [
  { id: 'gratis', nombre: 'Gratis', precio: 0, periodo: 'mes', anuncios: true, plus: false, descripcion: 'Todo el catálogo libre, con publicidad.' },
  { id: 'plus', nombre: 'Plus', precio: 2999, periodo: 'mes', anuncios: false, plus: true, descripcion: 'Sin publicidad y con los títulos Plus.' },
  { id: 'plus-anual', nombre: 'Plus anual', precio: 29990, periodo: 'año', anuncios: false, plus: true, descripcion: 'Lo mismo que Plus, pagando una vez al año: dos meses de regalo.' },
];
// Pantallas a la vez de cada plan (los planes guardados antes de existir este dato toman estos valores)
const PANTALLAS_INICIALES = { gratis: 1, plus: 2, 'plus-anual': 2 };
const limitarPantallas = (n) => Math.min(Math.max(Math.round(Number(n)) || 1, 1), 10);
export const pantallasDe = (plan) => limitarPantallas(plan?.pantallas ?? PANTALLAS_INICIALES[plan?.id] ?? 1);
let planes = (existsSync(ARCHIVO_PLANES) ? JSON.parse(readFileSync(ARCHIVO_PLANES, 'utf8')) : PLANES_INICIALES)
  .map((p) => ({ ...p, pantallas: pantallasDe(p) }));
export const listaPlanes = () => planes;
export const buscarPlan = (id) => planes.find((p) => p.id === id);
export async function guardarPlanes(nuevos) {
  // Solo se cambian nombre, precio, descripción, pantallas a la vez y si está a la venta; los demás beneficios son fijos
  planes = planes.map((p) => {
    const n = nuevos.find((x) => x.id === p.id) || {};
    return {
      ...p,
      nombre: String(n.nombre ?? p.nombre).trim().slice(0, 40) || p.nombre,
      precio: p.id === 'gratis' ? 0 : Math.max(0, Math.round(Number(n.precio ?? p.precio)) || 0),
      descripcion: String(n.descripcion ?? p.descripcion).trim().slice(0, 200),
      oculto: p.id === 'gratis' ? false : Boolean(n.oculto),
      pantallas: limitarPantallas(n.pantallas ?? p.pantallas),
    };
  });
  await writeFile(ARCHIVO_PLANES, JSON.stringify(planes, null, 2));
  return planes;
}

// ---------- Cuentas ----------
let cuentas = existsSync(ARCHIVO_CUENTAS) ? JSON.parse(readFileSync(ARCHIVO_CUENTAS, 'utf8')) : [];
let escribiendo = Promise.resolve();
export function guardarCuentas() {
  const copia = JSON.stringify(cuentas);
  escribiendo = escribiendo.then(async () => {
    await writeFile(`${ARCHIVO_CUENTAS}.tmp`, copia, { mode: 0o600 });
    await rename(`${ARCHIVO_CUENTAS}.tmp`, ARCHIVO_CUENTAS);
  }).catch((e) => console.error('No se pudieron guardar las cuentas:', e.message));
  return escribiendo;
}

export const todasLasCuentas = () => cuentas;
export const buscarCuenta = (id) => cuentas.find((c) => c.id === id);
const normalizarCorreo = (e) => String(e || '').trim().toLowerCase();
const correoValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;

export function crearCuenta(email, clave, nombre) {
  const correo = normalizarCorreo(email);
  if (!correoValido(correo)) throw new Error('Escribí un correo válido.');
  if (typeof clave !== 'string' || clave.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
  if (cuentas.some((c) => c.email === correo)) throw new Error('Ya hay una cuenta con ese correo. Ingresá con tu contraseña.');
  const sal = crypto.randomBytes(16).toString('hex');
  const cuenta = {
    id: crypto.randomBytes(8).toString('hex'), email: correo, nombre: String(nombre || '').trim().slice(0, 40),
    sal, hash: crypto.scryptSync(clave, sal, 64).toString('hex'),
    plan: 'gratis', estado: 'activa', vence: null, alta: Date.now(), pago: null,
  };
  cuentas.push(cuenta);
  guardarCuentas();
  return cuenta;
}

export function verificarCuenta(email, clave) {
  const cuenta = cuentas.find((c) => c.email === normalizarCorreo(email));
  // Se calcula igual aunque no exista, para no revelar qué correos tienen cuenta por el tiempo de respuesta
  const sal = cuenta?.sal || '00';
  const calculado = crypto.scryptSync(String(clave || ''), sal, 64);
  if (!cuenta) return null;
  return crypto.timingSafeEqual(calculado, Buffer.from(cuenta.hash, 'hex')) ? cuenta : null;
}

// El plan que vale ahora: un plan pago vencido o impago vuelve a Gratis
export function planEfectivo(cuenta) {
  const gratis = buscarPlan('gratis');
  if (!cuenta) return gratis;
  const plan = buscarPlan(cuenta.plan);
  if (!plan || plan.id === 'gratis') return gratis;
  const vigente = ['activa', 'cancelada'].includes(cuenta.estado) && cuenta.vence && cuenta.vence > Date.now();
  return vigente ? plan : gratis;
}

// Activa un plan pago hasta una fecha (lo llaman el pago aprobado o el administrador)
export function activarPlan(cuenta, planId, { vence, pago } = {}) {
  const plan = buscarPlan(planId);
  if (!plan) throw new Error('Ese plan no existe.');
  cuenta.plan = plan.id;
  cuenta.estado = 'activa';
  cuenta.vence = plan.id === 'gratis' ? null : (vence || Date.now() + (plan.periodo === 'año' ? 366 : 31) * DIA);
  if (pago) cuenta.pago = { ...cuenta.pago, ...pago };
  guardarCuentas();
  return cuenta;
}

// Cancelar: se deja de renovar, pero se sigue disfrutando hasta la fecha pagada
export function cancelarPlan(cuenta) {
  if (cuenta.plan !== 'gratis') cuenta.estado = 'cancelada';
  guardarCuentas();
  return cuenta;
}

export function datosPublicos(cuenta) {
  const plan = planEfectivo(cuenta);
  return {
    email: cuenta.email, nombre: cuenta.nombre, plan: plan.id, planNombre: plan.nombre,
    anuncios: plan.anuncios, plus: plan.plus, pantallas: pantallasDe(plan), estado: cuenta.estado, vence: plan.id === 'gratis' ? null : cuenta.vence,
    planContratado: cuenta.plan, pendiente: cuenta.pago?.estado === 'pendiente' ? cuenta.pago.plan : null,
  };
}

// ---------- Sesiones firmadas ----------
let secreto;
if (existsSync(ARCHIVO_SECRETO)) secreto = readFileSync(ARCHIVO_SECRETO, 'utf8').trim();
else { secreto = crypto.randomBytes(32).toString('hex'); writeFileSync(ARCHIVO_SECRETO, secreto, { mode: 0o600 }); }
const firmar = (texto) => crypto.createHmac('sha256', secreto).update(texto).digest('base64url');

export function crearToken(cuenta) {
  const cuerpo = Buffer.from(JSON.stringify({ c: cuenta.id, e: Date.now() + DIAS_SESION * DIA })).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function cuentaDeToken(token) {
  const [cuerpo, firma] = String(token || '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const { c, e } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return e > Date.now() ? buscarCuenta(c) : null;
  } catch { return null; }
}

export const cuentaDe = (req) => cuentaDeToken((req.headers.cookie || '').match(/cinetream_sesion=([^;]+)/)?.[1]);
export const cookieSesion = (req, token, segundos = DIAS_SESION * 86400) =>
  `cinetream_sesion=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${segundos}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

// ---------- Ingresar en la tele con un código ----------
// La tele muestra un código; desde el celular (con la cuenta abierta) se escribe en /activar.html
const codigos = new Map(); // código → { creado, cuentaId }
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (I, O, 0, 1)
export function nuevoCodigoTV() {
  for (const [k, v] of codigos) if (Date.now() - v.creado > 10 * 60000) codigos.delete(k);
  let codigo;
  do codigo = Array.from(crypto.randomBytes(6), (b) => LETRAS[b % LETRAS.length]).join('');
  while (codigos.has(codigo));
  codigos.set(codigo, { creado: Date.now(), cuentaId: null });
  return codigo;
}
export function vincularCodigo(codigo, cuenta) {
  const c = codigos.get(String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  if (!c || Date.now() - c.creado > 10 * 60000) return false;
  c.cuentaId = cuenta.id;
  return true;
}
// Devuelve la cuenta una sola vez: el código se descarta apenas la tele entra
export function estadoCodigo(codigo) {
  const c = codigos.get(codigo);
  if (!c || Date.now() - c.creado > 10 * 60000) return { estado: 'vencido' };
  if (!c.cuentaId) return { estado: 'esperando' };
  codigos.delete(codigo);
  return { estado: 'listo', cuenta: buscarCuenta(c.cuentaId) };
}
