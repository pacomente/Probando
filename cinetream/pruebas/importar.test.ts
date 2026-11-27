// Análisis de links: reproductores conocidos, StreamHG y plataformas bloqueadas (no necesita internet)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carpetaTemporal } from './preparar.ts';

carpetaTemporal();
delete process.env.STREAMHG_CLAVE;
const { analizar } = await import('../importar.ts');

test('YouTube se ve con su reproductor oficial (y respeta el minuto)', async () => {
  const r = await analizar('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90');
  assert.equal(r.tipo, 'embed');
  assert.match(r.embed!, /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?.*start=90/);
  assert.equal((await analizar('https://youtu.be/aqz-KE-bpKQ')).tipo, 'embed');
});

test('Vimeo, Dailymotion y Google Drive', async () => {
  assert.match((await analizar('https://vimeo.com/76979871')).embed!, /player\.vimeo\.com\/video\/76979871/);
  assert.match((await analizar('https://www.dailymotion.com/video/x8abcd1')).embed!, /dailymotion\.com\/embed\/video\/x8abcd1/);
  assert.match((await analizar('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')).embed!, /\/preview$/);
});

test('StreamHG usa el reproductor para insertar', async () => {
  const r = await analizar('https://streamhg.com/faro2026abcd');
  assert.equal(r.streamhg, 'faro2026abcd');
  assert.match(r.embed!, /\/e\/faro2026abcd$/);
});

test('las plataformas pagas y los links inválidos se rechazan', async () => {
  await assert.rejects(analizar('https://www.netflix.com/watch/123'), /no permite mostrar/);
  await assert.rejects(analizar('ftp://algo'), /http/);
  await assert.rejects(analizar('no es un link'), /no es válido/);
});
