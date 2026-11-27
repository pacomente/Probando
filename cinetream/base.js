// Base de datos de Cinetream: SQLite (viene con Node, no hay que instalar nada) en datos/cinetream.db.
// Cada «colección» es una tabla (una fila por película, cuenta, campaña o trámite) y cada «documento» es un valor único
// (planes, datos legales, estadísticas…). Al guardar solo se escriben las filas que cambiaron, en una transacción.
// La primera vez importa sola los archivos .json que usaba Cinetream antes y los deja renombrados como .migrado.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite avisa que es «experimental» al cargarse: se silencia solo ese aviso
const avisar = process.emitWarning;
process.emitWarning = (w, ...resto) => (String(w).includes('SQLite') ? undefined : avisar.call(process, w, ...resto));
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = avisar;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CARPETA_DATOS = process.env.CARPETA_DATOS || path.join(__dirname, 'datos');
mkdirSync(CARPETA_DATOS, { recursive: true });
export const ARCHIVO_BASE = path.join(CARPETA_DATOS, 'cinetream.db');

// Restaurar un respaldo: el administrador lo deja como cinetream.db.restaurar y se aplica al arrancar
if (existsSync(`${ARCHIVO_BASE}.restaurar`)) {
  if (existsSync(ARCHIVO_BASE)) renameSync(ARCHIVO_BASE, `${ARCHIVO_BASE}.antes-de-restaurar-${Date.now()}`);
  for (const extra of ['-wal', '-shm']) if (existsSync(ARCHIVO_BASE + extra)) rmSync(ARCHIVO_BASE + extra);
  renameSync(`${ARCHIVO_BASE}.restaurar`, ARCHIVO_BASE);
  console.log('   Base de datos: se restauró el respaldo');
}

export const db = new DatabaseSync(ARCHIVO_BASE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS documentos (nombre TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado INTEGER NOT NULL);
`);

const NOMBRE = /^[a-z_]+$/;
function enTransaccion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Lee un .json viejo para migrarlo y lo renombra, así no se vuelve a importar
function migrar(archivo, extraer) {
  const ruta = path.join(CARPETA_DATOS, archivo);
  if (!existsSync(ruta)) return undefined;
  try {
    const valor = extraer(JSON.parse(readFileSync(ruta, 'utf8')));
    renameSync(ruta, `${ruta}.migrado`);
    console.log(`   Base de datos: se importó ${archivo}`);
    return valor;
  } catch (e) {
    console.error(`No se pudo importar ${archivo}:`, e.message);
    return undefined;
  }
}

/**
 * Colección: una lista de objetos con «id». todos() devuelve la lista (en el orden guardado);
 * guardar(lista) escribe solo lo que cambió y borra lo que ya no está.
 */
export function coleccion(nombre, { indices = [], migrarDe, inicial = () => [] } = {}) {
  if (!NOMBRE.test(nombre)) throw new Error('Nombre de tabla inválido');
  db.exec(`CREATE TABLE IF NOT EXISTS ${nombre} (id TEXT PRIMARY KEY, orden INTEGER NOT NULL, datos TEXT NOT NULL, actualizado INTEGER NOT NULL)`);
  for (const { campo, unico } of indices) {
    if (!/^[a-zA-Z_]+$/.test(campo)) throw new Error('Campo de índice inválido');
    db.exec(`CREATE ${unico ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ix_${nombre}_${campo} ON ${nombre}(json_extract(datos, '$.${campo}'))`);
  }
  const insertar = db.prepare(`INSERT INTO ${nombre} (id, orden, datos, actualizado) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET orden = excluded.orden, datos = excluded.datos, actualizado = excluded.actualizado`);
  const borrar = db.prepare(`DELETE FROM ${nombre} WHERE id = ?`);
  const guardado = new Map(); // id → «orden|json» de lo que está en la base

  function guardar(lista) {
    const ahora = Date.now();
    const presentes = new Set();
    enTransaccion(() => {
      lista.forEach((item, i) => {
        const id = String(item.id);
        presentes.add(id);
        const json = JSON.stringify(item);
        const clave = `${i}|${json}`;
        if (guardado.get(id) !== clave) { insertar.run(id, i, json, ahora); guardado.set(id, clave); }
      });
      for (const id of [...guardado.keys()]) if (!presentes.has(id)) { borrar.run(id); guardado.delete(id); }
    });
  }

  let filas = db.prepare(`SELECT id, orden, datos FROM ${nombre} ORDER BY orden`).all();
  if (!filas.length) {
    const viejos = migrarDe ? migrar(migrarDe.archivo, migrarDe.extraer) : undefined;
    const iniciales = viejos ?? inicial();
    if (iniciales.length) guardar(iniciales);
    filas = db.prepare(`SELECT id, orden, datos FROM ${nombre} ORDER BY orden`).all();
  }
  for (const f of filas) guardado.set(f.id, `${f.orden}|${f.datos}`);
  const lista = filas.map((f) => JSON.parse(f.datos));
  return { todos: () => lista, guardar, cantidad: () => db.prepare(`SELECT count(*) n FROM ${nombre}`).get().n };
}

/** Documento: un único valor guardado como JSON (planes, datos legales, estadísticas…). */
export function documento(nombre, { migrarDe, inicial = () => null } = {}) {
  const fila = db.prepare('SELECT datos FROM documentos WHERE nombre = ?').get(nombre);
  const escribir = (valor) => db.prepare(`INSERT INTO documentos (nombre, datos, actualizado) VALUES (?, ?, ?)
    ON CONFLICT(nombre) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`).run(nombre, JSON.stringify(valor), Date.now());
  let valor;
  if (fila) valor = JSON.parse(fila.datos);
  else {
    valor = (migrarDe ? migrar(migrarDe.archivo, migrarDe.extraer ?? ((x) => x)) : undefined) ?? inicial();
    if (valor !== null && valor !== undefined) escribir(valor);
  }
  return { leer: () => valor, guardar: (nuevo) => { valor = nuevo; escribir(nuevo); } };
}

/** Copia completa y coherente de la base (aunque se esté usando), para respaldos. */
export function copiarBase(destino) {
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
}

/** Cuántas filas tiene cada tabla (para Ajustes). */
export function resumenBase() {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((t) => t.name);
  return Object.fromEntries(tablas.map((t) => [t, db.prepare(`SELECT count(*) n FROM "${t}"`).get().n]));
}
