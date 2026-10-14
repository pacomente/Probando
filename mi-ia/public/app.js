// Interfaz de chat de "Mi IA"
const $ = (sel) => document.querySelector(sel);
const messagesEl = $('#messages');
const emptyEl = $('#empty');
const form = $('#composer');
const input = $('#input');
const sendBtn = $('#send');
const modelSelect = $('#model');
const previewDialog = $('#preview');
const previewFrame = $('#preview-frame');

const STORAGE_KEY = 'mi-ia:conversacion';
let aiName = 'Mi IA';
let history = load();
let controller = null; // permite detener la respuesta en curso
let previewHtml = '';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Markdown completo con marked + DOMPurify; si no cargaron (sin internet), formato básico
function render(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
  }
  return escapeHtml(text)
    .replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => `<pre><code class="language-${lang}">${code}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = '✓ Copiado';
    setTimeout(() => (button.textContent = old), 1500);
  } catch {}
}

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function openPreview(html) {
  previewHtml = html;
  previewFrame.srcdoc = html;
  previewDialog.showModal();
}

function button(label, onClick, className = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

// Añade botones a los bloques de código: copiar y, si es HTML, vista previa y descarga
function decorateCode(el) {
  el.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code || pre.parentElement.classList.contains('code')) return;
    const text = code.textContent;
    const lang = (code.className.match(/language-(\w+)/) || [])[1] || '';
    const isHtml = lang === 'html' || /^\s*<!doctype html|^\s*<html/i.test(text);

    const wrap = document.createElement('div');
    wrap.className = 'code';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const label = document.createElement('span');
    label.textContent = lang || 'código';
    const actions = document.createElement('div');
    if (isHtml) {
      actions.append(
        button('▶ Ver página', () => openPreview(text), 'primary'),
        button('Descargar', () => download(text, 'pagina.html')),
      );
    }
    actions.append(button('Copiar', (e) => copy(text, e.target)));
    bar.append(label, actions);
    pre.replaceWith(wrap);
    wrap.append(bar, pre);
  });
}

function addMessage(role, content) {
  emptyEl.hidden = true;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'assistant') el.dataset.name = aiName;
  const body = document.createElement('div');
  body.className = 'body';
  el.append(body);
  setContent(el, content);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function setContent(el, content) {
  const body = el.querySelector('.body');
  if (el.classList.contains('user') || el.classList.contains('error')) body.textContent = content;
  else body.innerHTML = render(content);
}

// Botones al pie de cada respuesta: copiar y (en la última) regenerar
function finishAssistant(el, content) {
  decorateCode(el);
  el.querySelector('.actions')?.remove();
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(button('Copiar', (e) => copy(content, e.target)));
  actions.append(button('↻ Regenerar', regenerate, 'regen'));
  el.append(actions);
  updateRegenButtons();
}

function updateRegenButtons() {
  const all = messagesEl.querySelectorAll('.msg.assistant .regen');
  all.forEach((b, i) => (b.hidden = i !== all.length - 1));
}

function setBusy(busy) {
  sendBtn.textContent = busy ? 'Detener' : 'Enviar';
  sendBtn.classList.toggle('stop', busy);
  messagesEl.querySelectorAll('.regen').forEach((b) => (b.disabled = busy));
}

async function init() {
  try {
    const config = await (await fetch('/api/config')).json();
    aiName = config.name;
    document.title = aiName;
    $('#ai-name').textContent = aiName;
    document.querySelectorAll('.name').forEach((el) => (el.textContent = aiName));
  } catch {}

  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const models = data.models.length ? data.models : [data.default];
    for (const name of models) modelSelect.add(new Option(name, name));
    let saved = null;
    try {
      saved = localStorage.getItem('mi-ia:modelo');
    } catch {}
    modelSelect.value = models.includes(saved) ? saved : models.find((m) => m.startsWith(data.default)) || models[0];
    if (!data.models.length) {
      addMessage('error', `No hay modelos descargados. Ejecuta en una terminal: ollama pull ${data.default}`);
    }
  } catch (err) {
    addMessage('error', err.message || 'No se pudo conectar con el servidor.');
  }

  for (const m of history) {
    const el = addMessage(m.role, m.display || m.content);
    if (m.role === 'assistant') finishAssistant(el, m.content);
  }
}

// Envía mensajes al modelo y devuelve la respuesta completa; si se pasa `el`, la muestra en streaming
async function streamChat(messages, el) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelSelect.value, messages }),
    signal: controller.signal,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let reply = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    reply += decoder.decode(value, { stream: true });
    if (el) {
      setContent(el, reply);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }
  return reply;
}

// Crea la burbuja de respuesta, ejecuta `work(el)` y guarda lo que devuelva en el historial
async function respond(work) {
  const el = addMessage('assistant', '');
  el.classList.add('thinking');
  controller = new AbortController();
  setBusy(true);

  let reply = '';
  try {
    reply = await work(el);
  } catch (err) {
    if (err.name !== 'AbortError') {
      el.classList.add('error');
      el.querySelector('.body').textContent = err.message;
    }
  } finally {
    el.classList.remove('thinking');
    controller = null;
    setBusy(false);
  }

  if (reply) {
    setContent(el, reply);
    history.push({ role: 'assistant', content: reply });
    save();
    finishAssistant(el, reply);
  } else if (!el.classList.contains('error')) {
    el.remove();
  }
}

// Pide una respuesta al modelo con el historial actual
function ask() {
  return respond((el) => streamChat(history, el));
}

function send(text) {
  history.push({ role: 'user', content: text });
  addMessage('user', text);
  save();
  ask();
}

// Documentos: el texto se resume de una vez si es corto, o por partes si es largo
const DIRECT_LIMIT = 14000; // caracteres que caben de una vez en el contexto del modelo
const CHUNK_SIZE = 10000;
const MAX_CHARS = 80000; // más allá se recorta para que no tarde demasiado

function summaryPrompt(name, source, hints, instruction) {
  return `Te paso ${source}. Léelo con atención y responde en español con EXACTAMENTE este formato:

## 📄 Resumen de «${name}»
Un resumen claro de 1 a 3 párrafos: de qué trata, ideas principales y conclusiones.

### Puntos clave
- Entre 3 y 6 viñetas con los datos, nombres, cifras o ideas más importantes.

### 🔑 Palabras clave
Entre 8 y 12 palabras o expresiones clave del documento, cada una entre comillas invertidas (\`así\`) y separadas por " · ".

Usa solo información del documento, sin inventar nada.${hints.length ? ` Pistas: las palabras más repetidas son ${hints.join(', ')} (úsalas solo si son relevantes).` : ''}${instruction ? `\n\nAdemás, el usuario pide: ${instruction}` : ''}`;
}

async function summarizeDocument(file, instruction) {
  if (controller) return;
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  const display = `📄 ${file.name} (${sizeKb} KB)${instruction ? `\n${instruction}` : ''}`;
  addMessage('user', display);

  let text;
  try {
    text = (await extractText(file)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error('El documento está vacío.');
  } catch (err) {
    addMessage('error', `No se pudo leer «${file.name}»: ${err.message}`);
    return;
  }

  const words = text.split(/\s+/).length;
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  const hints = topWords(text);

  await respond(async (el) => {
    let prompt;
    if (text.length <= DIRECT_LIMIT) {
      prompt = summaryPrompt(file.name, `el documento «${file.name}»`, hints, instruction) + `\n\n--- DOCUMENTO ---\n${text}\n--- FIN ---`;
    } else {
      // Documento largo: primero un resumen de cada parte, luego el resumen final a partir de ellos
      const chunks = splitText(text, CHUNK_SIZE);
      const partials = [];
      for (let i = 0; i < chunks.length; i++) {
        setContent(el, `_Leyendo «${file.name}» (${words.toLocaleString('es')} palabras)… parte ${i + 1} de ${chunks.length}_`);
        const partial = await streamChat([
          {
            role: 'user',
            content: `Esta es la parte ${i + 1} de ${chunks.length} del documento «${file.name}». Resúmela en español en 5 a 8 viñetas, conservando nombres, cifras, fechas e ideas importantes. Responde solo con las viñetas.\n\n${chunks[i]}`,
          },
        ]);
        partials.push(`Parte ${i + 1}:\n${partial.trim()}`);
      }
      setContent(el, `_Escribiendo el resumen final…_`);
      prompt =
        summaryPrompt(file.name, `los resúmenes por partes del documento «${file.name}»`, hints, instruction) +
        `\n\n--- RESÚMENES POR PARTES ---\n${partials.join('\n\n')}\n--- FIN ---`;
    }

    // Se guarda en el historial para poder hacer preguntas después sobre el documento
    history.push({ role: 'user', content: prompt, display });
    save();
    let reply = await streamChat(history, el);
    if (truncated && reply) reply += `\n\n> ⚠️ El documento era muy largo: solo se han leído las primeras ${MAX_CHARS.toLocaleString('es')} letras.`;
    return reply;
  });
}

function regenerate() {
  if (controller || history.at(-1)?.role !== 'assistant') return;
  history.pop();
  save();
  [...messagesEl.querySelectorAll('.msg.assistant')].at(-1)?.remove();
  ask();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (controller) return controller.abort();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = '';
  send(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
});

modelSelect.addEventListener('change', () => {
  try {
    localStorage.setItem('mi-ia:modelo', modelSelect.value);
  } catch {}
});

$('#new-chat').addEventListener('click', () => {
  controller?.abort();
  history = [];
  save();
  messagesEl.querySelectorAll('.msg').forEach((el) => el.remove());
  emptyEl.hidden = false;
  input.focus();
});

document.querySelectorAll('.suggestions button').forEach((b) =>
  b.addEventListener('click', () => {
    if (!controller) send(b.textContent);
  }),
);

// Adjuntar documentos: botón 📎 o arrastrar y soltar
const fileInput = $('#file');
fileInput.accept = DOC_EXTENSIONS.join(',');
$('#attach').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;
  fileInput.value = '';
  if (file) attach(file);
});

function attach(file) {
  if (controller) return;
  const instruction = input.value.trim();
  input.value = '';
  input.style.height = '';
  summarizeDocument(file, instruction);
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const [file] = e.dataTransfer?.files || [];
  if (file) attach(file);
});

$('#preview-close').addEventListener('click', () => previewDialog.close());
$('#preview-download').addEventListener('click', () => download(previewHtml, 'pagina.html'));

init();
