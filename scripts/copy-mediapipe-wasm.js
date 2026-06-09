// Copies MediaPipe Tasks Vision WASM runtime from node_modules into public/
// so it can be served locally (no CDN). Run via `npm run mediapipe:copy`;
// also hooked into `predev` and `prebuild`. Uses only Node.js fs (no deps).

const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const srcDir = path.join(repoRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const destDir = path.join(repoRoot, 'public', 'mediapipe', 'wasm')

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error(
      `[mediapipe:copy] source not found: ${srcDir}\n` +
      `Run \`npm install @mediapipe/tasks-vision\` first.`
    )
    process.exit(1)
  }

  fs.mkdirSync(destDir, { recursive: true })

  const files = fs.readdirSync(srcDir)
  let copied = 0
  for (const name of files) {
    const srcFile = path.join(srcDir, name)
    if (!fs.statSync(srcFile).isFile()) continue
    fs.copyFileSync(srcFile, path.join(destDir, name))
    copied++
  }

  console.log(`[mediapipe:copy] copied ${copied} file(s) → ${path.relative(repoRoot, destDir)}`)
}

main()
