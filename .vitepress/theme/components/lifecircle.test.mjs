import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deg2rad, arcPath, labelXY, fillRadius } from './lifecircle.js'

test('deg2rad: 0° (top) maps to -π/2 radians', () => {
  assert.ok(Math.abs(deg2rad(0) - (-Math.PI / 2)) < 1e-9)
})

test('deg2rad: 90° maps to 0 radians (pointing right)', () => {
  assert.ok(Math.abs(deg2rad(90) - 0) < 1e-9)
})

test('labelXY: at 0° (top) y decreases below center, x ≈ center', () => {
  const { x, y } = labelXY(200, 200, 100, 0)
  assert.ok(Math.abs(x - 200) < 1e-9)
  assert.ok(Math.abs(y - 100) < 1e-9)
})

test('labelXY: at 90° points to the right of center', () => {
  const { x, y } = labelXY(200, 200, 100, 90)
  assert.ok(Math.abs(x - 300) < 1e-9)
  assert.ok(Math.abs(y - 200) < 1e-9)
})

test('fillRadius: readiness 10 → maxOuterR', () => {
  assert.equal(fillRadius(10, 55, 150), 150)
})

test('fillRadius: readiness 0 → innerR only', () => {
  assert.equal(fillRadius(0, 55, 150), 55)
})

test('fillRadius: readiness 5 → halfway', () => {
  assert.equal(fillRadius(5, 55, 150), 102.5)
})

test('fillRadius: clamps readiness above 10 and below 0', () => {
  assert.equal(fillRadius(99, 55, 150), 150)
  assert.equal(fillRadius(-5, 55, 150), 55)
})

test('arcPath: returns a string starting with M and ending with Z', () => {
  const p = arcPath(200, 200, 55, 155, 2, 58)
  assert.equal(typeof p, 'string')
  assert.ok(p.startsWith('M'))
  assert.ok(p.endsWith('Z'))
})

test('arcPath: sets large-arc flag for sweeps over 180°', () => {
  const big = arcPath(200, 200, 55, 155, 0, 200)
  // outer arc command uses the large-arc flag = 1 for >180°
  assert.ok(big.includes(`A155,155,0,1,1,`))
  const small = arcPath(200, 200, 55, 155, 0, 56)
  assert.ok(small.includes(`A155,155,0,0,1,`))
})
