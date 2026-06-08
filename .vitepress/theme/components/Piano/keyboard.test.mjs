import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  isBlackKey,
  buildKeyLayout,
  keyColor,
  generateKeyRects,
  FIRST_KEY,
  LAST_KEY,
  TOTAL_WHITE_KEYS,
  KEYBOARD_SVG_HEIGHT,
} from './keyboard.js'

test('FIRST_KEY is A0 (MIDI 21), LAST_KEY is C8 (MIDI 108)', () => {
  assert.equal(FIRST_KEY, 21)
  assert.equal(LAST_KEY, 108)
})

test('TOTAL_WHITE_KEYS is 52 for 88-key piano', () => {
  assert.equal(TOTAL_WHITE_KEYS, 52)
})

test('isBlackKey correctly identifies black keys', () => {
  assert.equal(isBlackKey(60), false)  // C4
  assert.equal(isBlackKey(61), true)   // C#4
  assert.equal(isBlackKey(62), false)  // D4
  assert.equal(isBlackKey(63), true)   // D#4
  assert.equal(isBlackKey(64), false)  // E4
  assert.equal(isBlackKey(65), false)  // F4
  assert.equal(isBlackKey(66), true)   // F#4
  assert.equal(isBlackKey(21), false)  // A0 (first key, white)
  assert.equal(isBlackKey(108), false) // C8 (last key, white)
})

test('buildKeyLayout returns 88 keys total', () => {
  const keys = buildKeyLayout(520)
  assert.equal(keys.length, 88)
})

test('buildKeyLayout: white keys come before black keys in output', () => {
  const keys = buildKeyLayout(520)
  let seenBlack = false
  for (const k of keys) {
    if (k.isBlack) seenBlack = true
    if (!k.isBlack && seenBlack) {
      assert.fail('White key found after black key — white keys must precede black keys')
    }
  }
})

test('buildKeyLayout: all 52 white keys have x positions that are multiples of white key width', () => {
  const totalWidth = 520
  const ww = totalWidth / TOTAL_WHITE_KEYS
  const keys = buildKeyLayout(totalWidth)
  const whites = keys.filter(k => !k.isBlack)
  assert.equal(whites.length, 52)
  for (const k of whites) {
    assert.ok(k.x >= 0)
    assert.ok(k.x < totalWidth)
    assert.equal(Math.round(k.x % ww), 0, `white key x=${k.x} is not a multiple of ww=${ww}`)
  }
})

test('buildKeyLayout: black keys are narrower and shorter than white keys', () => {
  const keys = buildKeyLayout(520)
  const white = keys.find(k => !k.isBlack)
  const black = keys.find(k => k.isBlack)
  assert.ok(black.width < white.width)
  assert.ok(black.height < white.height)
})

test('keyColor: pressed note returns blue fill', () => {
  const color = keyColor(60, { pressedNotes: new Set([60]) })
  assert.ok(color.fill.includes('4a9eff') || color.fill === '#4a9eff')
})

test('keyColor: expected note returns green stroke', () => {
  const color = keyColor(62, { expectedNote: 62 })
  assert.ok(color.stroke.includes('22cc22') || color.stroke === '#22cc22')
})

test('keyColor: out-of-scale white key returns grey fill', () => {
  // C major scale: 0,2,4,5,7,9,11 (C D E F G A B)
  // F# (pitch class 6) is NOT in C major
  const scaleKeys = new Set([0, 2, 4, 5, 7, 9, 11])
  const color = keyColor(66, { scaleKeys })  // F#4
  assert.ok(color.fill !== '#fff', 'out-of-scale key should not be white')
})

test('keyColor: in-scale white key returns white fill (default)', () => {
  const scaleKeys = new Set([0, 2, 4, 5, 7, 9, 11])
  const color = keyColor(60, { scaleKeys })  // C4, in scale
  assert.equal(color.fill, '#fff')
})

test('keyColor: pressed takes priority over expected', () => {
  const color = keyColor(60, { pressedNotes: new Set([60]), expectedNote: 60 })
  assert.ok(color.fill.includes('4a9eff') || color.fill === '#4a9eff')
})

test('generateKeyRects returns 88 objects with required properties', () => {
  const rects = generateKeyRects(520)
  assert.equal(rects.length, 88)
  for (const r of rects) {
    assert.ok('midi' in r)
    assert.ok('x' in r)
    assert.ok('y' in r)
    assert.ok('width' in r)
    assert.ok('height' in r)
    assert.ok('isBlack' in r)
    assert.ok('fill' in r)
    assert.ok('stroke' in r)
  }
})

test('generateKeyRects: midi range covers FIRST_KEY to LAST_KEY', () => {
  const rects = generateKeyRects(520)
  const midis = new Set(rects.map(r => r.midi))
  for (let n = FIRST_KEY; n <= LAST_KEY; n++) {
    assert.ok(midis.has(n), `MIDI ${n} missing from key layout`)
  }
})

test('KEYBOARD_SVG_HEIGHT is greater than white key height', () => {
  assert.ok(KEYBOARD_SVG_HEIGHT > 120)
})
