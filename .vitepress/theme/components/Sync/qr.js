// QR code generation using the 'qrcode' npm package (bundled, no CDN).
// Generates QR from a sync blob string encoded as a sync URL fragment.
import QRCode from 'qrcode'

const QR_OPTS = {
  width: 260,
  margin: 1,
  color: { dark: '#e2e8f0', light: '#1e293b' }, // Spiral dark palette
  errorCorrectionLevel: 'M',
}

export async function drawQR(canvas, text) {
  return QRCode.toCanvas(canvas, text, QR_OPTS)
}

// Encode a sync blob as a URL fragment so it can be shared as a clickable link
// or scanned as a QR that opens the journal/planner/decisions page directly.
// role: 'offer' | 'answer'
export function blobToSyncUrl(blobStr, role, baseUrl = window.location.href.split('#')[0]) {
  const encoded = btoa(blobStr)
  return `${baseUrl}#sync-${role}=${encoded}`
}

// Decode a sync URL fragment back to the blob string and role.
// Returns null if the hash doesn't contain a sync parameter.
export function parseSyncUrl(url) {
  const hash = url.includes('#') ? url.split('#')[1] : ''
  const offerMatch = hash.match(/^sync-offer=(.+)$/)
  if (offerMatch) return { role: 'offer', blobStr: atob(offerMatch[1]) }
  const answerMatch = hash.match(/^sync-answer=(.+)$/)
  if (answerMatch) return { role: 'answer', blobStr: atob(answerMatch[1]) }
  return null
}
