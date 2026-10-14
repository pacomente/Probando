#!/usr/bin/env bash
# Arranca Ollama en segundo plano si no está ya en marcha y espera a que responda
if ! curl -sf http://localhost:11434/api/tags > /dev/null; then
  echo "▶ Arrancando Ollama…"
  nohup setsid ollama serve > /tmp/ollama.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -sf http://localhost:11434/api/tags > /dev/null && break
    sleep 1
  done
fi
curl -sf http://localhost:11434/api/tags > /dev/null || { echo "✖ Ollama no arrancó (mira /tmp/ollama.log)"; exit 1; }
