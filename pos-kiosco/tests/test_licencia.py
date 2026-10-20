"""Prueba el programa y el panel juntos: activar, suspender, sin internet, reloj."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "panel"))

_tmp = tempfile.TemporaryDirectory()
os.environ["PANEL_DATOS"] = _tmp.name
os.environ["PANEL_CLAVE"] = "secreta"

import app as panel  # noqa: E402

from pos import licencia as lic  # noqa: E402

DIA = 86400


class Reloj:
    def __init__(self):
        import time
        self.t = time.time()

    def __call__(self):
        return self.t


class TestLicencia(unittest.TestCase):
    def setUp(self):
        self.web = panel.app.test_client()
        self.carpeta = tempfile.TemporaryDirectory()
        self.reloj = Reloj()
        reloj_panel = mock.patch.object(panel.time, "time", self.reloj)  # panel y PC con la misma hora
        reloj_panel.start()
        self.addCleanup(reloj_panel.stop)
        self.sin_internet = False
        self.licencia = self.nueva_pc("PC-1")
        self.entrar()
        respuesta = self.web.post("/nueva", data={"csrf": "x", "cliente": "Kiosco Pepe"})
        self.id = int(respuesta.headers["Location"].rsplit("/", 1)[1])
        with panel.app.app_context():
            self.clave = panel.db().execute("SELECT clave FROM licencias WHERE id = ?", (self.id,)).fetchone()[0]

    def tearDown(self):
        self.carpeta.cleanup()

    def nueva_pc(self, equipo):
        licencia = lic.Licencia(Path(self.carpeta.name) / equipo, "http://panel", panel.clave_publica_pem(),
                                equipo=equipo, reloj=self.reloj)
        licencia._consultar = self.consultar_panel(licencia)
        return licencia

    def consultar_panel(self, licencia):
        def consultar(clave):
            if self.sin_internet:
                raise OSError("sin internet")
            r = self.web.post("/api/verificar", json={"clave": clave, "equipo": licencia.equipo})
            return r.get_json()
        return consultar

    def entrar(self):
        with self.web.session_transaction() as s:
            s["dentro"] = True
            s["csrf"] = "x"

    def accion(self, accion, **datos):
        self.entrar()  # la sesión vence a los 7 días y la prueba adelanta el reloj
        self.web.post(f"/licencia/{self.id}", data={"csrf": "x", "accion": accion, **datos})

    def test_flujo_completo(self):
        self.assertEqual(self.licencia.estado()[0], lic.SIN_LICENCIA)
        self.assertFalse(self.licencia.activar("KPOS-NOEX-ISTE-XXXX-XXXX")[0])
        ok, _ = self.licencia.activar(self.clave.lower())
        self.assertTrue(ok)
        self.assertEqual(self.licencia.estado()[0], lic.ACTIVA)

        # Otra PC no puede usar la misma clave
        otra = self.nueva_pc("PC-2")
        ok, mensaje = otra.activar(self.clave)
        self.assertFalse(ok)
        self.assertIn("otra computadora", mensaje)

        # Suspender desde el panel bloquea en la próxima verificación
        self.accion("suspender")
        self.assertTrue(self.licencia.verificar_en_linea())
        self.assertEqual(self.licencia.estado()[0], lic.SUSPENDIDA)
        self.accion("activar")
        self.licencia.verificar_en_linea()
        self.assertEqual(self.licencia.estado()[0], lic.ACTIVA)

        # Sin internet funciona unos días y después se bloquea
        self.sin_internet = True
        self.reloj.t += 5 * DIA
        self.assertFalse(self.licencia.verificar_en_linea())
        self.assertEqual(self.licencia.estado()[0], lic.ACTIVA)
        self.reloj.t += 3 * DIA
        self.assertEqual(self.licencia.estado()[0], lic.VENCIDA)
        # Atrasar el reloj no sirve
        self.reloj.t -= 4 * DIA
        self.assertEqual(self.licencia.estado()[0], lic.RELOJ)
        # Al volver internet se renueva sola
        self.sin_internet = False
        self.reloj.t += 4 * DIA
        self.licencia.verificar_en_linea()
        self.assertEqual(self.licencia.estado()[0], lic.ACTIVA)

        # Liberar la PC permite pasarla a otra computadora
        self.accion("liberar")
        self.assertTrue(otra.activar(self.clave)[0])

    def test_permiso_falsificado_no_sirve(self):
        self.licencia.activar(self.clave)
        datos = json.loads(self.licencia.ruta.read_text())
        carga, firma = datos["token"].split(".")
        permiso = json.loads(lic._desde_b64(carga))
        permiso["valido_hasta"] += 3650 * DIA
        datos["token"] = lic._b64(json.dumps(permiso).encode()) + "." + firma
        self.licencia.ruta.write_text(json.dumps(datos))
        self.licencia._datos = self.licencia._leer()
        self.assertEqual(self.licencia.estado()[0], lic.SIN_LICENCIA)

    def test_permanente_no_necesita_internet(self):
        self.accion("guardar", cliente="Kiosco Pepe", permanente="1")
        self.licencia.activar(self.clave)
        self.reloj.t += 365 * DIA
        self.assertEqual(self.licencia.estado()[0], lic.ACTIVA)

    def test_panel_pide_login_y_csrf(self):
        anonimo = panel.app.test_client()
        self.assertEqual(anonimo.get("/").status_code, 302)
        self.assertEqual(anonimo.post("/login", data={"clave": "mal"}).status_code, 200)
        self.assertEqual(anonimo.post("/login", data={"clave": "secreta"}).status_code, 302)
        self.assertEqual(anonimo.get("/").status_code, 200)
        self.assertEqual(anonimo.post(f"/licencia/{self.id}", data={"accion": "suspender"}).status_code, 400)
        self.assertIn(self.clave, self.web.get("/").get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
