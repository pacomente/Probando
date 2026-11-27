// Utilidades HTTP compartidas por las rutas del público y del administrador.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Cuerpo } from './tipos.ts';

export type Pedido = IncomingMessage;
export type Respuesta = ServerResponse;

export function json(res: Respuesta, estado: number, datos: unknown, cabeceras: Record<string, string> = {}): void {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabeceras });
  res.end(JSON.stringify(datos));
}

/** Lee el cuerpo JSON de un pedido, con un tope de tamaño. Cada ruta valida los campos que usa. */
export function leerJSON(req: Pedido, limite = 20000): Promise<Cuerpo> {
  return new Promise((resolver, rechazar) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on('data', (d: Buffer) => { total += d.length; if (total > limite) { rechazar(new Error('Datos demasiado grandes')); req.destroy(); } else partes.push(d); });
    req.on('end', () => {
      try {
        const valor: unknown = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
        if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error();
        resolver(valor as Cuerpo);
      } catch { rechazar(new Error('Datos inválidos')); }
    });
    req.on('error', rechazar);
  });
}

/** Lee el cuerpo completo como binario (portadas, piezas de publicidad, respaldos). Devuelve null si pasa el tope. */
export async function leerBinario(req: Pedido, maximo: number): Promise<Buffer | null> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > maximo) return null;
    partes.push(parte as Buffer);
  }
  return Buffer.concat(partes);
}
