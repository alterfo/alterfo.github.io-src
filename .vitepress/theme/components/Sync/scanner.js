// QR scanner using the native BarcodeDetector API (Chrome 83+, Safari 17.4+).
// Falls back to a "not supported" state — the paste-text fallback in the UI
// handles browsers where camera scanning is unavailable.

export function isScannerSupported() {
  return typeof BarcodeDetector !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

// Start a camera-based QR scan on the given <video> element.
// Calls onResult(string) once when a QR code is found, then stops.
// Returns a stop() function to cancel early (e.g. on modal close).
export async function startScan(videoEl, onResult) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  videoEl.srcObject = stream
  await videoEl.play()

  const detector = new BarcodeDetector({ formats: ['qr_code'] })
  let stopped = false

  const interval = setInterval(async () => {
    if (stopped) return
    try {
      const barcodes = await detector.detect(videoEl)
      if (barcodes.length > 0) {
        stop()
        onResult(barcodes[0].rawValue)
      }
    } catch { /* frame not ready or detect failed — next tick */ }
  }, 250)

  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(interval)
    stream.getTracks().forEach(t => t.stop())
    if (videoEl) videoEl.srcObject = null
  }

  return stop
}
