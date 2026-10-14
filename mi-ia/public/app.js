// Interfaz de chat de "Mi IA"
const $ = (sel) => document.querySelector(sel);
const messagesEl = $('#messages');
const emptyEl = $('#empty');
const form = $('#composer');
const input = $('#input');
const sendBtn = $('#send');
const modelSelect = $('#model');

const STORAGE_KEY = 'mi-ia:conversacion';
let aiName = 'Mi IA';
let history = load();
let controller = null; // permite detener la respuesta en curso

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

// Formato mínimo: bloques ```código```, `código` y **negrita**
function render(text) {
  return escapeHtml(text)
    .replace(/```\w*\n?([\s\S]*?)(```|$)/g, (_, code) => `<pre><code>${code}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function addMessage(role, content) {
  emptyEl.hidden = true;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'assistant') el.dataset.name = aiName;
  el.innerHTML = render(content);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function setBusy(busy) {
  sendBtn.textContent = busy ? 'Detener' : 'Enviar';
  sendBtn.classList.toggle('stop', busy);
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
    const saved = localStorage.getItem('mi-ia:modelo');
    modelSelect.value = models.includes(saved) ? saved : models.find((m) => m.startsWith(data.default)) || models[0];
    if (!data.models.length) {
      addMessage('error', `No hay modelos descargados. Ejecuta en una terminal: ollama pull ${data.default}`);
    }
  } catch (err) {
    addMessage('error', err.message || 'No se pudo conectar con el servidor.');
  }

  for (const m of history) addMessage(m.role, m.content);
}

async function send(text) {
  history.push({ role: 'user', content: text });
  addMessage('user', text);
  save();

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
      el.innerHTML = render(reply);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      el.classList.add('error');
      el.textContent = err.message;
    }
  } finally {
    el.classList.remove('thinking');
    controller = null;
    setBusy(false);
  }

  if (reply) {
    history.push({ role: 'assistant', content: reply });
    save();
  } else if (!el.classList.contains('error')) {
    el.remove();
  }
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

modelSelect.addEventListener('change', () => localStorage.setItem('mi-ia:modelo', modelSelect.value));

$('#new-chat').addEventListener('click', () => {
  controller?.abort();
  history = [];
  save();
  messagesEl.querySelectorAll('.msg').forEach((el) => el.remove());
  emptyEl.hidden = false;
  input.focus();
});

init();
