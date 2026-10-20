# ⚓ Carta Náutica · Bahía Blanca

Carta náutica en vivo de la ría de Bahía Blanca, pensada para estudiantes de marinería:
buques moviéndose en tiempo real, avisos de tormenta, viento, olas, mareas y alertas de abordaje.

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
| 🧭 **Coordenadas náuticas** | Latitud y longitud en grados y minutos, y distancia y rumbo desde Ingeniero White. |

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

## Archivos

- `server.js`: servidor web. Recibe el AIS de aisstream.io (o simula) y se lo manda a la página cada 2 segundos.
- `public/app.js`: la carta (mapa, buques, tiempo, mareas, alertas, regla, GPS).
- `public/navegacion.js`: cálculos de navegación (distancia, rumbo, estima y CPA/TCPA). Buen material de estudio.
- `public/simulacion.js`: el tráfico de práctica.
- `public/registro.js`: junta los mensajes AIS de cada buque y guarda su estela.
- `public/vendor/leaflet`: librería de mapas [Leaflet](https://leafletjs.com) 1.9.4 (licencia BSD-2).
