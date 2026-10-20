"""Pantallas del Kiosco POS (tkinter)."""
import datetime as dt
import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from . import ajustes_fabrica as fabrica
from . import licencia as lic
from .almacen import ErrorDatos
from .config import MEDIOS_PAGO
from .ticket import armar, imprimir, numero, plata

VERDE = "#1F6F5C"
FUENTE = ("Segoe UI", 11)
FUENTE_GRANDE = ("Segoe UI", 16)
FUENTE_TOTAL = ("Segoe UI", 34, "bold")


def abrir_carpeta(ruta):
    if sys.platform == "win32":
        os.startfile(ruta)
    else:
        subprocess.Popen(["xdg-open", str(ruta)])


def hoy():
    return dt.date.today().isoformat()


def pedir_numero(padre, titulo, texto, inicial=""):
    respuesta = simpledialog.askstring(titulo, texto, parent=padre, initialvalue=inicial)
    if respuesta is None:
        return None
    try:
        return numero(respuesta)
    except ValueError:
        messagebox.showerror(titulo, "Ese número no es válido.", parent=padre)
        return None


def tabla(padre, columnas, alto=12):
    """columnas: [(clave, título, ancho, alineación)]"""
    marco = ttk.Frame(padre)
    arbol = ttk.Treeview(marco, columns=[c[0] for c in columnas], show="headings", height=alto)
    for clave, titulo, ancho, alineacion in columnas:
        arbol.heading(clave, text=titulo)
        arbol.column(clave, width=ancho, anchor=alineacion, stretch=alineacion == "w")
    barra = ttk.Scrollbar(marco, orient="vertical", command=arbol.yview)
    arbol.configure(yscrollcommand=barra.set)
    arbol.pack(side="left", fill="both", expand=True)
    barra.pack(side="right", fill="y")
    arbol.tag_configure("anulada", foreground="#B00020")
    arbol.tag_configure("bajo", foreground="#B00020")
    return marco, arbol


class Dialogo(tk.Toplevel):
    """Ventana modal con botones Aceptar/Cancelar."""

    def __init__(self, padre, titulo):
        super().__init__(padre)
        self.title(titulo)
        self.transient(padre)
        self.resizable(False, False)
        self.resultado = None
        self.cuerpo = ttk.Frame(self, padding=16)
        self.cuerpo.pack(fill="both", expand=True)
        botones = ttk.Frame(self, padding=(16, 0, 16, 16))
        botones.pack(fill="x")
        ttk.Button(botones, text="Cancelar (Esc)", command=self.destroy).pack(side="right")
        ttk.Button(botones, text="Aceptar (Enter)", style="Accent.TButton", command=self.aceptar).pack(
            side="right", padx=8)
        self.bind("<Escape>", lambda e: self.destroy())
        self.bind("<Return>", lambda e: self.aceptar())

    def mostrar(self):
        self.update_idletasks()
        x = self.master.winfo_rootx() + (self.master.winfo_width() - self.winfo_width()) // 2
        y = self.master.winfo_rooty() + (self.master.winfo_height() - self.winfo_height()) // 3
        self.geometry(f"+{max(0, x)}+{max(0, y)}")
        self.grab_set()
        self.wait_window()
        return self.resultado

    def aceptar(self):
        raise NotImplementedError


class DialogoProducto(Dialogo):
    def __init__(self, padre, almacen, producto=None, codigo=""):
        super().__init__(padre, "Editar producto" if producto else "Nuevo producto")
        self.almacen = almacen
        self.original = producto
        p = producto or {"codigo": codigo}
        self.campos = {}
        filas = [("codigo", "Código de barras"), ("nombre", "Nombre"), ("categoria", "Categoría"),
                 ("costo", "Costo"), ("margen", "Ganancia %"), ("precio", "Precio de venta"),
                 ("stock", "Stock inicial"), ("stock_minimo", "Avisar con stock menor a")]
        for i, (clave, texto) in enumerate(filas):
            if clave == "stock" and producto:
                continue
            ttk.Label(self.cuerpo, text=texto, font=FUENTE).grid(row=i, column=0, sticky="w", pady=4)
            if clave == "categoria":
                campo = ttk.Combobox(self.cuerpo, values=almacen.categorias(), font=FUENTE, width=30)
            else:
                campo = ttk.Entry(self.cuerpo, font=FUENTE, width=32)
            valor = p.get(clave)
            if clave in ("costo", "precio") and valor is not None:
                valor = f"{float(valor):g}"
            campo.insert(0, "" if valor is None else str(valor))
            campo.grid(row=i, column=1, sticky="we", pady=4, padx=(8, 0))
            self.campos[clave] = campo
        if producto:
            self.campos["codigo"].configure(state="disabled")
            if p.get("costo"):
                margen = (float(p["precio"] or 0) / float(p["costo"]) - 1) * 100
                self.campos["margen"].insert(0, f"{margen:.0f}")
        ttk.Label(self.cuerpo, text="Dejá el código vacío para productos sin código (se genera uno).",
                  foreground="#666").grid(row=len(filas), column=0, columnspan=2, sticky="w", pady=(8, 0))
        self.campos["margen"].bind("<KeyRelease>", self._calcular_precio)
        self.campos["costo"].bind("<KeyRelease>", self._calcular_precio)
        (self.campos["nombre"] if producto or codigo else self.campos["codigo"]).focus_set()

    def _calcular_precio(self, _evento=None):
        try:
            costo = numero(self.campos["costo"].get())
            margen = numero(self.campos["margen"].get())
        except ValueError:
            return
        if costo and self.campos["margen"].get().strip():
            self.campos["precio"].delete(0, "end")
            self.campos["precio"].insert(0, f"{costo * (1 + margen / 100):.2f}")

    def aceptar(self):
        try:
            datos = {clave: campo.get() for clave, campo in self.campos.items()}
            for clave in ("costo", "precio", "stock", "stock_minimo"):
                if clave in datos:
                    datos[clave] = numero(datos[clave])
            self.resultado = self.almacen.guardar_producto(
                datos, codigo_original=self.original["codigo"] if self.original else None)
        except ValueError:
            messagebox.showerror("Producto", "Revisá los números (costo, precio, stock).", parent=self)
            return
        except ErrorDatos as e:
            messagebox.showerror("Producto", str(e), parent=self)
            return
        self.destroy()


class DialogoCobro(Dialogo):
    def __init__(self, padre, total):
        super().__init__(padre, "Cobrar")
        self.total = total
        ttk.Label(self.cuerpo, text="Total a cobrar", font=FUENTE).pack(anchor="w")
        ttk.Label(self.cuerpo, text=plata(total), font=FUENTE_TOTAL, foreground=VERDE).pack(anchor="w")
        self.medio = tk.StringVar(value=MEDIOS_PAGO[0])
        medios = ttk.Frame(self.cuerpo)
        medios.pack(fill="x", pady=8)
        for i, medio in enumerate(MEDIOS_PAGO, start=1):
            ttk.Radiobutton(medios, text=f"F{i}  {medio}", value=medio, variable=self.medio,
                            command=self._cambio_medio).pack(anchor="w", pady=2)
            self.bind(f"<F{i}>", lambda e, m=medio: self._elegir_medio(m))
        self.fila_pago = ttk.Frame(self.cuerpo)
        self.fila_pago.pack(fill="x", pady=8)
        ttk.Label(self.fila_pago, text="Paga con: $", font=FUENTE_GRANDE).pack(side="left")
        self.pago = ttk.Entry(self.fila_pago, font=FUENTE_GRANDE, width=12)
        self.pago.pack(side="left", padx=8)
        self.pago.bind("<KeyRelease>", self._vuelto)
        self.etiqueta_vuelto = ttk.Label(self.cuerpo, text="", font=FUENTE_GRANDE)
        self.etiqueta_vuelto.pack(anchor="w")
        ttk.Label(self.cuerpo, text="Elegí el medio con F1 a F5. Si pagan justo, dejá 'Paga con' vacío.",
                  foreground="#666").pack(anchor="w", pady=(8, 0))
        self.pago.focus_set()

    def _elegir_medio(self, medio):
        self.medio.set(medio)
        self._cambio_medio()
        return "break"

    def _cambio_medio(self):
        if self.medio.get() == "Efectivo":
            self.fila_pago.pack(fill="x", pady=8, before=self.etiqueta_vuelto)
            self.pago.focus_set()
        else:
            self.pago.delete(0, "end")
            self.fila_pago.pack_forget()
            self.etiqueta_vuelto.configure(text="")
            self.focus_set()

    def _vuelto(self, _evento=None):
        try:
            pago = numero(self.pago.get())
        except ValueError:
            self.etiqueta_vuelto.configure(text="")
            return
        if pago >= self.total:
            self.etiqueta_vuelto.configure(text=f"Vuelto: {plata(pago - self.total)}", foreground=VERDE)
        elif pago:
            self.etiqueta_vuelto.configure(text=f"Faltan {plata(self.total - pago)}", foreground="#B00020")

    def aceptar(self):
        pago = None
        if self.medio.get() == "Efectivo" and self.pago.get().strip():
            try:
                pago = numero(self.pago.get())
            except ValueError:
                messagebox.showerror("Cobrar", "El monto no es válido.", parent=self)
                return
            if pago < self.total:
                messagebox.showerror("Cobrar", "El pago es menor que el total.", parent=self)
                return
        self.resultado = (self.medio.get(), pago)
        self.destroy()


class DialogoElegir(Dialogo):
    """Lista para elegir un producto cuando la búsqueda da varios."""

    def __init__(self, padre, productos):
        super().__init__(padre, "Elegí el producto")
        self.productos = productos
        marco, self.arbol = tabla(self.cuerpo, [("nombre", "Producto", 360, "w"), ("precio", "Precio", 110, "e"),
                                                 ("stock", "Stock", 80, "e")], alto=12)
        marco.pack(fill="both", expand=True)
        for i, p in enumerate(productos):
            self.arbol.insert("", "end", iid=str(i), values=(p["nombre"], plata(p["precio"]), f"{p['stock']:g}"))
        self.arbol.selection_set("0")
        self.arbol.focus("0")
        self.arbol.focus_set()
        self.arbol.bind("<Double-1>", lambda e: self.aceptar())

    def aceptar(self):
        seleccion = self.arbol.selection()
        if seleccion:
            self.resultado = self.productos[int(seleccion[0])]
        self.destroy()


# ----------------------------------------------------------------------
# Pestañas
# ----------------------------------------------------------------------
class PestanaVender(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=12)
        self.app = app
        self.carrito = []

        arriba = ttk.Frame(self)
        arriba.pack(fill="x")
        ttk.Label(arriba, text="Código o nombre:", font=FUENTE_GRANDE).pack(side="left")
        self.entrada = ttk.Entry(arriba, font=FUENTE_GRANDE)
        self.entrada.pack(side="left", fill="x", expand=True, padx=8)
        self.entrada.bind("<Return>", self.agregar_desde_entrada)
        ttk.Button(arriba, text="Agregar", command=self.agregar_desde_entrada).pack(side="left")
        ttk.Label(self, text="Escaneá o escribí y apretá Enter. Para varias unidades: 3*código. "
                             "F5 cantidad · F8 monto libre · Supr quitar · F12 cobrar",
                  foreground="#666").pack(anchor="w", pady=(4, 8))

        centro = ttk.Frame(self)
        centro.pack(fill="both", expand=True)
        marco, self.arbol = tabla(centro, [("cantidad", "Cant.", 70, "e"), ("nombre", "Producto", 380, "w"),
                                           ("precio", "Precio", 110, "e"), ("subtotal", "Subtotal", 120, "e")],
                                  alto=14)
        marco.pack(side="left", fill="both", expand=True)

        lado = ttk.Frame(centro, padding=(16, 0, 0, 0))
        lado.pack(side="right", fill="y")
        ttk.Label(lado, text="TOTAL", font=FUENTE_GRANDE).pack(anchor="e")
        self.etiqueta_total = ttk.Label(lado, text=plata(0), font=FUENTE_TOTAL, foreground=VERDE)
        self.etiqueta_total.pack(anchor="e", pady=(0, 16))
        for texto, comando in [("Cobrar (F12)", self.cobrar), ("Cantidad (F5)", self.cambiar_cantidad),
                               ("Monto libre (F8)", self.monto_libre), ("Quitar (Supr)", self.quitar),
                               ("Vaciar", self.vaciar)]:
            ttk.Button(lado, text=texto, command=comando,
                       style="Accent.TButton" if texto.startswith("Cobrar") else "TButton").pack(
                fill="x", pady=3, ipady=6)
        self.mensaje = ttk.Label(lado, text="", font=FUENTE, foreground=VERDE, wraplength=220)
        self.mensaje.pack(anchor="w", pady=16)

        self.arbol.bind("<Delete>", lambda e: self.quitar())

    def enfocar(self):
        self.entrada.focus_set()

    def agregar_desde_entrada(self, _evento=None):
        texto = self.entrada.get().strip()
        if not texto:
            return
        cant = 1.0
        if "*" in texto:
            izquierda, texto = texto.split("*", 1)
            try:
                cant = numero(izquierda)
            except ValueError:
                messagebox.showerror("Vender", "La cantidad no es válida.", parent=self)
                return
            texto = texto.strip()
        producto = self.app.almacen.producto(texto)
        if producto and producto.get("activo") == "NO":
            producto = None
        if producto is None:
            encontrados = self.app.almacen.lista_productos(texto)
            if len(encontrados) == 1:
                producto = encontrados[0]
            elif encontrados:
                producto = DialogoElegir(self, encontrados).mostrar()
                if producto is None:
                    return
            else:
                if messagebox.askyesno("Vender", f"No existe '{texto}'. ¿Querés cargarlo como producto nuevo?",
                                       parent=self):
                    es_codigo = texto.replace(" ", "").isalnum() and any(c.isdigit() for c in texto)
                    codigo = DialogoProducto(self, self.app.almacen, codigo=texto if es_codigo else "").mostrar()
                    if codigo:
                        self.app.refrescar()
                        producto = self.app.almacen.producto(codigo)
                if producto is None:
                    self.entrada.select_range(0, "end")
                    return
        self.agregar(producto, cant)
        self.entrada.delete(0, "end")

    def agregar(self, producto, cant):
        for item in self.carrito:
            if item["codigo"] and item["codigo"] == producto["codigo"]:
                item["cantidad"] += cant
                break
        else:
            self.carrito.append({"codigo": producto["codigo"], "nombre": producto["nombre"],
                                 "cantidad": cant, "precio": float(producto["precio"] or 0)})
        if float(producto.get("stock") or 0) - cant < 0:
            self.mensaje.configure(text=f"Ojo: {producto['nombre']} figura sin stock.", foreground="#B00020")
        else:
            self.mensaje.configure(text="")
        self.mostrar()

    def mostrar(self):
        self.arbol.delete(*self.arbol.get_children())
        for i, item in enumerate(self.carrito):
            self.arbol.insert("", "end", iid=str(i), values=(
                f"{item['cantidad']:g}", item["nombre"], plata(item["precio"]),
                plata(item["cantidad"] * item["precio"])))
        if self.carrito:
            ultimo = str(len(self.carrito) - 1)
            self.arbol.selection_set(ultimo)
            self.arbol.see(ultimo)
        self.etiqueta_total.configure(text=plata(self.total()))

    def total(self):
        return round(sum(round(i["cantidad"] * i["precio"], 2) for i in self.carrito), 2)

    def _seleccionado(self):
        seleccion = self.arbol.selection()
        return int(seleccion[0]) if seleccion else None

    def cambiar_cantidad(self):
        i = self._seleccionado()
        if i is None:
            return
        nueva = pedir_numero(self, "Cantidad", f"Cantidad de {self.carrito[i]['nombre']}:",
                             f"{self.carrito[i]['cantidad']:g}")
        if nueva is not None and nueva > 0:
            self.carrito[i]["cantidad"] = nueva
            self.mostrar()
        self.enfocar()

    def monto_libre(self):
        monto = pedir_numero(self, "Monto libre", "Importe a cobrar (artículos sin código):")
        if monto and monto > 0:
            self.carrito.append({"codigo": "", "nombre": "Varios", "cantidad": 1, "precio": monto})
            self.mostrar()
        self.enfocar()

    def quitar(self):
        i = self._seleccionado()
        if i is not None:
            del self.carrito[i]
            self.mostrar()
        self.enfocar()

    def vaciar(self):
        if self.carrito and messagebox.askyesno("Vender", "¿Vaciar la venta actual?", parent=self):
            self.carrito = []
            self.mostrar()
        self.enfocar()

    def cobrar(self):
        if not self.carrito:
            return
        if not self.app.puede_operar():
            return
        if not self.app.almacen.caja_actual():
            messagebox.showwarning("Cobrar", "Primero abrí la caja (pestaña Caja).", parent=self)
            self.app.ir_a(self.app.pestana_caja)
            return
        resultado = DialogoCobro(self, self.total()).mostrar()
        if not resultado:
            self.enfocar()
            return
        medio, pago = resultado
        try:
            venta = self.app.almacen.registrar_venta(self.carrito, medio, pago)
        except ErrorDatos as e:
            messagebox.showerror("Cobrar", str(e), parent=self)
            return
        self.carrito = []
        self.mostrar()
        texto = f"Venta N° {venta['numero']} registrada."
        if venta.get("vuelto"):
            texto += f"\nVuelto: {plata(venta['vuelto'])}"
        self.mensaje.configure(text=texto, foreground=VERDE)
        self.app.imprimir_ticket(venta)
        self.app.refrescar()
        self.enfocar()


class PestanaProductos(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=12)
        self.app = app
        arriba = ttk.Frame(self)
        arriba.pack(fill="x", pady=(0, 8))
        ttk.Label(arriba, text="Buscar:", font=FUENTE).pack(side="left")
        self.buscar = ttk.Entry(arriba, font=FUENTE, width=30)
        self.buscar.pack(side="left", padx=8)
        self.buscar.bind("<KeyRelease>", lambda e: self.refrescar())
        self.stock_bajo = tk.BooleanVar()
        self.bajas = tk.BooleanVar()
        ttk.Checkbutton(arriba, text="Solo stock bajo", variable=self.stock_bajo, command=self.refrescar).pack(
            side="left", padx=8)
        ttk.Checkbutton(arriba, text="Ver dados de baja", variable=self.bajas, command=self.refrescar).pack(
            side="left")
        self.contador = ttk.Label(arriba, text="", foreground="#666")
        self.contador.pack(side="right")

        botones = ttk.Frame(self)
        botones.pack(fill="x", pady=(0, 8))
        for texto, comando in [("Nuevo", self.nuevo), ("Editar", self.editar),
                               ("Ingreso de mercadería", self.ingreso), ("Ajustar stock", self.ajuste),
                               ("Dar de baja / reactivar", self.baja), ("Aumentar precios %", self.aumentar)]:
            ttk.Button(botones, text=texto, command=comando).pack(side="left", padx=(0, 6))

        marco, self.arbol = tabla(self, [
            ("codigo", "Código", 140, "w"), ("nombre", "Producto", 320, "w"), ("categoria", "Categoría", 130, "w"),
            ("costo", "Costo", 100, "e"), ("precio", "Precio", 100, "e"), ("stock", "Stock", 80, "e"),
            ("minimo", "Mínimo", 80, "e"), ("activo", "Activo", 60, "center")], alto=18)
        marco.pack(fill="both", expand=True)
        self.arbol.bind("<Double-1>", lambda e: self.editar())

    def refrescar(self):
        productos = self.app.almacen.lista_productos(self.buscar.get(), self.bajas.get(), self.stock_bajo.get())
        self.arbol.delete(*self.arbol.get_children())
        for p in productos:
            bajo = float(p.get("stock") or 0) <= float(p.get("stock_minimo") or 0) and p.get("stock_minimo")
            self.arbol.insert("", "end", iid=p["codigo"], tags=("bajo",) if bajo else (), values=(
                p["codigo"], p["nombre"], p.get("categoria") or "", plata(p["costo"]), plata(p["precio"]),
                f"{float(p['stock'] or 0):g}", f"{float(p['stock_minimo'] or 0):g}", p.get("activo") or "SI"))
        self.contador.configure(text=f"{len(productos)} productos")

    def _actual(self):
        seleccion = self.arbol.selection()
        if not seleccion:
            messagebox.showinfo("Productos", "Elegí un producto de la lista.", parent=self)
            return None
        return self.app.almacen.producto(seleccion[0])

    def nuevo(self):
        if DialogoProducto(self, self.app.almacen).mostrar():
            self.app.refrescar()

    def editar(self):
        p = self._actual()
        if p and DialogoProducto(self, self.app.almacen, p).mostrar():
            self.app.refrescar()

    def ingreso(self):
        p = self._actual()
        if not p:
            return
        cant = pedir_numero(self, "Ingreso de mercadería", f"¿Cuántas unidades de {p['nombre']} entraron?")
        if cant:
            self.app.almacen.mover_stock(p["codigo"], abs(cant), "Ingreso de mercadería")
            self.app.refrescar()

    def ajuste(self):
        p = self._actual()
        if not p or not self.app.pedir_clave_dueno():
            return
        real = pedir_numero(self, "Ajustar stock", f"Stock real contado de {p['nombre']}:",
                            f"{float(p['stock'] or 0):g}")
        if real is not None:
            diferencia = real - float(p["stock"] or 0)
            if diferencia:
                self.app.almacen.mover_stock(p["codigo"], diferencia, "Ajuste por recuento")
                self.app.refrescar()

    def baja(self):
        p = self._actual()
        if not p:
            return
        reactivar = p.get("activo") == "NO"
        pregunta = "¿Reactivar" if reactivar else "¿Dar de baja"
        if messagebox.askyesno("Productos", f"{pregunta} {p['nombre']}?\n(No se borra: queda en el historial.)",
                               parent=self):
            self.app.almacen.dar_de_baja(p["codigo"], activo=reactivar)
            self.app.refrescar()

    def aumentar(self):
        if not self.app.pedir_clave_dueno():
            return
        dialogo = DialogoAumento(self, self.app.almacen.categorias())
        resultado = dialogo.mostrar()
        if resultado:
            porcentaje, categoria = resultado
            cantidad = self.app.almacen.cambiar_precios(porcentaje, categoria)
            messagebox.showinfo("Precios", f"Se actualizaron {cantidad} productos.", parent=self)
            self.app.refrescar()


class DialogoAumento(Dialogo):
    def __init__(self, padre, categorias):
        super().__init__(padre, "Aumentar precios")
        ttk.Label(self.cuerpo, text="Porcentaje (ej: 10 para +10%, -5 para bajar):", font=FUENTE).grid(
            row=0, column=0, sticky="w")
        self.porcentaje = ttk.Entry(self.cuerpo, font=FUENTE, width=10)
        self.porcentaje.grid(row=0, column=1, padx=8, pady=4)
        ttk.Label(self.cuerpo, text="Categoría:", font=FUENTE).grid(row=1, column=0, sticky="w")
        self.categoria = ttk.Combobox(self.cuerpo, values=["(todas)"] + categorias, state="readonly", font=FUENTE)
        self.categoria.set("(todas)")
        self.categoria.grid(row=1, column=1, padx=8, pady=4)
        self.porcentaje.focus_set()

    def aceptar(self):
        try:
            porcentaje = numero(self.porcentaje.get())
        except ValueError:
            messagebox.showerror("Precios", "El porcentaje no es válido.", parent=self)
            return
        categoria = "" if self.categoria.get() == "(todas)" else self.categoria.get()
        alcance = f"la categoría {categoria}" if categoria else "TODOS los productos"
        if messagebox.askyesno("Precios", f"¿Cambiar {porcentaje:g}% los precios de {alcance}?", parent=self):
            self.resultado = (porcentaje, categoria)
            self.destroy()


class PestanaVentas(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=12)
        self.app = app
        self.fecha = dt.date.today()
        self.ventas = []
        arriba = ttk.Frame(self)
        arriba.pack(fill="x", pady=(0, 8))
        ttk.Button(arriba, text="◀ Día anterior", command=lambda: self.mover(-1)).pack(side="left")
        self.etiqueta_fecha = ttk.Label(arriba, text="", font=FUENTE_GRANDE, width=16, anchor="center")
        self.etiqueta_fecha.pack(side="left", padx=8)
        ttk.Button(arriba, text="Día siguiente ▶", command=lambda: self.mover(1)).pack(side="left")
        ttk.Button(arriba, text="Hoy", command=self.ir_a_hoy).pack(side="left", padx=8)
        ttk.Button(arriba, text="Anular venta", command=self.anular).pack(side="right")
        ttk.Button(arriba, text="Reimprimir ticket", command=self.reimprimir).pack(side="right", padx=8)

        marco, self.arbol = tabla(self, [("numero", "N°", 70, "e"), ("hora", "Hora", 80, "center"),
                                         ("total", "Total", 120, "e"), ("medio", "Medio de pago", 160, "w"),
                                         ("articulos", "Artículos", 80, "e"), ("estado", "Estado", 300, "w")],
                                  alto=12)
        marco.pack(fill="both", expand=True)
        self.arbol.bind("<<TreeviewSelect>>", lambda e: self.mostrar_detalle())
        self.totales = ttk.Label(self, text="", font=FUENTE)
        self.totales.pack(anchor="w", pady=6)
        marco, self.detalle = tabla(self, [("cantidad", "Cant.", 70, "e"), ("nombre", "Producto", 380, "w"),
                                           ("precio", "Precio", 110, "e"), ("subtotal", "Subtotal", 120, "e")],
                                    alto=7)
        marco.pack(fill="both", expand=True)

    def mover(self, dias):
        self.fecha += dt.timedelta(days=dias)
        self.refrescar()

    def ir_a_hoy(self):
        self.fecha = dt.date.today()
        self.refrescar()

    def refrescar(self):
        dia = self.fecha.isoformat()
        self.etiqueta_fecha.configure(text=self.fecha.strftime("%d/%m/%Y"))
        self.ventas = self.app.almacen.ventas_entre(dia, dia)
        self.arbol.delete(*self.arbol.get_children())
        for v in reversed(self.ventas):
            estado = "OK" if v["estado"] == "OK" else f"ANULADA: {v['motivo']}"
            self.arbol.insert("", "end", iid=str(v["numero"]), tags=("anulada",) if v["estado"] != "OK" else (),
                              values=(v["numero"], str(v["fecha"])[11:16], plata(v["total"]), v["medio_pago"],
                                      f"{float(v['articulos'] or 0):g}", estado))
        validas = [v for v in self.ventas if v["estado"] == "OK"]
        self.totales.configure(text=f"{len(validas)} ventas · Total del día: {plata(sum(v['total'] for v in validas))}")
        self.detalle.delete(*self.detalle.get_children())

    def _venta(self):
        seleccion = self.arbol.selection()
        if not seleccion:
            return None
        return next(v for v in self.ventas if v["numero"] == int(seleccion[0]))

    def mostrar_detalle(self):
        self.detalle.delete(*self.detalle.get_children())
        v = self._venta()
        if v:
            for d in self.app.almacen.detalle_venta(v["numero"], v["fecha"]):
                self.detalle.insert("", "end", values=(f"{float(d['cantidad']):g}", d["nombre"], plata(d["precio"]),
                                                       plata(d["subtotal"])))

    def anular(self):
        v = self._venta()
        if not v:
            messagebox.showinfo("Ventas", "Elegí una venta de la lista.", parent=self)
            return
        if v["estado"] != "OK":
            messagebox.showinfo("Ventas", "Esa venta ya está anulada.", parent=self)
            return
        if not self.app.puede_operar() or not self.app.pedir_clave_dueno():
            return
        motivo = simpledialog.askstring("Anular venta", f"Motivo para anular la venta N° {v['numero']} "
                                                        f"({plata(v['total'])}):", parent=self)
        if motivo is None:
            return
        try:
            self.app.almacen.anular_venta(v["numero"], v["fecha"], motivo)
        except ErrorDatos as e:
            messagebox.showerror("Anular venta", str(e), parent=self)
            return
        self.app.refrescar()

    def reimprimir(self):
        v = self._venta()
        if v:
            venta = dict(v, items=self.app.almacen.detalle_venta(v["numero"], v["fecha"]))
            error = imprimir(armar(venta, self.app.ajustes, copia=True))
            if error:
                messagebox.showerror("Ticket", error, parent=self)


class PestanaCaja(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=20)
        self.app = app
        self.contenido = None

    def refrescar(self):
        if self.contenido:
            self.contenido.destroy()
        self.contenido = ttk.Frame(self)
        self.contenido.pack(fill="both", expand=True)
        resumen = self.app.almacen.resumen_caja()
        if resumen is None:
            ttk.Label(self.contenido, text="La caja está cerrada", font=FUENTE_GRANDE).pack(anchor="w")
            fila = ttk.Frame(self.contenido)
            fila.pack(anchor="w", pady=16)
            ttk.Label(fila, text="Efectivo inicial en caja: $", font=FUENTE).pack(side="left")
            self.inicial = ttk.Entry(fila, font=FUENTE, width=12)
            self.inicial.pack(side="left", padx=8)
            self.inicial.bind("<Return>", lambda e: self.abrir())
            ttk.Button(fila, text="Abrir caja", style="Accent.TButton", command=self.abrir).pack(side="left")
            return
        ttk.Label(self.contenido, text=f"Caja N° {resumen['numero']} abierta desde "
                                       f"{resumen['apertura'][8:10]}/{resumen['apertura'][5:7]} "
                                       f"{resumen['apertura'][11:16]}", font=FUENTE_GRANDE).pack(anchor="w")
        grilla = ttk.Frame(self.contenido)
        grilla.pack(anchor="w", pady=16)
        filas = [("Efectivo inicial", resumen["inicial"])]
        filas += [(f"Ventas en {medio}", monto) for medio, monto in resumen["por_medio"].items()]
        filas += [("Ingresos de efectivo", resumen["ingresos"]), ("Retiros / pagos", -resumen["egresos"]),
                  ("EFECTIVO QUE DEBERÍA HABER", resumen["efectivo_esperado"]),
                  (f"Total vendido ({resumen['ventas']} ventas)", resumen["total_ventas"])]
        for i, (texto, monto) in enumerate(filas):
            negrita = texto.isupper() or texto.startswith("Total")
            fuente = ("Segoe UI", 13, "bold") if negrita else ("Segoe UI", 13)
            ttk.Label(grilla, text=texto, font=fuente).grid(row=i, column=0, sticky="w", pady=2)
            ttk.Label(grilla, text=plata(monto), font=fuente).grid(row=i, column=1, sticky="e", padx=(40, 0))
        botones = ttk.Frame(self.contenido)
        botones.pack(anchor="w")
        ttk.Button(botones, text="Ingreso de efectivo", command=lambda: self.movimiento("INGRESO")).pack(
            side="left", padx=(0, 8))
        ttk.Button(botones, text="Retiro / pago a proveedor", command=lambda: self.movimiento("EGRESO")).pack(
            side="left", padx=(0, 8))
        ttk.Button(botones, text="Cerrar caja", style="Accent.TButton", command=self.cerrar).pack(side="left")

    def abrir(self):
        if not self.app.puede_operar():
            return
        try:
            monto = numero(self.inicial.get() or 0)
            self.app.almacen.abrir_caja(monto)
        except (ValueError, ErrorDatos) as e:
            messagebox.showerror("Caja", str(e) if isinstance(e, ErrorDatos) else "Monto inválido.", parent=self)
            return
        self.app.refrescar()
        self.app.ir_a(self.app.pestana_vender)

    def movimiento(self, tipo):
        monto = pedir_numero(self, "Caja", "Monto:")
        if not monto:
            return
        detalle = simpledialog.askstring("Caja", "Detalle (ej: pago a proveedor, cambio):", parent=self) or ""
        try:
            self.app.almacen.movimiento_caja(tipo, monto, detalle)
        except ErrorDatos as e:
            messagebox.showerror("Caja", str(e), parent=self)
        self.app.refrescar()

    def cerrar(self):
        contado = pedir_numero(self, "Cerrar caja", "Contá el efectivo de la caja. ¿Cuánto hay?")
        if contado is None:
            return
        try:
            cierre = self.app.almacen.cerrar_caja(contado)
        except ErrorDatos as e:
            messagebox.showerror("Caja", str(e), parent=self)
            return
        diferencia = cierre["diferencia"]
        if abs(diferencia) < 0.01:
            texto = "La caja cerró justa. ✔"
        elif diferencia > 0:
            texto = f"Sobran {plata(diferencia)}."
        else:
            texto = f"Faltan {plata(-diferencia)}."
        messagebox.showinfo("Caja cerrada", f"Total vendido: {plata(cierre['total_ventas'])}\n"
                                            f"Efectivo esperado: {plata(cierre['efectivo_esperado'])}\n"
                                            f"Efectivo contado: {plata(cierre['contado'])}\n\n{texto}\n\n"
                                            "Se hizo un respaldo de los datos.", parent=self)
        self.app.refrescar()


class PestanaReportes(ttk.Frame):
    PERIODOS = ["Hoy", "Ayer", "Últimos 7 días", "Este mes", "Mes anterior", "Este año"]

    def __init__(self, padre, app):
        super().__init__(padre, padding=12)
        self.app = app
        arriba = ttk.Frame(self)
        arriba.pack(fill="x", pady=(0, 8))
        ttk.Label(arriba, text="Período:", font=FUENTE).pack(side="left")
        self.periodo = ttk.Combobox(arriba, values=self.PERIODOS, state="readonly", font=FUENTE, width=16)
        self.periodo.set("Hoy")
        self.periodo.pack(side="left", padx=8)
        self.periodo.bind("<<ComboboxSelected>>", lambda e: self.refrescar())
        ttk.Button(arriba, text="Exportar a Excel editable", command=self.exportar).pack(side="left", padx=8)
        ttk.Button(arriba, text="Abrir carpeta de datos", command=lambda: abrir_carpeta(app.almacen.carpeta)).pack(
            side="right")
        ttk.Button(arriba, text="Hacer respaldo ahora", command=self.respaldar).pack(side="right", padx=8)
        self.resumen = ttk.Label(self, text="", font=("Segoe UI", 13), justify="left")
        self.resumen.pack(anchor="w", pady=8)
        ttk.Label(self, text="Más vendidos", font=FUENTE_GRANDE).pack(anchor="w")
        marco, self.arbol = tabla(self, [("nombre", "Producto", 380, "w"), ("cantidad", "Cantidad", 100, "e"),
                                         ("total", "Total", 130, "e")], alto=12)
        marco.pack(fill="both", expand=True)

    def rango(self):
        hoy_ = dt.date.today()
        nombre = self.periodo.get()
        if nombre == "Ayer":
            ayer = hoy_ - dt.timedelta(days=1)
            return ayer, ayer
        if nombre == "Últimos 7 días":
            return hoy_ - dt.timedelta(days=6), hoy_
        if nombre == "Este mes":
            return hoy_.replace(day=1), hoy_
        if nombre == "Mes anterior":
            fin = hoy_.replace(day=1) - dt.timedelta(days=1)
            return fin.replace(day=1), fin
        if nombre == "Este año":
            return hoy_.replace(month=1, day=1), hoy_
        return hoy_, hoy_

    def refrescar(self):
        desde, hasta = (d.isoformat() for d in self.rango())
        r = self.app.almacen.resumen(desde, hasta)
        lineas = [f"Total vendido: {plata(r['total'])}     Ventas: {r['cantidad']}     "
                  f"Ticket promedio: {plata(r['promedio'])}",
                  f"Ganancia estimada (precio - costo): {plata(r['ganancia'])}", ""]
        lineas += [f"   {medio}: {plata(monto)}" for medio, monto in sorted(r["por_medio"].items())]
        self.resumen.configure(text="\n".join(lineas))
        self.arbol.delete(*self.arbol.get_children())
        for fila in r["mas_vendidos"][:50]:
            self.arbol.insert("", "end", values=(fila["nombre"], f"{fila['cantidad']:g}", plata(fila["total"])))

    def exportar(self):
        desde, hasta = (d.isoformat() for d in self.rango())
        try:
            ruta = self.app.almacen.exportar(desde, hasta)
        except OSError as e:
            messagebox.showerror("Exportar", f"No se pudo exportar: {e}", parent=self)
            return
        if messagebox.askyesno("Exportar", f"Se creó {ruta.name}\n(esta copia sí se puede editar).\n\n"
                                           "¿Abrir la carpeta?", parent=self):
            abrir_carpeta(ruta.parent)

    def respaldar(self):
        try:
            ruta = self.app.almacen.respaldar()
        except OSError as e:
            messagebox.showerror("Respaldo", f"No se pudo hacer el respaldo: {e}", parent=self)
            return
        messagebox.showinfo("Respaldo", f"Respaldo hecho: {ruta}", parent=self)


class PestanaConfiguracion(ttk.Frame):
    CAMPOS = [("comercio", "Nombre del comercio"), ("direccion", "Dirección"), ("telefono", "Teléfono"),
              ("cuit", "CUIT"), ("pie_ticket", "Mensaje al pie del ticket")]

    def __init__(self, padre, app):
        super().__init__(padre, padding=20)
        self.app = app
        self.campos = {}
        for i, (clave, texto) in enumerate(self.CAMPOS):
            ttk.Label(self, text=texto, font=FUENTE).grid(row=i, column=0, sticky="w", pady=4)
            campo = ttk.Entry(self, font=FUENTE, width=40)
            campo.grid(row=i, column=1, sticky="w", padx=8)
            self.campos[clave] = campo
        fila = len(self.CAMPOS)
        ttk.Label(self, text="Imprimir ticket", font=FUENTE).grid(row=fila, column=0, sticky="w", pady=4)
        self.imprimir = ttk.Combobox(self, values=["preguntar", "siempre", "nunca"], state="readonly", width=12)
        self.imprimir.grid(row=fila, column=1, sticky="w", padx=8)
        ttk.Label(self, text="Ancho del ticket", font=FUENTE).grid(row=fila + 1, column=0, sticky="w", pady=4)
        self.ancho = ttk.Combobox(self, values=["32 (58 mm)", "42 (80 mm)"], state="readonly", width=12)
        self.ancho.grid(row=fila + 1, column=1, sticky="w", padx=8)
        ttk.Label(self, text="Clave del dueño (para anular\nventas y cambiar precios)", font=FUENTE).grid(
            row=fila + 2, column=0, sticky="w", pady=4)
        self.clave = ttk.Entry(self, font=FUENTE, width=20, show="*")
        self.clave.grid(row=fila + 2, column=1, sticky="w", padx=8)
        ttk.Label(self, text="Copiar respaldos también a\n(pendrive o Google Drive)", font=FUENTE).grid(
            row=fila + 3, column=0, sticky="w", pady=4)
        extra = ttk.Frame(self)
        extra.grid(row=fila + 3, column=1, sticky="w", padx=8)
        self.extra = ttk.Entry(extra, font=FUENTE, width=32)
        self.extra.pack(side="left")
        ttk.Button(extra, text="Elegir…", command=self.elegir_carpeta).pack(side="left", padx=4)
        ttk.Button(self, text="Guardar configuración", style="Accent.TButton", command=self.guardar).grid(
            row=fila + 4, column=1, sticky="w", padx=8, pady=12)
        self.info = ttk.Label(self, text="", foreground="#666", justify="left")
        self.info.grid(row=fila + 5, column=0, columnspan=2, sticky="w", pady=(16, 0))

    def refrescar(self):
        cfg = self.app.ajustes
        for clave, campo in self.campos.items():
            campo.delete(0, "end")
            campo.insert(0, cfg.get(clave, ""))
        self.imprimir.set(cfg.get("imprimir_ticket", "preguntar"))
        self.ancho.set("42 (80 mm)" if int(cfg.get("ancho_ticket", 32)) == 42 else "32 (58 mm)")
        self.clave.delete(0, "end")
        self.clave.insert(0, cfg.get("clave_dueno", ""))
        self.extra.delete(0, "end")
        self.extra.insert(0, cfg.get("carpeta_respaldo_extra", ""))
        licencia = self.app.licencia
        self.info.configure(text=f"{fabrica.NOMBRE_PRODUCTO} {fabrica.VERSION}\n"
                                 f"Licencia: {licencia.clave or '-'}   ·   Equipo: {licencia.equipo}\n"
                                 f"Datos en: {self.app.almacen.carpeta}\n"
                                 f"Soporte: {fabrica.CONTACTO}")

    def elegir_carpeta(self):
        carpeta = filedialog.askdirectory(parent=self)
        if carpeta:
            self.extra.delete(0, "end")
            self.extra.insert(0, carpeta)

    def guardar(self):
        if self.app.ajustes.get("clave_dueno") and not self.app.pedir_clave_dueno():
            return
        cfg = self.app.ajustes
        for clave, campo in self.campos.items():
            cfg[clave] = campo.get().strip()
        cfg["imprimir_ticket"] = self.imprimir.get()
        cfg["ancho_ticket"] = 42 if self.ancho.get().startswith("42") else 32
        cfg["clave_dueno"] = self.clave.get()
        cfg["carpeta_respaldo_extra"] = self.extra.get().strip()
        cfg.guardar()
        self.app.almacen.carpeta_respaldo_extra = cfg["carpeta_respaldo_extra"]
        messagebox.showinfo("Configuración", "Guardado.", parent=self)


class PantallaBloqueo(ttk.Frame):
    """Se muestra sin licencia o con la licencia suspendida."""

    def __init__(self, padre, app):
        super().__init__(padre, padding=40)
        self.app = app
        ttk.Label(self, text=fabrica.NOMBRE_PRODUCTO, font=("Segoe UI", 28, "bold"), foreground=VERDE).pack(
            pady=(40, 8))
        self.mensaje = ttk.Label(self, text="", font=FUENTE_GRANDE, wraplength=640, justify="center")
        self.mensaje.pack(pady=16)
        fila = ttk.Frame(self)
        fila.pack(pady=8)
        ttk.Label(fila, text="Clave de licencia:", font=FUENTE).pack(side="left")
        self.clave = ttk.Entry(fila, font=FUENTE_GRANDE, width=28)
        self.clave.pack(side="left", padx=8)
        self.clave.bind("<Return>", lambda e: self.activar())
        self.boton = ttk.Button(fila, text="Activar", style="Accent.TButton", command=self.activar)
        self.boton.pack(side="left")
        ttk.Button(self, text="Volver a comprobar", command=self.reintentar).pack(pady=8)
        ttk.Label(self, text=f"Equipo: {app.licencia.equipo}   ·   {fabrica.CONTACTO}", foreground="#666").pack(
            pady=(24, 4))
        ttk.Button(self, text="Abrir mis planillas de Excel",
                   command=lambda: abrir_carpeta(app.almacen.carpeta)).pack(pady=4)

    def mostrar(self, mensaje):
        self.mensaje.configure(text=mensaje)
        if self.app.licencia.clave and not self.clave.get():
            self.clave.insert(0, self.app.licencia.clave)

    def activar(self):
        clave = self.clave.get().strip()
        if not clave:
            return
        self.boton.configure(state="disabled", text="Conectando…")

        resultado = []
        threading.Thread(target=lambda: resultado.append(self.app.licencia.activar(clave)), daemon=True).start()

        def esperar():
            if not resultado:
                self.after(200, esperar)
                return
            ok, mensaje = resultado[0]
            self.boton.configure(state="normal", text="Activar")
            if ok:
                messagebox.showinfo("Licencia", mensaje, parent=self)
            else:
                self.mensaje.configure(text=mensaje)
            self.app.revisar_licencia()

        esperar()

    def reintentar(self):
        listo = threading.Event()
        threading.Thread(target=lambda: (self.app.licencia.verificar_en_linea(), listo.set()), daemon=True).start()

        def esperar():
            if not listo.is_set():
                self.after(200, esperar)
                return
            if self.app.revisar_licencia() != lic.ACTIVA:
                messagebox.showinfo("Licencia", self.app.licencia.estado()[1], parent=self)

        esperar()


# ----------------------------------------------------------------------
# Ventana principal
# ----------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self, almacen, config, licencia):
        super().__init__()
        self.almacen = almacen
        self.ajustes = config
        self.licencia = licencia
        self.almacen.carpeta_respaldo_extra = config.get("carpeta_respaldo_extra", "")
        self.title(f"{fabrica.NOMBRE_PRODUCTO} — {config.get('comercio', '')}")
        self.geometry("1150x720")
        self.minsize(980, 620)
        try:
            self.state("zoomed")
        except tk.TclError:
            pass
        self._estilos()

        self.cuaderno = ttk.Notebook(self)
        self.pestana_vender = PestanaVender(self.cuaderno, self)
        self.pestana_productos = PestanaProductos(self.cuaderno, self)
        self.pestana_ventas = PestanaVentas(self.cuaderno, self)
        self.pestana_caja = PestanaCaja(self.cuaderno, self)
        self.pestana_reportes = PestanaReportes(self.cuaderno, self)
        self.pestana_config = PestanaConfiguracion(self.cuaderno, self)
        for pestana, nombre in [(self.pestana_vender, "  Vender  "), (self.pestana_productos, "  Productos  "),
                                (self.pestana_ventas, "  Ventas  "), (self.pestana_caja, "  Caja  "),
                                (self.pestana_reportes, "  Reportes  "), (self.pestana_config, "  Configuración  ")]:
            self.cuaderno.add(pestana, text=nombre)
        self.cuaderno.bind("<<NotebookTabChanged>>", lambda e: self._cambio_pestana())
        self.bloqueo = PantallaBloqueo(self, self)

        self.barra = ttk.Label(self, text="", anchor="w", padding=(10, 4), background="#EEF3F1")
        self.barra.pack(side="bottom", fill="x")

        for tecla, accion in [("<F12>", self.pestana_vender.cobrar), ("<F5>", self.pestana_vender.cambiar_cantidad),
                              ("<F8>", self.pestana_vender.monto_libre)]:
            self.bind_all(tecla, lambda e, a=accion: self._atajo(a))
        self.protocol("WM_DELETE_WINDOW", self.salir)

        self.bloqueado = None
        self.revisar_licencia()
        self.refrescar()
        if not almacen.respaldo_de_hoy_hecho():
            threading.Thread(target=self._respaldo_silencioso, daemon=True).start()
        threading.Thread(target=self._verificar_periodicamente, daemon=True).start()
        self.after(1000, self._actualizar_barra)

    def _estilos(self):
        estilo = ttk.Style(self)
        if "vista" in estilo.theme_names():
            estilo.theme_use("vista")
        else:
            estilo.theme_use("clam")
        estilo.configure("TNotebook.Tab", font=("Segoe UI", 12), padding=(12, 6))
        estilo.configure("TButton", font=FUENTE, padding=(10, 4))
        estilo.configure("Accent.TButton", font=("Segoe UI", 11, "bold"))
        estilo.configure("Treeview", font=FUENTE, rowheight=28)
        estilo.configure("Treeview.Heading", font=("Segoe UI", 11, "bold"))

    def _atajo(self, accion):
        if self.grab_current() is None and not self.bloqueado and self.cuaderno.select() == str(self.pestana_vender):
            accion()

    def _cambio_pestana(self):
        actual = self.cuaderno.nametowidget(self.cuaderno.select())
        if hasattr(actual, "refrescar"):
            actual.refrescar()
        if actual is self.pestana_vender:
            self.pestana_vender.enfocar()

    def ir_a(self, pestana):
        self.cuaderno.select(pestana)

    def refrescar(self):
        for pestana in (self.pestana_productos, self.pestana_ventas, self.pestana_caja, self.pestana_reportes,
                        self.pestana_config):
            pestana.refrescar()
        self._pintar_barra()

    # -- licencia ----------------------------------------------------------
    def revisar_licencia(self):
        estado, mensaje = self.licencia.estado()
        if estado == lic.ACTIVA:
            if self.bloqueado is not False:
                self.bloqueo.pack_forget()
                self.cuaderno.pack(fill="both", expand=True)
                self.bloqueado = False
                self.ir_a(self.pestana_caja if not self.almacen.caja_actual() else self.pestana_vender)
                self.pestana_vender.enfocar()
        else:
            if self.bloqueado is not True:
                self.cuaderno.pack_forget()
                self.bloqueo.pack(fill="both", expand=True)
                self.bloqueado = True
            self.bloqueo.mostrar(mensaje)
        return estado

    def puede_operar(self):
        if self.revisar_licencia() != lic.ACTIVA:
            return False
        return True

    def _verificar_periodicamente(self):
        while True:
            conectado = self.licencia.verificar_en_linea()
            espera = fabrica.HORAS_ENTRE_VERIFICACIONES * 3600 if conectado else 600
            threading.Event().wait(espera)

    # -- varios ------------------------------------------------------------
    def pedir_clave_dueno(self):
        clave = self.ajustes.get("clave_dueno")
        if not clave:
            return True
        ingresada = simpledialog.askstring("Clave del dueño", "Ingresá la clave del dueño:", show="*", parent=self)
        if ingresada == clave:
            return True
        if ingresada is not None:
            messagebox.showerror("Clave del dueño", "Clave incorrecta.", parent=self)
        return False

    def imprimir_ticket(self, venta):
        modo = self.ajustes.get("imprimir_ticket", "preguntar")
        if modo == "nunca" or (modo == "preguntar" and not messagebox.askyesno(
                "Ticket", "¿Imprimir ticket?", parent=self)):
            return
        error = imprimir(armar(venta, self.ajustes))
        if error:
            messagebox.showerror("Ticket", error, parent=self)

    def _respaldo_silencioso(self):
        try:
            self.almacen.respaldar()
        except OSError:
            pass

    def _actualizar_barra(self):
        self._pintar_barra()
        if (self.licencia.estado()[0] == lic.ACTIVA) == self.bloqueado:
            self.revisar_licencia()
        self.after(5000, self._actualizar_barra)

    def _pintar_barra(self):
        caja = self.almacen.caja_actual()
        partes = [f"Caja N° {caja['numero']} abierta" if caja else "Caja cerrada"]
        if self.almacen.error_guardado:
            partes.append("⚠ " + self.almacen.error_guardado)
        else:
            partes.append("Datos guardados en Excel ✔")
        permiso = self.licencia.permiso()
        if permiso and permiso.get("valido_hasta", 0) - self.licencia.reloj() < 2 * 86400 and not self.bloqueado:
            partes.append(f"⚠ Conectá a internet: la licencia necesita verificarse "
                          f"(quedan {self.licencia.dias_restantes()} días)")
        self.barra.configure(text="   ·   ".join(partes),
                             foreground="#B00020" if self.almacen.error_guardado else "#333")

    def salir(self):
        if self.pestana_vender.carrito and not messagebox.askyesno(
                "Salir", "Hay una venta sin cobrar. ¿Salir igual?", parent=self):
            return
        self.destroy()
