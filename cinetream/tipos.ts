// Tipos de los datos de Cinetream. Son la referencia de qué campos tiene cada cosa que se guarda en la base.

/** Cuerpo JSON que llega en un pedido: se valida campo por campo en cada ruta. */
export type Cuerpo = Record<string, any>;

export type EstadoPelicula = 'publicada' | 'oculta' | 'descargando' | 'error';
export type Clasificacion = 'ATP' | '+13' | '+16' | '+18';

export interface Pelicula {
  id: string;
  titulo: string;
  anio: number;
  duracionMin: number;
  clasificacion: Clasificacion;
  generos: string[];
  direccion: string;
  origen: string;
  licencia: string;
  sinopsis: string;
  /** «videos/archivo.mp4» (disco), «r2:clave» (Cloudflare R2) o un link https al archivo */
  video: string | null;
  /** Reproductor de otro sitio (YouTube, Vimeo, StreamHG…) */
  embed: string | null;
  /** Código del video en la cuenta de StreamHG */
  streamhg: string | null;
  portada: string | null;
  colores: [string, string];
  motivo: string;
  destacada: boolean;
  plus: boolean;
  estado: EstadoPelicula;
  fuente: string | null;
  videoOriginal: string | null;
  tamano: number;
  alta: number;
}

export interface Plan {
  id: 'gratis' | 'plus' | 'plus-anual' | string;
  nombre: string;
  precio: number;
  periodo: 'mes' | 'año';
  anuncios: boolean;
  plus: boolean;
  pantallas: number;
  descripcion: string;
  oculto?: boolean;
}

export interface Pago {
  proveedor?: 'mercadopago' | 'prueba' | 'manual' | string;
  id?: string | null;
  referencia?: string;
  estado?: 'pendiente' | 'autorizada' | string;
  plan?: string;
}

export interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  sal: string;
  hash: string;
  plan: string;
  estado: 'activa' | 'cancelada' | 'vencida' | string;
  vence: number | null;
  alta: number;
  pago: Pago | null;
  /** Fecha en que contrató el plan pago actual (para el botón de arrepentimiento) */
  contratado?: number;
  /** Sube al cambiar la contraseña: invalida las sesiones anteriores */
  version?: number;
  restablecer?: { hash: string; vence: number };
}

export interface Campana {
  id: string;
  nombre: string;
  anunciante: string;
  tipo: 'previo' | 'banner';
  titulo: string;
  texto: string;
  pieza: string | null;
  piezaTipo: 'imagen' | 'video' | null;
  enlace: string;
  colores: [string, string];
  duracion: number;
  saltarTras: number;
  peso: number;
  activa: boolean;
  desde: number | null;
  hasta: number | null;
  stats: { impresiones: number; clics: number; completos: number };
}

export interface Tramite {
  id: string;
  codigo: string;
  tipo: 'baja' | 'arrepentimiento' | 'eliminacion';
  email: string;
  cuentaId: string;
  fecha: number;
  estado: 'pendiente' | 'resuelto';
  resuelto?: number;
  [detalle: string]: unknown;
}

/** Lo que devuelve el análisis de un link en «Agregar con un link». */
export interface InfoImportada {
  tipo: 'archive' | 'directo' | 'pagina' | 'embed';
  video?: string;
  embed?: string;
  streamhg?: string;
  sitio?: string;
  paginaEntera?: boolean;
  fuente?: string;
  portada?: string | null;
  titulo?: string;
  anio?: number | null;
  direccion?: string;
  sinopsis?: string;
  duracionMin?: number;
  generos?: string[];
  licencia?: string;
  tamano?: number | null;
  formato?: string;
}

/** Trabajo en segundo plano (descargar, guardar en el servidor, pasar a R2). */
export interface Trabajo {
  estado: 'descargando' | 'listo' | 'error';
  tipo?: 'importar' | 'guardar' | 'r2';
  bytes: number;
  total: number;
  error: string | null;
  control: AbortController;
}
