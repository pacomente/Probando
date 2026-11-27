// Envío de correos (por ahora, para recuperar la contraseña). Usa Resend (resend.com), que tiene un plan gratis.
// Variables: RESEND_API_KEY y CORREO_REMITENTE (por ejemplo «Cinetream <no-responder@tudominio.com>», con el dominio verificado en Resend).
// Sin configurar, Cinetream funciona igual: el administrador puede generar el link y mandarlo por WhatsApp.
export const correoConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE);

export async function enviarCorreo({ para, asunto, html, texto }: { para: string; asunto: string; html: string; texto: string }) {
  if (!correoConfigurado()) throw new Error('El envío de correos no está configurado.');
  const r = await fetch(process.env.RESEND_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.CORREO_REMITENTE, to: [para], subject: asunto, html, text: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`El servicio de correo respondió ${r.status}.`);
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

export function correoRestablecer({ nombre, link }: { nombre?: string; link: string }) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';
  return {
    asunto: 'Cinetream · Creá una contraseña nueva',
    texto: `${saludo}\n\nPediste crear una contraseña nueva para tu cuenta de Cinetream. Entrá a este link (vale por 1 hora):\n${link}\n\nSi no lo pediste vos, ignorá este correo: tu contraseña no cambia.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1c22">
      <h1 style="font-size:22px;letter-spacing:1px">CINE<span style="color:#d98a12">TREAM</span></h1>
      <p>${esc(saludo)}</p>
      <p>Pediste crear una contraseña nueva para tu cuenta de Cinetream. El link vale por <b>1 hora</b>.</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#ffb547;color:#1a1205;padding:12px 20px;border-radius:8px;font-weight:bold;text-decoration:none">Crear contraseña nueva</a></p>
      <p style="color:#666;font-size:13px">Si no lo pediste vos, ignorá este correo: tu contraseña no cambia.</p></div>`,
  };
}
