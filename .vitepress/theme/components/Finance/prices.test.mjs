import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMoexResponse, MoexPriceError } from './prices.js'

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
