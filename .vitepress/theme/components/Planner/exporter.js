// File export/import for the encrypted planner vault.
// exportEnvelope and readEnvelopeFile are browser-only (Blob/File). The crypto + merge logic
// lives in crypto.js and store.js — this module only handles the download / file-read plumbing.
// Mirrors Journal/exporter.js; the only difference is the `.planner` extension.

export function exportEnvelope(envelopeStr, name = 'planner') {
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${name}-${date}.planner`
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
