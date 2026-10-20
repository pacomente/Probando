# Trappi Tecnología · Carta náutica y monitoreo de flota

Sistema de **carta náutica en tiempo real y monitoreo de flota pesquera**. Cada barco ve el tráfico, el tiempo y las
emergencias a su alrededor, aun sin internet. La oficina en tierra ve toda su flota en vivo por Starlink.

> Sistema de apoyo y monitoreo. **No reemplaza** las cartas oficiales del Servicio de Hidrografía Naval, los equipos de
> navegación del buque, el sistema de monitoreo satelital exigido por la autoridad pesquera ni los avisos de Prefectura.

## Cómo funciona

```
        BARCO 1                                BARCO 2                     OFICINA EN TIERRA
 ┌──────────────────────┐              ┌──────────────────────┐        ┌──────────────────────┐
 │ GPS ─┐               │              │                      │        │  Navegador web       │
 │ AIS ─┼─► Trappi      │   Starlink   │      Trappi          │        │  (usuario y clave)   │
 │      │   a bordo     │◄────────────►│      a bordo         │        │  Flota en vivo,      │
 │ USB/ │   (PC puente) │   HTTPS      │                      │        │  alertas, recorridos │
 │ red  │               │      │       └──────────▲───────────┘        └──────────▲───────────┘
 └──────────────────────┘      │                  │                               │
                               ▼                  │                               │
                      ┌──────────────────────────────────────────────────────────────┐
                      │                     TRAPPI CENTRAL (nube)                      │
                      │  Cuentas por empresa · posiciones · historial · alertas SOS   │
                      └──────────────────────────────────────────────────────────────┘
```

- **Trappi a bordo** se instala en la PC del puente. Lee el GPS y el AIS del barco (por USB/serie o por la red),
  muestra la carta **sin necesidad de internet** y, cuando hay Starlink, envía la posición a la central cada minuto.
- **Trappi Central** corre en un servidor en la nube. Reúne los barcos de cada empresa y se los muestra a la oficina y a
  los demás barcos de **la misma empresa**. **Ninguna empresa ve la flota de otra**: la posición de los caladeros es
  información sensible.
- **Entre barcos sin internet** se ven por AIS de radio, como siempre, a unas 20 a 40 millas. **Con internet** se ven por
  la central, a cualquier distancia.
- Todas las conexiones salen del barco hacia la central (HTTPS). Esto funciona con Starlink, que no acepta conexiones entrantes.

## Funciones

### En el barco (Trappi a bordo)

| | |
|---|---|
| 🚢 **Tráfico AIS** | Buques cercanos con rumbo, velocidad, destino, estela y vector de 6 minutos, moviéndose de forma continua. |
| 🟣 **Flota de la empresa** | Los demás barcos de la empresa resaltados, a cualquier distancia (vía central). |
| ⚠ **Riesgo de abordaje** | CPA/TCPA con la situación del RIPA (alcance, vuelta encontrada, cruce, Regla 18) y quién debe maniobrar. |
| 🆘 **Hombre al agua** | Un toque marca la posición con el GPS del barco, da rumbo y distancia de vuelta y **avisa a la oficina y a la flota**. |
| 📻 **MAYDAY / PAN-PAN** | Mensaje armado con el formato de la OMI y la posición del GPS, listo para leer por VHF y para enviar a la oficina. |
| 🛟 **Radiobalizas AIS** | Alarma sonora y visual ante AIS-SART, MOB AIS o EPIRB-AIS activos. |
| 🌪 **Avisos de tormenta** | Temporal, tormenta eléctrica, caída de presión, mar gruesa y niebla en las próximas 24 h. |
| 🌊 **Mareas y viento** | Curva de marea, viento en la zona y pronóstico de 48 h. |
| 📘 **Guía OMI** | SMSSM, señales de socorro, reglas del RIPA, señales con niebla, balizamiento IALA B y Beaufort. |
| 📴 **Sin internet** | Funcionan la carta, la costa, el GPS, el AIS del barco, el MOB, el MAYDAY y el último pronóstico. Las posiciones se guardan y se envían al volver la conexión. |

### En la oficina (Trappi Central)

| | |
|---|---|
| 🗺 **Flota en vivo** | Todos los barcos de la empresa en el mapa, con la antigüedad de cada posición. |
| 🚨 **Alertas SOS** | Hombre al agua, MAYDAY o PAN-PAN de cualquier barco: alarma sonora, barra roja y notificación, con la posición del evento. |
| 🕑 **Recorridos** | Recorrido de las últimas 24 h de cada barco y millas navegadas. |
| 🔐 **Acceso privado** | Usuario y contraseña por empresa; cada barco con su propia clave. |

## Confiabilidad

- **Nunca muestra datos inventados.** Sin datos dice **SIN DATOS AIS**. Los buques de práctica solo aparecen si no hay
  ninguna fuente configurada, y se ven marcados como **SIMULACIÓN**.
- **Posiciones viejas marcadas.** Un buque sin señal hace más de 6 minutos se ve transparente y sale del cálculo de abordaje.
  La estima entre señales dura 3 minutos como máximo.
- **Datos corruptos descartados.** Se descartan las sentencias NMEA con checksum inválido y las posiciones imposibles
  (más de 60 nudos), tanto a bordo como en la central.
- **Nada se pierde con los cortes.** A bordo, posiciones y alertas se guardan en disco hasta que vuelve la conexión.
  Las alertas salen primero.
- **Estado visible.** La pestaña ⚠ Alertas muestra cada fuente con la antigüedad del último dato, la conexión con la
  central y los datos pendientes de envío.

## Instalación a bordo (Windows)

1. Instalar **Node.js 22 LTS** desde <https://nodejs.org>.
2. Copiar la carpeta `carta-nautica` a la PC, por ejemplo en `C:\Trappi`.
3. Doble clic en **`Trappi-a-bordo.bat`**. La primera vez instala los componentes y abre la configuración (`.env`).
4. Completar el `.env`:
   ```
   TRAPPI_CENTRAL_URL=https://central.tu-dominio.com
   TRAPPI_TOKEN=trp_...            # clave del barco, la da la central al registrarlo
   SERIAL=COM3:4800                # GPS por USB (ver el número de puerto en el Administrador de dispositivos)
   ```
   Para el AIS por USB se suma con coma: `SERIAL=COM3:4800,COM4:38400`. Si los equipos salen por la red del barco
   (multiplexor NMEA), usar `AIS_UDP_PORT` o `AIS_TCP`.
5. Opcional: **`instalar-inicio-automatico.bat`** para que arranque solo al encender la PC.

La carta se abre en el navegador en <http://localhost:3001>. Con `HOST=0.0.0.0` también se puede ver desde otras
pantallas o tablets de la red del barco.

## Instalación de la central (servidor)

En un servidor Linux con Node.js 22 y un dominio propio:

```bash
cd carta-nautica
cp .env.central.example .env.central
node central.js empresa "Pesquera del Sur"                    # muestra el código de la empresa
node central.js usuario <código> oficina                      # usuario de oficina (muestra la contraseña)
node central.js buque <código> "Don Vicente" 701000201        # muestra el TRAPPI_TOKEN del barco
node central.js                                               # arranca (puerto 3100)
```

Publicarla **siempre con HTTPS**. Por ejemplo con [Caddy](https://caddyserver.com), que obtiene el certificado solo:

```
central.tu-dominio.com {
    reverse_proxy localhost:3100
}
```

Los datos quedan en `datos-central/`: `cuentas.json` (contraseñas y claves guardadas cifradas con hash), el historial por
barco y día, y `alertas.jsonl`. Hay que hacer **copias de seguridad** de esa carpeta.

## Antes de comercializar

- **Mapas:** los servidores gratuitos de OpenStreetMap, Esri y CARTO no permiten uso comercial intensivo. Hay que
  contratar un proveedor de mapas (MapTiler, Stadia, etc.) o un servidor propio y cambiar las direcciones en `public/app.js`.
- **AIS:** revisar las condiciones de uso comercial de aisstream.io. Para ver barcos lejos de la costa (caladeros)
  hace falta **AIS satelital** (Spire, ORBCOMM…), que es un servicio pago.
- **Pronóstico:** Open-Meteo pide una suscripción para uso comercial.
- **Cartas oficiales:** las cartas electrónicas del SHN se licencian aparte.
- **Monitoreo obligatorio:** los pesqueros ya llevan el sistema de posicionamiento satelital que exige la autoridad.
  Trappi se ofrece como **complemento de gestión y seguridad**, no como reemplazo.
- **Datos de clientes:** las posiciones de la flota son información confidencial de cada empresa. Conviene un contrato
  que diga dónde se guardan, quién accede y por cuánto tiempo.

## Archivos

| Archivo | Para qué |
|---|---|
| `server.js` | Trappi a bordo: lee GPS/AIS, sirve la carta, se comunica con la central. |
| `central.js` | Trappi Central: cuentas, flota, historial, alertas y administración. |
| `enlace-central.js` | Envío de posiciones y alertas con cola en disco para los cortes de conexión. |
| `ais-nmea.js` | Lectura de sentencias NMEA: AIS (!AIVDM/!AIVDO) y GPS ($GPRMC). |
| `comun.js` | Código compartido por los dos servidores. |
| `public/` | La carta (web): `app.js`, `emergencia.js`, `navegacion.js` (cálculos y RIPA), `sw.js` (uso sin internet), `login.html` (oficina). |
| `Trappi-a-bordo.bat` | Arranque en Windows. |

Datos de terceros: costa © colaboradores de OpenStreetMap (ODbL), señalización © OpenSeaMap, mapas © OpenStreetMap,
Esri y CARTO, pronóstico Open-Meteo, librería de mapas Leaflet (BSD-2).

© Trappi Tecnología. Todos los derechos reservados.
