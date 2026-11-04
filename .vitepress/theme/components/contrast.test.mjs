import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SPECTRUM } from './spectrum.js'
import { THEME_COLOR } from '../../seo.js'

const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const read = (name) => readFileSync(here(name), 'utf8')

function parseColor(value) {
  const v = value.trim()
  const hex = v.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255), a: 1 }
  }
  const fn = v.match(/^rgba?\(([^)]+)\)$/)
  if (fn) {
    const parts = fn[1].split(',').map((p) => Number(p.trim()))
    assert.ok(parts.length >= 3 && parts.every(Number.isFinite), `unparseable color ${value}`)
    return { rgb: parts.slice(0, 3).map((c) => c / 255), a: parts.length === 4 ? parts[3] : 1 }
  }
  throw new Error(`unparseable color ${value}`)
}

const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])

function contrast(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function composite(color, backdrop) {
  if (color.a >= 1) return color.rgb
  return color.rgb.map((c, i) => color.a * c + (1 - color.a) * backdrop[i])
}

function tokens(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = {}
  for (const m of source.matchAll(/--ds-([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const root = tokens(read('../styles/vars.css'))
const surface = parseColor(root['surface-solid']).rgb

test('vars.css still defines the dark «Spiral» ground', () => {
  assert.equal(root.void.toLowerCase(), '#14161a')
  assert.equal(root['surface-solid'].toLowerCase(), '#1e2126')
  assert.equal(root['text-strong'].toLowerCase(), '#f7f6f3')
  assert.equal(THEME_COLOR, root.void)
})

test('neutral text tiers keep AA contrast on the dark ground', () => {
  const text = parseColor(root.text)
  const pairs = [
    ['text', root.text, 7],
    ['text-strong', root['text-strong'], 7],
    ['text-muted', root['text-muted'], 4.5],
    ['danger', root.danger, 4.5],
  ]
  for (const [name, value, min] of pairs) {
    const ratio = contrast(composite(parseColor(value), surface), surface)
    assert.ok(ratio >= min, `${name} ${value} is ${ratio.toFixed(2)}:1, expected ≥${min}:1`)
  }
  const dim = contrast(composite(parseColor(root['text-dim']), surface), surface)
  assert.ok(dim >= 3, `text-dim is ${dim.toFixed(2)}:1, expected ≥3:1`)
  assert.ok(text)
})

test('spectrum tokens mirror spectrum.js exactly', () => {
  const names = ['violet', 'cyan', 'green', 'pink', 'amber', 'orange', 'teal', 'yellow', 'indigo', 'turquoise']
  assert.deepEqual(names.map((n) => root[n].toLowerCase()), SPECTRUM.map((c) => c.toLowerCase()))
})

const APP_FILES = {
  journal: 'Journal.css',
  piano: 'Piano.css',
  idef0: 'IDEF0Editor.css',
  planner: 'PlannerEditor.css',
  decisions: 'DecisionJournal.css',
  finance: 'FinanceApp.css',
  games: 'CasualGames.css',
  openpose: 'OpenPoseEditor.vue',
}

for (const [name, file] of Object.entries(APP_FILES)) {
  test(`${name}: button label and accent text stay AA on their own accent`, () => {
    const t = tokens(read(file))
    const accent = parseColor(t.accent)
    const label = parseColor(t['on-accent'] ?? root['on-accent'])
    const ratio = contrast(label.rgb, accent.rgb)
    assert.ok(ratio >= 4.5, `${name} label ${t['on-accent'] ?? root['on-accent']} on ${t.accent} is ${ratio.toFixed(2)}:1`)

    const light = parseColor(t['accent-light'] ?? root.text)
    const wash = composite(parseColor(t['accent-bg'] ?? 'rgba(0,0,0,0)'), surface)
    const washRatio = contrast(light.rgb, wash)
    assert.ok(washRatio >= 4.5, `${name} accent-light ${t['accent-light']} on accent wash is ${washRatio.toFixed(2)}:1`)
  })
}

test('music page label uses dark ink on graphite accent', () => {
  const t = tokens(read('MusicAlbums.vue'))
  assert.equal(t['on-accent'], '#131210')
  assert.ok(contrast(parseColor(t['on-accent']).rgb, parseColor(root.yellow).rgb) >= 4.5)
})

test('2D particle field defaults to the dark ground and additive glow', () => {
  const src = read('ConnectingParticles.js')
  const bg = src.match(/bg = '([^']+)'/)
  const blend = src.match(/blend = '([^']+)'/)
  assert.ok(bg && blend, 'defaults present')
  assert.equal(bg[1], 'rgb(20,22,26)')
  assert.equal(blend[1], 'lighter')
  assert.deepEqual(parseColor(`rgb(${bg[1].slice(4, -1)})`).rgb, parseColor(root.void).rgb)
})

test('WebGPU particle palette + clear color mirror the dark ground', () => {
  const src = read('WebGPUParticles.js')
  const colors = [...src.matchAll(/\[(0\.\d+), (0\.\d+), (0\.\d+)\],\s+\/\/ /g)].map((m) => m.slice(1, 4).map(Number))
  assert.equal(colors.length, SPECTRUM.length, 'COLORS mirror has one entry per sphere')
  SPECTRUM.forEach((hex, i) => {
    const expected = parseColor(hex).rgb
    expected.forEach((c, ch) => {
      assert.ok(Math.abs(colors[i][ch] - c) < 0.002, `COLORS[${i}][${ch}] ${colors[i][ch]} mirrors ${hex}`)
    })
  })
  const clear = src.match(/clearValue: \{ r: ([\d.]+), g: ([\d.]+), b: ([\d.]+)/)
  assert.ok(clear, 'clearValue present')
  const voidRgb = parseColor(root.void).rgb
  clear.slice(1, 4).map(Number).forEach((c, ch) => {
    assert.ok(Math.abs(c - voidRgb[ch]) < 0.002, `clearValue channel ${ch} mirrors --ds-void`)
  })
})
