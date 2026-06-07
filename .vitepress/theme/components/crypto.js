// Shared crypto substrate: PBKDF2 key derivation + AES-GCM encrypt/decrypt + envelope serialization.
// Passphrase and derived key are NEVER persisted. Only { salt, iterations, iv, ciphertext } leave memory.

const ALGO = 'AES-GCM';
const KEY_LEN = 256;
const KDF = 'PBKDF2';
const HASH = 'SHA-256';

export function randomBytes(n) {
  // getRandomValues limit is 65536 bytes per call; chunk for larger sizes.
  const out = new Uint8Array(n);
  const CHUNK = 65536;
  for (let offset = 0; offset < n; offset += CHUNK) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + CHUNK, n)));
  }
  return out;
}

export async function deriveKey(passphrase, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: KDF },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: KDF, salt, hash: HASH, iterations },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGO, iv }, key, plaintext)
  );
  return { iv, ciphertext };
}

export async function decryptJSON(key, { iv, ciphertext }) {
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// Base64 helpers that avoid btoa(String.fromCharCode(...bytes)) stack overflow on large buffers.
export function bytesToBase64(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str);
}

export function base64ToBytes(b64) {
  const str = atob(b64);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i);
  }
  return out;
}

// Envelope: the at-rest / on-file format — contains only non-secret fields.
export function packEnvelope({ salt, iterations, iv, ciphertext }) {
  return JSON.stringify({
    salt: bytesToBase64(salt),
    iterations,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  });
}

const MAX_ITERATIONS = 2_000_000;

export function unpackEnvelope(str) {
  const parsed = JSON.parse(str);
  if (!Number.isInteger(parsed.iterations) || parsed.iterations < 1 || parsed.iterations > MAX_ITERATIONS) {
    throw new Error('Invalid iterations in envelope');
  }
  if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') {
    throw new Error('Malformed envelope');
  }
  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  if (salt.length !== 16) throw new Error('Invalid salt length');
  if (iv.length !== 12) throw new Error('Invalid IV length');
  const ciphertext = base64ToBytes(parsed.ciphertext);
  if (ciphertext.length < 16) throw new Error('Invalid ciphertext length');
  return {
    salt,
    iterations: parsed.iterations,
    iv,
    ciphertext,
  };
}
