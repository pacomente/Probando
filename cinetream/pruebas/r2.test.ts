// La firma de los pedidos a Cloudflare R2 tiene que coincidir exacto con la de AWS (ejemplos oficiales de la documentación de S3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarPedido, urlFirmada } from '../r2.ts';

const base = { host: 'examplebucket.s3.amazonaws.com', id: 'AKIAIOSFODNN7EXAMPLE', secreta: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', ahora: new Date('2013-05-24T00:00:00Z') };

test('firma con cabecera (GET Object con Range)', () => {
  const h = firmarPedido({ ...base, metodo: 'GET', ruta: '/test.txt', cabeceras: { Range: 'bytes=0-9' }, hashCuerpo: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
  assert.equal(h.authorization.split('Signature=')[1], 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('URL prefirmada', () => {
  const u = urlFirmada({ ...base, metodo: 'GET', ruta: '/test.txt', segundos: 86400 });
  assert.equal(new URL(u).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});
