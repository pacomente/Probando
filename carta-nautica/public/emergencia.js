// Emergencias: radiobalizas AIS (SART, MOB, EPIRB), alarma sonora, hombre al agua
// y mensajes de socorro MAYDAY / PAN-PAN / SÉCURITÉ según el formato de la OMI (SMCP).
// Todo funciona sin internet.
import { distNM, rumbo } from './navegacion.js';
import { $, esc, fmtPos, grados, guardar, leer, leerJSON, num } from './util.js';

// ---------- Dispositivos de emergencia AIS ----------
// MMSI 970… = AIS-SART, 972… = MOB, 974… = EPIRB-AIS (Recomendación UIT-R M.585)
const NOMBRES_SOS = { MOB: 'HOMBRE AL AGUA', MAYDAY: 'MAYDAY (socorro)', PANPAN: 'PAN-PAN (urgencia)' };

export function emergencia(b) {
  // Alerta enviada por un barco de la flota desde Trappi a bordo
  if (b.sos?.alerta && NOMBRES_SOS[b.sos.alerta]) return { tipo: `${NOMBRES_SOS[b.sos.alerta]} en ${b.nombre || b.mmsi}`, prueba: false, flota: true };
  const id = String(b.mmsi);
  const texto = b.mensajeSeguridad || '';
  let tipo = null;
  if (id.startsWith('970')) tipo = 'AIS-SART: balsa o bote salvavidas';
  else if (id.startsWith('972')) tipo = 'MOB AIS: persona al agua';
  else if (id.startsWith('974')) tipo = 'EPIRB-AIS: radiobaliza de socorro';
  else if (b.estado === 14) tipo = 'Señal de emergencia AIS';
  else if (/\b(SART|MOB|EPIRB)\b.*ACTIVE|MAYDAY/i.test(texto)) tipo = 'Mensaje de socorro AIS';
  if (!tipo) return null;
  return { tipo, prueba: /TEST/i.test(texto) || b.estado === 15 };
}

// ---------- Alarma sonora ----------
let audio = null;
let intervaloAlarma = null;
let silenciadaHasta = 0;
// Los navegadores solo dejan sonar audio después de que la persona toque la pantalla
document.addEventListener('pointerdown', () => {
  try { audio ??= new AudioContext(); audio.resume(); } catch { /* sin audio */ }
}, { passive: true });

function pitido() {
  if (!audio) return;
  const t = audio.currentTime;
  [[0, 880], [0.25, 660], [0.5, 880], [0.75, 660]].forEach(([d, f]) => {
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = f;
    vol.gain.setValueAtTime(0.15, t + d);
    vol.gain.setValueAtTime(0, t + d + 0.22);
    osc.connect(vol).connect(audio.destination);
    osc.start(t + d);
    osc.stop(t + d + 0.23);
  });
}

export function alarma(activa) {
  if (activa && !intervaloAlarma && Date.now() > silenciadaHasta) {
    const sonar = () => { pitido(); navigator.vibrate?.([400, 200, 400]); };
    sonar();
    intervaloAlarma = setInterval(sonar, 2500);
  } else if (!activa && intervaloAlarma) {
    clearInterval(intervaloAlarma);
    intervaloAlarma = null;
  }
}

// Se silencia unos minutos; si la emergencia sigue, vuelve a sonar
export function silenciarAlarma(minutos = 5) {
  silenciadaHasta = Date.now() + minutos * 60000;
  alarma(false);
}

// ---------- Hombre al agua ----------
// alAvisar(tipo, posicion): avisa a la oficina (Trappi Central) al marcar y al terminar
export function crearMOB({ map, obtenerPropio, obtenerPosicionRapida, alAvisar = () => {} }) {
  let mob = leerJSON('carta-mob');
  let marcador = null;
  let linea = null;

  function dibujar() {
    marcador?.remove();
    linea?.remove();
    marcador = linea = null;
    if (!mob) return;
    marcador = L.marker([mob.lat, mob.lon], {
      zIndexOffset: 2000,
      icon: L.divIcon({ className: 'mob-icono', iconSize: [34, 34], iconAnchor: [17, 17], html: '<span>MOB</span>' }),
    }).bindTooltip('Hombre al agua: posición de la caída').addTo(map);
    linea = L.polyline([], { color: '#ff2d2d', weight: 3, dashArray: '6 6' }).addTo(map);
  }

  async function marcar() {
    const hora = Date.now();
    let p = obtenerPropio();
    let fuente = 'GPS';
    if (!p) p = await obtenerPosicionRapida();
    if (!p) {
      const c = map.getCenter();
      p = { lat: c.lat, lon: c.lng };
      fuente = 'centro de la carta: SIN GPS, posición aproximada';
    }
    mob = { lat: p.lat, lon: p.lon, hora, fuente };
    guardar('carta-mob', JSON.stringify(mob));
    alAvisar('MOB', mob);
    dibujar();
    map.setView([mob.lat, mob.lon], Math.max(map.getZoom(), 15));
    actualizar();
  }

  // Se confirma tocando dos veces (sin ventanas del navegador, que algunos equipos bloquean)
  let confirmando = null;
  function terminar() {
    const boton = $('#mob-fin');
    if (!confirmando) {
      boton.textContent = '¿Recuperada? Tocá de nuevo';
      confirmando = setTimeout(() => { confirmando = null; boton.textContent = '✓ Recuperada'; }, 4000);
      return;
    }
    clearTimeout(confirmando);
    confirmando = null;
    boton.textContent = '✓ Recuperada';
    mob = null;
    guardar('carta-mob', '');
    alAvisar('FIN');
    dibujar();
    actualizar();
  }

  function actualizar() {
    const ficha = $('#mob');
    if (!mob) { ficha.hidden = true; return; }
    const s = Math.round((Date.now() - mob.hora) / 1000);
    const reloj = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const propio = obtenerPropio();
    let vuelta = '<b>Activá 📍 Mi posición</b> para ver el rumbo y la distancia de vuelta.';
    if (propio) {
      const d = distNM(propio, mob);
      vuelta = `Volver: <b>${grados(rumbo(propio, mob))}</b> · <b>${num(d, 2)} MN</b> (${Math.round(d * 1852)} m)`;
      linea.setLatLngs([[propio.lat, propio.lon], [mob.lat, mob.lon]]);
    } else {
      linea.setLatLngs([]);
    }
    ficha.hidden = false;
    ficha.querySelector('.mob-datos').innerHTML = `
      <div class="mob-reloj">⏱ ${reloj}</div>
      <div>${vuelta}</div>
      <div class="detalle">Caída: ${fmtPos(mob)} (${esc(mob.fuente)})</div>`;
  }

  dibujar();
  return { marcar, terminar, actualizar, actual: () => mob };
}

// ---------- Mensajes de socorro (formato OMI / SMCP) ----------
const NATURALEZAS = {
  incendio: ['TENGO UN INCENDIO A BORDO', 'I AM ON FIRE'],
  inundacion: ['TENGO UNA VÍA DE AGUA, ME ESTOY INUNDANDO', 'I AM FLOODING'],
  abordaje: ['HE TENIDO UN ABORDAJE', 'I HAVE COLLIDED'],
  varada: ['ESTOY VARADO', 'I AM AGROUND'],
  escora: ['TENGO ESCORA, PELIGRO DE ZOZOBRAR', 'I AM LISTING, DANGER OF CAPSIZING'],
  hundimiento: ['ME ESTOY HUNDIENDO', 'I AM SINKING'],
  mob: ['HOMBRE AL AGUA', 'PERSON OVERBOARD'],
  abandono: ['ESTOY ABANDONANDO EL BUQUE', 'I AM ABANDONING VESSEL'],
  sinGobierno: ['ESTOY SIN GOBIERNO, A LA DERIVA', 'I AM NOT UNDER COMMAND, DRIFTING'],
  medica: ['TENGO UNA EMERGENCIA MÉDICA A BORDO', 'I REQUIRE MEDICAL ASSISTANCE'],
};
const AYUDAS = {
  inmediata: ['NECESITO ASISTENCIA INMEDIATA', 'I REQUIRE IMMEDIATE ASSISTANCE'],
  remolque: ['NECESITO REMOLQUE', 'I REQUIRE A TOW'],
  medica: ['NECESITO EVACUACIÓN MÉDICA', 'I REQUIRE MEDICAL EVACUATION'],
  ninguna: null,
};
const CAMPOS = ['nombre', 'indicativo', 'mmsi', 'personas'];

export function crearGeneradorSocorro({ obtenerPropio, obtenerMOB, referencia }) {
  for (const c of CAMPOS) {
    const el = $(`#sos-${c}`);
    el.value = leer(`carta-sos-${c}`) || '';
    el.addEventListener('input', () => { guardar(`carta-sos-${c}`, el.value); generar(); });
  }
  document.querySelectorAll('#vista-sos input, #vista-sos select, #vista-sos textarea').forEach((el) => el.addEventListener('change', generar));
  $('#sos-extra').addEventListener('input', generar);
  $('#sos-copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#sos-mensaje').textContent);
      $('#sos-copiar').textContent = '✓ Copiado';
    } catch {
      $('#sos-copiar').textContent = 'No se pudo copiar';
    }
    setTimeout(() => { $('#sos-copiar').textContent = '📋 Copiar'; }, 2000);
  });

  function generar() {
    const tipo = document.querySelector('input[name="sos-tipo"]:checked').value;
    const v = (c) => $(`#sos-${c}`).value.trim().toUpperCase();
    const nombre = v('nombre') || '[NOMBRE DEL BUQUE]';
    const ident = [v('indicativo') && `INDICATIVO ${v('indicativo')}`, v('mmsi') && `MMSI ${v('mmsi')}`].filter(Boolean).join(', ');
    const naturaleza = NATURALEZAS[$('#sos-naturaleza').value];
    const ayuda = AYUDAS[$('#sos-ayuda').value];
    const personas = v('personas');
    const extra = v('extra');
    const bilingue = ([es, en]) => `${es} (${en})`;

    const propio = obtenerPropio();
    const mob = obtenerMOB();
    const lugar = $('#sos-naturaleza').value === 'mob' && mob ? mob : propio;
    let posicion = 'POSICIÓN: ⚠ [activá 📍 Mi posición para completarla con el GPS]';
    if (lugar) {
      const d = distNM(referencia.punto, lugar);
      posicion = `POSICIÓN ${fmtPos(lugar).replace(/\s+/g, ' ')}\n${num(d)} MILLAS AL ${grados(rumbo(referencia.punto, lugar))} DE ${referencia.nombre}`;
    }
    const x3 = (t) => `${t}, ${t}, ${t}`;
    const lineas = [];
    if (tipo === 'mayday') {
      lineas.push(x3('MAYDAY'), `AQUÍ ${x3(nombre)}`);
      if (ident) lineas.push(ident);
      lineas.push(`MAYDAY ${nombre}${ident ? `, ${ident}` : ''}`, posicion, bilingue(naturaleza));
      if (ayuda) lineas.push(bilingue(ayuda));
      if (personas) lineas.push(`${personas} PERSONAS A BORDO`);
      if (extra) lineas.push(extra);
      lineas.push('CAMBIO (OVER)');
    } else if (tipo === 'panpan') {
      lineas.push(x3('PAN-PAN'), x3('A TODAS LAS ESTACIONES'), `AQUÍ ${x3(nombre)}`);
      if (ident) lineas.push(ident);
      lineas.push(posicion, bilingue(naturaleza));
      if (ayuda) lineas.push(bilingue(ayuda));
      if (personas) lineas.push(`${personas} PERSONAS A BORDO`);
      if (extra) lineas.push(extra);
      lineas.push('CAMBIO (OVER)');
    } else {
      lineas.push(x3('SÉCURITÉ'), x3('A TODAS LAS ESTACIONES'), `AQUÍ ${x3(nombre)}`);
      if (ident) lineas.push(ident);
      lineas.push(posicion, extra || '[AVISO: por ejemplo, OBJETO A LA DERIVA, BOYA APAGADA, MAL TIEMPO]', 'CORTO (OUT)');
    }
    $('#sos-mensaje').textContent = lineas.join('\n');
  }

  generar();
  return { generar };
}
