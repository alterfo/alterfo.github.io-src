// File export/import for the encrypted journal vault.
// exportEnvelope and readEnvelopeFile are browser-only (Blob/FileReader).
// The merge/crypto logic lives in vault.js and crypto.js.

export function exportEnvelope(envelopeStr, name = 'journal') {
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${name}-${date}.journal`
  const blob = new Blob([envelopeStr], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// Reads a File and resolves with the envelope string.
export function readEnvelopeFile(file) {
  return file.text()
}
