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
    const el = addMessage(m.role, m.content);
    if (m.role === 'assistant') finishAssistant(el, m.content);
  }
}

// Pide una respuesta al modelo con el historial actual y la muestra en streaming
async function ask() {
  const el = addMessage('assistant', '');
  el.classList.add('thinking');
  controller = new AbortController();
  setBusy(true);

  let reply = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelSelect.value, messages: history }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      setContent(el, reply);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
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
    history.push({ role: 'assistant', content: reply });
    save();
    finishAssistant(el, reply);
  } else if (!el.classList.contains('error')) {
    el.remove();
  }
}

function send(text) {
  history.push({ role: 'user', content: text });
  addMessage('user', text);
  save();
  ask();
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

$('#preview-close').addEventListener('click', () => previewDialog.close());
$('#preview-download').addEventListener('click', () => download(previewHtml, 'pagina.html'));

init();
