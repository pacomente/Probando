// Guarda la plataforma en el dispositivo: se abre al instante y el catálogo se ve aunque se corte internet.
// Los videos no se guardan (son pesados): necesitan conexión.
const VERSION = 'cinetream-v8';
const APP = ['./', 'index.html', 'estilos.css', 'app.js', 'catalogo.js', 'carteles.js', 'navegacion.js', 'reproductor.js', 'cuenta.js', 'anuncios.js', 'app-nativa.js', 'pantallas.js',
  'manifest.webmanifest', 'icono.svg', 'icono-192.png', 'icono-512.png'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((n) => Promise.all(n.filter((x) => x !== VERSION).map((x) => caches.delete(x))))
  .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/videos/') || url.pathname.startsWith('/r2/')) return;
  // Administrador, cuentas, pagos y publicidad: siempre desde el servidor, nunca guardados
  if (/\/api\/(admin|cuenta|planes|pagos|anuncios|pantallas)|admin\.(html|js)$|pago-prueba|activar/.test(url.pathname)) return;
  e.respondWith(fetch(e.request)
    .then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
      return r;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
