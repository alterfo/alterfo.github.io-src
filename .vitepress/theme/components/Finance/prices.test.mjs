import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMoexResponse, fetchPrice, MoexPriceError } from './prices.js'

test('parseMoexResponse: LAST present uses live price', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SBER', 305.5, '18:39:59']] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', 303.2]] },
  }
  assert.deepEqual(parseMoexResponse(json), { price: 305.5, source: 'LAST' })
})

test('parseMoexResponse: LAST null falls back to PREVPRICE', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SBER', null, null]] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', 303.2]] },
  }
  assert.deepEqual(parseMoexResponse(json), { price: 303.2, source: 'PREVPRICE' })
})

test('parseMoexResponse: marketdata row absent falls back to PREVPRICE', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', 303.2]] },
  }
  assert.deepEqual(parseMoexResponse(json), { price: 303.2, source: 'PREVPRICE' })
})

test('parseMoexResponse: unknown ticker (both blocks empty) throws typed error', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [] },
  }
  assert.throws(() => parseMoexResponse(json), (err) => {
    assert.ok(err instanceof MoexPriceError)
    assert.equal(err.code, 'unknown-ticker')
    return true
  })
})

test('parseMoexResponse: both LAST and PREVPRICE null throws typed error', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SBER', null, null]] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', null]] },
  }
  assert.throws(() => parseMoexResponse(json), (err) => {
    assert.ok(err instanceof MoexPriceError)
    assert.equal(err.code, 'no-price')
    return true
  })
})

test('parseMoexResponse: missing blocks entirely throws unknown-ticker', () => {
  assert.throws(() => parseMoexResponse({}), (err) => {
    assert.ok(err instanceof MoexPriceError)
    assert.equal(err.code, 'unknown-ticker')
    return true
  })
})

test('parseMoexResponse: isBond converts LAST from percent-of-face to RUB using FACEVALUE', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SU26238RMFS4', 53.109, '17:51:12']] },
    securities: { columns: ['SECID', 'PREVPRICE', 'FACEVALUE'], data: [['SU26238RMFS4', 53.331, 1000]] },
  }
  assert.deepEqual(parseMoexResponse(json, { isBond: true }), { price: 531.09, source: 'LAST' })
})

test('parseMoexResponse: isBond converts PREVPRICE fallback too', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SU26238RMFS4', null, null]] },
    securities: { columns: ['SECID', 'PREVPRICE', 'FACEVALUE'], data: [['SU26238RMFS4', 53.331, 1000]] },
  }
  assert.deepEqual(parseMoexResponse(json, { isBond: true }), { price: 533.31, source: 'PREVPRICE' })
})

test('parseMoexResponse: isBond without a FACEVALUE column leaves the price unscaled', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SU26238RMFS4', 53.109, '17:51:12']] },
    securities: { columns: ['SECID', 'PREVPRICE'], data: [['SU26238RMFS4', 53.331]] },
  }
  assert.deepEqual(parseMoexResponse(json, { isBond: true }), { price: 53.109, source: 'LAST' })
})

test('parseMoexResponse: a share (isBond false/omitted) is never scaled by FACEVALUE', () => {
  const json = {
    marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SBER', 305.5, '18:39:59']] },
    securities: { columns: ['SECID', 'PREVPRICE', 'FACEVALUE'], data: [['SBER', 303.2, 3]] },
  }
  assert.deepEqual(parseMoexResponse(json), { price: 305.5, source: 'LAST' })
})

test('fetchPrice: a share is found on the first (shares) board, no fallback attempted', async () => {
  const calledUrls = []
  const fetchImpl = async (url) => {
    calledUrls.push(url)
    return {
      ok: true,
      json: async () => ({
        marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SBER', 305.5, '18:39:59']] },
        securities: { columns: ['SECID', 'PREVPRICE', 'FACEVALUE'], data: [['SBER', 303.2, null]] },
      }),
    }
  }
  const result = await fetchPrice('SBER', { fetchImpl, now: () => '2026-08-20T10:00:00.000Z' })
  assert.deepEqual(result, { ticker: 'SBER', price: 305.5, asOf: '2026-08-20T10:00:00.000Z' })
  assert.equal(calledUrls.length, 1)
  assert.match(calledUrls[0], /markets\/shares\/boards\/TQBR/)
})

test('fetchPrice: unknown on the shares board falls back to the bonds board and converts the price', async () => {
  const calledUrls = []
  const fetchImpl = async (url) => {
    calledUrls.push(url)
    if (url.includes('/markets/shares/')) {
      return { ok: true, json: async () => ({ marketdata: { columns: [], data: [] }, securities: { columns: [], data: [] } }) }
    }
    return {
      ok: true,
      json: async () => ({
        marketdata: { columns: ['SECID', 'LAST', 'UPDATETIME'], data: [['SU26238RMFS4', 53.109, '17:51:12']] },
        securities: { columns: ['SECID', 'PREVPRICE', 'FACEVALUE'], data: [['SU26238RMFS4', 53.331, 1000]] },
      }),
    }
  }
  const result = await fetchPrice('SU26238RMFS4', { fetchImpl, now: () => '2026-08-20T10:00:00.000Z' })
  assert.deepEqual(result, { ticker: 'SU26238RMFS4', price: 531.09, asOf: '2026-08-20T10:00:00.000Z' })
  assert.equal(calledUrls.length, 2)
  assert.match(calledUrls[0], /markets\/shares\/boards\/TQBR/)
  assert.match(calledUrls[1], /markets\/bonds\/boards\/TQOB/)
})

test('fetchPrice: unknown on every board throws unknown-ticker', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ marketdata: { columns: [], data: [] }, securities: { columns: [], data: [] } }),
  })
  await assert.rejects(() => fetchPrice('NOPE', { fetchImpl }), (err) => {
    assert.ok(err instanceof MoexPriceError)
    assert.equal(err.code, 'unknown-ticker')
    return true
  })
})

test('fetchPrice: a network error on the first board is thrown immediately, no fallback attempted', async () => {
  const calledUrls = []
  const fetchImpl = async (url) => {
    calledUrls.push(url)
    return { ok: false, status: 500 }
  }
  await assert.rejects(() => fetchPrice('SBER', { fetchImpl }), (err) => {
    assert.ok(err instanceof MoexPriceError)
    assert.equal(err.code, 'network')
    return true
  })
  assert.equal(calledUrls.length, 1)
})
