// Puertos y ciudades costeras de Argentina. Posiciones APROXIMADAS, solo como referencia en la carta
// y para medir distancias ("a 12 MN al 125° de Puerto Madryn"). Para navegar, usá las cartas del SHN.
// tipo: 'puerto' (comercial o pesquero), 'ciudad' (ciudad o balneario costero), 'base' (naval)
// principal: se nombra desde lejos; los demás, al acercarse
export const PUERTOS = [
  // Río Paraná y Río de la Plata
  { nombre: 'Puerto de Santa Fe', principal: true, lat: -31.645, lon: -60.700, tipo: 'puerto', provincia: 'Santa Fe' },
  { nombre: 'Paraná', lat: -31.728, lon: -60.530, tipo: 'ciudad', provincia: 'Entre Ríos' },
  { nombre: 'Puerto San Martín', lat: -32.715, lon: -60.730, tipo: 'puerto', provincia: 'Santa Fe' },
  { nombre: 'Puerto de Rosario', principal: true, lat: -32.960, lon: -60.630, tipo: 'puerto', provincia: 'Santa Fe' },
  { nombre: 'Puerto San Nicolás', lat: -33.330, lon: -60.210, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Zárate', lat: -34.095, lon: -59.025, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Campana', lat: -34.170, lon: -58.955, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Puerto de Buenos Aires', principal: true, lat: -34.585, lon: -58.370, tipo: 'puerto', provincia: 'CABA' },
  { nombre: 'Dock Sud', lat: -34.645, lon: -58.340, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Puerto La Plata', principal: true, lat: -34.860, lon: -57.895, tipo: 'puerto', provincia: 'Buenos Aires' },
  // Costa atlántica bonaerense
  { nombre: 'San Clemente del Tuyú', lat: -36.355, lon: -56.720, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Pinamar', lat: -37.110, lon: -56.850, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Villa Gesell', lat: -37.265, lon: -56.975, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Puerto de Mar del Plata', principal: true, lat: -38.040, lon: -57.535, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Miramar', lat: -38.270, lon: -57.840, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Puerto Quequén', principal: true, lat: -38.575, lon: -58.705, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Claromecó', lat: -38.860, lon: -60.075, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Monte Hermoso', lat: -38.990, lon: -61.290, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Base Naval Puerto Belgrano', lat: -38.893, lon: -62.105, tipo: 'base', provincia: 'Buenos Aires' },
  { nombre: 'Puerto Rosales', lat: -38.923, lon: -62.066, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Puerto Ingeniero White', principal: true, lat: -38.7935, lon: -62.270, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Puerto Galván', lat: -38.784, lon: -62.302, tipo: 'puerto', provincia: 'Buenos Aires' },
  { nombre: 'Bahía Blanca', lat: -38.718, lon: -62.266, tipo: 'ciudad', provincia: 'Buenos Aires' },
  { nombre: 'Carmen de Patagones', lat: -40.800, lon: -62.980, tipo: 'ciudad', provincia: 'Buenos Aires' },
  // Río Negro y Chubut
  { nombre: 'Viedma', etiquetaIzquierda: true, lat: -40.813, lon: -62.996, tipo: 'ciudad', provincia: 'Río Negro' },
  { nombre: 'Puerto San Antonio Este', principal: true, lat: -40.805, lon: -64.880, tipo: 'puerto', provincia: 'Río Negro' },
  { nombre: 'San Antonio Oeste', lat: -40.732, lon: -64.948, tipo: 'ciudad', provincia: 'Río Negro' },
  { nombre: 'Las Grutas', lat: -40.810, lon: -65.085, tipo: 'ciudad', provincia: 'Río Negro' },
  { nombre: 'Puerto Pirámides', lat: -42.572, lon: -64.282, tipo: 'ciudad', provincia: 'Chubut' },
  { nombre: 'Puerto Madryn', principal: true, lat: -42.770, lon: -65.030, tipo: 'puerto', provincia: 'Chubut' },
  { nombre: 'Trelew', lat: -43.250, lon: -65.305, tipo: 'ciudad', provincia: 'Chubut' },
  { nombre: 'Puerto Rawson', principal: true, lat: -43.340, lon: -65.045, tipo: 'puerto', provincia: 'Chubut' },
  { nombre: 'Camarones', lat: -44.800, lon: -65.710, tipo: 'puerto', provincia: 'Chubut' },
  { nombre: 'Puerto de Comodoro Rivadavia', principal: true, lat: -45.860, lon: -67.465, tipo: 'puerto', provincia: 'Chubut' },
  // Santa Cruz
  { nombre: 'Caleta Paula (Caleta Olivia)', principal: true, lat: -46.440, lon: -67.515, tipo: 'puerto', provincia: 'Santa Cruz' },
  { nombre: 'Puerto Deseado', principal: true, lat: -47.750, lon: -65.900, tipo: 'puerto', provincia: 'Santa Cruz' },
  { nombre: 'Puerto San Julián', principal: true, lat: -49.305, lon: -67.725, tipo: 'puerto', provincia: 'Santa Cruz' },
  { nombre: 'Punta Quilla (Puerto Santa Cruz)', principal: true, lat: -50.115, lon: -68.405, tipo: 'puerto', provincia: 'Santa Cruz' },
  { nombre: 'Puerto de Río Gallegos', principal: true, lat: -51.615, lon: -69.215, tipo: 'puerto', provincia: 'Santa Cruz' },
  // Tierra del Fuego
  { nombre: 'Río Grande', principal: true, lat: -53.785, lon: -67.700, tipo: 'puerto', provincia: 'Tierra del Fuego' },
  { nombre: 'Puerto de Ushuaia', principal: true, lat: -54.810, lon: -68.300, tipo: 'puerto', provincia: 'Tierra del Fuego' },
];

export const ICONOS_PUERTO = { puerto: '⚓', ciudad: '•', base: '⚓' };
