import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  randomBytes,
  deriveKey,
  encryptJSON,
  decryptJSON,
  bytesToBase64,
  base64ToBytes,
  packEnvelope,
  unpackEnvelope,
} from './crypto.js';

describe('randomBytes', () => {
  it('returns Uint8Array of requested length', () => {
    const b = randomBytes(16);
    assert.ok(b instanceof Uint8Array);
    assert.equal(b.length, 16);
  });

  it('produces different values each call', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    assert.notDeepEqual(Array.from(a), Array.from(b));
  });
});

describe('deriveKey', () => {
  it('returns a CryptoKey', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('test-passphrase', salt, 1000);
    assert.equal(typeof key, 'object');
    assert.equal(key.type, 'secret');
  });
});

describe('encryptJSON / decryptJSON', () => {
  it('round-trip returns original object', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('passphrase', salt, 1000);
    const obj = { hello: 'world', num: 42, arr: [1, 2, 3] };
    const { iv, ciphertext } = await encryptJSON(key, obj);
    const result = await decryptJSON(key, { iv, ciphertext });
    assert.deepEqual(result, obj);
  });

  it('two encryptions produce different iv and ciphertext', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('passphrase', salt, 1000);
    const obj = { x: 1 };
    const a = await encryptJSON(key, obj);
    const b = await encryptJSON(key, obj);
    assert.notDeepEqual(Array.from(a.iv), Array.from(b.iv));
    assert.notDeepEqual(Array.from(a.ciphertext), Array.from(b.ciphertext));
  });

  it('wrong passphrase causes decrypt to reject', async () => {
    const salt = randomBytes(16);
    const goodKey = await deriveKey('correct-horse', salt, 1000);
    const badKey = await deriveKey('wrong-passphrase', salt, 1000);
    const { iv, ciphertext } = await encryptJSON(goodKey, { secret: true });
    await assert.rejects(() => decryptJSON(badKey, { iv, ciphertext }));
  });
});

describe('base64 helpers', () => {
  it('bytesToBase64 / base64ToBytes round-trip', () => {
    const original = randomBytes(64);
    const b64 = bytesToBase64(original);
    assert.equal(typeof b64, 'string');
    const roundtripped = base64ToBytes(b64);
    assert.deepEqual(Array.from(roundtripped), Array.from(original));
  });

  it('handles large buffer (>200 KB) without stack overflow', () => {
    const large = randomBytes(210 * 1024);
    const b64 = bytesToBase64(large);
    const back = base64ToBytes(b64);
    assert.equal(back.length, large.length);
    assert.equal(back[0], large[0]);
    assert.equal(back[large.length - 1], large[large.length - 1]);
  });
});

describe('packEnvelope / unpackEnvelope', () => {
  it('round-trip preserves all fields', () => {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const ciphertext = randomBytes(48);
    const iterations = 600000;
    const envelope = { salt, iterations, iv, ciphertext };
    const packed = packEnvelope(envelope);
    assert.equal(typeof packed, 'string');
    const unpacked = unpackEnvelope(packed);
    assert.deepEqual(Array.from(unpacked.salt), Array.from(salt));
    assert.equal(unpacked.iterations, iterations);
    assert.deepEqual(Array.from(unpacked.iv), Array.from(iv));
    assert.deepEqual(Array.from(unpacked.ciphertext), Array.from(ciphertext));
  });

  it('full crypto round-trip through envelope', async () => {
    const passphrase = 'my-secret-pass';
    const salt = randomBytes(16);
    const iterations = 100000;
    const key = await deriveKey(passphrase, salt, iterations);
    const obj = { journal: 'entry text here', words: 42 };
    const { iv, ciphertext } = await encryptJSON(key, obj);
    const packed = packEnvelope({ salt, iterations, iv, ciphertext });
    const unpacked = unpackEnvelope(packed);
    const key2 = await deriveKey(passphrase, unpacked.salt, unpacked.iterations);
    const result = await decryptJSON(key2, { iv: unpacked.iv, ciphertext: unpacked.ciphertext });
    assert.deepEqual(result, obj);
  });

  it('rejects iterations below minimum', () => {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const ciphertext = randomBytes(48);
    const packed = packEnvelope({ salt, iterations: 600000, iv, ciphertext });
    const tampered = packed.replace('"iterations":600000', '"iterations":1000');
    assert.throws(() => unpackEnvelope(tampered), /Invalid iterations/);
  });
});
