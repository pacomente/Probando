# Kiosco POS

Sistema de punto de venta para kioscos y almacenes, para vender como software.

- **Programa para PC con Windows.** Funciona sin internet.
- **Todo se guarda en planillas de Excel**, en `Documentos\KioscoPOS`.
- **Los datos no se borran ni se reinician:** las ventas se anulan con un motivo y queda el registro; los productos se dan de baja, no se eliminan.
- **Panel web para vos:** creás licencias y, si un cliente no paga, lo suspendés y el programa se bloquea.

## Qué hace el programa

| Pestaña | Para qué sirve |
|---|---|
| **Vender** | Lector de código de barras o búsqueda por nombre. `3*código` agrega varias unidades. **F12** cobra, **F5** cambia la cantidad, **F8** agrega un monto libre ("Varios"). Calcula el vuelto. |
| **Productos** | Alta y edición de productos, con cálculo del precio según la ganancia %. Ingreso de mercadería, ajuste de stock, aviso de stock bajo y **aumento masivo de precios por %**. |
| **Ventas** | Ventas día por día con su detalle. Anular venta (pide motivo y la clave del dueño) y reimprimir ticket. |
| **Caja** | Apertura con monto inicial, ingresos y retiros, y cierre con el efectivo esperado contra el contado (sobrante o faltante). |
| **Reportes** | Total vendido, ticket promedio, ganancia estimada, totales por medio de pago y más vendidos. Exporta a un Excel editable y hace respaldos. |
| **Configuración** | Datos del comercio para el ticket, impresora de 58 u 80 mm, clave del dueño y carpeta extra de respaldo (pendrive o Google Drive). |

Si escanean un código que no existe, el programa ofrece cargarlo en ese momento.

## Cómo se protegen los datos

En `Documentos\KioscoPOS` quedan:

```
kiosco.xlsx              productos y stock
ventas_2026_10.xlsx      un archivo por mes: Ventas, Detalle, Caja, Stock
registro\2026-10.jsonl   cada operación, en el momento (solo se agregan líneas)
respaldos\respaldo_2026-10-20.zip   un respaldo por día (se guardan 60)
exportaciones\           copias editables que pide el usuario
```

- **Primero se anota en el registro y después en el Excel.** Si se corta la luz, al abrir el programa se recupera todo.
- **El Excel se reemplaza entero de una vez**, así nunca queda un archivo a medio escribir.
- **Si el cliente tiene el Excel abierto**, el programa avisa abajo en rojo y sigue vendiendo. Guarda solo cuando se cierra el Excel.
- **Las hojas tienen contraseña:** se pueden mirar, filtrar y copiar, pero no modificar ni borrar. Para trabajar los números está **Reportes → Exportar a Excel editable**.
- **No se puede abrir el programa dos veces a la vez.**
- **Respaldo automático una vez por día y al cerrar la caja.** Si en Configuración elegís una carpeta de Google Drive o un pendrive, también se copia ahí.

## Cómo funcionan las licencias

1. En tu panel creás una licencia y te da una clave tipo `KPOS-7HQ2-M9XA-...`.
2. Instalás el programa en la PC del cliente y cargás esa clave. Queda atada a esa PC.
3. El programa consulta tu panel al abrirse y cada 6 horas.
4. Si **suspendés** la licencia, el programa se bloquea en la próxima consulta y muestra tu mensaje (por ejemplo: "Tenés una cuota pendiente..."). El cliente igual puede abrir sus planillas de Excel, porque los datos son suyos.
5. **Sin internet** funciona hasta 7 días (se cambia con `PANEL_DIAS_SIN_INTERNET`). Así no se puede usar gratis para siempre desconectándolo.
6. **Atrasar la fecha de la PC no sirve:** el programa lo detecta.
7. **Licencia permanente:** cuando el cliente terminó de pagar, la marcás así y ya no necesita internet. Ojo: después no la podés bloquear a distancia.
8. **Cambio de PC:** en el panel tocás "Liberar PC" y el cliente activa la licencia en la nueva computadora.

Las licencias están firmadas digitalmente con una clave privada que solo tiene tu panel, así que no se pueden falsificar copiando archivos.

> Aviso honesto: ningún programa de PC es imposible de crackear. Esto frena al usuario común y a quien quiera "pasarle" el programa a otro kiosco, que es lo que importa en la práctica.

---

## Puesta en marcha (una sola vez)

### 1. Generar tus claves

Necesitás Python 3.11 o más nuevo ([python.org](https://www.python.org/downloads/); al instalarlo, marcá "Add to PATH").

```
pip install -r requirements.txt -r panel/requirements.txt
python herramientas/generar_claves.py
```

Esto crea:
- `panel/datos/clave_privada.pem`: **SECRETA.** Se sube a tu servidor; guardala con copia y **nunca la subas a GitHub** (ya está en `.gitignore`).
- `pos/clave_publica.py`: va dentro del programa.

### 2. Publicar el panel (ejemplo: PythonAnywhere, tiene plan gratis)

1. Creá una cuenta en [pythonanywhere.com](https://www.pythonanywhere.com/). Tu panel queda en `https://TU-USUARIO.pythonanywhere.com`.
2. Subí la carpeta `panel/` completa, incluida `panel/datos/clave_privada.pem`.
3. En **Web → Add a new web app → Flask**, apuntá a `panel/app.py` (la variable se llama `app`).
4. En la consola: `pip install --user -r panel/requirements.txt`.
5. Definí las variables de entorno en el archivo WSGI, antes de importar la app:
   ```python
   import os
   os.environ["PANEL_CLAVE"] = "una-contraseña-larga-para-entrar"
   os.environ["PANEL_SECRETO"] = "un-texto-largo-al-azar"
   ```
6. Recargá la app y entrá con tu contraseña.

Sirve cualquier hosting que tenga Python y **disco permanente**, porque la base de datos es un archivo SQLite en `panel/datos/`. Hacé copia de esa carpeta de vez en cuando.

### 3. Armar el programa para vender

1. En `pos/ajustes_fabrica.py` poné la dirección de tu panel (`SERVIDOR_LICENCIAS`), el nombre del producto y tu contacto.
2. En una PC con Windows, hacé doble clic en `construir_exe.bat`.
3. Queda `dist\KioscoPOS.exe`: ese es el archivo que instalás en cada cliente.

### 4. Instalar en un cliente

1. En tu panel: **+ Nueva licencia**, cargás los datos del cliente y la forma de pago.
2. Copiás `KioscoPOS.exe` a la PC del cliente y le creás un acceso directo en el escritorio.
3. Lo abrís, pegás la clave y tocás **Activar** (hace falta internet esa vez).
4. En **Configuración** cargás el nombre del comercio y la clave del dueño, y elegís cuándo imprimir el ticket.
5. Si tiene impresora térmica, la ponés como **impresora predeterminada** de Windows.

---

## Para programadores

```
python iniciar.py                       # abrir el programa
python -m unittest discover -s tests    # pruebas
PANEL_CLAVE=x python panel/app.py       # panel en http://localhost:5000
```

Variables útiles para probar sin tocar tus datos reales: `KIOSCO_DATOS` (carpeta de planillas) y `KIOSCO_CONFIG` (carpeta de la licencia).

## Próximas mejoras posibles

- Factura electrónica (ARCA/AFIP).
- Varios usuarios (dueño y empleados) con permisos.
- Ver las ventas de cada cliente desde el panel.
- Instalador con ícono (Inno Setup).
