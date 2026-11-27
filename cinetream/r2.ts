// Videos en Cloudflare R2 (almacenamiento compatible con S3).
// Se configura con variables de entorno (en Render: Environment):
//   R2_CUENTA         ID de la cuenta de Cloudflare
//   R2_CLAVE_ID       Access Key ID del token de R2
//   R2_CLAVE_SECRETA  Secret Access Key del token de R2
//   R2_BUCKET         nombre del bucket
//   R2_ENDPOINT       (opcional) otra dirección compatible con S3; por defecto https://<cuenta>.r2.cloudflarestorage.com
// El bucket no necesita ser público: cada reproducción recibe un link firmado que vence solo.
import crypto from 'node:crypto';

const cfg = () => ({
  cuenta: process.env.R2_CUENTA || '',
  id: process.env.R2_CLAVE_ID || '',
  secreta: process.env.R2_CLAVE_SECRETA || '',
  bucket: process.env.R2_BUCKET || '',
  endpoint: (process.env.R2_ENDPOINT || (process.env.R2_CUENTA ? `https://${process.env.R2_CUENTA}.r2.cloudflarestorage.com` : '')).replace(/\/$/, ''),
  region: process.env.R2_REGION || 'auto',
});

export const r2Configurado = () => { const c = cfg(); return Boolean(c.endpoint && c.id && c.secreta && c.bucket); };
export const r2Bucket = () => cfg().bucket;

// ---------- Firma AWS Signature V4 ----------
const sha256 = (datos: string | Buffer) => crypto.createHash('sha256').update(datos).digest('hex');
const hmac = (clave: string | Buffer, texto: string) => crypto.createHmac('sha256', clave).update(texto).digest();
const codificar = (t: string) => encodeURIComponent(t).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const rutaCodificada = (ruta: string) => ruta.split('/').map(codificar).join('/');
const consulta = (params: Record<string, string>) => Object.keys(params).sort().map((k) => `${codificar(k)}=${codificar(String(params[k]))}`).join('&');
const fechas = (ahora = new Date()) => {
  const amz = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amz, dia: amz.slice(0, 8) };
};
function claveFirma(secreta: string, dia: string, region: string, servicio = 's3') {
  return hmac(hmac(hmac(hmac(`AWS4${secreta}`, dia), region), servicio), 'aws4_request');
}

/** Firma un pedido (cabecera Authorization). Exportada para probarla con los ejemplos oficiales de AWS. */
interface Credenciales { id: string; secreta: string; region: string; ahora?: Date }
type Params = Record<string, string>;
export function firmarPedido({ metodo, host, ruta, params = {}, cabeceras = {}, hashCuerpo, id, secreta, region, ahora }:
  Credenciales & { metodo: string; host: string; ruta: string; params?: Params; cabeceras?: Record<string, string>; hashCuerpo: string }): Record<string, string> {
  const { amz, dia } = fechas(ahora);
  const todas = { ...cabeceras, host, 'x-amz-date': amz, 'x-amz-content-sha256': hashCuerpo };
  const nombres = Object.keys(todas).map((k) => k.toLowerCase()).sort();
  const valores = Object.fromEntries(Object.entries(todas).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const firmadas = nombres.join(';');
  const canonico = [metodo, rutaCodificada(ruta), consulta(params), nombres.map((k) => `${k}:${valores[k]}\n`).join(''), firmadas, hashCuerpo].join('\n');
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', amz, alcance, sha256(canonico)].join('\n');
  const firma = hmac(claveFirma(secreta, dia, region), aFirmar).toString('hex');
  return {
    ...todas,
    authorization: `AWS4-HMAC-SHA256 Credential=${id}/${alcance}, SignedHeaders=${firmadas}, Signature=${firma}`,
  };
}

/** URL prefirmada (el permiso va en la dirección): sirve para reproducir o para subir desde el navegador. */
export function urlFirmada({ metodo = 'GET', host, ruta, segundos = 3600, id, secreta, region, ahora, base, params = {} }:
  Credenciales & { metodo?: string; host: string; ruta: string; segundos?: number; base?: string; params?: Params }): string {
  const { amz, dia } = fechas(ahora);
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const q = {
    ...params,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${id}/${alcance}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(segundos),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonico = [metodo, rutaCodificada(ruta), consulta(q), `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aFirmar = ['AWS4-HMAC-SHA256', amz, alcance, sha256(canonico)].join('\n');
  const firma = hmac(claveFirma(secreta, dia, region), aFirmar).toString('hex');
  return `${base || `https://${host}`}${rutaCodificada(ruta)}?${consulta(q)}&X-Amz-Signature=${firma}`;
}

// ---------- Pedidos al bucket ----------
function destino(clave = '') {
  const c = cfg();
  const u = new URL(c.endpoint);
  const ruta = `${u.pathname.replace(/\/$/, '')}/${c.bucket}${clave ? `/${clave}` : ''}`;
  return { c, host: u.host, base: `${u.protocol}//${u.host}`, ruta };
}

async function pedir(metodo: string, clave: string, { params = {}, cuerpo, cabeceras = {}, senal }:
  { params?: Params; cuerpo?: string | Buffer; cabeceras?: Record<string, string>; senal?: AbortSignal } = {}): Promise<Response> {
  const { c, host, base, ruta } = destino(clave);
  const datos = cuerpo === undefined ? Buffer.alloc(0) : Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo);
  const firmadas = firmarPedido({ metodo, host, ruta, params, cabeceras, hashCuerpo: sha256(datos), id: c.id, secreta: c.secreta, region: c.region });
  delete firmadas.host;
  const q = consulta(params);
  const r = await fetch(`${base}${rutaCodificada(ruta)}${q ? `?${q}` : ''}`, {
    method: metodo, headers: firmadas, body: datos.length ? datos : undefined, signal: senal || AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => '');
    const codigo = texto.match(/<Code>([^<]+)<\/Code>/)?.[1] || `HTTP ${r.status}`;
    throw new ErrorR2(codigo, r.status);
  }
  return r;
}

export class ErrorR2 extends Error {
  codigo: string;
  estado: number;
  constructor(codigo: string, estado: number) {
    const MENSAJES: Record<string, string> = {
      InvalidAccessKeyId: 'La clave de R2 (R2_CLAVE_ID) no es válida.',
      SignatureDoesNotMatch: 'La clave secreta de R2 (R2_CLAVE_SECRETA) no coincide.',
      NoSuchBucket: 'No existe ese bucket en R2 (revisá R2_BUCKET).',
      AccessDenied: 'El token de R2 no tiene permiso para este bucket.',
    };
    super(MENSAJES[codigo] || `Cloudflare R2 respondió con un error (${codigo}).`);
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** Link firmado para ver un video (vence solo). */
export function linkReproduccion(clave: string, segundos = 6 * 3600): string {
  const { c, host, base, ruta } = destino(clave);
  return urlFirmada({ metodo: 'GET', host, base, ruta, segundos, id: c.id, secreta: c.secreta, region: c.region });
}

/** Link firmado para que el navegador del administrador suba el archivo directo a R2. */
export function linkSubida(clave: string, segundos = 6 * 3600): string {
  const { c, host, base, ruta } = destino(clave);
  return urlFirmada({ metodo: 'PUT', host, base, ruta, segundos, id: c.id, secreta: c.secreta, region: c.region });
}

export async function borrarObjeto(clave: string) {
  await pedir('DELETE', clave).catch((e) => { if (e.estado !== 404) throw e; });
}

export async function infoObjeto(clave: string): Promise<{ tamano: number; tipo: string } | null> {
  try {
    const r = await pedir('HEAD', clave);
    return { tamano: Number(r.headers.get('content-length')) || 0, tipo: r.headers.get('content-type') || '' };
  } catch (e) {
    if (e.estado === 404) return null;
    throw e;
  }
}

/** Cuánto ocupan los videos en el bucket (recorre la lista de objetos). */
export async function espacioUsado() {
  let total = 0;
  let cantidad = 0;
  let token: string | null | undefined = null;
  do {
    const params = { 'list-type': '2', 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const xml = await (await pedir('GET', '', { params })).text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) { total += Number(m[1]); cantidad++; }
    token = xml.match(/<IsTruncated>true<\/IsTruncated>/) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : null;
  } while (token);
  return { total, cantidad };
}

/** Permite que el administrador suba directo desde el navegador (regla CORS del bucket). */
export async function permitirSubidasDesde(origen: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration><CORSRule><AllowedOrigin>${origen.replace(/[<>&"]/g, '')}</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
  const md5 = crypto.createHash('md5').update(xml).digest('base64');
  await pedir('PUT', '', { params: { cors: '' }, cuerpo: xml, cabeceras: { 'content-type': 'application/xml', 'content-md5': md5 } });
}

/** Prueba la conexión: escribe, lee y borra un archivo chiquito. */
export async function probarConexion() {
  const clave = `cinetream-prueba-${crypto.randomBytes(4).toString('hex')}.txt`;
  await pedir('PUT', clave, { cuerpo: 'ok', cabeceras: { 'content-type': 'text/plain' } });
  const r = await fetch(linkReproduccion(clave, 60));
  const ok = r.ok && (await r.text()) === 'ok';
  await borrarObjeto(clave);
  if (!ok) throw new Error('Se pudo escribir en R2 pero no leer con un link firmado.');
}

/**
 * Sube un video a R2 desde un flujo de datos (un link o un archivo del disco), en partes de 16 MB.
 * Sirve para películas de muchos GB sin cargarlas enteras en memoria.
 */
export async function subirFlujo(clave: string, flujo: AsyncIterable<Buffer>, { tipo = 'video/mp4', alProgreso, senal }:
  { tipo?: string; alProgreso?: (bytes: number) => void; senal?: AbortSignal } = {}): Promise<number> {
  const inicio = await (await pedir('POST', clave, { params: { uploads: '' }, cabeceras: { 'content-type': tipo }, senal })).text();
  const subida = inicio.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!subida) throw new Error('R2 no aceptó empezar la subida.');
  const partes: { numero: number; etag: string | null }[] = [];
  let buffer: Buffer[] = [];
  let enBuffer = 0;
  let total = 0;
  const TAM = 16 * 1024 ** 2;
  const mandar = async () => {
    const datos = Buffer.concat(buffer, enBuffer);
    buffer = [];
    enBuffer = 0;
    const numero = partes.length + 1;
    const r = await pedir('PUT', clave, { params: { partNumber: String(numero), uploadId: subida }, cuerpo: datos, senal });
    partes.push({ numero, etag: r.headers.get('etag') });
  };
  try {
    for await (const trozo of flujo) {
      if (senal?.aborted) throw new Error('Se canceló la subida.');
      buffer.push(trozo);
      enBuffer += trozo.length;
      total += trozo.length;
      alProgreso?.(total);
      if (enBuffer >= TAM) await mandar();
    }
    if (enBuffer || !partes.length) await mandar();
    const xml = `<CompleteMultipartUpload>${partes.map((p) => `<Part><PartNumber>${p.numero}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
    await pedir('POST', clave, { params: { uploadId: subida }, cuerpo: xml, cabeceras: { 'content-type': 'application/xml' }, senal });
    return total;
  } catch (e) {
    await pedir('DELETE', clave, { params: { uploadId: subida } }).catch(() => {});
    throw e;
  }
}
