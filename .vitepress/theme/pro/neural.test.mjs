import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createNet,
  createAdam,
  makeDataset,
  trainEpoch,
  predict,
  evaluate,
} from './neural.js'

function train(net, ds, epochs, lr = 0.03) {
  const adam = createAdam(net)
  let last = Infinity
  for (let i = 0; i < epochs; i++) last = trainEpoch(net, ds, lr, adam)
  return last
}

test('circles separate above 95% within 400 epochs', () => {
  const ds = makeDataset('circles', 240, 3)
  const net = createNet([2, 12, 12, 2], 5)
  const before = evaluate(net, ds)
  train(net, ds, 400)
  const after = evaluate(net, ds)
  assert.ok(after.loss < before.loss * 0.5, `loss ${before.loss} -> ${after.loss}`)
  assert.ok(after.acc > 0.95, `acc ${after.acc}`)
})

test('moons separate above 92% within 900 epochs', () => {
  const ds = makeDataset('moons', 240, 9)
  const net = createNet([2, 16, 16, 2], 2)
  train(net, ds, 900, 0.02)
  const after = evaluate(net, ds)
  assert.ok(after.acc > 0.92, `acc ${after.acc}`)
})

test('prediction is a probability', () => {
  const net = createNet([2, 8, 8, 2], 1)
  const p = predict(net, 0.3, -0.2)
  assert.ok(p >= 0 && p <= 1)
})

test('dataset shapes stay inside the unit box', () => {
  for (const kind of ['spirals', 'moons', 'circles']) {
    const ds = makeDataset(kind, 200, 4)
    for (const v of ds.X) assert.ok(Number.isFinite(v) && Math.abs(v) < 1.7, `${kind}: ${v}`)
  }
})
