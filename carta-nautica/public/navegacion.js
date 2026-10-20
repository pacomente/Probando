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

// Jerarquía de la Regla 18 del RIPA/COLREG (OMI), por estado de navegación AIS.
// Número menor = más privilegiado; los buques con número mayor se mantienen apartados.
const JERARQUIA = { 2: 0, 3: 1, 4: 2, 7: 3, 8: 4 }; // sin gobierno, maniobra restringida, calado, pesca, vela
const NOMBRE_JERARQUIA = ['sin gobierno', 'con capacidad de maniobra restringida', 'restringido por su calado', 'dedicado a la pesca', 'de vela'];

// Qué situación de las Reglas 13 a 15 y 18 del RIPA forman dos buques que se aproximan.
// Devuelve quién debe maniobrar ('a', 'b' o 'ambos') y la regla que lo dice.
export function situacionRIPA(a, b) {
  const marcacionB = (rumbo(a, b) - a.cog + 360) % 360; // dónde ve A a B, respecto de su proa
  const marcacionA = (rumbo(b, a) - b.cog + 360) % 360;
  // Alcance primero: la Regla 13 prevalece sobre la 18
  const popa = (m) => m > 112.5 && m < 247.5; // más de 22,5° a popa del través
  if (popa(marcacionA)) return { tipo: 'Alcance', regla: 13, cede: 'a', motivo: 'alcanza al otro por su popa' };
  if (popa(marcacionB)) return { tipo: 'Alcance', regla: 13, cede: 'b', motivo: 'alcanza al otro por su popa' };

  const ra = JERARQUIA[a.estado] ?? 5;
  const rb = JERARQUIA[b.estado] ?? 5;
  if (ra !== rb && Math.min(ra, rb) <= 4) {
    const cede = ra < rb ? 'b' : 'a';
    const privilegiado = cede === 'a' ? b : a;
    return { tipo: 'Responsabilidades entre buques', regla: 18, cede,
      motivo: `el otro buque está ${NOMBRE_JERARQUIA[Math.min(ra, rb)]}${privilegiado.estado === 4 ? ' (no estorbarle)' : ''}` };
  }

  const diferencia = Math.abs(((a.cog - b.cog + 540) % 360) - 180); // 180 = rumbos opuestos
  const proa = (m) => m < 10 || m > 350;
  if (diferencia > 170 && proa(marcacionB) && proa(marcacionA)) {
    return { tipo: 'Vuelta encontrada', regla: 14, cede: 'ambos', motivo: 'rumbos opuestos: los dos caen a estribor y se cruzan babor con babor' };
  }
  if (marcacionB < 180) return { tipo: 'Cruce', regla: 15, cede: 'a', motivo: 'tiene al otro por su estribor' };
  return { tipo: 'Cruce', regla: 15, cede: 'b', motivo: 'tiene al otro por su estribor' };
}
