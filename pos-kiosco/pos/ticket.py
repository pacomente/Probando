"""Ticket de venta en texto, para impresoras térmicas de 58 u 80 mm."""
import os
import subprocess
import sys
import tempfile


def plata(valor) -> str:
    """1234.5 -> '$ 1.234,50'"""
    texto = f"{float(valor or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {texto}"


def numero(texto) -> float:
    """Acepta '1.234,50', '1234.5', '$ 100'..."""
    texto = str(texto).strip().replace("$", "").replace(" ", "")
    if not texto:
        return 0.0
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    return float(texto)


def armar(venta, config, copia=False) -> str:
    ancho = int(config.get("ancho_ticket") or 32)
    linea = "-" * ancho

    def centro(t):
        return str(t)[:ancho].center(ancho).rstrip()

    def dos(izq, der):
        izq = str(izq)[: max(1, ancho - len(der) - 1)]
        return izq + " " * (ancho - len(izq) - len(der)) + der

    filas = [centro(config.get("comercio", ""))]
    for clave in ("direccion", "telefono"):
        if config.get(clave):
            filas.append(centro(config[clave]))
    if config.get("cuit"):
        filas.append(centro(f"CUIT {config['cuit']}"))
    filas += [linea, dos(f"Venta N° {venta['numero']}", str(venta["fecha"])[:16])]
    if copia:
        filas.append(centro("*** REIMPRESIÓN ***"))
    filas.append(linea)
    for item in venta["items"]:
        filas.append(str(item["nombre"])[:ancho])
        cantidad = f"{item['cantidad']:g}"
        filas.append(dos(f"  {cantidad} x {plata(item['precio'])}", plata(item["subtotal"])))
    filas += [linea, dos("TOTAL", plata(venta["total"])), dos("Pago", str(venta["medio_pago"]))]
    if venta.get("pago_con"):
        filas += [dos("Pagó con", plata(venta["pago_con"])), dos("Vuelto", plata(venta["vuelto"]))]
    filas += [linea, centro("Comprobante no válido como factura")]
    if config.get("pie_ticket"):
        filas.append(centro(config["pie_ticket"]))
    return "\n".join(filas) + "\n\n\n"


def imprimir(texto):
    """Manda el ticket a la impresora predeterminada. Devuelve un error o None."""
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(texto)
        if sys.platform == "win32":
            os.startfile(f.name, "print")
        else:
            subprocess.run(["lp", f.name], check=True, capture_output=True)
        return None
    except (OSError, subprocess.CalledProcessError) as e:
        return f"No se pudo imprimir: {e}"
