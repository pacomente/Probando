// Afiches de Cinetream dibujados en SVG: degradé con los colores de la película y una figura que la representa.
// Así la plataforma no depende de imágenes con derechos de terceros y funciona sin internet.

let contador = 0;

// Figuras en un lienzo de 200 × 300 (afiche vertical). c = color de acento, f = color de fondo
const MOTIVOS = {
  sol: (c) => `<circle cx="130" cy="105" r="52" fill="${c}"/>${[...Array(12)].map((_, i) => {
    const a = (i * Math.PI) / 6;
    return `<line x1="${130 + Math.cos(a) * 66}" y1="${105 + Math.sin(a) * 66}" x2="${130 + Math.cos(a) * 90}" y2="${105 + Math.sin(a) * 90}" stroke="${c}" stroke-width="6" stroke-linecap="round" opacity=".8"/>`;
  }).join('')}`,
  luna: (c, f) => `<circle cx="118" cy="100" r="58" fill="${c}"/><circle cx="142" cy="86" r="52" fill="${f}"/>
    ${[[40, 40], [170, 190], [60, 170], [150, 30], [30, 110]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${c}"/>`).join('')}`,
  grilla: (c) => `${[...Array(9)].map((_, i) => `<line x1="${100 + (i - 4) * 12}" y1="120" x2="${100 + (i - 4) * 60}" y2="300" stroke="${c}" stroke-width="1.5" opacity=".7"/>`).join('')}
    ${[130, 145, 165, 192, 230, 280].map((y) => `<line x1="0" y1="${y}" x2="200" y2="${y}" stroke="${c}" stroke-width="1.5" opacity=".7"/>`).join('')}
    <circle cx="100" cy="95" r="34" fill="none" stroke="${c}" stroke-width="4"/>`,
  engranaje: (c) => `<g transform="translate(120 110)">${[...Array(10)].map((_, i) => `<rect x="-9" y="-72" width="18" height="24" rx="3" fill="${c}" transform="rotate(${i * 36})"/>`).join('')}
    <circle r="54" fill="${c}"/><circle r="22" fill="none" stroke="#0005" stroke-width="10"/></g>
    <g transform="translate(48 190) scale(.5)">${[...Array(8)].map((_, i) => `<rect x="-9" y="-72" width="18" height="24" rx="3" fill="${c}" opacity=".7" transform="rotate(${i * 45})"/>`).join('')}<circle r="54" fill="${c}" opacity=".7"/></g>`,
  montanas: (c) => `<circle cx="150" cy="70" r="22" fill="${c}" opacity=".9"/>
    <path d="M0 220 L55 120 L95 185 L135 105 L200 210 L200 300 L0 300 Z" fill="${c}" opacity=".55"/>
    <path d="M0 250 L40 190 L80 235 L125 170 L200 245 L200 300 L0 300 Z" fill="${c}"/>`,
  ondas: (c) => [...Array(6)].map((_, i) => `<path d="M-10 ${90 + i * 26} Q 40 ${60 + i * 26} 100 ${90 + i * 26} T 210 ${90 + i * 26}" fill="none" stroke="${c}" stroke-width="5" opacity="${1 - i * 0.13}"/>`).join(''),
  anillos: (c) => [...Array(6)].map((_, i) => `<circle cx="110" cy="110" r="${18 + i * 16}" fill="none" stroke="${c}" stroke-width="${7 - i}" opacity="${1 - i * 0.14}"/>`).join(''),
  triangulo: (c) => `<path d="M100 30 L180 190 L20 190 Z" fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M100 80 L148 175 L52 175 Z" fill="${c}" opacity=".85"/>`,
  rayos: (c) => `<path d="M120 20 L60 140 L105 140 L80 260 L150 110 L105 110 L135 20 Z" fill="${c}"/>`,
  sombra: (c) => `<path d="M118 40 C 108 70 112 95 104 120 L 92 210 C 90 240 70 270 60 300 L 140 300 C 128 260 120 230 122 205 L 130 120 C 126 95 132 70 126 40 Z" fill="${c}" opacity=".85"/>
    <path d="M128 120 C 150 118 165 130 176 150 M176 150 l 10 -6 M176 150 l 12 2 M176 150 l 6 10" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  angulos: (c) => `<path d="M10 300 L60 80 L95 300 Z" fill="${c}" opacity=".5"/><path d="M80 300 L130 40 L160 300 Z" fill="${c}" opacity=".8"/>
    <path d="M140 300 L190 120 L200 300 Z" fill="${c}" opacity=".6"/><path d="M0 60 L200 20 L200 34 L0 76 Z" fill="${c}" opacity=".7"/>`,
};

function svg(p, ancho, alto, recorte) {
  const id = `g${++contador}`;
  const [fondo, acento] = p.colores;
  const motivo = (MOTIVOS[p.motivo] || MOTIVOS.anillos)(acento, fondo);
  const apaisado = recorte === 'ancho';
  // En apaisado, la figura va a la derecha y la escena se oscurece hacia la izquierda, donde va el texto
  const escena = apaisado
    ? `<g transform="translate(${ancho * 0.52} ${alto * -0.08}) scale(${(alto * 1.15) / 300})">${motivo}</g>
       <rect width="${ancho}" height="${alto}" fill="url(#${id}l)"/>`
    : motivo;
  // Luz cálida detrás de la figura y viñeta en los bordes, como en un afiche impreso
  const luzX = apaisado ? 0.72 : 0.62;
  const luzY = apaisado ? 0.35 : 0.33;
  return `<svg viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${mezclar(fondo, '#ffffff', 0.06)}"/><stop offset="1" stop-color="${mezclar(fondo, '#000000', 0.6)}"/></linearGradient>
      <radialGradient id="${id}r" cx="${luzX}" cy="${luzY}" r="0.55"><stop offset="0" stop-color="${acento}" stop-opacity=".28"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}v" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
      <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0.25" stop-color="#0b0b10" stop-opacity=".95"/><stop offset="0.7" stop-color="#0b0b10" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${ancho}" height="${alto}" fill="url(#${id})"/>
    <rect width="${ancho}" height="${alto}" fill="url(#${id}r)"/>
    ${escena}
    <rect width="${ancho}" height="${alto}" fill="url(#${id}v)"/>
  </svg>`;
}

function mezclar(a, b, t) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// Afiche vertical: estudio arriba, título con tipografía de cartel y año
export function afiche(p, firma = '') {
  return `<div class="afiche">${svg(p, 200, 300)}
    ${firma ? `<span class="afiche-firma">${esc(firma)}</span>` : ''}
    <span class="afiche-titulo">${esc(p.titulo)}</span><span class="afiche-anio">${p.anio}</span></div>`;
}

// Miniatura apaisada (16:9) para "Seguir viendo"
export function miniatura(p) {
  return `<div class="miniatura">${svg(p, 1600, 900, 'ancho')}<span class="miniatura-titulo">${esc(p.titulo)}</span></div>`;
}

// Fondo apaisado para la portada y la ficha
export function fondoApaisado(p) {
  return svg(p, 1600, 900, 'ancho');
}

// Avatar de perfil: una cara simple sobre el color elegido (la forma de los ojos cambia con el estilo)
export function avatar(perfil) {
  const ojos = {
    puntos: '<circle cx="36" cy="44" r="5"/><circle cx="64" cy="44" r="5"/>',
    lineas: '<rect x="28" y="42" width="16" height="5" rx="2.5"/><rect x="56" y="42" width="16" height="5" rx="2.5"/>',
    grandes: '<circle cx="36" cy="44" r="8"/><circle cx="64" cy="44" r="8"/><circle cx="38" cy="42" r="2.5" fill="#fff"/><circle cx="66" cy="42" r="2.5" fill="#fff"/>',
    guino: '<circle cx="36" cy="44" r="5"/><path d="M57 45 q7 -6 14 0" stroke="#0c0d12" stroke-width="5" fill="none" stroke-linecap="round"/>',
  }[perfil.estilo] || '';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="14" fill="${perfil.color}"/>
    <g fill="#0c0d12">${ojos}</g><path d="M32 64 q18 16 36 0" stroke="#0c0d12" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`;
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
