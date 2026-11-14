@echo off
rem Cinetream: abre la plataforma en esta PC y la deja disponible para la tele y el celular de la misma wifi.
chcp 65001 >nul
title Cinetream
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js. Descargalo de https://nodejs.org ^(version LTS^) e instalalo.
  echo.
  pause
  exit /b 1
)

echo.
echo  Cinetream en marcha. No cierres esta ventana mientras la uses.
echo  Para abrirla en la tele o el celular, usa la direccion "misma wifi" que aparece abajo.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3500"
node server.js
pause
