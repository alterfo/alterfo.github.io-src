export function mulberry32(seed) {
  let state = seed | 0
  return function next() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng, n) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('n must be a positive integer')
  return Math.floor(rng() * n)
}

export function shuffle(arr, rng) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}
