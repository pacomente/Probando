#!/usr/bin/env bash
# Se ejecuta cada vez que abres el Codespace: arranca Ollama y la IA
set -euo pipefail
source "$(dirname "$0")/model.sh"
bash "$(dirname "$0")/ollama-up.sh"

# Si cambiaste de modelo en model.sh, lo descarga la primera vez
if ! ollama show "$MODEL" > /dev/null 2>&1; then
  echo "▶ Descargando el modelo $MODEL (puede tardar unos minutos)…"
  ollama pull "$MODEL"
fi

cd "$(dirname "$0")/../mi-ia"
exec npm start
