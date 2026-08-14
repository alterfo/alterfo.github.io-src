// MOEX ISS current-price lookup. Explicit, scoped exception to the "no runtime
// third-party fetch" rule — see the "MOEX ISS runtime-fetch exception" note in root
// CLAUDE.md. User-initiated only (a "refresh prices" button), never automatic/polling.
//
// parseMoexResponse is pure (no fetch/clock) so it's fully node --test-able against
// fixture JSON. fetchPrice is the thin browser-only wrapper around it.

const BOARD_URL = (ticker) =>
  `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}.json?iss.meta=off&iss.only=marketdata,securities&marketdata.columns=SECID,LAST,UPDATETIME&securities.columns=SECID,PREVPRICE`

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
// blocks come back empty (HTTP 200, ticker not found on the TQBR board).
export function parseMoexResponse(json) {
  const marketRow = firstRow(json?.marketdata)
  const securityRow = firstRow(json?.securities)

  if (!marketRow && !securityRow) {
    throw new MoexPriceError('unknown-ticker', 'MOEX ISS returned no data for this ticker')
  }

  const last = marketRow?.LAST
  if (last !== undefined && last !== null) {
    return { price: last, source: 'LAST' }
  }

  const prev = securityRow?.PREVPRICE
  if (prev !== undefined && prev !== null) {
    return { price: prev, source: 'PREVPRICE' }
  }

  throw new MoexPriceError('no-price', 'MOEX ISS returned no LAST or PREVPRICE for this ticker')
}

// Browser-only: fetches the live endpoint and returns { ticker, price, asOf }.
// asOf is the fetch time (ISO), not MOEX's own UPDATETIME (a bare time-of-day with no
// date, unusable standalone for a cached "as of" label).
export async function fetchPrice(ticker, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  let response
  try {
    response = await fetchImpl(BOARD_URL(ticker))
  } catch (err) {
    throw new MoexPriceError('network', `MOEX ISS request failed: ${err.message}`)
  }

  if (!response.ok) {
    throw new MoexPriceError('network', `MOEX ISS request failed with status ${response.status}`)
  }

  const json = await response.json()
  const { price } = parseMoexResponse(json)
  return { ticker, price, asOf: now() }
}
