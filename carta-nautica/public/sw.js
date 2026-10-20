// Service worker: guarda la carta en el dispositivo para que funcione sin internet.
// - La página y sus archivos: primero la red (para recibir actualizaciones), si falla, lo guardado.
// - Teselas del mapa: primero lo guardado (rápido y sin conexión), con un límite de tamaño.
// - Datos en vivo (/api) y pronóstico: nunca se cachean aquí (la página guarda el último pronóstico).
const VERSION = 'carta-v2';
const APP = [
  './', 'index.html', 'style.css', 'app.js', 'navegacion.js', 'registro.js', 'simulacion.js', 'emergencia.js',
  'util.js', 'costa.js', 'manifest.webmanifest', 'icono.svg', 'icono-192.png', 'icono-512.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-shadow.png',
];
const TESELAS = { cors: 'teselas', opacas: 'teselas-opacas' };
const MAX_TESELAS = { teselas: 6000, 'teselas-opacas': 1500 };
const SERVIDORES_TESELAS = /tile\.openstreetmap\.org|tiles\.openseamap\.org|arcgisonline\.com|basemaps\.cartocdn\.com/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const conservar = [VERSION, TESELAS.cors, TESELAS.opacas];
  e.waitUntil(caches.keys()
    .then((nombres) => Promise.all(nombres.filter((n) => !conservar.includes(n)).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (SERVIDORES_TESELAS.test(url.hostname)) {
    e.respondWith(tesela(pedido));
  } else if (url.origin === self.location.origin && !url.pathname.includes('/api/')) {
    e.respondWith(paginaPrimeroRed(pedido));
  }
});

async function paginaPrimeroRed(pedido) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok) cache.put(pedido, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(pedido, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
  }
}

let guardadas = 0;
async function tesela(pedido) {
  const nombre = pedido.mode === 'no-cors' ? TESELAS.opacas : TESELAS.cors;
  const cache = await caches.open(nombre);
  const guardada = await cache.match(pedido.url);
  if (guardada) return guardada;
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok || respuesta.type === 'opaque') {
      await cache.put(pedido.url, respuesta.clone());
      if (++guardadas % 50 === 0) recortar(nombre);
    }
    return respuesta;
  } catch {
    // Sin internet y sin la tesela: transparente, para que se vea la costa incluida debajo
    return new Response(null, { status: 504 });
  }
}

async function recortar(nombre) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  const sobran = claves.length - MAX_TESELAS[nombre];
  for (let i = 0; i < sobran; i++) await cache.delete(claves[i]);
}
