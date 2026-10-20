# ⚓ Carta Náutica · Bahía Blanca

Carta náutica en vivo de la ría de Bahía Blanca, pensada para estudiantes de marinería:
buques moviéndose en tiempo real, avisos de tormenta, viento, olas, mareas, alertas de abordaje con las reglas
del RIPA, emergencias (hombre al agua, radiobalizas AIS-SART, MAYDAY) y guía de la OMI. **Funciona sin internet.**

> **No apta para navegación.** Es una herramienta de estudio y seguimiento. Para navegar usá las cartas
> oficiales del Servicio de Hidrografía Naval (SHN) y los avisos a los navegantes de Prefectura.

## Qué tiene

| Función | Qué hace |
|---|---|
| 🚢 **Buques en tiempo real (AIS)** | Posición, rumbo, velocidad, destino, ETA, eslora, calado y bandera de cada buque. Se mueven de forma continua (estima entre señales) y dejan **estela** y **vector de 6 minutos**, como en un ECDIS. |
| ⚠ **Riesgo de abordaje (CPA/TCPA)** | Calcula a qué distancia se van a cruzar dos buques y en cuántos minutos. Si es menos del límite (0,2 / 0,5 / 1 MN) dibuja una línea roja y avisa. |
| 🌪 **Avisos de tormenta** | Barra roja arriba si en las próximas 24 h viene **temporal** (Fuerza 8 o más), **tormenta eléctrica**, **caída rápida de presión**, **mar gruesa** o **niebla**. Detecta viento del S-SO (posible **pampero**) y del SE (**sudestada**). |
| 🔔 **Avisos al teléfono** | Con el botón Avisos te notifica y hace vibrar el teléfono si llega un temporal o si un buque va a pasar peligrosamente cerca de vos. |
| 🌬 **Viento en la ría** | Flechas animadas en 9 puntos de la ría con nudos y ráfagas, coloreadas según la escala Beaufort. Pronóstico de 48 h con fuerza Beaufort y olas. |
| 🌊 **Mareas** | Curva de las próximas 42 h con próxima pleamar y bajamar. |
| 🗺 **Capas** | Carta (OpenStreetMap), satélite u oscuro, más **balizas, boyas y faros de OpenSeaMap**, puertos (Ing. White, Galván, Rosales, Puerto Belgrano, Cuatreros, Prefectura) y el Canal Principal. |
| 📏 **Regla** | Tocá puntos en la carta: da distancia en millas, rumbo verdadero y cuánto tardás a 6 y a 10 nudos. |
| 📍 **Mi posición** | Usa el GPS del teléfono, te muestra en la carta y calcula el riesgo de abordaje con los demás buques. |
| 🌙 **Modo noche** | Todo en rojo para no perder la visión nocturna en el puente. |
| 🆘 **Hombre al agua (MOB)** | Un toque marca la posición de la caída con el GPS, cuenta el tiempo y da **rumbo y distancia para volver**. Incluye la maniobra Williamson y qué hacer. Queda guardado aunque se cierre la página. |
| 🛟 **Radiobalizas AIS** | Detecta **AIS-SART** (MMSI 970…), **MOB AIS** (972…) y **EPIRB-AIS** (974…): barra roja intermitente, **alarma sonora**, vibración y aviso con la posición. Distingue las pruebas de equipo de las emergencias reales. |
| 📻 **MAYDAY listo para leer** | Arma el mensaje **MAYDAY / PAN-PAN / SÉCURITÉ** con el formato de la OMI (SMCP), en español con las frases en inglés, y pone tu posición del GPS en grados y minutos. Botón para llamar a Prefectura (106). |
| 📘 **Guía OMI** | Canales y equipos del SMSSM (GMDSS), señales de socorro (RIPA Anexo IV), reglas de rumbo y gobierno, señales fónicas con niebla, balizamiento IALA B, alfabeto fonético y escala Beaufort. |
| ⚖ **Reglas del RIPA en cada alerta** | Cada riesgo de abordaje dice qué situación es (alcance, vuelta encontrada, cruce o jerarquía de la Regla 18) y **quién debe maniobrar**. |
| 🧭 **Coordenadas náuticas** | Latitud y longitud en grados y minutos, y distancia y rumbo desde Ingeniero White. |

## Confiabilidad: qué hace para no mostrar datos falsos

- **Nunca inventa buques.** Si no llegan datos AIS, dice **SIN DATOS AIS** y no muestra nada. Los buques de práctica
  solo aparecen si el servidor no tiene ninguna fuente configurada (dice **SIMULACIÓN**) o si abrís la página con `?practica`.
- **Señal vieja = transparente.** Un buque sin señal hace más de 6 minutos se ve transparente y con aviso. Se deja de
  calcular su riesgo de abordaje, porque su posición ya no es fiable.
- **Estima limitada.** Entre señales, la posición se adelanta según rumbo y velocidad durante 3 minutos como máximo.
  Pasado ese tiempo se muestra la última posición recibida.
- **Datos imposibles descartados.** Una posición que exigiría navegar a más de 60 nudos se ignora, porque casi
  siempre es un error del GPS o del AIS. Las sentencias NMEA con checksum inválido también se descartan.
- **Estado de los datos** (pestaña ⚠ Alertas): muestra cada fuente con la antigüedad del último dato, el pronóstico,
  el GPS con su precisión y la carta guardada.
- **Lo aproximado está marcado como aproximado**: puertos y Canal Principal. El canal viene apagado: guiate por las
  boyas reales de OpenSeaMap y por la carta del SHN.

## Sin internet

| Funciona sin internet | Cómo |
|---|---|
| La página completa | Queda guardada en el dispositivo la primera vez que la abrís (se puede **instalar como app**). |
| La costa y las islas de la ría | Vienen incluidas (datos de OpenStreetMap), siempre visibles debajo del mapa. |
| El mapa detallado y las boyas | Se guardan las zonas que mirás. Antes de salir, recorré la ría con internet o usá **💾 Guardar la zona visible**. |
| GPS, MOB, regla, MAYDAY y guía OMI | No necesitan red. |
| Pronóstico, avisos de tormenta y mareas | Se usa el último pronóstico guardado (cubre hasta 4 días), marcado como guardado. |
| **Buques AIS** | Con un **receptor AIS a bordo** conectado a la compu donde corre el servidor (ver abajo). |

### Receptor AIS a bordo (sin internet)

Un receptor AIS (por ejemplo dAISy, o una antena VHF con un dongle RTL-SDR y AIS-catcher) recibe directamente las
señales de los buques cercanos, unas 20 a 40 millas según la antena. Configurá el receptor para que mande NMEA por la red
y poné en `.env`:

```
AIS_UDP_PORT=10110          # si el receptor envía por UDP
AIS_TCP=192.168.1.50:10110  # o si sirve NMEA por TCP
```

Se pueden usar al mismo tiempo que aisstream.io: con internet suma la cobertura de tierra, y sin internet sigue el receptor.

## Puesta en marcha

Necesitás [Node.js](https://nodejs.org) 22 o superior. No hace falta `npm install`: no tiene dependencias.

```bash
cd carta-nautica
npm start
```

Abrí <http://localhost:3001>. Sin clave AIS arranca en **modo simulación**, con buques de práctica
(los que terminan en "(SIM)") que entran y salen por el Canal Principal.

### Ver los buques reales

1. Creá una cuenta gratis en <https://aisstream.io> y generá una **API Key**.
2. Copiá `.env.example` como `.env` y pegá la clave:
   ```
   AISSTREAM_API_KEY=tu_clave
   ```
3. Reiniciá con `npm start`. Arriba va a decir **AIS EN VIVO**.

La clave queda en el servidor y nunca se manda al navegador. La cobertura AIS en la ría depende de las
estaciones receptoras en tierra: en algunos momentos puede haber pocos buques o señales atrasadas.

### En GitHub Codespaces

Abrí el Codespace, en la terminal ejecutá `cd carta-nautica && npm start` y abrí el puerto **3001**
desde la pestaña **Ports**. Para la clave AIS, creá el archivo `.env` como arriba.

## De dónde salen los datos

- **Buques**: [aisstream.io](https://aisstream.io) (AIS terrestre, gratis con registro).
- **Viento, presión, olas y marea**: [Open-Meteo](https://open-meteo.com) (gratis, sin clave). La marea es la
  de un modelo global en la boca de la ría: **dentro de la ría la amplitud es mucho mayor**. Para la hora y la altura
  reales en Ingeniero White usá las [tablas de marea del SHN](https://www.hidro.gov.ar/oceanografia/tmareas/form_tmareas.asp).
- **Carta**: OpenStreetMap y [OpenSeaMap](https://openseamap.org) (señalización marítima cargada por voluntarios).

Las posiciones de los puertos y el trazado del Canal Principal son aproximados.

La guía OMI es un resumen de estudio de los convenios (RIPA/COLREG 72, SOLAS, SMSSM, SMCP): no reemplaza los textos
oficiales ni las normas de Prefectura Naval Argentina.

## Archivos

- `server.js`: servidor web. Recibe el AIS de aisstream.io (o simula) y se lo manda a la página cada 2 segundos.
- `ais-nmea.js`: decodificador de sentencias AIS NMEA (!AIVDM) para el receptor a bordo.
- `public/app.js`: la carta (mapa, buques, tiempo, mareas, alertas, regla, GPS, estado de los datos).
- `public/emergencia.js`: radiobalizas AIS, alarma, hombre al agua y mensajes MAYDAY / PAN-PAN / SÉCURITÉ.
- `public/navegacion.js`: cálculos de navegación (distancia, rumbo, estima, CPA/TCPA) y situaciones del RIPA. Buen material de estudio.
- `public/sw.js`: guarda la página y el mapa en el dispositivo para usarlos sin internet.
- `public/costa.js`: costa e islas de la ría (© OpenStreetMap, ODbL, vía @geo-maps/earth-lands-1m).
- `public/simulacion.js`: el tráfico de práctica.
- `public/registro.js`: junta los mensajes AIS de cada buque y guarda su estela.
- `public/vendor/leaflet`: librería de mapas [Leaflet](https://leafletjs.com) 1.9.4 (licencia BSD-2).
