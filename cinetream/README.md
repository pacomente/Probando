# 🎬 Cinetream

Plataforma de películas pensada para **la tele y el celular**: se maneja con el control remoto, el teclado, el mouse
o el dedo, y se puede instalar como app.

## Qué tiene

| | |
|---|---|
| ✨ **Apertura** | Animación del logo al abrir (una vez por sesión; se saltea con cualquier tecla o toque). |
| 👤 **Perfiles** | «¿Quién está mirando?» con hasta 5 perfiles. Se crean, se renombran, se elige color y cara, se marcan como **infantiles** (solo ATP) y se eliminan. Cada perfil tiene su lista y su progreso. |
| 🏠 **Inicio** | Portada con fundido entre películas. **En la tele, la portada muestra la película que tenés marcada**, como en Google TV o Apple TV. Filas: Seguir viendo (apaisada, con lo que falta), Mi lista, **Las 10 imprescindibles** (con números grandes) y por género. |
| 🧭 **Explorar** | Todo el catálogo por género, con cuántas películas tiene cada uno. |
| 📄 **Ficha** | Estudio, sinopsis, duración, clasificación, dirección, licencia, «Seguir viendo» o «Desde el principio», Mi lista y «Más como esta». |
| ▶ **Reproductor** | Controles que se esconden solos, barra de progreso, ±10 s, velocidad (0,75× a 2×), pantalla completa. **En pausa** muestra qué estás viendo y a qué hora termina. **A continuación**: al llegar a los créditos ofrece la siguiente película con cuenta regresiva. Guarda por dónde ibas. |
| ⌨ **Atajos** | En la computadora: K pausa, J/L ±10 s, F pantalla completa, M silencio. |
| 🔎 **Buscar** | Por título, director, género, año u origen, con sugerencias. En la tele, con teclado en pantalla. |
| ⚙ **Ajustes** | Cambiar o editar el perfil, reproducción automática de la siguiente, animaciones y borrar el historial. |
| 📺 **Control remoto** | Flechas, OK y Volver, incluidas las teclas de Samsung (Tizen), LG (webOS) y Android TV, y las de reproducción. Las filas recuerdan la última tarjeta marcada. |
| 📱 **Celular** | Cinco pestañas abajo, filas que se deslizan con el dedo, doble toque a los costados del video para saltar 10 s y botón «atrás» del teléfono. |
| 🎨 **Afiches propios** | Ilustraciones dibujadas por la app con los colores de cada película, con luz, viñeta y grano de película: no se usan imágenes con derechos de terceros. |

## Administrador: cómo agregar películas

Abrí **<http://localhost:3500/admin.html>** en la PC donde está instalado Cinetream. La primera vez pide crear una
contraseña. Por seguridad, el administrador **solo se abre desde esa PC**, no desde la tele ni desde otros equipos de la
wifi (si hace falta, se habilita con `ADMIN_DESDE_RED=1`).

### Con un link (recomendado)

Pegás el link, tocás **Buscar** y Cinetream completa solo la información; revisás y tocás **Agregar al catálogo**.

| Link | Qué trae |
|---|---|
| **Internet Archive** (`archive.org/details/…`) | La película (elige el MP4 que reproducen todas las teles), título, año, director, duración, sinopsis, géneros, licencia y portada. Tiene miles de películas de dominio público. |
| **Archivo de video directo** (`….mp4`, `.webm`) | La película; la duración y la portada se toman solas del video. |
| **Página con video** (con etiquetas Open Graph) | La película, título, sinopsis y portada de la página. |

- **Descargarla a esta PC** (recomendado): se ve aunque el link deje de funcionar y carga más rápido en la red de tu casa.
  Se ve el avance de la descarga y se puede cancelar.
- **Reproducir desde el link**: no ocupa espacio, pero depende de que el sitio siga online.
- Cuando termina, la película queda **oculta** para que la revises, salvo que marques «Publicar apenas esté lista».
- **No se importa desde YouTube, Netflix, Vimeo ni otras plataformas**: sus condiciones de uso no lo permiten.

### Subiendo el archivo

En «Subir un archivo» elegís o arrastrás el video desde la PC (MP4 H.264 es lo más compatible), completás los datos y
se sube con barra de avance. La duración, la portada (un cuadro del video) y los colores se completan solos.

### Editar el catálogo

Cada película se puede **editar** (datos, portada propia, otro cuadro del video o la ilustración de Cinetream, colores),
**publicar u ocultar** y **eliminar** (borra también su archivo y su portada). Hay que confirmar que se tienen los
derechos de cada película que se agrega.

Los datos quedan en la carpeta `datos/` (catálogo, portadas y contraseña) y los videos en `videos/`: conviene hacer
copias de seguridad de las dos.

## El catálogo: solo contenido legal

El catálogo de ejemplo (`public/catalogo.js`) tiene **películas abiertas de la Blender Foundation** (Creative Commons:
Sintel, Tears of Steel, Big Buck Bunny, Elephants Dream, Caminandes, Spring, Cosmos Laundromat, Sprite Fright, Charge)
y **clásicos mudos en dominio público** (Nosferatu, El gabinete del Dr. Caligari, Viaje a la Luna).

- Cuatro títulos tienen su video cargado. El resto figura como **Próximamente**, y mientras tanto reproduce una
  **señal de prueba** con la duración real. Lo mismo pasa si un video no carga, así nunca queda una pantalla negra.
- **Para subir películas comerciales hacen falta los derechos de distribución.** Subirlas sin licencia es piratería.
- Verificá la licencia de cada título en tu país antes de publicarla. El dominio público depende de cada país.

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
| `server.js` | Servidor local: sirve la plataforma, el catálogo, las portadas y los videos por partes, para poder adelantar. |
| `admin.js` | Rutas del administrador: contraseña, importar, subir, editar y eliminar. |
| `importar.js` | Análisis de links (Internet Archive, archivo directo, página con video) y descargas. |
| `datos.js` | Catálogo y contraseña guardados en `datos/`. |
| `public/admin.html` · `admin.js` · `admin.css` | La página del administrador. |
| `public/catalogo.js` | Películas de ejemplo (el catálogo inicial) y filas del inicio. |
| `public/app.js` | Pantallas, perfiles, búsqueda, Mi lista y Seguir viendo. |
| `public/reproductor.js` | Reproductor y señal de prueba. |
| `public/navegacion.js` | Navegación con control remoto. |
| `public/carteles.js` | Afiches dibujados en SVG. |
| `public/sw.js` | Guarda la plataforma para que abra al instante. |
