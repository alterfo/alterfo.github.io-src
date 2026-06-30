import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guards the four hand-maintained mirrors of the «колесо жизни» 8 spheres
// (order/id/color must agree — see .vitepress/CLAUDE.md "HomeMark.vue" and
// "Palette mirrors" sections). None of the three mirrors import SEGMENTS —
// LifeCircle.vue is the documented source of truth and the others are kept
// in sync by hand, so this test is the only thing that catches drift,
// especially in ar-engine/web/index.html which sits outside the build
// pipeline entirely.

const lifeCirclePath = fileURLToPath(new URL('./LifeCircle.vue', import.meta.url))
const homeMarkPath = fileURLToPath(new URL('./HomeMark.vue', import.meta.url))
const wheelSvgPath = fileURLToPath(new URL('../../../public/home-wheel.svg', import.meta.url))
const arIndexPath = fileURLToPath(new URL('../../../ar-engine/web/index.html', import.meta.url))

// Pulls { id: '...', ..., color: '#xxxxxx', ... } object literals out of a
// `const NAME = [ ... ]` block — used for both SEGMENTS (LifeCircle.vue) and
// SPHERES (HomeMark.vue), which share the same id/color shape.
function parseIdColorList(source, constName) {
  const blockMatch = source.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\n\\]`))
  assert.ok(blockMatch, `${constName} block found`)
  const body = blockMatch[1]
  const entries = [...body.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?color:\s*'(#[0-9a-fA-F]{6})'[^}]*\}/g)]
  assert.ok(entries.length > 0, `${constName} has entries`)
  return entries.map(([, id, color]) => ({ id, color: color.toLowerCase() }))
}

// Pulls ordered fill="#xxxxxx" colors out of a static SVG's <path> list —
// used for both public/home-wheel.svg and the inline copy in
// ar-engine/web/index.html, neither of which carries sphere ids.
function parseSvgFillColors(source) {
  const colors = [...source.matchAll(/<path\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase())
  assert.ok(colors.length > 0, 'svg has fill colors')
  return colors
}

const lifeCircleSource = readFileSync(lifeCirclePath, 'utf8')
const homeMarkSource = readFileSync(homeMarkPath, 'utf8')
const wheelSvgSource = readFileSync(wheelSvgPath, 'utf8')
const arIndexSource = readFileSync(arIndexPath, 'utf8')

const segments = parseIdColorList(lifeCircleSource, 'SEGMENTS')
const spheres = parseIdColorList(homeMarkSource, 'SPHERES')
const wheelSvgColors = parseSvgFillColors(wheelSvgSource)
const arIndexColors = parseSvgFillColors(arIndexSource)

test('LifeCircle.vue SEGMENTS has 8 spheres', () => {
  assert.equal(segments.length, 8)
})

test('HomeMark.vue SPHERES mirrors LifeCircle.vue SEGMENTS (id + color + order)', () => {
  assert.deepEqual(
    spheres,
    segments.map(({ id, color }) => ({ id, color })),
  )
})

test('public/home-wheel.svg mirrors LifeCircle.vue SEGMENTS (color + order)', () => {
  assert.deepEqual(
    wheelSvgColors,
    segments.map((s) => s.color),
  )
})

test('ar-engine/web/index.html home-link wheel mirrors LifeCircle.vue SEGMENTS (color + order)', () => {
  assert.deepEqual(
    arIndexColors,
    segments.map((s) => s.color),
  )
})
