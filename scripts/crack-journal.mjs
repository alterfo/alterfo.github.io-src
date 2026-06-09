#!/usr/bin/env node
/**
 * Offline brute-force tester for .journal encrypted envelopes.
 * Tests YOUR OWN file to assess password strength.
 *
 * Usage:
 *   node scripts/crack-journal.mjs <file.journal> <wordlist.txt> [--variants]
 *
 * Options:
 *   --variants   Also try common mutations per word:
 *                  capitalize, UPPER, word+1..9, word+year, word+!, word+123
 *
 * Recommended wordlist: rockyou.txt (14M passwords, ~2GB uncompressed)
 *   macOS: brew install hashcat && ls /opt/homebrew/share/hashcat/wordlists/
 *   or download: https://github.com/brannondorsey/naive-hashcat/releases
 *
 * At 600k PBKDF2 iterations on Apple M-series: ~5-8 attempts/sec per core.
 * One day ≈ 432000–691200 total attempts.
 */

import { readFileSync } from 'fs'
import { webcrypto } from 'crypto'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const subtle = webcrypto.subtle

// ── Envelope parsing (mirrors unpackEnvelope in crypto.js) ───────────────────

function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64')
}

function parseEnvelope(raw) {
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error('Not valid JSON') }
  const { salt, iterations, iv, ciphertext } = parsed
  if (!salt || !iv || !ciphertext || !Number.isInteger(iterations)) {
    throw new Error('Missing fields in envelope')
  }
  if (iterations < 100_000 || iterations > 2_000_000) {
    throw new Error(`Unusual iterations: ${iterations}`)
  }
  return {
    salt: base64ToBuffer(salt),
    iv: base64ToBuffer(iv),
    ciphertext: base64ToBuffer(ciphertext),
    iterations,
  }
}

// ── Crypto: one PBKDF2+AES-GCM attempt ───────────────────────────────────────

async function tryPassword(envelope, password) {
  const { salt, iv, ciphertext, iterations } = envelope
  let keyMaterial
  try {
    keyMaterial = await subtle.importKey(
      'raw',
      Buffer.from(password, 'utf-8'),
      'PBKDF2',
      false,
      ['deriveKey']
    )
  } catch {
    return false
  }
  let key
  try {
    key = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )
  } catch {
    return false
  }
  try {
    await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return true
  } catch {
    return false
  }
}

// ── Candidate mutations ───────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

function* variants(word) {
  yield word
  const cap = word[0].toUpperCase() + word.slice(1)
  if (cap !== word) yield cap
  const upper = word.toUpperCase()
  if (upper !== word) yield upper
  const lower = word.toLowerCase()
  if (lower !== word) yield lower
  // common suffixes
  for (const suffix of ['1', '2', '123', '!', '1!', '12', '0', '99', '00', '01', '123!']) {
    yield word + suffix
    yield cap + suffix
  }
  // years
  for (let y = CURRENT_YEAR - 5; y <= CURRENT_YEAR; y++) {
    yield word + y
    yield cap + y
  }
}

// ── Progress display ──────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function statusLine(tested, total, rate, password) {
  const pct = total > 0 ? ((tested / total) * 100).toFixed(1) : '?'
  const eta = rate > 0 && total > 0 ? formatTime((total - tested) / rate) : '?'
  const rateStr = rate > 0 ? rate.toFixed(1) : '?'
  const padded = `  ${tested}/${total || '?'} (${pct}%) | ${rateStr}/s | ETA ${eta} | testing: ${password.slice(0, 20)}`
  process.stdout.write('\r' + padded.padEnd(80))
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const withVariants = args.includes('--variants')
const positional = args.filter(a => !a.startsWith('--'))
const [envelopeFile, wordlistFile] = positional

if (!envelopeFile || !wordlistFile) {
  console.error('Usage: node scripts/crack-journal.mjs <file.journal> <wordlist.txt> [--variants]')
  console.error('')
  console.error('  --variants   Also try capitalization, digits, year suffixes per word')
  process.exit(1)
}

let envelopeRaw
try {
  envelopeRaw = readFileSync(envelopeFile, 'utf-8').trim()
} catch (e) {
  console.error(`Cannot read envelope file: ${e.message}`)
  process.exit(1)
}

let envelope
try {
  envelope = parseEnvelope(envelopeRaw)
} catch (e) {
  console.error(`Invalid envelope: ${e.message}`)
  process.exit(1)
}

// Count wordlist lines first (for ETA)
let wordlistTotal = 0
await new Promise(resolve => {
  const rl = createInterface({ input: createReadStream(wordlistFile), crlfDelay: Infinity })
  rl.on('line', () => wordlistTotal++)
  rl.on('close', resolve)
})

const estimatedAttempts = withVariants ? wordlistTotal * 20 : wordlistTotal
const ONE_DAY = 86400

console.log(`\nJournal brute-force tester`)
console.log(`  Envelope:   ${envelopeFile}`)
console.log(`  Wordlist:   ${wordlistFile} (${wordlistTotal.toLocaleString()} words)`)
console.log(`  Iterations: ${envelope.iterations.toLocaleString()} PBKDF2-SHA256`)
console.log(`  Variants:   ${withVariants ? 'yes (~20x per word)' : 'no (exact matches only)'}`)
console.log(`  Candidates: ~${estimatedAttempts.toLocaleString()}`)
console.log('')

// Benchmark: measure one attempt to estimate rate
const benchStart = performance.now()
await tryPassword(envelope, '__benchmark__')
const msPerAttempt = performance.now() - benchStart
const attemptsPerSec = 1000 / msPerAttempt
const estimatedSeconds = estimatedAttempts / attemptsPerSec

console.log(`  Speed:      ~${attemptsPerSec.toFixed(1)} attempts/sec (${msPerAttempt.toFixed(0)}ms/attempt)`)
console.log(`  Est. time:  ${formatTime(estimatedSeconds)} for full wordlist`)
if (estimatedSeconds > ONE_DAY) {
  console.log(`  Verdict:    wordlist takes longer than 1 day — safe against this dictionary`)
} else {
  console.log(`  Verdict:    could crack within 1 day if password is in this wordlist`)
}
console.log('')
console.log('Starting attack...')

const lineStream = createInterface({
  input: createReadStream(wordlistFile),
  crlfDelay: Infinity,
})

let tested = 0
let found = null
const startTime = Date.now()

for await (const line of lineStream) {
  const word = line.trim()
  if (!word) continue

  const toTry = withVariants ? [...variants(word)] : [word]

  for (const candidate of toTry) {
    const ok = await tryPassword(envelope, candidate)
    tested++

    if (ok) {
      found = candidate
      lineStream.close()
      break
    }

    if (tested % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const rate = tested / elapsed
      statusLine(tested, estimatedAttempts, rate, candidate)
    }
  }

  if (found) break
}

const elapsed = (Date.now() - startTime) / 1000
process.stdout.write('\n')

if (found) {
  console.log('')
  console.log(`PASSWORD FOUND: "${found}"`)
  console.log(`Tested ${tested.toLocaleString()} candidates in ${formatTime(elapsed)}`)
  console.log('')
  console.log('Your password is in the wordlist. Change it to something longer and random.')
} else {
  console.log(`Not found in ${tested.toLocaleString()} candidates (${formatTime(elapsed)})`)
  console.log('Password is not in this wordlist.')
}
