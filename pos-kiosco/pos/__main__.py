"""Arranque del Kiosco POS:  python -m pos"""
import datetime as dt
import os
import sys
import tkinter as tk
from tkinter import messagebox

from . import ajustes_fabrica as fabrica
from .almacen import Almacen
from .clave_publica import CLAVE_PUBLICA
from .config import Configuracion, carpeta_config, carpeta_datos
from .licencia import Licencia
from .ui import App


def bloquear_instancia(carpeta):
    """Evita abrir el programa dos veces (mezclaría los datos)."""
    archivo = open(carpeta / ".en_uso", "a+")
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(archivo.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(archivo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return None
    return archivo


def main():
    datos = carpeta_datos()
    datos.mkdir(parents=True, exist_ok=True)
    candado = bloquear_instancia(datos)
    if candado is None:
        raiz = tk.Tk()
        raiz.withdraw()
        messagebox.showwarning(fabrica.NOMBRE_PRODUCTO, "El programa ya está abierto.")
        return 1

    almacen = Almacen(datos)

    def ultima_fecha():
        if not almacen.ultima_fecha:
            return 0
        return dt.datetime.strptime(almacen.ultima_fecha, "%Y-%m-%d %H:%M:%S").timestamp()

    licencia = Licencia(carpeta_config(), fabrica.SERVIDOR_LICENCIAS, CLAVE_PUBLICA, version=fabrica.VERSION,
                        ultima_fecha=ultima_fecha)
    app = App(almacen, Configuracion(datos), licencia)
    try:
        app.mainloop()
    finally:
        almacen.cerrar()
        candado.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
