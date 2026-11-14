// Catálogo de Cinetream. Solo contenido que se puede distribuir legalmente:
// películas abiertas de la Blender Foundation (Creative Commons) y clásicos mudos en dominio público.
// Antes de publicar, verificá la licencia de cada título en tu país.
//
// video: dirección del archivo (MP4/WebM) o, para archivos propios, "videos/nombre.mp4" (carpeta videos/ del servidor).
// Si falta o no carga, el reproductor muestra una señal de prueba con la misma duración.
// colores y motivo: con qué se dibuja el afiche (Cinetream no usa imágenes con derechos de terceros).

const MUESTRAS = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';

export const PELICULAS = [
  {
    id: 'sintel', titulo: 'Sintel', anio: 2010, duracionMin: 15, clasificacion: '+13',
    generos: ['Animación', 'Aventura', 'Fantasía'], direccion: 'Colin Levy', origen: 'Países Bajos',
    licencia: 'CC BY 3.0 · Blender Foundation',
    sinopsis: 'Una joven guerrera recorre tierras heladas y desiertos en busca del pequeño dragón que rescató y perdió. Cuando por fin lo encuentra, descubre que el tiempo cambió más de lo que imaginaba.',
    video: `${MUESTRAS}Sintel.mp4`, colores: ['#3a1c4a', '#d9643a'], motivo: 'luna', destacada: true,
  },
  {
    id: 'tears-of-steel', titulo: 'Tears of Steel', anio: 2012, duracionMin: 12, clasificacion: '+13',
    generos: ['Ciencia ficción', 'Acción'], direccion: 'Ian Hubert', origen: 'Países Bajos',
    licencia: 'CC BY 3.0 · Blender Foundation',
    sinopsis: 'En una Ámsterdam del futuro invadida por robots, un grupo de científicos intenta salvar el mundo recreando el momento en que una pareja se separó.',
    video: `${MUESTRAS}TearsOfSteel.mp4`, colores: ['#0f2a3a', '#4fb3c9'], motivo: 'grilla', destacada: true,
  },
  {
    id: 'big-buck-bunny', titulo: 'Big Buck Bunny', anio: 2008, duracionMin: 10, clasificacion: 'ATP',
    generos: ['Animación', 'Comedia', 'Familia'], direccion: 'Sacha Goedegebure', origen: 'Países Bajos',
    licencia: 'CC BY 3.0 · Blender Foundation',
    sinopsis: 'Un conejo gigante y bonachón disfruta de una mañana de primavera hasta que tres roedores abusivos se meten con él. Entonces prepara una venganza a su medida.',
    video: `${MUESTRAS}BigBuckBunny.mp4`, colores: ['#2f6b2a', '#f2c94c'], motivo: 'sol', destacada: true,
  },
  {
    id: 'elephants-dream', titulo: 'Elephants Dream', anio: 2006, duracionMin: 11, clasificacion: 'ATP',
    generos: ['Animación', 'Ciencia ficción'], direccion: 'Bassam Kurdali', origen: 'Países Bajos',
    licencia: 'CC BY 2.5 · Blender Foundation',
    sinopsis: 'Emo y Proog recorren una máquina infinita y laberíntica. Para uno es un mundo lleno de maravillas; para el otro, una trampa. La primera película abierta de la historia.',
    video: `${MUESTRAS}ElephantsDream.mp4`, colores: ['#2b2620', '#c98b3f'], motivo: 'engranaje',
  },
  {
    id: 'caminandes-llamigos', titulo: 'Caminandes: Llamigos', anio: 2016, duracionMin: 3, clasificacion: 'ATP',
    generos: ['Animación', 'Comedia', 'Familia'], direccion: 'Pablo Vázquez', origen: 'Argentina',
    licencia: 'CC BY 4.0 · Blender Foundation',
    sinopsis: 'En pleno invierno patagónico, la llama Koro descubre que un pingüino también quiere las últimas bayas del lugar. Del director argentino Pablo Vázquez.',
    video: null, colores: ['#7fb6d9', '#f5f1e6'], motivo: 'montanas', destacada: true,
  },
  {
    id: 'spring', titulo: 'Spring', anio: 2019, duracionMin: 8, clasificacion: 'ATP',
    generos: ['Animación', 'Fantasía'], direccion: 'Andy Goralczyk', origen: 'Países Bajos',
    licencia: 'CC BY 4.0 · Blender Foundation',
    sinopsis: 'Una joven pastora y su perro se enfrentan a espíritus ancestrales para que el ciclo de la vida pueda continuar.',
    video: null, colores: ['#1f3b2f', '#e8a3b8'], motivo: 'ondas',
  },
  {
    id: 'cosmos-laundromat', titulo: 'Cosmos Laundromat', anio: 2015, duracionMin: 12, clasificacion: '+13',
    generos: ['Animación', 'Comedia', 'Fantasía'], direccion: 'Mathieu Auvray', origen: 'Países Bajos',
    licencia: 'CC BY 4.0 · Blender Foundation',
    sinopsis: 'En una isla desolada, Franck, una oveja harta de todo, conoce a Victor, un vendedor excéntrico que le ofrece el regalo de mil vidas.',
    video: null, colores: ['#2a2350', '#f08a5d'], motivo: 'anillos',
  },
  {
    id: 'sprite-fright', titulo: 'Sprite Fright', anio: 2021, duracionMin: 10, clasificacion: '+13',
    generos: ['Animación', 'Terror', 'Comedia'], direccion: 'Matthew Luhn', origen: 'Países Bajos',
    licencia: 'CC BY 4.0 · Blender Foundation',
    sinopsis: 'Un grupo de adolescentes acampa en un bosque británico sin saber que sus habitantes, unos duendes adorables, no toleran la mala educación.',
    video: null, colores: ['#203018', '#d4e157'], motivo: 'triangulo',
  },
  {
    id: 'charge', titulo: 'Charge', anio: 2022, duracionMin: 4, clasificacion: '+13',
    generos: ['Animación', 'Acción', 'Ciencia ficción'], direccion: 'Hjalti Hjálmarsson', origen: 'Países Bajos',
    licencia: 'CC BY 4.0 · Blender Foundation',
    sinopsis: 'En un futuro sin energía, un anciano desesperado intenta robar una batería custodiada por un robot implacable.',
    video: null, colores: ['#141820', '#ff4b3e'], motivo: 'rayos',
  },
  {
    id: 'nosferatu', titulo: 'Nosferatu', anio: 1922, duracionMin: 94, clasificacion: '+13',
    generos: ['Clásicos', 'Terror', 'Cine mudo'], direccion: 'F. W. Murnau', origen: 'Alemania',
    licencia: 'Dominio público',
    sinopsis: 'Un agente inmobiliario viaja a Transilvania para cerrar una venta con el misterioso conde Orlok, sin saber que su cliente lleva la peste y la muerte a su ciudad.',
    video: null, colores: ['#141414', '#9a9a8a'], motivo: 'sombra', destacada: true,
  },
  {
    id: 'caligari', titulo: 'El gabinete del Dr. Caligari', anio: 1920, duracionMin: 76, clasificacion: '+13',
    generos: ['Clásicos', 'Terror', 'Cine mudo'], direccion: 'Robert Wiene', origen: 'Alemania',
    licencia: 'Dominio público',
    sinopsis: 'Un hipnotizador de feria y su sonámbulo llegan a un pueblo donde empiezan a ocurrir asesinatos. La obra cumbre del expresionismo alemán.',
    video: null, colores: ['#2b2116', '#d8b26e'], motivo: 'angulos',
  },
  {
    id: 'viaje-a-la-luna', titulo: 'Viaje a la Luna', anio: 1902, duracionMin: 13, clasificacion: 'ATP',
    generos: ['Clásicos', 'Ciencia ficción', 'Cine mudo', 'Familia'], direccion: 'Georges Méliès', origen: 'Francia',
    licencia: 'Dominio público',
    sinopsis: 'Un grupo de astrónomos viaja a la Luna dentro de una cápsula disparada por un cañón gigante. La primera película de ciencia ficción de la historia.',
    video: null, colores: ['#101830', '#f3e7b3'], motivo: 'luna',
  },
];

// Filas de la pantalla de inicio, en orden
export const FILAS = [
  { titulo: 'Destacadas', filtro: (p) => p.destacada },
  { titulo: 'Animación', filtro: (p) => p.generos.includes('Animación') },
  { titulo: 'Ciencia ficción', filtro: (p) => p.generos.includes('Ciencia ficción') },
  { titulo: 'Para toda la familia', filtro: (p) => p.clasificacion === 'ATP' },
  { titulo: 'Clásicos del cine mudo', filtro: (p) => p.generos.includes('Cine mudo') },
  { titulo: 'Para ver en menos de 15 minutos', filtro: (p) => p.duracionMin <= 15 },
];
