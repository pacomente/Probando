"""Crea la clave privada del panel y escribe la pública en el programa.

Uso (una sola vez, antes de armar el primer .exe):
    python herramientas/generar_claves.py

- panel/datos/clave_privada.pem  -> se sube al servidor del panel. SECRETA.
- pos/clave_publica.py           -> va dentro del programa que vendés.

Si la clave privada ya existe, no se toca: solo se vuelve a escribir la pública.
"""
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
os.environ.setdefault("PANEL_DATOS", str(RAIZ / "panel" / "datos"))
sys.path.insert(0, str(RAIZ / "panel"))

from app import CARPETA, clave_publica_pem  # noqa: E402

existia = (CARPETA / "clave_privada.pem").exists()
pem = clave_publica_pem()
(RAIZ / "pos" / "clave_publica.py").write_text(
    "# Generado por herramientas/generar_claves.py. Es la clave PÚBLICA del panel:\n"
    "# sirve para comprobar que las licencias las firmó tu panel. No es secreta.\n"
    f'CLAVE_PUBLICA = """{pem}"""\n', encoding="utf-8")
print("Clave privada:", CARPETA / "clave_privada.pem", "(ya existía)" if existia else "(NUEVA)")
print("Clave pública escrita en pos/clave_publica.py")
print("Guardá una copia de la clave privada en un lugar seguro. No la subas a GitHub.")
