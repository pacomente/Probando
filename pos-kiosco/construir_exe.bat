@echo off
REM Arma dist\KioscoPOS.exe para instalar en las PCs de los clientes.
REM Requisitos: Python 3.11 o mas nuevo para Windows (python.org), con "Add to PATH".
cd /d "%~dp0"
python -m pip install -r requirements.txt pyinstaller || goto error
python -m PyInstaller --noconfirm --onefile --windowed --name KioscoPOS iniciar.py || goto error
echo.
echo Listo: dist\KioscoPOS.exe
pause
exit /b 0
:error
echo.
echo Hubo un error. Revisa los mensajes de arriba.
pause
exit /b 1
