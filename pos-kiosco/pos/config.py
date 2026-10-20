"""Carpetas y configuración del comercio."""
import json
import os
from pathlib import Path

APP = "KioscoPOS"

MEDIOS_PAGO = ["Efectivo", "Débito", "Crédito", "Transferencia", "Mercado Pago / QR"]

POR_DEFECTO = {
    "comercio": "Mi Kiosco",
    "direccion": "",
    "telefono": "",
    "cuit": "",
    "pie_ticket": "¡Gracias por su compra!",
    "imprimir_ticket": "preguntar",  # "siempre", "preguntar" o "nunca"
    "ancho_ticket": 32,
    "clave_dueno": "",
    "carpeta_respaldo_extra": "",
}


def carpeta_datos() -> Path:
    """Donde quedan las planillas de Excel (Documentos/KioscoPOS)."""
    if os.environ.get("KIOSCO_DATOS"):
        return Path(os.environ["KIOSCO_DATOS"])
    return Path.home() / "Documents" / APP


def carpeta_config() -> Path:
    """Donde se guarda la licencia (AppData en Windows)."""
    if os.environ.get("KIOSCO_CONFIG"):
        return Path(os.environ["KIOSCO_CONFIG"])
    base = os.environ.get("APPDATA") or Path.home() / ".config"
    return Path(base) / APP


class Configuracion(dict):
    def __init__(self, carpeta: Path):
        super().__init__(POR_DEFECTO)
        self.ruta = Path(carpeta) / "configuracion.json"
        try:
            self.update(json.loads(self.ruta.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass

    def guardar(self):
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        temporal = self.ruta.with_suffix(".tmp")
        temporal.write_text(json.dumps(self, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporal, self.ruta)
