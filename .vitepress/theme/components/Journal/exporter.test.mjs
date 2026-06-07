// Data-layer tests for file sync: crypto round-trip + mergeVaults.
// No DOM, no FileReader — tests the logic that import/export rely on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from '../crypto.js'
import { emptyVault, upsertEntry, mergeVaults } from './vault.js'

// Shared passphrase + vault helpers
async function makeEncryptedEnvelope(passphrase, vault) {
  const salt = randomBytes(16)
  const iterations = 100000
  const key = await deriveKey(passphrase, salt, iterations)
  const { iv, ciphertext } = await encryptJSON(key, vault)
  return { envelopeStr: packEnvelope({ salt, iterations, iv, ciphertext }), key, salt, iterations }
}

test('encrypt → pack → unpack → decrypt reproduces vault', async () => {
  const vault = emptyVault()
  upsertEntry(vault, '2026-01-01', 'Hello world today', '2026-01-01T10:00:00.000Z')
  const { envelopeStr } = await makeEncryptedEnvelope('secret', vault)
  const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
  const key2 = await deriveKey('secret', salt, iterations)
  const restored = await decryptJSON(key2, { iv, ciphertext })
  assert.deepEqual(restored.entries['2026-01-01'].text, 'Hello world today')
})

test('mergeVaults reproduces union after decrypt', async () => {
  const vaultA = emptyVault()
  upsertEntry(vaultA, '2026-01-01', 'Device A entry', '2026-01-01T09:00:00.000Z')

  const vaultB = emptyVault()
  upsertEntry(vaultB, '2026-01-02', 'Device B entry', '2026-01-02T09:00:00.000Z')

  // Simulate: device A exports, device B imports and merges
  const { envelopeStr } = await makeEncryptedEnvelope('pass', vaultA)
  const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
  const importKey = await deriveKey('pass', salt, iterations)
  const importedVault = await decryptJSON(importKey, { iv, ciphertext })
  const merged = mergeVaults(vaultB, importedVault)

  assert.ok(merged.entries['2026-01-01'], '2026-01-01 from imported vault present')
  assert.ok(merged.entries['2026-01-02'], '2026-01-02 from local vault present')
  assert.equal(merged.entries['2026-01-01'].text, 'Device A entry')
  assert.equal(merged.entries['2026-01-02'].text, 'Device B entry')
})

test('LWW: newer updatedAt wins during merge after import', async () => {
  const older = emptyVault()
  upsertEntry(older, '2026-01-01', 'old text', '2026-01-01T08:00:00.000Z')

  const newer = emptyVault()
  upsertEntry(newer, '2026-01-01', 'new text', '2026-01-01T12:00:00.000Z')

  const { envelopeStr } = await makeEncryptedEnvelope('pw', older)
  const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
  const k = await deriveKey('pw', salt, iterations)
  const imported = await decryptJSON(k, { iv, ciphertext })
  const merged = mergeVaults(newer, imported)

  assert.equal(merged.entries['2026-01-01'].text, 'new text', 'newer entry wins')
})

test('tampered ciphertext rejects on decrypt', async () => {
  const vault = emptyVault()
  const { envelopeStr } = await makeEncryptedEnvelope('pass', vault)
  const env = unpackEnvelope(envelopeStr)

  // Flip a byte in ciphertext
  const tampered = new Uint8Array(env.ciphertext)
  tampered[0] ^= 0xff
  env.ciphertext = tampered

  const key = await deriveKey('pass', env.salt, env.iterations)
  await assert.rejects(
    () => decryptJSON(key, env),
    err => err instanceof DOMException
  )
})

test('wrong passphrase rejects on import', async () => {
  const vault = emptyVault()
  const { envelopeStr } = await makeEncryptedEnvelope('correct-pass', vault)
  const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
  const wrongKey = await deriveKey('wrong-pass', salt, iterations)
  await assert.rejects(
    () => decryptJSON(wrongKey, { iv, ciphertext }),
    err => err instanceof DOMException
  )
})
