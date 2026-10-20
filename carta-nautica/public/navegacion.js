// Cálculos de navegación compartidos por el servidor y el navegador.
// Distancias en millas náuticas (MN), velocidades en nudos, rumbos en grados verdaderos.

const R_MN = 3440.065; // radio medio de la Tierra en millas náuticas
const rad = (g) => (g * Math.PI) / 180;
const grad = (r) => (r * 180) / Math.PI;

export function distNM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MN * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Rumbo inicial de a hacia b (0-360)
export function rumbo(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (grad(Math.atan2(y, x)) + 360) % 360;
}

// Punto alcanzado navegando `mn` millas al rumbo `rumboG` desde p
export function destino(p, rumboG, mn) {
  const d = mn / R_MN;
  const lat1 = rad(p.lat);
  const lon1 = rad(p.lon);
  const th = rad(rumboG);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(th));
  const lon2 = lon1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: grad(lat2), lon: ((grad(lon2) + 540) % 360) - 180 };
}

// Punto de máxima aproximación (CPA) y tiempo hasta él (TCPA) entre dos buques.
// Usa un plano local: suficiente para las distancias cortas en que importa un abordaje.
export function cpa(a, b) {
  const cosLat = Math.cos(rad((a.lat + b.lat) / 2));
  const rx = (b.lon - a.lon) * 60 * cosLat;
  const ry = (b.lat - a.lat) * 60;
  const va = velocidad(a);
  const vb = velocidad(b);
  const vx = vb.x - va.x;
  const vy = vb.y - va.y;
  const v2 = vx * vx + vy * vy;
  const tcpaH = v2 < 1e-9 ? 0 : -(rx * vx + ry * vy) / v2;
  const t = Math.max(0, tcpaH);
  return { cpa: Math.hypot(rx + vx * t, ry + vy * t), tcpaMin: tcpaH * 60, distancia: Math.hypot(rx, ry) };
}

function velocidad(b) {
  const sog = b.sog || 0;
  const cog = rad(b.cog || 0);
  return { x: sog * Math.sin(cog), y: sog * Math.cos(cog) };
}
