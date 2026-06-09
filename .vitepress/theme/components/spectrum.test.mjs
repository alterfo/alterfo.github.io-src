import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPECTRUM, CANVAS_PALETTE, PROJECT_COLORS } from './spectrum.js'

test('SPECTRUM has 6 hex colors', () => {
  assert.equal(SPECTRUM.length, 6)
  for (const c of SPECTRUM) {
    assert.match(c, /^#[0-9a-f]{6}$/i, `${c} is a 6-digit hex`)
  }
})

test('CANVAS_PALETTE entries are open rgba( prefixes', () => {
  assert.ok(CANVAS_PALETTE.length >= SPECTRUM.length)
  for (const c of CANVAS_PALETTE) {
    assert.ok(c.startsWith('rgba('), `${c} starts with rgba(`)
    // trailing comma: alpha + ')' are appended at draw time → rgba(r,g,b,a)
    assert.ok(c.endsWith(','), `${c} ends with , (alpha appended at draw time)`)
  }
})

test('PROJECT_COLORS has all 6 project keys, hex values', () => {
  const keys = ['ar', 'blog', 'idef0', 'journal', 'piano', 'github']
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
