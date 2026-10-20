// Registro de buques: une los mensajes de posición y de datos estáticos de cada MMSI,
// guarda una estela con sus últimas posiciones y descarta saltos de posición imposibles.
import { distNM } from './navegacion.js';

const VELOCIDAD_IMPOSIBLE_KN = 60;
const SALTOS_PARA_ACEPTAR = 3; // si insiste 3 veces seguidas, el buque de verdad está ahí

export class RegistroBuques {
  constructor({ maxEstela = 60, intervaloEstelaMs = 20000, caducidadMs = 30 * 60000 } = {}) {
    this.buques = new Map();
    this.maxEstela = maxEstela;
    this.intervaloEstelaMs = intervaloEstelaMs;
    this.caducidadMs = caducidadMs;
  }

  actualizar(datos) {
    const ahora = Date.now();
    const b = this.buques.get(datos.mmsi) || { mmsi: datos.mmsi, estela: [], ultimaEstela: 0 };
    const conPosicion = datos.lat != null && datos.lon != null;
    if (conPosicion && b.lat != null && this.esSalto(b, datos, ahora)) {
      this.buques.set(datos.mmsi, b);
      return;
    }
    for (const [clave, valor] of Object.entries(datos)) {
      if (valor !== undefined && valor !== null && valor !== '') b[clave] = valor;
    }
    if (conPosicion) {
      b.actualizado = ahora;
      if (ahora - b.ultimaEstela >= this.intervaloEstelaMs) {
        b.estela.push([round(datos.lat), round(datos.lon)]);
        if (b.estela.length > this.maxEstela) b.estela.shift();
        b.ultimaEstela = ahora;
      }
    }
    this.buques.set(datos.mmsi, b);
  }

  // Una posición que exigiría navegar a más de 60 nudos es casi siempre un error del GPS o del AIS
  esSalto(b, datos, ahora) {
    const millas = distNM(b, datos);
    const horas = Math.max(ahora - b.actualizado, 1000) / 3600000;
    if (millas < 0.5 || millas / horas <= VELOCIDAD_IMPOSIBLE_KN) {
      b.saltos = 0;
      return false;
    }
    b.saltos = (b.saltos || 0) + 1;
    b.saltosDescartados = (b.saltosDescartados || 0) + 1;
    if (b.saltos >= SALTOS_PARA_ACEPTAR) {
      b.saltos = 0;
      b.estela = [];
      return false;
    }
    return true;
  }

  lista() {
    const limite = Date.now() - this.caducidadMs;
    const salida = [];
    for (const [mmsi, b] of this.buques) {
      if (b.actualizado && b.actualizado < limite) this.buques.delete(mmsi);
      else if (b.lat != null) salida.push(b);
    }
    return salida;
  }
}

const round = (n) => Math.round(n * 1e5) / 1e5;
