@echo off
rem Hace que Trappi a bordo arranque solo al encender la PC del barco.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\Trappi a bordo.lnk');" ^
  "$s.TargetPath = '%~dp0Trappi-a-bordo.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
if errorlevel 1 (
  echo No se pudo crear el inicio automatico.
) else (
  echo Listo: Trappi a bordo va a arrancar solo cada vez que se encienda la PC.
)
pause
