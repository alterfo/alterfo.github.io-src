import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] || '.vitepress/dist'
const target = join(out, 'audit')

if (existsSync(target)) rmSync(target, { recursive: true, force: true })
