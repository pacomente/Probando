// Servidor de "Mi IA": sirve la interfaz web y hace de puente con Ollama.
// Sin dependencias externas: solo módulos nativos de Node (>= 18).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga simple de .env (clave=valor) si existe
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const PORT = Number(process.env.PORT) || 3000;
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.MODEL || 'qwen2.5:3b';
const AI_NAME = process.env.AI_NAME || 'Nova';

// Personalidad e instrucciones de la IA: edita este texto para cambiar cómo se comporta
function systemPrompt() {
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `Eres ${AI_NAME}, un asistente de inteligencia artificial experto, útil y preciso. Hoy es ${hoy}.

Cómo respondes:
- Siempre en el idioma del usuario (por defecto en español), con un tono cercano y claro.
- Piensa paso a paso antes de responder preguntas difíciles, de lógica o de matemáticas, y muestra el razonamiento cuando ayude.
- Organiza las respuestas largas con títulos, listas y tablas en Markdown. Las respuestas cortas, directas.
- Si no estás seguro de un dato, dilo con honestidad en vez de inventarlo. Tus conocimientos tienen una fecha de corte.

Cuando te pidan crear una página web, una landing, un juego o cualquier cosa visual en HTML:
- Entrega UN solo archivo HTML completo en un bloque \`\`\`html, con el CSS dentro de <style> y el JavaScript dentro de <script>.
- Hazla bonita y moderna: buena tipografía, colores armoniosos, espaciado generoso y diseño adaptable a móvil.
- Usa contenido de ejemplo realista (nunca "Lorem ipsum") y no dejes partes sin terminar.
- Antes del código, explica en una o dos frases qué has hecho; después, sugiere mejoras posibles.
- Si te piden cambios sobre una página anterior, devuelve otra vez el archivo HTML completo ya modificado.

Cuando escribas código de otro tipo, usa bloques de código con el lenguaje indicado y explica lo importante.`;
}

// Parámetros del modelo: más contexto para que recuerde la conversación y quepan páginas web largas
const MODEL_OPTIONS = {
  num_ctx: Number(process.env.NUM_CTX) || 8192,
  temperature: 0.6,
};

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit = 5_000_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Petición demasiado grande');
  }
  return body ? JSON.parse(body) : {};
}

const ollamaDown = {
  error: `No se pudo conectar con Ollama en ${OLLAMA_URL}. ¿Está instalado y en marcha? (ejecuta "ollama serve")`,
};

// GET /api/config -> datos básicos para la interfaz
// GET /api/models -> modelos instalados en Ollama
async function handleModels(res) {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await r.json();
    sendJson(res, 200, { models: (data.models || []).map((m) => m.name), default: DEFAULT_MODEL });
  } catch {
    sendJson(res, 502, ollamaDown);
  }
}

// POST /api/chat { model, messages: [{role, content}] } -> texto en streaming
async function handleChat(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string')
        .map(({ role, content }) => ({ role, content }))
        .slice(-40) // limita el historial que se envía al modelo
    : [];
  if (messages.length === 0) return sendJson(res, 400, { error: 'No hay mensajes' });

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // si el usuario pulsa "Detener" o cierra la pestaña

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: payload.model || DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt() }, ...messages],
        options: MODEL_OPTIONS,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch {
    return sendJson(res, 502, ollamaDown);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    let error = `Ollama respondió ${upstream.status}`;
    try {
      error = JSON.parse(detail).error || error;
    } catch {}
    return sendJson(res, 502, { error });
  }

  // Ollama devuelve NDJSON (un JSON por línea); reenviamos solo el texto
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        if (data.error) res.write(`\n[Error: ${data.error}]`);
        if (data.message?.content) res.write(data.message.content);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Error en el streaming:', err.message);
  }
  res.end();
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Prohibido' });
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'No encontrado' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/config') {
      return sendJson(res, 200, { name: AI_NAME, model: DEFAULT_MODEL });
    }
    if (req.method === 'GET' && req.url === '/api/models') return await handleModels(res);
    if (req.method === 'POST' && req.url === '/api/chat') return await handleChat(req, res);
    if (req.method === 'GET') return await serveStatic(req, res);
    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`🤖 ${AI_NAME} lista en http://localhost:${PORT}`);
  console.log(`   Ollama: ${OLLAMA_URL} · modelo por defecto: ${DEFAULT_MODEL}`);
});
