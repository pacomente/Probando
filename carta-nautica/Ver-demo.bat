@echo off
rem Demostracion de Trappi Tecnologia: abre la portada con la vista a bordo y la de la oficina.
chcp 65001 >nul
title Trappi - Demostracion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js 22 o superior. Descargalo de https://nodejs.org ^(version LTS^) e instalalo.
  echo.
  pause
  exit /b 1
)

echo.
echo  Demostracion de Trappi en marcha: se abre en el navegador.
echo  Si no se abre sola, entra a http://localhost:3001/demo.html
echo  Para cerrarla, cerra esta ventana.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3001/demo.html"
node server.js
pause
