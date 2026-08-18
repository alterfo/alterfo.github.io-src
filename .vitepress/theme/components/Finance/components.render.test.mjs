import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const financeAppPath = path.join(dir, '..', 'FinanceApp.vue')
const categoryBarPath = path.join(dir, 'CategoryBar.vue')
const trendChartPath = path.join(dir, 'TrendChart.vue')

const runtimeStringTemplatePattern = /defineComponent\s*\(\s*\{[^}]*\btemplate\s*:/s

test('FinanceApp.vue does not define a runtime string-template component', () => {
  const src = readFileSync(financeAppPath, 'utf8')
  assert.doesNotMatch(src, runtimeStringTemplatePattern)
})

test('CategoryBar.vue does not define a runtime string-template component', () => {
  const src = readFileSync(categoryBarPath, 'utf8')
  assert.doesNotMatch(src, runtimeStringTemplatePattern)
})

test('TrendChart.vue does not define a runtime string-template component', () => {
  const src = readFileSync(trendChartPath, 'utf8')
  assert.doesNotMatch(src, runtimeStringTemplatePattern)
})

test('FinanceApp.vue imports CategoryBar and TrendChart as SFCs', () => {
  const src = readFileSync(financeAppPath, 'utf8')
  assert.match(src, /import\s+CategoryBar\s+from\s+['"]\.\/Finance\/CategoryBar\.vue['"]/)
  assert.match(src, /import\s+TrendChart\s+from\s+['"]\.\/Finance\/TrendChart\.vue['"]/)
})
