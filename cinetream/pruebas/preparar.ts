// Cada archivo de pruebas corre en su propio proceso con una carpeta de datos temporal y vacía.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function carpetaTemporal(): string {
  const carpeta = mkdtempSync(path.join(tmpdir(), 'cinetream-prueba-'));
  process.env.CARPETA_DATOS = carpeta;
  process.env.CARPETA_VIDEOS = path.join(carpeta, 'videos');
  return carpeta;
}
