#!/usr/bin/env bash
# Se ejecuta una sola vez al crear el Codespace
set -euo pipefail

if ! command -v ollama > /dev/null; then
  echo "▶ Instalando Ollama…"
  sudo apt-get update -qq && sudo apt-get install -y -qq zstd > /dev/null
  curl -fsSL https://ollama.com/install.sh | sh
fi

bash "$(dirname "$0")/ollama-up.sh"

MODEL="${MODEL:-llama3.2:1b}"
echo "▶ Descargando el modelo $MODEL (puede tardar unos minutos)…"
ollama pull "$MODEL"
echo "✔ Listo"
