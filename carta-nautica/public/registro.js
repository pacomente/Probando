// Registro de buques: une los mensajes de posición y de datos estáticos de cada MMSI
// y guarda una estela con sus últimas posiciones.

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
    for (const [clave, valor] of Object.entries(datos)) {
      if (valor !== undefined && valor !== null && valor !== '') b[clave] = valor;
    }
    if (datos.lat != null && datos.lon != null) {
      b.actualizado = ahora;
      if (ahora - b.ultimaEstela >= this.intervaloEstelaMs) {
        b.estela.push([round(datos.lat), round(datos.lon)]);
        if (b.estela.length > this.maxEstela) b.estela.shift();
        b.ultimaEstela = ahora;
      }
    }
    this.buques.set(datos.mmsi, b);
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
