import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { packBlob, unpackBlob, receiveAndMerge, diffVaultDates, sendEnvelope, closeSync, CHANNEL_TIMEOUT_MS } from './sync.js'

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

  it('unpackBlob throws when the JSON parses to null (destructuring a non-object)', () => {
    // A pasted "null" parses fine but `const { sdp } = null` throws TypeError.
    assert.throws(() => unpackBlob('null'), TypeError)
  })
})

describe('sendEnvelope', () => {
  it('forwards the envelope string verbatim, exactly once', () => {
    const sent = []
    sendEnvelope({ send: (s) => sent.push(s) }, 'ENVELOPE-STRING')
    assert.deepEqual(sent, ['ENVELOPE-STRING'])
  })
})

describe('CHANNEL_TIMEOUT_MS', () => {
  it('is 60000 — matches the "60 с" wording hardcoded in the timeout message', () => {
    assert.equal(CHANNEL_TIMEOUT_MS, 60000)
  })
})

describe('closeSync', () => {
  function stubChannel(readyState = 'open') {
    return { readyState, closed: 0, close() { this.closed++; this.readyState = 'closed' } }
  }
  function stubPc({ connectionState = 'connected', dc = null, timer = null } = {}) {
    return {
      connectionState,
      _syncDc: dc,
      _syncTimer: timer,
      closed: 0,
      close() { this.closed++; this.connectionState = 'closed' },
    }
  }

  it('no-ops on null / undefined', () => {
    assert.doesNotThrow(() => closeSync(null))
    assert.doesNotThrow(() => closeSync(undefined))
  })

  it('closes both the DataChannel and the peer connection', () => {
    const dc = stubChannel('open')
    const pc = stubPc({ dc })
    closeSync(pc)
    assert.equal(dc.closed, 1)
    assert.equal(pc.closed, 1)
  })

  it('skips a DataChannel already in the closed state', () => {
    const dc = stubChannel('closed')
    const pc = stubPc({ dc })
    closeSync(pc)
    assert.equal(dc.closed, 0)
    assert.equal(pc.closed, 1)
  })

  it('skips a peer connection already closed', () => {
    const pc = stubPc({ connectionState: 'closed' })
    closeSync(pc)
    assert.equal(pc.closed, 0)
  })

  it('clears a pending channel-open timer', () => {
    const timer = setTimeout(() => {}, 10000)
    const pc = stubPc({ timer })
    closeSync(pc)
    assert.equal(pc._syncTimer, null)
  })

  it('is idempotent — a second call performs no further close', () => {
    const dc = stubChannel('open')
    const pc = stubPc({ dc })
    closeSync(pc)
    closeSync(pc)
    assert.equal(dc.closed, 1)
    assert.equal(pc.closed, 1)
  })

  it('swallows errors thrown by close()', () => {
    const pc = {
      connectionState: 'connected',
      _syncDc: { readyState: 'open', close() { throw new Error('boom') } },
      close() { throw new Error('boom2') },
    }
    assert.doesNotThrow(() => closeSync(pc))
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

  // Isolate each half of the `updatedAt !== b.updatedAt || text !== b.text` OR so a
  // regression dropping either comparison is caught (both fields move together elsewhere).
  it('counts a same-text entry with only a newer updatedAt as updated', () => {
    const old = ts(-5000); const newer = ts()
    const before = makeVault({ '2026-06-01': { text: 'same', words: 1, createdAt: old, updatedAt: old } })
    const after = makeVault({ '2026-06-01': { text: 'same', words: 1, createdAt: old, updatedAt: newer } })
    assert.deepEqual(diffVaultDates(before, after), { added: 0, updated: 1 })
  })

  it('counts a changed-text entry with an unchanged updatedAt as updated', () => {
    const t = ts()
    const before = makeVault({ '2026-06-01': { text: 'one', words: 1, createdAt: t, updatedAt: t } })
    const after = makeVault({ '2026-06-01': { text: 'two', words: 1, createdAt: t, updatedAt: t } })
    assert.deepEqual(diffVaultDates(before, after), { added: 0, updated: 1 })
  })

  it('ignores a words-only change (text and updatedAt unchanged)', () => {
    const t = ts()
    const before = makeVault({ '2026-06-01': { text: 'same', words: 1, createdAt: t, updatedAt: t } })
    const after = makeVault({ '2026-06-01': { text: 'same', words: 99, createdAt: t, updatedAt: t } })
    assert.deepEqual(diffVaultDates(before, after), { added: 0, updated: 0 })
  })

  it('reports nothing after a real no-op merge of a vault with an equal peer copy', () => {
    const t = ts()
    const v = makeVault({ '2026-06-01': { text: 'A', words: 1, createdAt: t, updatedAt: t } })
    // Drive the diff with the genuine merge reducer the sync path uses, not a stand-in.
    const after = receiveAndMerge(v, makeVault({ ...v.entries }))
    assert.deepEqual(diffVaultDates(v, after), { added: 0, updated: 0 })
  })

  it('reports nothing when the local entry wins LWW over an older remote', () => {
    const old = ts(-5000); const newer = ts()
    const local = makeVault({ '2026-06-01': { text: 'local', words: 1, createdAt: newer, updatedAt: newer } })
    const remote = makeVault({ '2026-06-01': { text: 'remote', words: 1, createdAt: old, updatedAt: old } })
    const after = receiveAndMerge(local, remote)
    assert.deepEqual(diffVaultDates(local, after), { added: 0, updated: 0 })
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
})
