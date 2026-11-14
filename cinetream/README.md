# 🎬 Cinetream

Plataforma de películas pensada para **la tele y el celular**: se maneja con el control remoto, el teclado, el mouse
o el dedo, y se puede instalar como app.

## Qué tiene

| | |
|---|---|
| 👤 **Perfiles** | «¿Quién está mirando?» con perfiles Familia, Invitado y **Niños** (solo películas ATP). Cada perfil tiene su lista y su progreso. |
| 🏠 **Inicio** | Portada con películas destacadas que rota sola, y filas: Seguir viendo, Mi lista, Animación, Ciencia ficción, Para toda la familia, Clásicos del cine mudo y más. |
| 📄 **Ficha** | Sinopsis, año, duración, clasificación, dirección, licencia, «Seguir viendo» desde donde quedaste y «Más como esta». |
| ▶ **Reproductor** | Controles que se esconden solos, barra de progreso, ±10 s con las flechas o doble toque a los costados, pantalla completa. Guarda por dónde ibas. |
| 🔎 **Buscar** | Por título, director, género, año u origen. En la tele, con teclado en pantalla para escribir con el control. |
| 📺 **Control remoto** | Flechas, OK y Volver, incluidas las teclas de Samsung (Tizen), LG (webOS) y Android TV, y las teclas de reproducción. |
| 📱 **Celular** | Pestañas abajo, filas que se deslizan con el dedo y botón «atrás» del teléfono. |
| 🎨 **Afiches propios** | Los afiches se dibujan en la app con los colores de cada película: no se usan imágenes con derechos de terceros. |

## El catálogo: solo contenido legal

El catálogo de ejemplo (`public/catalogo.js`) tiene **películas abiertas de la Blender Foundation** (Creative Commons:
Sintel, Tears of Steel, Big Buck Bunny, Elephants Dream, Caminandes, Spring, Cosmos Laundromat, Sprite Fright, Charge)
y **clásicos mudos en dominio público** (Nosferatu, El gabinete del Dr. Caligari, Viaje a la Luna).

- Cuatro títulos tienen su video cargado. El resto figura como **Próximamente**, y mientras tanto reproduce una
  **señal de prueba** con la duración real. Lo mismo pasa si un video no carga, así nunca queda una pantalla negra.
- **Para subir películas comerciales hacen falta los derechos de distribución.** Subirlas sin licencia es piratería.
- Verificá la licencia de cada título en tu país antes de publicarla. El dominio público depende de cada país.

### Agregar una película

1. Copiá el archivo a la carpeta `videos/`. MP4 con video H.264 y audio AAC es lo que reproducen todas las teles y celulares.
2. En `public/catalogo.js`, agregá la película (o completá una existente) con `video: 'videos/nombre.mp4'`.
3. Elegí sus `colores` y su `motivo` (sol, luna, grilla, engranaje, montanas, ondas, anillos, triangulo, rayos, sombra,
   angulos): con eso se dibuja el afiche.

## Usarla en tu PC, tu tele y tu celular

1. Instalá **Node.js** (versión LTS) desde <https://nodejs.org>.
2. Descargá el proyecto y abrí la carpeta `cinetream`.
3. **Windows:** doble clic en **`Ver-Cinetream.bat`**. **Mac o Linux:** `npm start` en una terminal.
4. Se abre en <http://localhost:3500>.
5. **En la tele o el celular** (conectados a la misma wifi): abrí el navegador y entrá a la dirección que aparece en la
   ventana negra, del estilo `http://192.168.1.20:3500`. En el celular se puede **instalar como app** desde el menú del
   navegador.

## Teclas

| Tecla | En la plataforma | En el reproductor |
|---|---|---|
| Flechas | Mover el foco | Con los controles ocultos: ← → saltan 10 s |
| OK / Enter | Abrir | Pausar / reproducir |
| Volver / Esc | Pantalla anterior | Salir y guardar por dónde ibas |
| ⏯ ⏪ ⏩ ⏹ del control | | Pausar, retroceder o adelantar 30 s, salir |

## Para un servicio comercial

Esto es la plataforma (la parte que ve el público). Para venderla como servicio falta:

- **Derechos del contenido** que se vaya a ofrecer.
- **Hosting de video**: los videos se sirven desde un CDN o un servicio de video (por ejemplo Cloudflare Stream, Mux o
  Bunny Stream) con calidad adaptable (HLS), en lugar de archivos sueltos.
- **Cuentas y pagos** si es por suscripción.
- **Apps de las tiendas** de Samsung, LG o Google TV: se arman empaquetando esta misma web con las herramientas de cada marca.

## Archivos

| Archivo | Para qué |
|---|---|
| `server.js` | Servidor local: sirve la plataforma y los videos por partes, para poder adelantar. |
| `public/catalogo.js` | Películas y filas del inicio. |
| `public/app.js` | Pantallas, perfiles, búsqueda, Mi lista y Seguir viendo. |
| `public/reproductor.js` | Reproductor y señal de prueba. |
| `public/navegacion.js` | Navegación con control remoto. |
| `public/carteles.js` | Afiches dibujados en SVG. |
| `public/sw.js` | Guarda la plataforma para que abra al instante. |
