# ✦ Mi IA — asistente propio en local

Asistente de chat con nombre y personalidad propios que funciona **100 % en tu ordenador**
con modelos open-source (Llama, Mistral, Qwen, Gemma…) a través de [Ollama](https://ollama.com).
Sin APIs de pago, sin enviar tus datos a terceros.

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior
- [Ollama](https://ollama.com/download) instalado

## Puesta en marcha

```bash
# 1. Descarga un modelo (solo la primera vez, ~2 GB)
ollama pull qwen2.5:3b

# 2. Arranca la app (no necesita npm install: no tiene dependencias)
cd mi-ia
npm start
```

Abre <http://localhost:3000> y empieza a chatear.

## Probarla en GitHub Codespaces (sin instalar nada)

1. En la página del repositorio pulsa **Code → Codespaces → Create codespace on main**.
2. Espera a que termine la preparación: la primera vez instala Ollama y descarga el modelo
   `qwen2.5:3b` (unos minutos).
3. La IA arranca sola y se abre en una pestaña del navegador. Si no se abre, ve a la
   pestaña **Ports** y abre la dirección del puerto 3000.

Notas:
- Los Codespaces no tienen GPU: por eso usa un modelo pequeño y las respuestas tardan unos segundos.
- El plan gratuito tiene un límite de horas al mes: detén el Codespace cuando termines.
- Para cambiar de modelo, edita `MODEL` en `.devcontainer/model.sh`; se descarga solo la próxima vez que abras el Codespace.

## Qué sabe hacer

- Conversar y responder preguntas con formato (títulos, listas, tablas, código).
- **Crear páginas web**: pídele una web, una landing o un juego y pulsa **▶ Ver página** para verla
  funcionando dentro del chat, o **Descargar** para guardarla como `.html`.
- **Resumir documentos**: pulsa 📎 (o arrastra un archivo al chat) y te devuelve un resumen,
  los puntos clave y las **palabras clave**. Lee PDF (con texto, no escaneados), Word `.docx`,
  `.txt`, `.md`, `.csv`, `.json` y `.html`. Si escribes algo antes de adjuntarlo, lo usa como
  instrucción (por ejemplo: «céntrate en las fechas»). Después puedes hacerle preguntas sobre él.
  Los documentos largos se leen por partes; el texto se extrae en tu navegador y no sale de tu máquina.
- Copiar respuestas o código y **regenerar** la última respuesta si no te convence.

## ¿Cómo hacerla más inteligente?

Lo que sabe tu IA depende sobre todo del **modelo**. Cuanto más grande, más sabe y mejor razona,
pero necesita más memoria y responde más lento:

| Modelo              | Tamaño | RAM recomendada | Para qué                                    |
|---------------------|--------|-----------------|---------------------------------------------|
| `llama3.2:1b`       | 1,3 GB | 4 GB            | Muy rápido, pero sabe poco                  |
| `qwen2.5:3b`        | 1,9 GB | 8 GB            | Buen equilibrio (por defecto)               |
| `qwen2.5-coder:7b`  | 4,7 GB | 16 GB           | Mucho mejor creando páginas web y código    |
| `qwen2.5:7b`        | 4,7 GB | 16 GB           | Sabe bastante más y razona mejor            |
| `qwen2.5:14b`       | 9 GB   | 32 GB           | Muy bueno; ideal con tarjeta gráfica        |

Descárgalo con `ollama pull <modelo>` y elígelo en el selector de arriba a la derecha.
En Codespaces, los modelos de 7b necesitan una máquina de 4 núcleos (16 GB).

## Personalizar tu IA

- **Nombre, modelo y puerto**: copia `.env.example` a `.env` y edítalo.
- **Personalidad e instrucciones**: cambia el texto de `systemPrompt()` en `server.js`.
- **Otros modelos**: `ollama pull mistral`, `ollama pull qwen2.5`, etc. Aparecerán solos en el selector.

## Estructura

```
mi-ia/
├── server.js        # servidor Node: interfaz web + puente con Ollama (streaming)
└── public/
    ├── index.html   # interfaz de chat
    ├── style.css
    ├── app.js       # lógica del chat (historial guardado en el navegador)
    ├── documents.js # lectura de PDF, Word y texto, y palabras más frecuentes
    └── vendor/      # marked (Markdown), DOMPurify y pdf.js, incluidos para funcionar sin internet
```

## API

- `GET /api/config` → nombre de la IA y modelo por defecto
- `GET /api/models` → modelos instalados en Ollama
- `POST /api/chat` `{ model, messages: [{ role, content }] }` → respuesta en streaming (texto)
