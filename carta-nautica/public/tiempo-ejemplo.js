// Pronóstico de EJEMPLO para la demostración sin conexión: un frente con temporal del SO dentro de unas horas,
// para mostrar cómo avisa la carta. Nunca se usa fuera del modo práctica ni se guarda como pronóstico real.
export function pronosticoEjemplo() {
  const offset = -10800; // hora de Argentina
  const inicio = Math.floor((Date.now() - 24 * 3600000 + offset * 1000) / 3600000) * 3600000;
  const time = Array.from({ length: 120 }, (_, i) => new Date(inicio + i * 3600000).toISOString().slice(0, 16));
  const ahora = 24;
  const frente = (i) => Math.max(0, 1 - Math.abs(i - (ahora + 8)) / 5); // pico 8 h después de ahora
  const pron = { utc_offset_seconds: offset, hourly: {
    time,
    temperature_2m: time.map((_, i) => 15 - 6 * frente(i)),
    wind_speed_10m: time.map((_, i) => Math.round(12 + 26 * frente(i))),
    wind_gusts_10m: time.map((_, i) => Math.round(18 + 34 * frente(i))),
    wind_direction_10m: time.map((_, i) => (i < ahora + 5 ? 20 : 225)),
    pressure_msl: time.map((_, i) => Math.round((1014 - 9 * Math.max(0, Math.min(1, (i - ahora) / 7)) + 6 * Math.max(0, (i - ahora - 9) / 12)) * 10) / 10),
    weather_code: time.map((_, i) => (frente(i) > 0.8 ? 95 : frente(i) > 0.3 ? 63 : 2)),
    visibility: time.map((_, i) => (frente(i) > 0.6 ? 3000 : 20000)),
    precipitation_probability: time.map((_, i) => Math.round(80 * frente(i))),
  } };
  const mar = { utc_offset_seconds: offset, hourly: {
    time,
    wave_height: time.map((_, i) => Math.round((1 + 2.2 * frente(i)) * 10) / 10),
    wave_direction: time.map(() => 200),
    wave_period: time.map(() => 8),
    sea_level_height_msl: time.map((_, i) => Math.round(1.1 * Math.cos((2 * Math.PI * (i - 3)) / 12.42) * 100) / 100),
  } };
  const malla = [];
  for (let k = 0; k < 9; k++) malla.push({ current: { wind_speed_10m: 10 + (k % 3) * 2, wind_direction_10m: 15 + k * 4, wind_gusts_10m: 16 + (k % 3) * 3 } });
  return { pron, mar, malla };
}
