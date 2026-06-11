import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nbspBeforeDash } from './typography.js'

const NBSP = ' '

test('nbspBeforeDash: replaces a plain space before an em dash', () => {
  assert.equal(nbspBeforeDash('слово — слово'), `слово${NBSP}— слово`)
})

test('nbspBeforeDash: collapses multiple spaces before the dash into one nbsp', () => {
  assert.equal(nbspBeforeDash('слово   — слово'), `слово${NBSP}— слово`)
})

test('nbspBeforeDash: handles several dashes in one string', () => {
  assert.equal(
    nbspBeforeDash('раз — два — три'),
    `раз${NBSP}— два${NBSP}— три`,
  )
})

test('nbspBeforeDash: idempotent — existing nbsp is kept as is', () => {
  const already = `слово${NBSP}— слово`
  assert.equal(nbspBeforeDash(already), already)
})

test('nbspBeforeDash: dialogue dash at line start is untouched', () => {
  assert.equal(nbspBeforeDash('— Привет!'), '— Привет!')
})

test('nbspBeforeDash: hyphen and en dash are untouched', () => {
  assert.equal(nbspBeforeDash('кто-то 5 - 3 и 2 – 1'), 'кто-то 5 - 3 и 2 – 1')
})

test('nbspBeforeDash: non-string input is stringified, not thrown', () => {
  assert.equal(nbspBeforeDash(42), '42')
})

// ── applyNbspToInlineTokens ──────────────────────────────────────────────────
import { applyNbspToInlineTokens } from './typography.js'

test('applyNbspToInlineTokens: plain text token gets nbsp', () => {
  const kids = [{ type: 'text', content: 'слово — слово' }]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, `слово${NBSP}— слово`)
})

test('applyNbspToInlineTokens: &mdash; entity — trailing space of previous text token becomes nbsp', () => {
  const kids = [
    { type: 'text', content: 'parent ' },
    { type: 'text_special', content: '—' },
    { type: 'text', content: ' данные' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, `parent${NBSP}`)
})

test('applyNbspToInlineTokens: entity with no preceding space is untouched', () => {
  const kids = [
    { type: 'text', content: 'X' },
    { type: 'text_special', content: '—' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, 'X')
})

test('applyNbspToInlineTokens: recurses into image children (alt text)', () => {
  const kids = [{ type: 'image', children: [{ type: 'text', content: 'схема — обзор' }] }]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].children[0].content, `схема${NBSP}— обзор`)
})

test('applyNbspToInlineTokens: non-dash text_special (e.g. ©) leaves neighbours alone', () => {
  const kids = [
    { type: 'text', content: 'до ' },
    { type: 'text_special', content: '©' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, 'до ')
})

test('nbspBeforeDash: raw &mdash; entity form also gets nbsp (html:true keeps entities)', () => {
  assert.equal(nbspBeforeDash('parent &mdash; данные'), `parent${NBSP}&mdash; данные`)
})

test('applyNbspToInlineTokens: softbreak before dash collapses into nbsp', () => {
  const kids = [
    { type: 'text', content: 'direction' },
    { type: 'softbreak', content: '' },
    { type: 'text', content: '— далее' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[1].type, 'text')
  assert.equal(kids[1].content, NBSP)
})

test('applyNbspToInlineTokens: text_special at i=0 is a no-op (guard i>0 holds)', () => {
  const kids = [{ type: 'text_special', content: '—' }]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, '—')
})

test('applyNbspToInlineTokens: multiple trailing spaces before text_special collapse to single nbsp', () => {
  const kids = [
    { type: 'text', content: 'parent   ' },
    { type: 'text_special', content: '—' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[0].content, `parent${NBSP}`)
})

test('applyNbspToInlineTokens: softbreak NOT before dash stays a softbreak', () => {
  const kids = [
    { type: 'text', content: 'строка' },
    { type: 'softbreak', content: '' },
    { type: 'text', content: 'обычная' },
  ]
  applyNbspToInlineTokens(kids)
  assert.equal(kids[1].type, 'softbreak')
})
