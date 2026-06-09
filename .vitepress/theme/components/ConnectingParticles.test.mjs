import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stepParticle, connectionAlpha, createParticles } from './ConnectingParticles.js'

test('stepParticle wraps left edge to right', () => {
  assert.equal(stepParticle({ x: -1, y: 5, vx: 0, vy: 0 }, 100, 100).x, 100)
})

test('stepParticle wraps right edge to left', () => {
  assert.equal(stepParticle({ x: 101, y: 5, vx: 0, vy: 0 }, 100, 100).x, 0)
})

test('stepParticle applies velocity then wraps vertically', () => {
  const p = stepParticle({ x: 50, y: -2, vx: 1, vy: 0 }, 100, 100)
  assert.equal(p.x, 51)
  assert.equal(p.y, 100)
})

test('connectionAlpha by distance', () => {
  assert.equal(connectionAlpha(0, 100), 0.4)
  assert.equal(connectionAlpha(100, 100), 0)
  assert.equal(connectionAlpha(50, 100), 0.2)
})

test('connectionAlpha beyond maxDist is 0', () => {
  assert.equal(connectionAlpha(150, 100), 0)
})

test('createParticles count and bounds', () => {
  const arr = createParticles(10, 200, 100)
  assert.equal(arr.length, 10)
  for (const p of arr) {
    assert.ok(p.x >= 0 && p.x <= 200, 'x in bounds')
    assert.ok(p.y >= 0 && p.y <= 100, 'y in bounds')
    assert.ok(typeof p.rgba === 'string' && p.rgba.startsWith('rgba('), 'rgba prefix')
    assert.ok(p.r >= 1 && p.r <= 3, 'radius in range')
  }
})
