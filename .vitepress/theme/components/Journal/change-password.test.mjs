// Re-keying (change-password) data-layer tests.
// Mirrors the crypto path of Journal.vue's doChangePassword() WITHOUT any DOM/Vue:
//   verify current password → fresh salt → derive new key → encrypt vault →
//   pack new envelope → unpack → derive from new salt → decrypt = same vault.
// The Vue template/handler itself is verified manually (no DOM harness).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from '../crypto.js'
import { emptyVault, upsertEntry } from './vault.js'

// Build the at-rest envelope exactly like the journal does on save/create.
// iterations must be >= MIN_ITERATIONS (100000) or unpackEnvelope rejects it.
async function makeEnvelope(passphrase, vault, iterations = 100000) {
  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt, iterations)
  const { iv, ciphertext } = await encryptJSON(key, vault)
  return packEnvelope({ salt, iterations, iv, ciphertext })
}

// The pure re-keying core of doChangePassword(): verify old password, re-encrypt
// the in-memory vault under a freshly derived key. Returns the new envelope string.
async function rekey(oldEnvelopeStr, currentPass, newPass, vault, newIterations = 100000) {
  // 1. Verify current password against the stored envelope's own salt/iterations.
  const { salt: oldSalt, iterations: oldIterations, iv: oldIv, ciphertext: oldCt } = unpackEnvelope(oldEnvelopeStr)
  const testKey = await deriveKey(currentPass, oldSalt, oldIterations)
  await decryptJSON(testKey, { iv: oldIv, ciphertext: oldCt }) // throws on wrong password

  // 2. Fresh salt + new key — full re-keying.
  const newSalt = randomBytes(16)
  const newKey = await deriveKey(newPass, newSalt, newIterations)

  // 3. Re-encrypt and pack with the new salt.
  const { iv, ciphertext } = await encryptJSON(newKey, vault)
  return packEnvelope({ salt: newSalt, iterations: newIterations, iv, ciphertext })
}

test('crypto.js API shape: encryptJSON returns raw {iv, ciphertext}, not a packed string', async () => {
  const key = await deriveKey('pw', randomBytes(16), 1000)
  const out = await encryptJSON(key, { a: 1 })
  assert.ok(out.iv instanceof Uint8Array, 'iv is raw bytes')
  assert.ok(out.ciphertext instanceof Uint8Array, 'ciphertext is raw bytes')
  // So packEnvelope can be called with a NEW salt directly — no crypto.js helper needed.
  const packed = packEnvelope({ salt: randomBytes(16), iterations: 1000, iv: out.iv, ciphertext: out.ciphertext })
  assert.equal(typeof packed, 'string')
})

test('re-keyed envelope decrypts to the same vault under the new password', async () => {
  const vault = emptyVault()
  upsertEntry(vault, '2026-01-01', 'Some private words for the day', '2026-01-01T10:00:00.000Z')

  const oldEnvelope = await makeEnvelope('old-pass', vault)
  const newEnvelope = await rekey(oldEnvelope, 'old-pass', 'new-pass-123', vault)

  const { salt, iterations, iv, ciphertext } = unpackEnvelope(newEnvelope)
  const newKey = await deriveKey('new-pass-123', salt, iterations)
  const restored = await decryptJSON(newKey, { iv, ciphertext })

  assert.deepEqual(restored, vault, 'journal data is unchanged after re-keying')
  assert.equal(restored.entries['2026-01-01'].text, 'Some private words for the day')
})

test('re-keying generates a fresh salt (not reuse of the old one)', async () => {
  const vault = emptyVault()
  const oldEnvelope = await makeEnvelope('old-pass', vault)
  const { salt: oldSalt } = unpackEnvelope(oldEnvelope)

  const newEnvelope = await rekey(oldEnvelope, 'old-pass', 'new-pass-123', vault)
  const { salt: newSalt } = unpackEnvelope(newEnvelope)

  assert.notDeepEqual(Array.from(newSalt), Array.from(oldSalt), 'salt is regenerated, full re-keying')
})

test('after re-keying the OLD password no longer decrypts the new envelope', async () => {
  const vault = emptyVault()
  upsertEntry(vault, '2026-02-02', 'data', '2026-02-02T08:00:00.000Z')

  const oldEnvelope = await makeEnvelope('old-pass', vault)
  const newEnvelope = await rekey(oldEnvelope, 'old-pass', 'brand-new-pass', vault)

  const { salt, iterations, iv, ciphertext } = unpackEnvelope(newEnvelope)
  const oldKeyAgainstNewSalt = await deriveKey('old-pass', salt, iterations)
  await assert.rejects(
    () => decryptJSON(oldKeyAgainstNewSalt, { iv, ciphertext }),
    err => err instanceof DOMException && err.name === 'OperationError',
    'old password is rejected after change'
  )
})

test('wrong current password aborts re-keying (decrypt rejects, envelope untouched)', async () => {
  const vault = emptyVault()
  const oldEnvelope = await makeEnvelope('correct-pass', vault)

  // The handler branches on err.name === 'OperationError' to show "Неверный
  // текущий пароль"; pin that exact name, not just the DOMException base type.
  await assert.rejects(
    () => rekey(oldEnvelope, 'WRONG-pass', 'new-pass-123', vault),
    err => err instanceof DOMException && err.name === 'OperationError',
    'verification step throws OperationError before any new envelope is produced'
  )
})
