// Límite de pantallas: cuántos equipos de una misma cuenta pueden ver películas al mismo tiempo.
// Cada equipo que reproduce manda una señal cada 30 s; si deja de mandarla (se cerró, se cortó internet) deja de contar.
// Se guarda en memoria: si el servidor se reinicia, las pantallas vuelven a anotarse solas con la próxima señal.
import { planEfectivo, pantallasDe } from './cuentas.ts';
import type { Cuenta } from './tipos.ts';

interface Pantalla { equipo: string; titulo: string; desde: number; ultimo: number; cortada: boolean }

const VIVA = 75000;
const activas = new Map<string, Map<string, Pantalla>>(); // id de cuenta → equipos mirando

function deCuenta(cuenta: Cuenta): Map<string, Pantalla> {
  let mapa = activas.get(cuenta.id);
  if (!mapa) { mapa = new Map(); activas.set(cuenta.id, mapa); }
  for (const [d, p] of mapa) if (Date.now() - p.ultimo > VIVA) mapa.delete(d);
  return mapa;
}
const publica = (dispositivo: string, p: Pantalla) => ({ dispositivo, equipo: p.equipo, titulo: p.titulo, desde: p.desde });
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export function pantallasActivas(cuenta: Cuenta) {
  return [...deCuenta(cuenta)].filter(([, p]) => !p.cortada).map(([d, p]) => publica(d, p));
}

/** Pide permiso para empezar a ver en este equipo. */
export function empezar(cuenta: Cuenta, { dispositivo, equipo, titulo }: Record<string, unknown>) {
  const id = texto(dispositivo, 64);
  if (!id) return { ok: false, error: 'Falta el identificador del equipo.' };
  const limite = pantallasDe(planEfectivo(cuenta));
  const mapa = deCuenta(cuenta);
  const otras = [...mapa].filter(([d, p]) => d !== id && !p.cortada);
  if (otras.length >= limite) return { ok: false, limite, otras: otras.map(([d, p]) => publica(d, p)) };
  const antes = mapa.get(id);
  mapa.set(id, { equipo: texto(equipo, 40) || 'Equipo', titulo: texto(titulo, 120), desde: antes && !antes.cortada ? antes.desde : Date.now(), ultimo: Date.now(), cortada: false });
  return { ok: true, limite, enUso: otras.length + 1 };
}

/** Señal de vida mientras se ve una película. Si el equipo fue cortado o ya no hay lugar, tiene que dejar de reproducir. */
export function latido(cuenta: Cuenta, dispositivo: unknown): { seguir: boolean; motivo?: string; volver?: boolean } {
  const mapa = deCuenta(cuenta);
  const p = mapa.get(String(dispositivo));
  if (p?.cortada) { mapa.delete(String(dispositivo)); return { seguir: false, motivo: 'cortada' }; }
  if (p) { p.ultimo = Date.now(); return { seguir: true }; }
  // Se había vencido (por ejemplo, se cortó internet un rato): vuelve si todavía hay lugar
  const otras = [...mapa].filter(([, x]) => !x.cortada).length;
  return otras < pantallasDe(planEfectivo(cuenta)) ? { seguir: true, volver: true } : { seguir: false, motivo: 'limite' };
}

export function terminar(cuenta: Cuenta, dispositivo: unknown) { deCuenta(cuenta).delete(String(dispositivo)); }

/** Corta la reproducción en otro equipo de la misma cuenta (deja de contar enseguida). */
export function cortar(cuenta: Cuenta, dispositivo: unknown): boolean {
  const p = deCuenta(cuenta).get(String(dispositivo));
  if (!p) return false;
  p.cortada = true;
  return true;
}

/** Para el administrador: cuántas pantallas están viendo ahora. */
export function resumenPantallas() {
  let pantallas = 0;
  const porCuenta: Record<string, number> = {};
  for (const [cuentaId, mapa] of activas) {
    const vivas = [...mapa.values()].filter((p) => !p.cortada && Date.now() - p.ultimo <= VIVA).length;
    if (vivas) { pantallas += vivas; porCuenta[cuentaId] = vivas; }
  }
  return { pantallas, cuentas: Object.keys(porCuenta).length, porCuenta };
}
