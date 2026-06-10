import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPECTRUM, CANVAS_PALETTE, PROJECT_COLORS } from './spectrum.js'

test('SPECTRUM has 7 hex colors', () => {
  assert.equal(SPECTRUM.length, 7)
  for (const c of SPECTRUM) {
    assert.match(c, /^#[0-9a-f]{6}$/i, `${c} is a 6-digit hex`)
  }
})

test('CANVAS_PALETTE entries are well-formed open rgba( prefixes', () => {
  assert.ok(CANVAS_PALETTE.length >= SPECTRUM.length)
  for (const c of CANVAS_PALETTE) {
    // trailing comma: alpha + ')' are appended at draw time → rgba(r,g,b,a)
    // strict triple-of-0..255 form so a typo'd channel (e.g. rgba(999,foo,)
    // that would render an invisible particle) is caught, not just rgba( prefix.
    assert.match(c, /^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),$/, `${c} is rgba(r,g,b,`)
    const [, r, g, b] = c.match(/^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),$/)
    for (const ch of [r, g, b]) assert.ok(Number(ch) <= 255, `${c} channel ${ch} <= 255`)
  }
})

test('CANVAS_PALETTE first 7 entries mirror SPECTRUM (dual-mirror sync contract)', () => {
  // The two palettes are hand-synced (CSS can't be imported as JS); this guards
  // the documented "change a color in BOTH" rule so a SPECTRUM edit that forgets
  // the matching CANVAS_PALETTE rgba is caught instead of silently mismatching.
  const hexToPrefix = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},`
  }
  SPECTRUM.forEach((hex, i) => {
    assert.equal(CANVAS_PALETTE[i], hexToPrefix(hex), `CANVAS_PALETTE[${i}] mirrors ${hex}`)
  })
})

test('PROJECT_COLORS has all 7 project keys, hex values', () => {
  const keys = ['ar', 'blog', 'idef0', 'journal', 'piano', 'github', 'decisions']
  for (const k of keys) {
    assert.ok(k in PROJECT_COLORS, `${k} present`)
    assert.match(PROJECT_COLORS[k], /^#[0-9a-f]{6}$/i, `${k} is a 6-digit hex`)
  }
  assert.equal(Object.keys(PROJECT_COLORS).length, keys.length)
})

test('PROJECT_COLORS values are drawn from SPECTRUM', () => {
  for (const v of Object.values(PROJECT_COLORS)) {
    assert.ok(SPECTRUM.includes(v), `${v} is in SPECTRUM`)
  }
})
