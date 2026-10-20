@echo off
rem Trappi a bordo - Trappi Tecnologia
rem Inicia la carta en la PC del puente. Doble clic para abrir.
chcp 65001 >nul
title Trappi a bordo - Trappi Tecnologia
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js 22 o superior. Descargalo de https://nodejs.org ^(version LTS^) e instalalo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\serialport (
  echo  Instalando componentes para leer el GPS y el AIS por USB...
  call npm install --no-audit --no-fund
)

if not exist .env (
  copy .env.example .env >nul
  echo  Se creo el archivo de configuracion .env. Completalo con los datos del barco y guardalo.
  notepad .env
)

echo.
echo  Trappi a bordo en marcha. No cierres esta ventana mientras uses la carta.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3001"
node server.js
echo.
echo  Trappi a bordo se detuvo.
pause
