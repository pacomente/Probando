// Copias de seguridad de la base de datos: una por día (se guardan las últimas 14) y cuando el administrador la pide.
// Quedan en datos/respaldos/. Para restaurar, el administrador sube una copia y Cinetream la aplica al reiniciar.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ARCHIVO_BASE, CARPETA_DATOS, copiarBase } from './base.ts';

export const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, 'respaldos');
mkdirSync(CARPETA_RESPALDOS, { recursive: true });
const NOMBRE = /^cinetream-\d{4}-\d{2}-\d{2}-\d{4}(-manual)?\.db$/;
const GUARDAR = 14;

export function listaRespaldos() {
  return readdirSync(CARPETA_RESPALDOS).filter((n) => NOMBRE.test(n)).map((nombre) => {
    const s = statSync(path.join(CARPETA_RESPALDOS, nombre));
    return { nombre, tamano: s.size, fecha: s.mtimeMs, manual: nombre.includes('-manual') };
  }).sort((a, b) => b.fecha - a.fecha);
}

export function hacerRespaldo({ manual = false } = {}) {
  const ahora = new Date();
  const sello = ahora.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const nombre = `cinetream-${sello}${manual ? '-manual' : ''}.db`;
  const destino = path.join(CARPETA_RESPALDOS, nombre);
  if (existsSync(destino)) rmSync(destino);
  copiarBase(destino);
  // Se borran los automáticos más viejos (los manuales quedan hasta que el administrador los borre)
  listaRespaldos().filter((r) => !r.manual).slice(GUARDAR).forEach((r) => rmSync(path.join(CARPETA_RESPALDOS, r.nombre)));
  return listaRespaldos().find((r) => r.nombre === nombre);
}

export const rutaRespaldo = (nombre) => (NOMBRE.test(nombre) && existsSync(path.join(CARPETA_RESPALDOS, nombre)) ? path.join(CARPETA_RESPALDOS, nombre) : null);
export function borrarRespaldo(nombre) { const r = rutaRespaldo(nombre); if (r) rmSync(r); return Boolean(r); }

/** Deja un respaldo listo para aplicarse en el próximo arranque (se valida que sea una base de Cinetream). */
export async function prepararRestauracion(datos) {
  if (datos.length < 100 || datos.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') throw new Error('Ese archivo no es una copia de seguridad de Cinetream (.db).');
  if (!datos.includes(Buffer.from('CREATE TABLE cuentas')) || !datos.includes(Buffer.from('CREATE TABLE peliculas'))) {
    throw new Error('Ese archivo es una base de datos, pero no de Cinetream.');
  }
  await writeFile(`${ARCHIVO_BASE}.restaurar`, datos, { mode: 0o600 });
}
export const restauracionPendiente = () => existsSync(`${ARCHIVO_BASE}.restaurar`);

// Automático: al arrancar y cada 6 horas se fija si pasó un día desde el último respaldo
function revisar() {
  const ultimo = listaRespaldos().find((r) => !r.manual);
  if (!ultimo || Date.now() - ultimo.fecha > 24 * 3600000) {
    try { hacerRespaldo(); } catch (e) { console.error('No se pudo hacer la copia de seguridad:', e.message); }
  }
}
export function programarRespaldos() {
  setTimeout(revisar, 5000).unref();
  setInterval(revisar, 6 * 3600000).unref();
}
export const leerRespaldo = (ruta) => readFileSync(ruta);
