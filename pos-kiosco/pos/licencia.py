"""Licencia del programa, controlada desde tu panel web.

- El cliente activa con una clave (KPOS-XXXX-...). La clave queda atada a esa PC.
- El panel devuelve un permiso firmado digitalmente: el cliente no lo puede
  falsificar ni estirar la fecha, porque no tiene la clave privada del panel.
- El permiso dura unos días sin internet; cada vez que hay conexión se renueva.
- Si desactivás la licencia en el panel, en la próxima consulta el programa
  queda bloqueado (las planillas de Excel siguen siendo del cliente).
- Si atrasan el reloj de la PC para estirar el permiso, se detecta.
"""
import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.serialization import load_pem_public_key

ACTIVA = "activa"
SIN_LICENCIA = "sin_licencia"
SUSPENDIDA = "suspendida"
VENCIDA = "vencida"  # pasó demasiado tiempo sin conectarse
RELOJ = "reloj"  # la fecha de la PC está atrasada
ERROR = "error"


def id_equipo() -> str:
    crudo = None
    if os.name == "nt":
        try:
            import winreg
            clave = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography", 0,
                                   winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
            crudo = winreg.QueryValueEx(clave, "MachineGuid")[0]
        except OSError:
            pass
    if not crudo:
        try:
            crudo = Path("/etc/machine-id").read_text().strip()
        except OSError:
            crudo = str(uuid.getnode())
    resumen = hashlib.sha256(f"kioscopos:{crudo}".encode()).hexdigest()[:16].upper()
    return "-".join(resumen[i:i + 4] for i in range(0, 16, 4))


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _desde_b64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def leer_permiso(token: str, clave_publica_pem: str):
    """Devuelve el contenido del permiso si la firma es válida, si no None."""
    try:
        carga, firma = token.strip().split(".")
        datos = _desde_b64(carga)
        load_pem_public_key(clave_publica_pem.encode()).verify(_desde_b64(firma), datos)
        return json.loads(datos)
    except (ValueError, InvalidSignature, TypeError, AttributeError):
        return None


class Licencia:
    def __init__(self, carpeta, servidor, clave_publica, version="", equipo=None, ultima_fecha=None,
                 reloj=time.time):
        self.carpeta = Path(carpeta)
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self.ruta = self.carpeta / "licencia.dat"
        self.servidor = servidor.rstrip("/")
        self.clave_publica = clave_publica
        self.version = version
        self.equipo = equipo or id_equipo()
        self.ultima_fecha = ultima_fecha or (lambda: 0)  # última venta registrada (epoch)
        self.reloj = reloj
        self.ultima_verificacion = None
        self._datos = self._leer()

    # -- archivo local ---------------------------------------------------
    def _leer(self):
        try:
            return json.loads(self.ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _guardar(self):
        temporal = self.ruta.with_suffix(".tmp")
        temporal.write_text(json.dumps(self._datos), encoding="utf-8")
        os.replace(temporal, self.ruta)

    @property
    def clave(self):
        return self._datos.get("clave", "")

    def permiso(self):
        if not self.clave_publica or not self._datos.get("token"):
            return None
        return leer_permiso(self._datos["token"], self.clave_publica)

    # -- estado ----------------------------------------------------------
    def estado(self):
        """Devuelve (estado, mensaje para el usuario)."""
        if not self.clave_publica:
            return ERROR, "Falta configurar la clave pública del programa (ver README)."
        permiso = self.permiso()
        if not permiso or permiso.get("clave") != self.clave:
            return SIN_LICENCIA, "Ingresá tu clave de licencia para activar el programa."
        if permiso.get("equipo") != self.equipo:
            return SIN_LICENCIA, "Esta licencia fue activada en otra computadora."
        ahora = self.reloj()
        visto = max(float(self._datos.get("visto", 0)), float(self.ultima_fecha() or 0), permiso["emitido"])
        if ahora + 3600 < visto:
            return RELOJ, "La fecha u hora de la computadora está atrasada. Corregila para seguir usando el programa."
        if ahora > float(self._datos.get("visto", 0)) + 60:
            self._datos["visto"] = ahora
            self._guardar()
        if permiso.get("estado") != ACTIVA:
            return SUSPENDIDA, permiso.get("mensaje") or "La licencia está suspendida."
        if ahora > permiso["valido_hasta"]:
            return VENCIDA, "Hace muchos días que el programa no se conecta a internet. Conectate para seguir."
        return ACTIVA, ""

    def dias_restantes(self):
        permiso = self.permiso()
        if not permiso:
            return 0
        return max(0, int((permiso["valido_hasta"] - self.reloj()) // 86400))

    # -- servidor --------------------------------------------------------
    def _consultar(self, clave):
        cuerpo = json.dumps({"clave": clave, "equipo": self.equipo, "version": self.version}).encode()
        pedido = urllib.request.Request(f"{self.servidor}/api/verificar", data=cuerpo,
                                        headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(pedido, timeout=10) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read())
            except ValueError:
                return {"error": "servidor", "mensaje": f"El servidor respondió con error {e.code}."}

    def activar(self, clave):
        """Activa con una clave nueva. Devuelve (ok, mensaje)."""
        clave = clave.strip().upper()
        try:
            respuesta = self._consultar(clave)
        except (OSError, ValueError):
            return False, "No se pudo conectar. Revisá que haya internet e intentá de nuevo."
        if "token" not in respuesta:
            return False, respuesta.get("mensaje", "No se pudo activar la licencia.")
        permiso = leer_permiso(respuesta["token"], self.clave_publica or "")
        if not permiso or permiso.get("clave") != clave or permiso.get("equipo") != self.equipo:
            return False, "La respuesta del servidor no es válida."
        self._datos.update(clave=clave, token=respuesta["token"])
        self._guardar()
        self.ultima_verificacion = self.reloj()
        estado, mensaje = self.estado()
        return estado == ACTIVA, mensaje or "¡Licencia activada!"

    def verificar_en_linea(self):
        """Renueva el permiso. Devuelve True si se pudo hablar con el servidor."""
        if not self.clave:
            return False
        try:
            respuesta = self._consultar(self.clave)
        except (OSError, ValueError):
            return False
        token = respuesta.get("token")
        permiso = leer_permiso(token, self.clave_publica or "") if token else None
        if permiso and permiso.get("clave") == self.clave and permiso.get("equipo") == self.equipo:
            self._datos["token"] = token
            self._guardar()
        self.ultima_verificacion = self.reloj()
        return True
