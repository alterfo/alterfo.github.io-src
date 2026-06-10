import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowOnboarding } from './onboarding.js'

// Minimal Storage mock (Map-backed). getItem returns null for missing keys, like the DOM API.
function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    _map: map,
  }
}

test('first visit returns true and records the flag', () => {
  const s = mockStorage()
  assert.equal(shouldShowOnboarding('idef0:seen-help', s), true)
  assert.equal(s.getItem('idef0:seen-help'), '1')
})

test('return visit returns false (does not re-show)', () => {
  const s = mockStorage()
  assert.equal(shouldShowOnboarding('piano:seen-help', s), true)
  assert.equal(shouldShowOnboarding('piano:seen-help', s), false)
  assert.equal(shouldShowOnboarding('piano:seen-help', s), false)
})

test('respects a pre-existing flag (returning user, never shows)', () => {
  const s = mockStorage({ 'journal:seen-help': '1' })
  assert.equal(shouldShowOnboarding('journal:seen-help', s), false)
})

test('distinct keys are independent (one tool does not suppress another)', () => {
  const s = mockStorage()
  assert.equal(shouldShowOnboarding('idef0:seen-help', s), true)
  // A different tool's first visit is unaffected by the first key being set.
  assert.equal(shouldShowOnboarding('journal:seen-help', s), true)
  assert.equal(shouldShowOnboarding('piano:seen-help', s), true)
  // ...and each is now suppressed on its own next call.
  assert.equal(shouldShowOnboarding('idef0:seen-help', s), false)
  assert.equal(shouldShowOnboarding('journal:seen-help', s), false)
})

test('null storage (SSR / node) is a safe no-op returning false', () => {
  assert.equal(shouldShowOnboarding('idef0:seen-help', null), false)
})
