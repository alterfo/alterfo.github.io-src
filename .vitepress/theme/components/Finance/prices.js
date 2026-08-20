// MOEX ISS current-price lookup. Explicit, scoped exception to the "no runtime
// third-party fetch" rule — see the "MOEX ISS runtime-fetch exception" note in root
// CLAUDE.md. User-initiated only (a "refresh prices" button), never automatic/polling.
//
// parseMoexResponse is pure (no fetch/clock) so it's fully node --test-able against
// fixture JSON. fetchPrice is the thin browser-only wrapper around it.

// Tried in order: shares (stocks/ETFs, the common case) first, bonds as fallback.
// A ticker only exists on one of these boards, so trying shares first costs nothing
// extra for the (overwhelmingly common) shares/ETF case.
const BOARDS = [
  { market: 'shares', board: 'TQBR', isBond: false },
  { market: 'bonds', board: 'TQOB', isBond: true },
]

const BOARD_URL = (ticker, { market, board }) =>
  `https://iss.moex.com/iss/engines/stock/markets/${market}/boards/${board}/securities/${encodeURIComponent(ticker)}.json?iss.meta=off&iss.only=marketdata,securities&marketdata.columns=SECID,LAST,UPDATETIME&securities.columns=SECID,PREVPRICE,FACEVALUE`

export class MoexPriceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MoexPriceError'
    this.code = code
  }
}

function firstRow(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) return null
  const row = block.data[0]
  if (!row) return null
  const byColumn = {}
  block.columns.forEach((col, i) => { byColumn[col] = row[i] })
  return byColumn
}

// Pure: takes the parsed MOEX ISS JSON body, returns { price, source }.
// source is 'LAST' (live trade price) or 'PREVPRICE' (previous close, used when LAST
// is null — outside trading hours). Throws MoexPriceError('unknown-ticker') when both
// blocks come back empty (HTTP 200, ticker not found on the queried board).
//
// `isBond`: MOEX quotes bond LAST/PREVPRICE as a percent of face value (e.g. 53.109 on
// a 1000₽-face bond means 531.09₽), unlike shares/ETFs which quote RUB directly — so a
// bond price is converted to RUB using the security's own FACEVALUE before returning.
export function parseMoexResponse(json, { isBond = false } = {}) {
  const marketRow = firstRow(json?.marketdata)
  const securityRow = firstRow(json?.securities)

  if (!marketRow && !securityRow) {
    throw new MoexPriceError('unknown-ticker', 'MOEX ISS returned no data for this ticker')
  }

  const faceValue = isBond && Number.isFinite(securityRow?.FACEVALUE) ? securityRow.FACEVALUE : null
  const toRub = (raw) => (faceValue != null ? (raw * faceValue) / 100 : raw)

  const last = marketRow?.LAST
  if (last !== undefined && last !== null) {
    return { price: toRub(last), source: 'LAST' }
  }

  const prev = securityRow?.PREVPRICE
  if (prev !== undefined && prev !== null) {
    return { price: toRub(prev), source: 'PREVPRICE' }
  }

  throw new MoexPriceError('no-price', 'MOEX ISS returned no LAST or PREVPRICE for this ticker')
}

// Browser-only: fetches the live endpoint and returns { ticker, price, asOf }.
// asOf is the fetch time (ISO), not MOEX's own UPDATETIME (a bare time-of-day with no
// date, unusable standalone for a cached "as of" label).
//
// Tries each board in BOARDS in turn, moving to the next only on 'unknown-ticker'
// (ticker genuinely not on that board) — a network failure or a found-but-priceless
// ticker ('no-price') is thrown immediately rather than masked by a fallback attempt.
export async function fetchPrice(ticker, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  let lastUnknownTickerError = null

  for (const boardSpec of BOARDS) {
    let response
    try {
      response = await fetchImpl(BOARD_URL(ticker, boardSpec))
    } catch (err) {
      throw new MoexPriceError('network', `MOEX ISS request failed: ${err.message}`)
    }

    if (!response.ok) {
      throw new MoexPriceError('network', `MOEX ISS request failed with status ${response.status}`)
    }

    const json = await response.json()
    try {
      const { price } = parseMoexResponse(json, { isBond: boardSpec.isBond })
      return { ticker, price, asOf: now() }
    } catch (err) {
      if (err instanceof MoexPriceError && err.code === 'unknown-ticker') {
        lastUnknownTickerError = err
        continue
      }
      throw err
    }
  }

  throw lastUnknownTickerError
}
