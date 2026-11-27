// Base de datos: guardar solo lo que cambia, índice único y migración de los .json viejos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { carpetaTemporal } from './preparar.ts';

const carpeta = carpetaTemporal();
writeFileSync(path.join(carpeta, 'viejo.json'), JSON.stringify({ items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] }));
const base = await import('../base.ts');

test('migra un .json viejo una sola vez', () => {
  const col = base.coleccion<{ id: string; n: number }>('prueba', { migrarDe: { archivo: 'viejo.json', extraer: (j) => j.items } });
  assert.deepEqual(col.todos().map((x) => x.id), ['a', 'b']);
  assert.ok(existsSync(path.join(carpeta, 'viejo.json.migrado')));
});

test('guarda cambios, borra lo que falta y respeta el orden', () => {
  const col = base.coleccion<{ id: string; n: number }>('orden');
  col.guardar([{ id: 'x', n: 1 }, { id: 'y', n: 2 }, { id: 'z', n: 3 }]);
  col.guardar([{ id: 'z', n: 30 }, { id: 'x', n: 1 }]);
  const filas = base.db.prepare('SELECT id, datos FROM orden ORDER BY orden').all() as { id: string; datos: string }[];
  assert.deepEqual(filas.map((f) => f.id), ['z', 'x']);
  assert.equal(JSON.parse(filas[0].datos).n, 30);
});

test('índice único', () => {
  const col = base.coleccion<{ id: string; email: string }>('unicos', { indices: [{ campo: 'email', unico: true }] });
  col.guardar([{ id: '1', email: 'a@b.com' }]);
  assert.throws(() => col.guardar([{ id: '1', email: 'a@b.com' }, { id: '2', email: 'a@b.com' }]));
  assert.equal(col.cantidad(), 1, 'la transacción no dejó nada a medias');
});

test('documento y copia de seguridad', () => {
  const doc = base.documento<{ v: number }>('config', { inicial: () => ({ v: 1 }) });
  doc.guardar({ v: 2 });
  const copia = path.join(carpeta, 'copia.db');
  base.copiarBase(copia);
  assert.ok(existsSync(copia));
  assert.ok(base.resumenBase().documentos >= 1);
});
