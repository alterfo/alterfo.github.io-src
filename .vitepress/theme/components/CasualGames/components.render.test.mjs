import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const queensBoardPath = path.join(dir, 'QueensBoard.vue')
const tangoBoardPath = path.join(dir, 'TangoBoard.vue')
const zipBoardPath = path.join(dir, 'ZipBoard.vue')
const shellPath = path.join(dir, '..', 'CasualGames.vue')

const runtimeStringTemplatePattern = /defineComponent\s*\(\s*\{[^}]*\btemplate\s*:/s

for (const [label, file] of [
  ['QueensBoard.vue', queensBoardPath],
  ['TangoBoard.vue', tangoBoardPath],
  ['ZipBoard.vue', zipBoardPath],
]) {
  test(`${label} does not define a runtime string-template component`, () => {
    const src = readFileSync(file, 'utf8')
    assert.doesNotMatch(src, runtimeStringTemplatePattern)
  })

  test(`${label} is a single-file component`, () => {
    const src = readFileSync(file, 'utf8')
    assert.match(src, /<script\s+setup>/)
    assert.match(src, /<template>/)
  })
}

test('CasualGames.vue imports QueensBoard as an SFC', () => {
  const src = readFileSync(shellPath, 'utf8')
  assert.match(src, /import\s+QueensBoard\s+from\s+['"]\.\/CasualGames\/QueensBoard\.vue['"]/)
})

test('CasualGames.vue imports TangoBoard as an SFC', () => {
  const src = readFileSync(shellPath, 'utf8')
  assert.match(src, /import\s+TangoBoard\s+from\s+['"]\.\/CasualGames\/TangoBoard\.vue['"]/)
})

test('CasualGames.vue imports ZipBoard as an SFC', () => {
  const src = readFileSync(shellPath, 'utf8')
  assert.match(src, /import\s+ZipBoard\s+from\s+['"]\.\/CasualGames\/ZipBoard\.vue['"]/)
})
