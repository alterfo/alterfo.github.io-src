// SVG/PNG/JSON export and import

const SVG_STYLES = `
  .idef0-box rect { fill: white; stroke: black; stroke-width: 1; }
  text { font-family: sans-serif; }
`

/**
 * Export the current diagram SVG to a downloadable .svg file.
 * svgEl — the <svg> DOM element (passed from the component).
 * diagramId — used as the filename base.
 */
export function exportToSVG(svgEl, diagramId = 'diagram') {
  if (!svgEl) return
  const clone = svgEl.cloneNode(true)
  // Remove zoom/pan transform so exported SVG shows default view
  const transformG = clone.querySelector('g[transform]')
  if (transformG) transformG.removeAttribute('transform')
  // Inject a basic style block so the SVG is self-contained
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = SVG_STYLES
  clone.insertBefore(styleEl, clone.firstChild)
  // Ensure xmlns is set for standalone SVG
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const svgStr = new XMLSerializer().serializeToString(clone)
  _downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), `idef0-${diagramId}.svg`)
}

/**
 * Export the current diagram SVG to a 2x PNG.
 */
export function exportToPNG(svgEl, diagramId = 'diagram') {
  if (!svgEl) return
  const clone = svgEl.cloneNode(true)
  const transformG = clone.querySelector('g[transform]')
  if (transformG) transformG.removeAttribute('transform')
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = SVG_STYLES
  clone.insertBefore(styleEl, clone.firstChild)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const svgStr = new XMLSerializer().serializeToString(clone)
  const viewBox = svgEl.viewBox.baseVal
  const W = viewBox.width || 1200
  const H = viewBox.height || 800
  const SCALE = 2

  const img = new Image()
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = W * SCALE
    canvas.height = H * SCALE
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob(pngBlob => {
      if (pngBlob) _downloadBlob(pngBlob, `idef0-${diagramId}.png`)
    }, 'image/png')
  }
  img.src = url
}

/**
 * Export the whole project as a JSON file.
 */
export function exportToJSON(project) {
  const json = JSON.stringify(project, null, 2)
  _downloadBlob(new Blob([json], { type: 'application/json' }), 'idef0-project.json')
}

/**
 * Import a project from a JSON file chosen by the user.
 * Returns a Promise that resolves with the parsed project object,
 * or rejects with an error.
 */
export function importFromJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { reject(new Error('No file selected')); return }
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result)
          if (!data.diagrams) throw new Error('Invalid IDEF0 project file')
          resolve(data)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('File read error'))
      reader.readAsText(file)
    }
    input.click()
  })
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
