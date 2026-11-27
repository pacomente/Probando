// Cobro de suscripciones con Mercado Pago (suscripciones con renovación automática: "preapproval").
// Con MP_ACCESS_TOKEN en el entorno se cobra de verdad; sin él, Cinetream funciona en MODO PRUEBA:
// el pago se simula, no se cobra nada y así se puede probar todo el circuito.
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Cuenta, Plan } from './tipos.ts';

const API = 'https://api.mercadopago.com';
const TOKEN = (process.env.MP_ACCESS_TOKEN || '').trim();
const SECRETO_WEBHOOK = (process.env.MP_WEBHOOK_SECRET || '').trim();
export const modoPrueba = () => !TOKEN;

// Respuestas de la API de Mercado Pago: se leen solo los campos que se usan
type RespuestaMP = Record<string, any>;
async function mp(ruta: string, opciones: RequestInit & { headers?: Record<string, string> } = {}): Promise<RespuestaMP> {
  const r = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opciones.headers },
  });
  const datos = (await r.json().catch(() => ({}))) as RespuestaMP;
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}: ${datos.message || 'error'}`);
  return datos;
}

// Crea la suscripción y devuelve la dirección donde la persona paga
export async function crearSuscripcion({ cuenta, plan, urlRetorno }: { cuenta: Cuenta; plan: Plan; urlRetorno: string }): Promise<{ url: string; referencia: string; id?: string; prueba?: boolean }> {
  const referencia = `${cuenta.id}:${plan.id}:${crypto.randomBytes(4).toString('hex')}`;
  if (modoPrueba()) return { url: `pago-prueba.html?ref=${encodeURIComponent(referencia)}`, referencia, prueba: true };
  const s = await mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Cinetream ${plan.nombre}`,
      external_reference: referencia,
      payer_email: cuenta.email,
      back_url: urlRetorno,
      status: 'pending',
      auto_recurring: {
        frequency: plan.periodo === 'año' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: plan.precio,
        currency_id: 'ARS',
      },
    }),
  });
  return { url: s.init_point, referencia, id: s.id };
}

// Consulta el estado real de una suscripción en Mercado Pago (nunca se confía en lo que llega del navegador)
export interface EstadoSuscripcion { id: string; cuentaId: string; planId: string; autorizada: boolean; cancelada: boolean; proximoPago: number | null }
export async function consultarSuscripcion(id: string): Promise<EstadoSuscripcion> {
  const s = await mp(`/preapproval/${encodeURIComponent(id)}`);
  const [cuentaId, planId] = String(s.external_reference || '').split(':');
  return {
    id: s.id,
    cuentaId,
    planId,
    autorizada: s.status === 'authorized',
    cancelada: ['cancelled', 'paused'].includes(s.status),
    proximoPago: s.next_payment_date ? Date.parse(s.next_payment_date) : null,
  };
}

export async function cancelarEnMercadoPago(id: string | null | undefined) {
  if (modoPrueba() || !id) return;
  await mp(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
}

// Verifica la firma del aviso de Mercado Pago (x-signature), si se configuró MP_WEBHOOK_SECRET.
// Igual, el estado siempre se vuelve a consultar a Mercado Pago antes de activar nada.
export function firmaValida(req: IncomingMessage, idDato: unknown): boolean {
  if (!SECRETO_WEBHOOK) return true;
  const partes = Object.fromEntries(String(req.headers['x-signature'] || '').split(',').map((p) => p.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const manifiesto = `id:${idDato};request-id:${req.headers['x-request-id'] || ''};ts:${partes.ts};`;
  const esperada = crypto.createHmac('sha256', SECRETO_WEBHOOK).update(manifiesto).digest('hex');
  return esperada.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(partes.v1));
}
