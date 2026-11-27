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
| 💳 **Planes** | Gratis con publicidad, Plus y Plus anual. Cuenta propia, ingreso en la tele con un código desde el celular, cobro con Mercado Pago. |
| 📢 **Publicidad** | Avisos antes de la película (se saltan a los pocos segundos) y banners en el inicio, con estadísticas por campaña. |
| 📲 **Apps para Android** | APK para celular y para la tele (Android TV / Google TV): aparece en el inicio, se maneja con el control, encuentra sola el servidor en la wifi y trae una demostración adentro. |
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

### Películas con el reproductor de otro sitio (YouTube, Vimeo, páginas con reproductor)

Se puede pegar el link de una página que ya tiene su propio reproductor y la película se ve **dentro de Cinetream con
ese reproductor**, sin descargar nada:

| Link | Qué hace Cinetream |
|---|---|
| **YouTube** (`youtube.com/watch?v=…`, `youtu.be/…`, Shorts) | Usa el reproductor oficial de YouTube; trae título, canal y portada. Si el dueño no permite verlo en otras páginas, avisa. |
| **Vimeo, Dailymotion** | Usa su reproductor oficial y trae los datos. |
| **Google Drive** (link de «Compartir» de un video) | Usa la vista previa de Drive (el archivo tiene que estar compartido con «Cualquier persona con el link»). |
| **Cualquier otra página con reproductor** | Busca el reproductor dentro de la página y muestra solo ese. Si no encuentra uno, muestra la página entera (avisa antes). Si la página prohíbe mostrarse dentro de otra, avisa. |
| Netflix, Disney+, Prime Video y otras plataformas pagas | No se puede: protegen sus películas para que solo se vean en su app. |

Así **no se pagan almacenamiento ni tráfico**: el video lo sirve el otro sitio. Si el sitio lo borra o deja de permitirlo,
«Revisar links» lo marca. Lo que se publique tiene que ser legal (propio, con licencia o permitido por su dueño): la tilde
de derechos sigue siendo obligatoria. En la tele, «Volver» o el botón atrás cierran el reproductor; con la flecha abajo
el control pasa al reproductor del sitio (pausa, adelantar).

### Tu cuenta de StreamHG

Si subís tus videos a StreamHG, Cinetream se conecta con tu cuenta por su API:

- **Catálogo → Desde StreamHG:** lista todos tus videos (con miniatura, duración y vistas), con buscador. **Agregar** abre la
  ficha ya completa (título, duración, portada) para revisarla y publicarla.
- **Subir un video a StreamHG desde un link:** StreamHG lo baja directo a tu cuenta y se ve el avance.
- **Links de StreamHG** pegados en «Agregar con un link» (de la página del video o del reproductor `/e/…`) también funcionan.
- Las películas se ven con el **reproductor para insertar** de StreamHG (`/e/código`), que es el que se deja mostrar dentro de
  otro sitio. (La página común de StreamHG lo prohíbe: por eso un link común no se reproducía.)
- «Revisar links» le pregunta a StreamHG si cada video sigue disponible.

**Conectarla:** en StreamHG copiá tu **API key**; en Render → **Environment** agregá `STREAMHG_CLAVE` con esa clave
(y, si tus videos usan otra dirección de reproductor, `STREAMHG_REPRODUCTOR`). En el administrador, **Ajustes → StreamHG**
tiene que decir «Conectado». La clave queda solo en el servidor: nunca llega al navegador.

### ¿Dónde queda guardada cada película?

| Cómo se agregó | Qué se guarda en el servidor | Qué pasa si el sitio original la borra |
|---|---|---|
| **Desde un link** («Reproducir desde el link») | Solo la ficha y la portada (unos KB). El video se reproduce directo desde el sitio original, sin pasar por el servidor. | Deja de verse. «Revisar links» lo detecta. |
| **Con el reproductor de otro sitio** (YouTube, Vimeo…) | Solo la ficha y la portada. | Deja de verse. «Revisar links» lo detecta. |
| **Guardada** («Guardarla en Cinetream» o subida) | El archivo entero, en el disco del servidor. | Se sigue viendo. |

En el catálogo del administrador cada película muestra dónde está su video y cuánto ocupa, y se puede pasar de una forma a
la otra: **Guardar en el servidor** baja el video al disco (mientras tanto se sigue viendo desde el link) y **Liberar espacio**
borra el archivo y vuelve a reproducirla desde el link original, después de comprobar que ese link sigue andando.

### Videos en Cloudflare R2 (recomendado para el catálogo propio)

R2 es el almacenamiento de Cloudflare: guarda las películas fuera del servidor, así no llenan el disco de Render, se ven
aunque el sitio original las borre y **no se paga el tráfico** (en otros servicios, cada vez que alguien mira se paga).
Los primeros 10 GB son gratis; después cuesta unos USD 0,015 por GB al mes (100 GB ≈ USD 1,35 por mes).

**Conectarlo (una sola vez):**

1. En <https://dash.cloudflare.com> abrí **R2 Object Storage** (la primera vez pide una tarjeta, pero lo gratis no se cobra).
2. **Create bucket** → nombre `cinetream` → dejalo privado.
3. **Manage API tokens → Create API token** con permiso **Admin Read & Write**. Copiá el *Access Key ID*,
   el *Secret Access Key* y tu *Account ID*.
4. En Render → tu servicio → **Environment** agregá `R2_CUENTA`, `R2_CLAVE_ID`, `R2_CLAVE_SECRETA` y `R2_BUCKET`.
5. En el administrador → **Ajustes → Probar la conexión**.

**Cómo se usa:** con R2 conectado, «Agregar con un link» ofrece **Guardarla en Cloudflare R2** (Cinetream copia el video
del link a R2), «Subir un archivo» sube directo desde tu compu a R2 (sin pasar por el servidor) y cada película guardada
o desde un link tiene el botón **Pasar a R2**. Al eliminar una película se borra también de R2.

**Seguridad:** el bucket queda privado. Cada vez que alguien da play, Cinetream le da un link firmado que vence a las
6 horas, y los títulos Plus solo se los da a suscriptores Plus: nadie puede compartir el video por fuera de la plataforma.

### Más herramientas del administrador

- **Resumen:** reproducciones de los últimos 30 días (gráfico por día), lo más visto, suscriptores por plan y el disco
  (videos, portadas, publicidad y lugar libre). Avisa cuando el disco está casi lleno.
- **Catálogo:** filtros por estado, por dónde está el video (servidor, link, link caído) y orden por vistas, título o peso.
  **Revisar links** prueba todos los videos «desde un link» y marca los que ya no funcionan.
- **Suscriptores:** **Exportar planilla** baja todas las cuentas en un CSV que abre Excel o Google Sheets.
- **Ajustes:** estado de Cloudflare R2 (videos, espacio y costo), cambiar la contraseña del administrador (con medidor de fuerza; cierra las sesiones de otros equipos),
  cerrar las otras sesiones y ver los datos del servidor.

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

## Suscripción y publicidad

Cinetream tiene dos formas de ganar plata, que se combinan:

| Plan | Qué incluye | Precio inicial |
|---|---|---|
| **Gratis** | Todo el catálogo común, con publicidad. | $ 0 |
| **Plus** | Sin publicidad y con los títulos marcados «Solo Plus». | $ 2.999 por mes |
| **Plus anual** | Lo mismo que Plus, pagando el año (dos meses gratis). | $ 29.990 por año |

Nombres, precios y descripciones se cambian en **Administrador → Planes y pagos**.

- **Cuentas**: la primera vez la plataforma pide crear una cuenta (correo y contraseña) y elegir plan.
  En la tele no hace falta escribir: aparece un código de 6 letras, se abre `/activar.html` en el celular y se escribe ahí.
- **Títulos Plus**: en el editor de cada película está la tilde «Solo para suscriptores Plus». Los demás ven el título con
  un candado y la invitación a pasarse a Plus; el servidor no les entrega el video.
- **Cancelar**: desde Perfil → Ajustes. El plan sigue hasta el último día pago y después pasa solo a Gratis.

### Pantallas a la vez

Cada plan define en cuántos equipos se puede ver **al mismo tiempo** con una cuenta (al empezar: Gratis 1, Plus 2,
Plus anual 2; se cambia en **Planes y pagos → Pantallas a la vez**, de 1 a 10).

- Al dar play, Cinetream anota ese equipo (tele, celular, compu). Mientras se ve, el equipo avisa cada 30 segundos.
- Si la cuenta ya está en el límite, aparece **«Ya se está viendo en otra pantalla»** con la lista de equipos que están
  mirando (qué película y desde cuándo) y el botón **Cortar ahí y ver acá**. En el plan Gratis también ofrece pasarse a Plus.
- El equipo cortado cierra la película solo, con el aviso «Se empezó a ver en otro equipo con tu cuenta».
- Si un equipo se apaga o pierde internet, deja de contar al minuto y medio.
- En el administrador, **Resumen** muestra cuántas pantallas están viendo ahora y **Suscriptores** marca qué cuentas
  están mirando y en cuántas pantallas.

### Cobrar con Mercado Pago

Mientras no se configure, Cinetream funciona en **modo prueba**: el pago se simula en una página y nadie paga de verdad.
Para cobrar de verdad (débito automático mes a mes o año a año):

1. En <https://www.mercadopago.com.ar/developers> creá una aplicación y copiá el **Access Token** de producción.
2. Configurá las notificaciones (webhooks) del tema **Suscripciones** hacia `https://tu-dominio/api/pagos/mercadopago`
   y copiá la clave secreta.
3. Arrancá el servidor así:

   ```bash
   MP_ACCESS_TOKEN=APP_USR-... MP_WEBHOOK_SECRET=... node server.js
   ```

El servidor necesita un dominio con **https** para que Mercado Pago pueda avisar los cobros.
Al volver del pago y cada vez que llega un aviso, Cinetream le pregunta a Mercado Pago el estado real antes de activar nada.
Desde **Suscriptores** también se puede dar un plan a mano (por ejemplo, alguien que pagó por transferencia o una cortesía).

### Publicidad

En **Administrador → Publicidad** se cargan las campañas de los anunciantes:

- **Antes de la película**: un aviso de imagen, video o texto que se puede saltar después de los segundos que elijas.
  Sale como mucho uno cada 15 minutos.
- **Banner en el inicio**: una franja entre las filas de películas.
- Cada campaña tiene fechas de inicio y fin, un peso (cuántas veces sale frente a otras) y un link opcional.
- Se cuentan las veces que se mostró, los clics y cuántos lo vieron completo, para pasarle el informe al anunciante.
- Nunca se muestra publicidad a suscriptores Plus ni en perfiles infantiles.

Vienen dos campañas propias que invitan a pasarse a Plus; se pueden pausar o editar.

### Resumen del negocio

La primera pantalla del administrador muestra suscriptores Plus, cuentas nuevas del mes, ingreso mensual estimado,
avisos mostrados y clics, y cómo se reparten las cuentas entre los planes.

## Apps para Android (celular y tele)

En `android/` está la app nativa. De un mismo código salen dos APK:

| APK | Para | Detalles |
|---|---|---|
| `cinetream-celular.apk` | Celulares y tablets con Android 6 o más nuevo | Pantalla completa al ver películas, botón «atrás» del teléfono. |
| `cinetream-tele.apk` | Android TV, Google TV, Chromecast con Google TV, TV Box | Aparece en el inicio de la tele con su banner, se maneja con el control remoto. |

Se pueden instalar las dos en el mismo equipo. La app:

- Abre la plataforma del servidor de Cinetream. **La primera vez**, tocá **Buscar en mi wifi** y encuentra sola la PC
  donde corre Cinetream; también se puede escribir la dirección (por ejemplo `192.168.0.10:3500` o `cine.tudominio.com`).
- Sin servidor muestra la **demostración**, que viene adentro de la app.
- Si el servidor no responde, ofrece reintentar, buscar de nuevo o cambiar la dirección.
- Mantiene la pantalla encendida mientras se ve una película, y los links de los anunciantes se abren en el navegador.
- El servidor se cambia después en Perfil → Ajustes → Servidor de Cinetream.

### Cómo conseguir los APK

- **Desde GitHub (sin instalar nada):** cada cambio en `cinetream/` compila las dos apps solas (*Actions*) y las publica en
  **Releases** del repositorio. Se bajan directo desde el celular.
- **En tu PC:** con el [Android SDK](https://developer.android.com/studio) instalado:

  ```bash
  cd android
  ./compilar.sh                              # la app pregunta o busca el servidor
  ./compilar.sh https://cine.tudominio.com   # la app abre directo tu servidor
  ```

  Los APK quedan en `descargas/` y se ofrecen desde **http://tu-PC:3500/descargar.html** (también hay un botón en Ajustes).

### Instalar en la tele

1. En la tele, desde Google Play, instalá la app gratuita **Downloader**.
2. Abrila y escribí `tu-PC:3500/descargas/cinetream-tele.apk` (o el link de Releases de GitHub).
3. Aceptá instalar apps de origen desconocido para Downloader. Cinetream aparece en el inicio de la tele.

También se puede copiar el APK a un pendrive y abrirlo con un administrador de archivos de la tele.

### Firma de las apps

Para que una versión nueva se instale encima de la anterior, todas tienen que estar firmadas con la misma clave.
El repositorio trae `android/firma-prueba.jks`, una clave **de prueba y pública**: sirve para probar, no para publicar.
Para publicar en Google Play o repartir la app en serio, creá tu clave y guardala en un lugar seguro:

```bash
keytool -genkeypair -keystore cinetream.jks -alias cinetream -keyalg RSA -keysize 2048 -validity 10000
```

- **En tu PC:** creá `android/firma.properties` con `archivo=/ruta/cinetream.jks`, `clave=...` y `alias=cinetream`.
- **En GitHub:** en *Settings → Secrets and variables → Actions* cargá los secretos `CINETREAM_FIRMA_BASE64`
  (el archivo en base64: `base64 -w0 cinetream.jks`), `CINETREAM_FIRMA_CLAVE` y `CINETREAM_FIRMA_ALIAS`.
  Con la variable `CINETREAM_SERVIDOR` (por ejemplo `https://cine.tudominio.com`) la app abre directo tu servidor.

Al pasar de la clave de prueba a la tuya hay que desinstalar una vez la app vieja.

## Base de datos y copias de seguridad

Todo (cuentas, catálogo, planes, publicidad, trámites, estadísticas y configuración) está en una base de datos **SQLite**,
`datos/cinetream.db`. Viene incluida en Node: no hay que instalar ni pagar nada aparte. Cada cuenta, película o campaña es una
fila; el correo de las cuentas tiene un índice único. Al guardar solo se escribe lo que cambió, en una transacción.

- **Si venís de una versión anterior,** al arrancar importa sola los `.json` de antes y los deja renombrados como `.migrado`.
- **Copias automáticas:** una por día en `datos/respaldos/` (se guardan las últimas 14).
- **Administrador → Ajustes → Base de datos:** ver el tamaño y las filas, **Hacer una copia ahora**, **Descargar** cualquier copia y
  **Restaurar una copia** (se valida que sea de Cinetream y se aplica al reiniciar; antes se guarda la base actual).
- Las copias incluyen las contraseñas cifradas: guardalas en un lugar seguro.

## Cuentas: contraseña nueva

- **«¿Olvidaste tu contraseña?»** en el ingreso manda un link por correo (vale 1 hora y sirve una vez). La respuesta es la misma
  exista o no la cuenta, para no revelar qué correos están registrados.
- Para los correos hace falta una cuenta gratis en <https://resend.com>: en Render cargá `RESEND_API_KEY` y `CORREO_REMITENTE`
  (por ejemplo `Cinetream <no-responder@tudominio.com>`, con el dominio verificado en Resend).
- **Sin correo configurado:** en **Suscriptores → Link contraseña** se genera un link de 24 horas para mandar por WhatsApp.
- Al cambiar la contraseña se cierran las sesiones abiertas en los otros equipos.

## Lo legal (Argentina)

- **Términos y condiciones** y **Política de privacidad** (`legal.html`), con los datos del titular que se cargan en
  **Ajustes → Datos legales** (titular, CUIT, domicilio, correo). Incluyen la leyenda de la AAIP de la Ley 25.326.
  Son un modelo: conviene que los revise un abogado o tu contador.
- **Botón de baja** (Res. 316/2018): la suscripción se da de baja en un paso, sigue hasta la fecha pagada y se entrega un código.
- **Botón de arrepentimiento** (Res. 424/2020): dentro de los 10 días de contratado se cancela en el momento y queda un trámite
  «Devolver $…» en **Suscriptores → Trámites** para hacer la devolución desde Mercado Pago y marcarlo como resuelto.
- **Eliminar mi cuenta:** borra la cuenta y sus datos (con la contraseña como confirmación).
- Los links están en la bienvenida, al pie del inicio y en Perfil → Ajustes.

## Ponerla en internet con Render

Así Cinetream se ve desde cualquier lado (no solo en la wifi de tu casa), con https, y puede cobrar con Mercado Pago.
El repositorio trae `render.yaml`, que configura todo:

1. Entrá a <https://render.com> y creá una cuenta (podés entrar con GitHub).
2. **New → Blueprint**, elegí el repositorio `Probando` y la rama `main` (primero uní el PR a `main`).
3. Render muestra el servicio **cinetream** con un disco de 10 GB. Cargá `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`
   si ya querés cobrar (si no, dejalos vacíos: queda en modo prueba). Tocá **Apply**.
4. En unos minutos queda andando en una dirección como `https://cinetream.onrender.com`.
5. La **contraseña del administrador** la inventa Render: está en el servicio → *Environment* → `ADMIN_CLAVE`.
   Entrá a `https://tu-servicio.onrender.com/admin.html` con esa contraseña.

Cosas a saber:

- **Costo:** plan Starter (unos USD 7 por mes) más el disco (unos USD 2,50 por mes por 10 GB). El plan gratis no sirve
  porque no tiene disco: cada reinicio borraría cuentas, catálogo y películas.
- **Películas:** conviene agregarlas **por link** (Internet Archive, por ejemplo) con «Reproducir desde el link»:
  no ocupan el disco y se ven más fluidas. Subir películas enteras funciona, pero llena el disco rápido.
- **La app de Android** abre directo `https://cinestream-fsji.onrender.com`, la dirección que está en
  `android/gradle.properties` (`cinetream.servidor`). Si cambiás de servidor, cambiala ahí (o creá la variable
  `CINETREAM_SERVIDOR` en GitHub → *Settings → Secrets and variables → Actions → Variables*) y GitHub compila las apps nuevas.
- La página `descargar.html` ofrece los APK de las Releases de GitHub (variable `DESCARGAS_URL`).
- Cada cambio que se sube a `main` se publica solo en Render.

## Para un servicio comercial

Esto es la plataforma (la parte que ve el público). Para venderla como servicio falta:

- **Derechos del contenido** que se vaya a ofrecer.
- **Hosting de video**: los videos se sirven desde un CDN o un servicio de video (por ejemplo Cloudflare Stream, Mux o
  Bunny Stream) con calidad adaptable (HLS), en lugar de archivos sueltos.
- **Facturación** (AFIP) de las suscripciones y la publicidad.
- **PostgreSQL** si algún día hacen falta varios servidores a la vez (SQLite alcanza para un servidor con decenas de miles de cuentas).
- **Apps de Samsung (Tizen) y LG (webOS)**: se arman empaquetando esta misma web con las herramientas de cada marca. La de Android TV ya está en `android/`.
- **Google Play**: subir los APK (o un AAB, con `./gradlew bundleRelease`) firmados con tu clave propia.

## Para programar: TypeScript y pruebas

El servidor está escrito en **TypeScript** (`*.ts`). Node 22.18 o más nuevo lo ejecuta directo, sin compilar:
`node server.js` arranca igual que antes (en Render no hay que cambiar nada, solo tener `NODE_VERSION=22`).

```bash
npm install          # solo para las herramientas de desarrollo (TypeScript)
npm run dev          # servidor que se reinicia solo al guardar cambios
npm run tipos        # revisa los tipos de todo el servidor
npm test             # pruebas automáticas (cuentas, pantallas, base de datos, links, R2 y el servidor entero)
npm run verificar    # las dos cosas
```

- `tipos.ts` define los datos de Cinetream (película, cuenta, plan, campaña, trámite…); `http.ts`, las utilidades de las rutas.
- `tsconfig.json` usa modo estricto y solo sintaxis que Node puede ejecutar directo (`erasableSyntaxOnly`).
- Las pruebas están en `pruebas/` y usan el corredor de pruebas de Node (`node:test`). Una de ellas arranca el servidor
  de verdad en una carpeta vacía, como una instalación nueva.
- En GitHub, cada cambio corre los tipos y las pruebas (*Actions → Cinetream · tipos y pruebas*).
- La plataforma y el administrador (`public/`) siguen en JavaScript; el próximo paso es pasarlos a TypeScript con React.

## Archivos

| Archivo | Para qué |
|---|---|
| `server.js` · `servidor.ts` | Arranque y servidor: sirve la plataforma, el catálogo, las portadas y los videos por partes. |
| `tipos.ts` · `http.ts` | Tipos de los datos y utilidades HTTP. |
| `pruebas/` | Pruebas automáticas (`npm test`). |
| `admin.ts` | Rutas del administrador: contraseña, importar, subir, editar y eliminar. |
| `importar.ts` | Análisis de links (Internet Archive, archivo directo, página con video) y descargas. |
| `datos.ts` | Catálogo y contraseña guardados en `datos/`. |
| `estadisticas.ts` | Reproducciones por película y estado de los links. |
| `base.ts` | Base de datos SQLite: colecciones, documentos, migración de los .json viejos y copias. |
| `respaldo.ts` | Copias de seguridad diarias, descarga y restauración. |
| `legal.ts` · `correo.ts` | Datos legales, trámites (baja, arrepentimiento, eliminación) y correos de contraseña nueva. |
| `public/legal.html` · `tramites.html` · `restablecer.html` | Términos y privacidad; botones de baja y arrepentimiento; contraseña nueva. |
| `pantallas.ts` · `public/pantallas.js` | Límite de pantallas a la vez: pedir lugar, señal mientras se ve y cortar en otro equipo. |
| `streamhg.ts` | Tu cuenta de StreamHG: lista de videos, datos, subida por link y reproductor para insertar. |
| `r2.ts` | Videos en Cloudflare R2: firma de pedidos (compatible con S3), subidas por partes y links firmados. |
| `red.ts` | IP del visitante y pedidos locales, también detrás del proxy de Render. |
| `../render.yaml` | Configuración para publicar en Render. |
| `cuentas.ts` | Cuentas, planes, sesiones y código para la tele. |
| `pagos.ts` | Suscripciones con Mercado Pago (o el modo prueba). |
| `publicidad.ts` | Campañas, piezas y estadísticas de publicidad. |
| `rutas-cuenta.ts` | Rutas del público: cuenta, planes, pagos y avisos. |
| `public/cuenta.js` · `anuncios.js` | Pantallas de bienvenida y planes; avisos antes de la película y banners. |
| `public/app-nativa.js` | Conexión con las apps de Android: elegir servidor, buscarlo en la wifi, pantalla encendida. |
| `public/descargar.html` | Página para bajar las apps (lee los APK de `descargas/`). |
| `android/` | App nativa para Android: `MainActivity.java` (la app), `BuscadorServidores.java` (busca en la wifi), `compilar.sh`. |
| `public/activar.html` · `pago-prueba.html` | Activar la tele desde el celular; pago simulado del modo prueba. |
| `public/admin.html` · `admin.js` · `admin.css` | La página del administrador. |
| `public/catalogo.js` | Películas de ejemplo (el catálogo inicial) y filas del inicio. |
| `public/app.js` | Pantallas, perfiles, búsqueda, Mi lista y Seguir viendo. |
| `public/reproductor.js` | Reproductor y señal de prueba. |
| `public/navegacion.js` | Navegación con control remoto. |
| `public/carteles.js` | Afiches dibujados en SVG. |
| `public/sw.js` | Guarda la plataforma para que abra al instante. |
