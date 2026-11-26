#!/usr/bin/env bash
# Compila las dos apps de Android y las deja en ../descargas para ofrecerlas desde el servidor (descargar.html).
# Uso:  ./compilar.sh                      → la app pregunta el servidor al abrirla (o busca en la wifi)
#       ./compilar.sh https://cine.tudominio.com  → la app abre directo ese servidor
set -euo pipefail
cd "$(dirname "$0")"
SERVIDOR="${1:-}"
./gradlew assembleRelease --no-daemon -q -Pcinetream.servidor="$SERVIDOR"
mkdir -p ../descargas
cp app/build/outputs/apk/celular/release/cinetream-celular-*.apk ../descargas/cinetream-celular.apk
cp app/build/outputs/apk/tele/release/cinetream-tele-*.apk ../descargas/cinetream-tele.apk
ls -lh ../descargas/*.apk
echo "Listo. Se descargan desde http://<esta-PC>:3500/descargar.html"
