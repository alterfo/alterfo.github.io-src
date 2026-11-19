import test from 'node:test'
import assert from 'node:assert/strict'
import {
  channels,
  channelsPerPerson,
  groupModel,
  groupModelExact,
  groupSizes,
} from './topology.js'

test('channel count is the handshake number', () => {
  assert.equal(channels(2), 1)
  assert.equal(channels(8), 28)
  assert.equal(channels(24), 276)
  assert.equal(channels(1), 0)
  assert.equal(channels(0), 0)
})

test('per-person channels grow linearly', () => {
  assert.equal(channelsPerPerson(24), 11.5)
})

test('three groups of eight cut the graph', () => {
  const one = channels(24)
  const split = groupModelExact(24, 8)
  assert.deepEqual(split.sizes, [8, 8, 8])
  assert.equal(split.cross, 3)
  assert.equal(split.total, 87)
  assert.ok(split.total < one / 3)
})

test('uneven split keeps the total close to the balanced one', () => {
  const sizes = groupSizes(22, 8)
  assert.deepEqual(sizes, [8, 7, 7])
  const model = groupModelExact(22, 8)
  assert.equal(model.total, 28 + 21 + 21 + 3)
})

test('group model never reports fewer channels than a single group', () => {
  for (let n = 2; n <= 30; n++) {
    const model = groupModel(n, 8)
    assert.ok(model.total <= channels(n), `n=${n}`)
    assert.ok(model.perPerson > 0)
  }
})
