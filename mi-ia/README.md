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
ollama pull llama3.2

# 2. Arranca la app (no necesita npm install: no tiene dependencias)
cd mi-ia
npm start
```

Abre <http://localhost:3000> y empieza a chatear.

## Probarla en GitHub Codespaces (sin instalar nada)

1. En la página del repositorio pulsa **Code → Codespaces → Create codespace on main**.
2. Espera a que termine la preparación: la primera vez instala Ollama y descarga el modelo
   `llama3.2:1b` (unos minutos).
3. La IA arranca sola y se abre en una pestaña del navegador. Si no se abre, ve a la
   pestaña **Ports** y abre la dirección del puerto 3000.

Notas:
- Los Codespaces no tienen GPU: por eso usa el modelo pequeño y las respuestas tardan unos segundos.
- El plan gratuito tiene un límite de horas al mes: detén el Codespace cuando termines.
- Para cambiar de modelo, edita `MODEL` en `.devcontainer/devcontainer.json` y recrea el Codespace.

## Personalizar tu IA

- **Nombre, modelo y puerto**: copia `.env.example` a `.env` y edítalo.
- **Personalidad**: cambia el texto `SYSTEM_PROMPT` en `server.js`.
- **Otros modelos**: `ollama pull mistral`, `ollama pull qwen2.5`, etc. Aparecerán solos en el selector.

| Modelo        | Tamaño | RAM recomendada |
|---------------|--------|-----------------|
| `llama3.2:1b` | 1,3 GB | 4 GB            |
| `llama3.2`    | 2 GB   | 8 GB            |
| `qwen2.5:7b`  | 4,7 GB | 16 GB           |

## Estructura

```
mi-ia/
├── server.js        # servidor Node: interfaz web + puente con Ollama (streaming)
└── public/
    ├── index.html   # interfaz de chat
    ├── style.css
    └── app.js       # lógica del chat (historial guardado en el navegador)
```

## API

- `GET /api/config` → nombre de la IA y modelo por defecto
- `GET /api/models` → modelos instalados en Ollama
- `POST /api/chat` `{ model, messages: [{ role, content }] }` → respuesta en streaming (texto)
