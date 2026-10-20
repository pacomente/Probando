// Decodificador de sentencias AIS NMEA 0183 (!AIVDM / !AIVDO), para recibir buques sin internet
// desde un receptor AIS a bordo (dAISy, rtl-ais, AIS-catcher, un multiplexor del buque…).
// Solo descarta sentencias con checksum inválido: un dato corrupto nunca llega a la carta.

const TEXTO_6BIT = '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !"#$%&\'()*+,-./0123456789:;<=>?';

export function checksumValido(linea) {
  const m = linea.match(/^[!$]([^*]+)\*([0-9A-Fa-f]{2})/);
  if (!m) return false;
  let x = 0;
  for (const c of m[1]) x ^= c.charCodeAt(0);
  return x === parseInt(m[2], 16);
}

// Junta las sentencias de varias partes y devuelve el mensaje decodificado cuando está completo
export function crearDecodificador() {
  const partes = new Map();
  return function decodificar(lineaCruda) {
    const linea = lineaCruda.trim().replace(/^\\[^\\]*\\/, ''); // quita etiquetas NMEA 4.0 (\s:...,c:...\)
    if (!/^!(AI|AB|BS)VD[MO],/.test(linea) || !checksumValido(linea)) return null;
    const campos = linea.split('*')[0].split(',');
    const [, total, numero, secuencia, , carga, relleno] = campos;
    const n = Number(total);
    const num = Number(numero);
    if (n === 1) return decodificarCarga(carga, Number(relleno));
    const clave = `${secuencia}-${n}`;
    if (num === 1) {
      for (const [k, v] of partes) if (Date.now() - v.hora > 10000) partes.delete(k);
      partes.set(clave, { cargas: [carga], hora: Date.now() });
      return null;
    }
    const p = partes.get(clave);
    if (!p || p.cargas.length !== num - 1) { // falta una parte: se descarta todo el mensaje
      partes.delete(clave);
      return null;
    }
    p.cargas.push(carga);
    if (num < n) return null;
    partes.delete(clave);
    return decodificarCarga(p.cargas.join(''), Number(relleno));
  };
}

function aBits(carga, relleno) {
  let bits = '';
  for (const c of carga) {
    let v = c.charCodeAt(0) - 48;
    if (v > 40) v -= 8;
    if (v < 0 || v > 63) return null;
    bits += v.toString(2).padStart(6, '0');
  }
  return relleno ? bits.slice(0, bits.length - relleno) : bits;
}

function lector(bits) {
  const u = (ini, largo) => (ini + largo <= bits.length ? parseInt(bits.substr(ini, largo), 2) : null);
  const s = (ini, largo) => {
    const v = u(ini, largo);
    if (v == null) return null;
    return bits[ini] === '1' ? v - 2 ** largo : v;
  };
  const t = (ini, largo) => {
    let texto = '';
    for (let i = ini; i + 6 <= Math.min(ini + largo, bits.length); i += 6) texto += TEXTO_6BIT[parseInt(bits.substr(i, 6), 2)];
    return texto.replace(/@.*$/, '').trim() || null;
  };
  return { u, s, t };
}

function posicion(r, iniLon, iniLat) {
  const lon = r.s(iniLon, 28) / 600000;
  const lat = r.s(iniLat, 27) / 600000;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return {}; // 91° / 181° = posición no disponible
  return { lat, lon };
}

const velocidad = (v) => (v == null || v === 1023 ? null : v / 10);
const curso = (v) => (v == null || v >= 3600 ? null : v / 10);
const proa = (v) => (v == null || v >= 360 ? null : v);
const medida = (a, b) => (a || b ? a + b : null);

export function decodificarCarga(carga, relleno = 0) {
  const bits = aBits(carga, relleno);
  if (!bits || bits.length < 38) return null;
  const r = lector(bits);
  const tipoMsg = r.u(0, 6);
  const mmsi = r.u(8, 30);

  switch (tipoMsg) {
    case 1: case 2: case 3:
      return {
        mmsi, ...posicion(r, 61, 89), estado: r.u(38, 4), sog: velocidad(r.u(50, 10)), precision: r.u(60, 1),
        cog: curso(r.u(116, 12)), rumbo: proa(r.u(128, 9)), claseB: false,
      };
    case 18:
      return { mmsi, ...posicion(r, 57, 85), sog: velocidad(r.u(46, 10)), precision: r.u(56, 1), cog: curso(r.u(112, 12)), rumbo: proa(r.u(124, 9)), claseB: true };
    case 19:
      return {
        mmsi, ...posicion(r, 57, 85), sog: velocidad(r.u(46, 10)), precision: r.u(56, 1), cog: curso(r.u(112, 12)), rumbo: proa(r.u(124, 9)),
        nombre: r.t(143, 120), tipo: r.u(263, 8) || null, eslora: medida(r.u(271, 9), r.u(280, 9)), manga: medida(r.u(289, 6), r.u(295, 6)), claseB: true,
      };
    case 5: {
      const mes = r.u(274, 4);
      const dia = r.u(278, 5);
      const hora = r.u(283, 5);
      const minuto = r.u(288, 6);
      const dos = (n) => String(n).padStart(2, '0');
      return {
        mmsi, imo: r.u(40, 30) || null, callsign: r.t(70, 42), nombre: r.t(112, 120), tipo: r.u(232, 8) || null,
        eslora: medida(r.u(240, 9), r.u(249, 9)), manga: medida(r.u(258, 6), r.u(264, 6)),
        eta: mes && dia && hora < 24 && minuto < 60 ? `${dos(dia)}/${dos(mes)} ${dos(hora)}:${dos(minuto)} UTC` : null,
        calado: r.u(294, 8) ? r.u(294, 8) / 10 : null, destino: r.t(302, 120),
      };
    }
    case 24:
      if (r.u(38, 2) === 0) return { mmsi, nombre: r.t(40, 120) };
      return { mmsi, tipo: r.u(40, 8) || null, callsign: r.t(90, 42), eslora: medida(r.u(132, 9), r.u(141, 9)), manga: medida(r.u(150, 6), r.u(156, 6)) };
    case 14:
      return { mmsi, mensajeSeguridad: r.t(40, bits.length - 40), horaMensaje: Date.now() };
    default:
      return null;
  }
}
