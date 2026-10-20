"""Panel web para administrar las licencias del Kiosco POS.

Variables de entorno:
  PANEL_CLAVE            contraseña para entrar al panel (obligatoria)
  PANEL_SECRETO          texto largo al azar para las sesiones (obligatorio)
  PANEL_DATOS            carpeta de la base de datos y la clave privada (por defecto panel/datos)
  PANEL_DIAS_SIN_INTERNET  días que el POS puede funcionar sin conectarse (por defecto 7)
"""
import base64
import datetime as dt
import functools
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from flask import Flask, abort, flash, g, jsonify, redirect, render_template, request, session, url_for

CARPETA = Path(os.environ.get("PANEL_DATOS", Path(__file__).parent / "datos"))
DIAS_SIN_INTERNET = int(os.environ.get("PANEL_DIAS_SIN_INTERNET", "7"))
ANIOS_PERMANENTE = 20
LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I

app = Flask(__name__)
app.secret_key = os.environ.get("PANEL_SECRETO") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  PERMANENT_SESSION_LIFETIME=dt.timedelta(days=7))


# ----------------------------------------------------------------------
# Base de datos y firma
# ----------------------------------------------------------------------
ESQUEMA = """
CREATE TABLE IF NOT EXISTS licencias (
    id INTEGER PRIMARY KEY,
    clave TEXT UNIQUE NOT NULL,
    cliente TEXT NOT NULL,
    comercio TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    precio TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'activa',
    permanente INTEGER NOT NULL DEFAULT 0,
    mensaje TEXT DEFAULT '',
    equipo TEXT DEFAULT '',
    version TEXT DEFAULT '',
    creada TEXT NOT NULL,
    activada TEXT DEFAULT '',
    ultima_conexion TEXT DEFAULT '',
    ultima_ip TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS historial (
    id INTEGER PRIMARY KEY,
    licencia_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    detalle TEXT NOT NULL
);
"""


def ahora():
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def db():
    if "db" not in g:
        CARPETA.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(CARPETA / "licencias.db")
        g.db.row_factory = sqlite3.Row
        g.db.executescript(ESQUEMA)
    return g.db


@app.teardown_appcontext
def cerrar_db(_error):
    conexion = g.pop("db", None)
    if conexion is not None:
        conexion.close()


def anotar(licencia_id, detalle):
    db().execute("INSERT INTO historial (licencia_id, fecha, detalle) VALUES (?, ?, ?)",
                 (licencia_id, ahora(), detalle))


def clave_privada():
    ruta = CARPETA / "clave_privada.pem"
    if not ruta.exists():
        CARPETA.mkdir(parents=True, exist_ok=True)
        pem = Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        ruta.write_bytes(pem)
    return serialization.load_pem_private_key(ruta.read_bytes(), password=None)


def clave_publica_pem():
    return clave_privada().public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()


def _b64(datos):
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def firmar(licencia, equipo):
    activa = licencia["estado"] == "activa"
    dias = ANIOS_PERMANENTE * 365 if licencia["permanente"] and activa else DIAS_SIN_INTERNET
    emitido = time.time()
    carga = json.dumps({
        "clave": licencia["clave"],
        "equipo": equipo,
        "estado": licencia["estado"],
        "mensaje": licencia["mensaje"] or ("" if activa else "Licencia suspendida. Comunicate con tu proveedor."),
        "comercio": licencia["comercio"],
        "emitido": emitido,
        "valido_hasta": emitido + dias * 86400,
    }, separators=(",", ":")).encode()
    return f"{_b64(carga)}.{_b64(clave_privada().sign(carga))}"


def nueva_clave():
    bloques = ["".join(secrets.choice(LETRAS) for _ in range(4)) for _ in range(4)]
    return "KPOS-" + "-".join(bloques)


# ----------------------------------------------------------------------
# API para el programa de los clientes
# ----------------------------------------------------------------------
@app.post("/api/verificar")
def api_verificar():
    datos = request.get_json(silent=True) or {}
    clave = str(datos.get("clave", "")).strip().upper()
    equipo = str(datos.get("equipo", "")).strip()[:40]
    if not clave or not equipo:
        return jsonify(error="datos", mensaje="Faltan datos."), 400
    licencia = db().execute("SELECT * FROM licencias WHERE clave = ?", (clave,)).fetchone()
    if licencia is None:
        return jsonify(error="clave", mensaje="Esa clave de licencia no existe. Revisala."), 404
    if licencia["equipo"] and licencia["equipo"] != equipo:
        anotar(licencia["id"], f"Intento de uso en otra PC ({equipo})")
        db().commit()
        return jsonify(error="otro_equipo",
                       mensaje="Esta licencia ya está activada en otra computadora. "
                               "Pedile a tu proveedor que la libere."), 409
    cambios = {"ultima_conexion": ahora(), "ultima_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
               "version": str(datos.get("version", ""))[:20]}
    if not licencia["equipo"]:
        cambios.update(equipo=equipo, activada=ahora())
        anotar(licencia["id"], f"Activada en la PC {equipo}")
    db().execute(f"UPDATE licencias SET {', '.join(f'{k} = ?' for k in cambios)} WHERE id = ?",
                 (*cambios.values(), licencia["id"]))
    db().commit()
    return jsonify(token=firmar(licencia, equipo))


# ----------------------------------------------------------------------
# Panel
# ----------------------------------------------------------------------
def requiere_login(vista):
    @functools.wraps(vista)
    def envoltura(*args, **kwargs):
        if not session.get("dentro"):
            return redirect(url_for("login", siguiente=request.path))
        if request.method == "POST" and not hmac.compare_digest(request.form.get("csrf", ""), session.get("csrf", "")):
            abort(400)
        return vista(*args, **kwargs)
    return envoltura


@app.context_processor
def datos_plantilla():
    return {"csrf": session.get("csrf", "")}


@app.route("/login", methods=["GET", "POST"])
def login():
    clave = os.environ.get("PANEL_CLAVE")
    if not clave:
        return "Falta configurar la variable PANEL_CLAVE en el servidor.", 500
    if request.method == "POST":
        time.sleep(0.5)  # frena a quien quiera adivinar la contraseña
        if hmac.compare_digest(request.form.get("clave", ""), clave):
            session.clear()
            session.permanent = True
            session["dentro"] = True
            session["csrf"] = secrets.token_hex(16)
            siguiente = request.args.get("siguiente", "")
            return redirect(siguiente if siguiente.startswith("/") and not siguiente.startswith("//") else "/")
        flash("Contraseña incorrecta.")
    return render_template("login.html")


@app.post("/salir")
@requiere_login
def salir():
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
@requiere_login
def inicio():
    buscar = request.args.get("q", "").strip()
    consulta = "SELECT * FROM licencias"
    parametros = ()
    if buscar:
        consulta += " WHERE cliente LIKE ? OR comercio LIKE ? OR clave LIKE ? OR telefono LIKE ?"
        parametros = (f"%{buscar}%",) * 4
    licencias = db().execute(consulta + " ORDER BY id DESC", parametros).fetchall()
    totales = db().execute("SELECT COUNT(*) total, SUM(estado = 'activa') activas, "
                           "SUM(estado = 'suspendida') suspendidas, SUM(equipo != '') instaladas "
                           "FROM licencias").fetchone()
    return render_template("inicio.html", licencias=licencias, totales=totales, buscar=buscar,
                           hace_dias=hace_dias)


def hace_dias(fecha):
    if not fecha:
        return None
    return (dt.datetime.now() - dt.datetime.strptime(fecha, "%Y-%m-%d %H:%M:%S")).days


CAMPOS = ("cliente", "comercio", "telefono", "email", "precio", "notas", "mensaje")


@app.route("/nueva", methods=["GET", "POST"])
@requiere_login
def nueva():
    if request.method == "POST":
        datos = {c: request.form.get(c, "").strip() for c in CAMPOS}
        if not datos["cliente"]:
            flash("Poné el nombre del cliente.")
            return render_template("licencia.html", licencia=datos, historial=[], nueva=True)
        clave = nueva_clave()
        cursor = db().execute(
            f"INSERT INTO licencias (clave, creada, permanente, {', '.join(CAMPOS)}) "
            f"VALUES (?, ?, ?, {', '.join('?' for _ in CAMPOS)})",
            (clave, ahora(), 1 if request.form.get("permanente") else 0, *datos.values()))
        anotar(cursor.lastrowid, "Licencia creada")
        db().commit()
        flash(f"Licencia creada: {clave}")
        return redirect(url_for("ver", id=cursor.lastrowid))
    return render_template("licencia.html", licencia={}, historial=[], nueva=True)


@app.route("/licencia/<int:id>", methods=["GET", "POST"])
@requiere_login
def ver(id):
    licencia = db().execute("SELECT * FROM licencias WHERE id = ?", (id,)).fetchone()
    if licencia is None:
        abort(404)
    if request.method == "POST":
        accion = request.form.get("accion")
        if accion == "guardar":
            datos = {c: request.form.get(c, "").strip() for c in CAMPOS}
            permanente = 1 if request.form.get("permanente") else 0
            db().execute(f"UPDATE licencias SET {', '.join(f'{c} = ?' for c in CAMPOS)}, permanente = ? WHERE id = ?",
                         (*datos.values(), permanente, id))
            anotar(id, "Datos modificados" + (" (permanente)" if permanente != licencia["permanente"] and permanente
                                              else ""))
            flash("Guardado.")
        elif accion in ("suspender", "activar"):
            estado = "suspendida" if accion == "suspender" else "activa"
            db().execute("UPDATE licencias SET estado = ? WHERE id = ?", (estado, id))
            anotar(id, "Licencia SUSPENDIDA" if estado == "suspendida" else "Licencia reactivada")
            flash("Licencia suspendida: se bloquea la próxima vez que el programa se conecte."
                  if estado == "suspendida" else "Licencia reactivada.")
        elif accion == "liberar":
            db().execute("UPDATE licencias SET equipo = '' WHERE id = ?", (id,))
            anotar(id, f"PC liberada (era {licencia['equipo']})")
            flash("PC liberada: el cliente puede activar la licencia en otra computadora.")
        db().commit()
        return redirect(url_for("ver", id=id))
    historial = db().execute("SELECT * FROM historial WHERE licencia_id = ? ORDER BY id DESC LIMIT 100",
                             (id,)).fetchall()
    return render_template("licencia.html", licencia=licencia, historial=historial, nueva=False,
                           dias_sin_internet=DIAS_SIN_INTERNET)


@app.get("/clave-publica")
@requiere_login
def ver_clave_publica():
    return render_template("clave.html", pem=clave_publica_pem())


if __name__ == "__main__":
    app.run(debug=False, port=int(os.environ.get("PORT", "5000")))
