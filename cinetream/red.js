// Quién hace el pedido. En Render (o detrás de otro proxy) todos los pedidos llegan desde el proxy, así que la IP real
// del visitante viene en X-Forwarded-For. Se toma la última, la que agregó el proxy: las anteriores las puede inventar el cliente.
const DETRAS_DE_PROXY = process.env.RENDER === 'true' || process.env.DETRAS_DE_PROXY === '1';
const LOCALES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

export function ipCliente(req) {
  const reenviada = req.headers['x-forwarded-for'];
  if (DETRAS_DE_PROXY && reenviada) return String(reenviada).split(',').pop().trim();
  return req.socket.remoteAddress || '';
}

// Pedido hecho desde la misma PC donde corre Cinetream (nunca es así en Render)
export const esLocal = (req) => !DETRAS_DE_PROXY && LOCALES.includes(req.socket.remoteAddress);
