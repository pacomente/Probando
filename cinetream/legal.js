// Datos legales del titular (aparecen en Términos, Privacidad, Botón de baja y Botón de arrepentimiento)
// y trámites que hacen los usuarios (bajas, arrepentimientos, eliminación de cuenta).
import crypto from 'node:crypto';
import { coleccion, documento } from './base.js';

const docLegal = documento('legal', { inicial: () => ({}) });
const tablaTramites = coleccion('tramites', { indices: [{ campo: 'cuentaId' }, { campo: 'estado' }] });

// ---------- Datos del titular ----------
const CAMPOS = ['titular', 'cuit', 'domicilio', 'correo', 'telefono', 'jurisdiccion'];
let legal = { titular: '', cuit: '', domicilio: '', correo: '', telefono: '', jurisdiccion: 'Ciudad Autónoma de Buenos Aires', actualizado: null, ...docLegal.leer() };
export const datosLegales = () => legal;
export const legalCompleto = () => Boolean(legal.titular && legal.cuit && legal.correo);
export async function guardarLegales(nuevos) {
  for (const c of CAMPOS) if (nuevos[c] !== undefined) legal[c] = String(nuevos[c]).trim().slice(0, 200);
  legal.actualizado = Date.now();
  docLegal.guardar(legal);
  return legal;
}

// ---------- Trámites ----------
let tramites = [...tablaTramites.todos()];
const guardarTramites = () => { try { tablaTramites.guardar(tramites); } catch (e) { console.error('No se pudieron guardar los trámites:', e.message); } };
const PREFIJOS = { baja: 'B', arrepentimiento: 'A', eliminacion: 'E' };
export function registrarTramite(tipo, cuenta, detalle = {}) {
  const codigo = `${PREFIJOS[tipo] || 'T'}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const t = {
    id: codigo, codigo,
    tipo, email: cuenta.email, cuentaId: cuenta.id, fecha: Date.now(), estado: tipo === 'baja' ? 'resuelto' : 'pendiente', ...detalle,
  };
  tramites.unshift(t);
  guardarTramites();
  return t;
}
export const listaTramites = () => tramites;
export async function resolverTramite(codigo) {
  const t = tramites.find((x) => x.codigo === codigo);
  if (!t) return null;
  t.estado = 'resuelto';
  t.resuelto = Date.now();
  guardarTramites();
  return t;
}
