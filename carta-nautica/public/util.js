// Utilidades de formato compartidas por la carta.

export const $ = (sel) => document.querySelector(sel);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const num = (n, dec = 1) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(dec).replace('.', ','));
export const grados = (g) => (g == null ? '—' : `${String(Math.round(g) % 360).padStart(3, '0')}°`);

// Coordenadas náuticas: grados y minutos con dos decimales (38°47,40' S)
export function fmtCoord(v, pos, neg, anchoGrados = 2) {
  const a = Math.abs(v);
  let g = Math.floor(a);
  let m = (a - g) * 60;
  if (m >= 59.995) { g += 1; m = 0; }
  return `${String(g).padStart(anchoGrados, '0')}°${m.toFixed(2).padStart(5, '0').replace('.', ',')}' ${v < 0 ? neg : pos}`;
}
export const fmtPos = (p) => `${fmtCoord(p.lat, 'N', 'S')}  ${fmtCoord(p.lon, 'E', 'O', 3)}`;

export function hace(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 172800) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

export function guardar(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } }
export function leer(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
export function leerJSON(clave) { try { return JSON.parse(leer(clave)); } catch { return null; } }
