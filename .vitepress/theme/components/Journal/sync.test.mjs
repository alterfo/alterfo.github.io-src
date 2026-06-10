import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { packBlob, unpackBlob, receiveAndMerge, diffVaultDates } from './sync.js'

describe('packBlob / unpackBlob', () => {
  it('round-trips a plain SDP string', () => {
    const sdp = 'v=0\r\no=- 1234 2 IN IP4 127.0.0.1\r\n'
    assert.equal(unpackBlob(packBlob(sdp)), sdp)
  })

  it('round-trips a long SDP with special chars', () => {
    const sdp = 'a=ice-ufrag:abc+def/ghi=\r\na=fingerprint:sha-256 AA:BB:CC\r\n'.repeat(10)
    assert.equal(unpackBlob(packBlob(sdp)), sdp)
  })

  it('unpackBlob throws on invalid JSON', () => {
    assert.throws(() => unpackBlob('not json'), SyntaxError)
  })

  it('unpackBlob returns undefined sdp for missing field', () => {
    const result = unpackBlob(JSON.stringify({ other: 'x' }))
    assert.equal(result, undefined)
  })
})

describe('receiveAndMerge', () => {
  const ts = (offset = 0) => new Date(Date.now() + offset).toISOString()

  function makeVault(entries = {}) {
    return { version: 1, entries, createdAt: '2026-01-01T00:00:00.000Z' }
  }

  it('returns union of two disjoint vaults', () => {
    const a = makeVault({ '2026-06-01': { text: 'A', words: 1, createdAt: ts(), updatedAt: ts() } })
    const b = makeVault({ '2026-06-02': { text: 'B', words: 1, createdAt: ts(), updatedAt: ts() } })
    const merged = receiveAndMerge(a, b)
    assert.ok(merged.entries['2026-06-01'])
    assert.ok(merged.entries['2026-06-02'])
  })

  it('newer updatedAt wins on same date', () => {
    const old = ts(-5000)
    const newer = ts()
    const a = makeVault({ '2026-06-01': { text: 'old', words: 1, createdAt: old, updatedAt: old } })
    const b = makeVault({ '2026-06-01': { text: 'new', words: 1, createdAt: old, updatedAt: newer } })
    const merged = receiveAndMerge(a, b)
    assert.equal(merged.entries['2026-06-01'].text, 'new')
  })

  it('is idempotent', () => {
    const a = makeVault({ '2026-06-01': { text: 'hi', words: 1, createdAt: ts(), updatedAt: ts() } })
    const m1 = receiveAndMerge(a, a)
    const m2 = receiveAndMerge(m1, a)
    assert.deepEqual(m1.entries, m2.entries)
  })

  it('does not lose entries from either side', () => {
    const dates = Array.from({ length: 5 }, (_, i) => `2026-06-0${i + 1}`)
    const a = makeVault(Object.fromEntries(dates.slice(0, 3).map(d => [d, { text: d, words: 1, createdAt: ts(), updatedAt: ts() }])))
    const b = makeVault(Object.fromEntries(dates.slice(2).map(d => [d, { text: d + 'B', words: 1, createdAt: ts(), updatedAt: ts(-1) }])))
    const merged = receiveAndMerge(a, b)
    for (const d of dates) assert.ok(merged.entries[d], `missing ${d}`)
  })

  it('commutativity: merge(a,b) and merge(b,a) produce same entries', () => {
    const t1 = ts(-1000); const t2 = ts()
    const a = makeVault({ '2026-06-01': { text: 'a', words: 1, createdAt: t1, updatedAt: t1 } })
    const b = makeVault({ '2026-06-01': { text: 'b', words: 1, createdAt: t1, updatedAt: t2 } })
    const m1 = receiveAndMerge(a, b)
    const m2 = receiveAndMerge(b, a)
    assert.deepEqual(m1.entries, m2.entries)
  })
})

describe('diffVaultDates', () => {
  const ts = (offset = 0) => new Date(Date.now() + offset).toISOString()

  function makeVault(entries = {}) {
    return { version: 1, entries, createdAt: '2026-01-01T00:00:00.000Z' }
  }

  it('counts a brand-new date as added, not updated', () => {
    const t = ts()
    const before = makeVault({ '2026-06-01': { text: 'A', words: 1, createdAt: t, updatedAt: t } })
    const after = makeVault({
      '2026-06-01': { text: 'A', words: 1, createdAt: t, updatedAt: t },
      '2026-06-02': { text: 'B', words: 1, createdAt: t, updatedAt: t },
    })
    assert.deepEqual(diffVaultDates(before, after), { added: 1, updated: 0 })
  })

  it('counts a changed date as updated (newer updatedAt)', () => {
    const old = ts(-5000); const newer = ts()
    const before = makeVault({ '2026-06-01': { text: 'old', words: 1, createdAt: old, updatedAt: old } })
    const after = makeVault({ '2026-06-01': { text: 'new', words: 1, createdAt: old, updatedAt: newer } })
    assert.deepEqual(diffVaultDates(before, after), { added: 0, updated: 1 })
  })

  it('reports nothing when before and after are identical', () => {
    const t = ts()
    const v = makeVault({ '2026-06-01': { text: 'A', words: 1, createdAt: t, updatedAt: t } })
    assert.deepEqual(diffVaultDates(v, mergeIdentity(v)), { added: 0, updated: 0 })
  })

  it('mixes added and updated in one diff', () => {
    const old = ts(-5000); const newer = ts()
    const before = makeVault({ '2026-06-01': { text: 'a', words: 1, createdAt: old, updatedAt: old } })
    const after = makeVault({
      '2026-06-01': { text: 'a2', words: 1, createdAt: old, updatedAt: newer },
      '2026-06-02': { text: 'b', words: 1, createdAt: newer, updatedAt: newer },
    })
    assert.deepEqual(diffVaultDates(before, after), { added: 1, updated: 1 })
  })

  it('treats missing vault/entries as empty (no throw)', () => {
    assert.deepEqual(diffVaultDates(null, null), { added: 0, updated: 0 })
    assert.deepEqual(diffVaultDates(undefined, { entries: {} }), { added: 0, updated: 0 })
  })

  // The post-merge vault keeps a date when nothing changed → identity diff.
  function mergeIdentity(v) {
    return makeVault({ ...v.entries })
  }
})
