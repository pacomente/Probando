// Enlace de Trappi a bordo con Trappi Central, por internet (Starlink, 4G…).
// - Envía la posición del barco cada INTERVALO y las alertas (MOB, MAYDAY) al instante.
// - Si no hay conexión, guarda todo en disco y lo manda cuando vuelve (nada se pierde).
// - Trae las posiciones de los demás barcos de la empresa para verlos en la carta.
// Solo hace conexiones salientes por HTTPS: funciona detrás de Starlink, que no acepta conexiones entrantes.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_COLA = 20000; // unas dos semanas de posiciones cada minuto
const LOTE = 500;

export function crearEnlaceCentral({ url, token, carpetaDatos, intervaloMs = 60000, obtenerPropio, alRecibirFlota }) {
  const base = url.replace(/\/$/, '');
  mkdirSync(carpetaDatos, { recursive: true });
  const archivoCola = path.join(carpetaDatos, 'cola-central.json');
  let cola = [];
  try { if (existsSync(archivoCola)) cola = JSON.parse(readFileSync(archivoCola, 'utf8')); } catch { cola = []; }

  const estado = { nombre: `Trappi Central (${new URL(base).host})`, conectado: false, ultimoEnvio: null, ultimoError: null, pendientes: cola.length, buque: null };
  let guardando = Promise.resolve();
  const guardarCola = () => {
    estado.pendientes = cola.length;
    guardando = guardando.then(() => writeFile(archivoCola, JSON.stringify(cola))).catch(() => {});
  };

  async function pedir(ruta, opciones = {}) {
    const control = new AbortController();
    const corte = setTimeout(() => control.abort(), 20000);
    try {
      const r = await fetch(base + ruta, {
        ...opciones,
        signal: control.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opciones.headers },
      });
      if (r.status === 401) throw new Error('token del buque inválido: revisá TRAPPI_TOKEN');
      if (!r.ok) throw new Error(`la central respondió HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(corte);
    }
  }

  function encolar(item) {
    cola.push(item);
    // Si la cola se llena se descartan las posiciones más viejas, nunca las alertas
    while (cola.length > MAX_COLA) {
      const i = cola.findIndex((x) => x.tipo === 'posicion');
      if (i < 0) break;
      cola.splice(i, 1);
    }
    guardarCola();
  }

  let enviando = false;
  async function vaciarCola() {
    if (enviando || !cola.length) return;
    enviando = true;
    try {
      // Primero las alertas, después las posiciones en orden
      const alertas = cola.filter((x) => x.tipo === 'alerta');
      for (const a of alertas) {
        await pedir('/api/flota/alerta', { method: 'POST', body: JSON.stringify(a) });
        cola.splice(cola.indexOf(a), 1);
        guardarCola();
      }
      while (cola.length) {
        const lote = cola.slice(0, LOTE);
        await pedir('/api/flota/posiciones', { method: 'POST', body: JSON.stringify({ posiciones: lote }) });
        cola.splice(0, lote.length);
        guardarCola();
      }
      marcarConectado();
    } catch (e) {
      marcarError(e);
    } finally {
      enviando = false;
    }
  }

  function marcarConectado() {
    if (!estado.conectado) console.log('🛰  Conectado con Trappi Central');
    estado.conectado = true;
    estado.ultimoEnvio = Date.now();
    estado.ultimoError = null;
  }
  function marcarError(e) {
    if (estado.conectado || !estado.ultimoError) console.warn(`Trappi Central sin conexión (${e.message}). Los datos quedan guardados para enviarse después.`);
    estado.conectado = false;
    estado.ultimoError = e.name === 'AbortError' ? 'la central no responde'
      : e.message === 'fetch failed' ? 'sin internet o la central no responde' : e.message;
  }

  async function traerFlota() {
    try {
      const datos = await pedir('/api/flota');
      estado.buque = datos.buque;
      alRecibirFlota(datos.flota);
      marcarConectado();
    } catch (e) {
      marcarError(e);
    }
  }

  function ciclo() {
    const p = obtenerPropio();
    if (p && Date.now() - p.hora < 2 * 60000) {
      encolar({ tipo: 'posicion', lat: p.lat, lon: p.lon, sog: p.sog, cog: p.cog, hora: p.hora });
    }
    vaciarCola().then(traerFlota);
  }

  setTimeout(ciclo, 3000);
  setInterval(ciclo, intervaloMs);

  return {
    estado,
    alerta(datos) {
      encolar({ tipo: 'alerta', ...datos, hora: Date.now() });
      vaciarCola();
    },
  };
}
