import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] || '.vitepress/dist-pro'
const creativeOnly = ['ar', 'music', 'mediapipe', 'audio']

for (const name of creativeOnly) {
  const target = join(out, name)
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
}
