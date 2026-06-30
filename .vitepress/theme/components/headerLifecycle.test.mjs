import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldStartInit, headerAction, shouldResetForNewCanvas } from './headerLifecycle.js'

test('shouldStartInit: no existing promise starts a new init', () => {
  assert.equal(shouldStartInit(null), true)
  assert.equal(shouldStartInit(undefined), true)
})

test('shouldStartInit: in-flight or resolved promise blocks a second init (single-flight)', () => {
  const inFlight = new Promise(() => {})
  assert.equal(shouldStartInit(inFlight), false)
  const resolved = Promise.resolve(true)
  assert.equal(shouldStartInit(resolved), false)
})

test('headerAction: no WebGPU yet, capable device -> init', () => {
  assert.equal(headerAction({ useWebGPU: false, gpuAvailable: true, hasParticles: false }), 'init')
})

test('headerAction: no WebGPU, no device -> field-2d', () => {
  assert.equal(headerAction({ useWebGPU: false, gpuAvailable: false, hasParticles: false }), 'field-2d')
})

test('headerAction: WebGPU active with a live instance -> reseed-render (SPA navigation)', () => {
  assert.equal(headerAction({ useWebGPU: true, gpuAvailable: true, hasParticles: true }), 'reseed-render')
})

test('headerAction: WebGPU flagged active but instance not constructed yet -> noop', () => {
  assert.equal(headerAction({ useWebGPU: true, gpuAvailable: true, hasParticles: false }), 'noop')
})

test('shouldResetForNewCanvas: first mount (no prior bound element) does not reset', () => {
  assert.equal(shouldResetForNewCanvas(null, {}), false)
})

test('shouldResetForNewCanvas: same element re-supplied does not reset', () => {
  const el = {}
  assert.equal(shouldResetForNewCanvas(el, el), false)
})

test('shouldResetForNewCanvas: a genuinely new element after a prior bind resets', () => {
  const prev = {}
  const next = {}
  assert.equal(shouldResetForNewCanvas(prev, next), true)
})
