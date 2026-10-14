#!/usr/bin/env bash
# Se ejecuta cada vez que abres el Codespace: arranca Ollama y la IA
set -euo pipefail
bash "$(dirname "$0")/ollama-up.sh"
cd "$(dirname "$0")/../mi-ia"
exec npm start
