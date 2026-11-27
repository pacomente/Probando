// Cuentas, contraseñas, sesiones, planes y límite de pantallas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carpetaTemporal } from './preparar.ts';

carpetaTemporal();
const c = await import('../cuentas.ts');
const p = await import('../pantallas.ts');

test('crear cuenta, correo único y contraseña', () => {
  const cuenta = c.crearCuenta('Ana@Ejemplo.com ', 'claveana1', 'Ana');
  assert.equal(cuenta.email, 'ana@ejemplo.com');
  assert.notEqual(cuenta.hash, 'claveana1');
  assert.throws(() => c.crearCuenta('ana@ejemplo.com', 'otraclave1'), /Ya hay una cuenta/);
  assert.throws(() => c.crearCuenta('beto@ejemplo.com', 'corta'), /al menos 8/);
  assert.equal(c.verificarCuenta('ana@ejemplo.com', 'claveana1')?.id, cuenta.id);
  assert.equal(c.verificarCuenta('ana@ejemplo.com', 'incorrecta'), null);
});

test('la sesión firmada identifica a la cuenta y no se puede falsificar', () => {
  const cuenta = c.buscarPorCorreo('ana@ejemplo.com')!;
  const token = c.crearToken(cuenta);
  assert.equal(c.cuentaDeToken(token)?.id, cuenta.id);
  const [cuerpo, firma] = token.split('.');
  assert.equal(c.cuentaDeToken(`${cuerpo}.${firma.slice(0, -2)}xx`), null);
});

test('contraseña nueva: link de un solo uso que cierra las sesiones anteriores', () => {
  const cuenta = c.buscarPorCorreo('ana@ejemplo.com')!;
  const sesionVieja = c.crearToken(cuenta);
  const link = c.crearRestablecimiento(cuenta, 1);
  c.restablecerClave(link, 'nuevaclave9');
  assert.ok(c.verificarCuenta('ana@ejemplo.com', 'nuevaclave9'));
  assert.equal(c.cuentaDeToken(sesionVieja), null, 'la sesión vieja ya no vale');
  assert.throws(() => c.restablecerClave(link, 'otraclave99'), /venció o ya se usó/);
});

test('el plan pago vence y vuelve a Gratis', () => {
  const cuenta = c.crearCuenta('plus@ejemplo.com', 'claveplus1');
  c.activarPlan(cuenta, 'plus', { vence: Date.now() + 86400000 });
  assert.equal(c.planEfectivo(cuenta).id, 'plus');
  assert.ok(cuenta.contratado, 'queda la fecha para el botón de arrepentimiento');
  cuenta.vence = Date.now() - 1;
  assert.equal(c.planEfectivo(cuenta).id, 'gratis');
});

test('límite de pantallas: Gratis 1, cortar en otro equipo libera el lugar', () => {
  const cuenta = c.crearCuenta('tele@ejemplo.com', 'clavetele1');
  assert.equal(p.empezar(cuenta, { dispositivo: 'tele', equipo: 'Tele', titulo: 'Sintel' }).ok, true);
  const otro = p.empezar(cuenta, { dispositivo: 'celu', equipo: 'Celular', titulo: 'Nosferatu' });
  assert.equal(otro.ok, false);
  assert.equal(otro.otras?.[0].equipo, 'Tele');
  assert.equal(p.cortar(cuenta, 'tele'), true);
  assert.equal(p.empezar(cuenta, { dispositivo: 'celu', equipo: 'Celular', titulo: 'Nosferatu' }).ok, true);
  assert.deepEqual(p.latido(cuenta, 'tele'), { seguir: false, motivo: 'cortada' });
  c.activarPlan(cuenta, 'plus', { vence: Date.now() + 86400000 });
  assert.equal(p.empezar(cuenta, { dispositivo: 'tele', equipo: 'Tele', titulo: 'Sintel' }).ok, true, 'Plus permite 2');
});
