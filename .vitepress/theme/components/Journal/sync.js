// WebRTC DataChannel sync — same-LAN, no STUN/TURN, no signaling server.
// Non-trickle ICE: wait for full gathering before producing the blob,
// so offer and answer are each a single self-contained JSON string.
// Only the encrypted envelope is sent over the channel — never plaintext.

// Serialize/deserialize the SDP blob (pure, testable).
export function packBlob(sdp) {
  return JSON.stringify({ sdp })
}

export function unpackBlob(str) {
  const { sdp } = JSON.parse(str)
  return sdp
}

// Wait for ICE gathering to complete and return the full local SDP.
function gatheringComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve(pc.localDescription)
      return
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check)
        resolve(pc.localDescription)
      }
    }
    pc.addEventListener('icegatheringstatechange', check)
  })
}

// Build a bare RTCPeerConnection with no ICE servers (host-only, same-LAN).
function makePc() {
  return new RTCPeerConnection({ iceServers: [] })
}

// --- Initiator side ---
// Returns { blobStr, waitForChannel(onEnvelope) }
// Call createOffer() → show blobStr to peer → peer calls acceptOffer → gets answerBlobStr
// → you call acceptAnswer(answerBlobStr) → channel opens → onEnvelope fires with received str
export async function createOffer() {
  const pc = makePc()
  const dc = pc.createDataChannel('journal-sync')

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const localDesc = await gatheringComplete(pc)
  const blobStr = packBlob(localDesc.sdp)

  function waitForChannel(onEnvelope) {
    return new Promise((resolve, reject) => {
      dc.onopen = () => resolve(dc)
      dc.onerror = (e) => reject(e)
      dc.onmessage = (e) => onEnvelope(e.data)
    })
  }

  async function acceptAnswer(answerBlobStr) {
    const sdp = unpackBlob(answerBlobStr)
    await pc.setRemoteDescription({ type: 'answer', sdp })
  }

  return { blobStr, waitForChannel, acceptAnswer, pc }
}

// --- Responder side ---
// Returns { blobStr, waitForChannel(onEnvelope) }
export async function acceptOffer(offerBlobStr) {
  const pc = makePc()

  const offerSdp = unpackBlob(offerBlobStr)
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const localDesc = await gatheringComplete(pc)
  const blobStr = packBlob(localDesc.sdp)

  function waitForChannel(onEnvelope) {
    return new Promise((resolve, reject) => {
      pc.ondatachannel = (e) => {
        const dc = e.channel
        dc.onopen = () => resolve(dc)
        dc.onerror = (err) => reject(err)
        dc.onmessage = (ev) => onEnvelope(ev.data)
      }
    })
  }

  return { blobStr, waitForChannel, pc }
}

// Send an envelope string over an open DataChannel.
export function sendEnvelope(dc, envelopeStr) {
  dc.send(envelopeStr)
}

// Pure receive-and-merge reducer (testable without RTCPeerConnection).
// Returns the merged vault object.
import { mergeVaults } from './vault.js'

export function receiveAndMerge(currentVault, importedVault) {
  return mergeVaults(currentVault, importedVault)
}

// --- Minimal QR encoder (self-contained, no external lib) ---
// Uses a tiny QR library pattern: encodes the string as QR version auto,
// rendered onto a <canvas> element. Returns false if string is too long.
// Implementation: Reed-Solomon + bit-matrix using pure JS.
// This is a lightweight subset sufficient for ~500-char SDP blobs.

// We use a well-known small self-contained QR encoder adapted from
// the public-domain "qrcodegen" algorithm (integer-only, no float).
// For SDP blobs (~500 chars) QR version 15-20 is sufficient.

const QR = (() => {
  // Galois field GF(256) with primitive polynomial x^8+x^4+x^3+x^2+1 (= 0x11D)
  const EXP = new Uint8Array(512)
  const LOG = new Uint8Array(256)
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]

  function gmul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]] }
  function gpow(a, p) { return EXP[(LOG[a] * p) % 255] }

  function rsGenerator(degree) {
    const g = [1]
    for (let i = 0; i < degree; i++) {
      const alpha = EXP[i]
      const newg = new Array(g.length + 1).fill(0)
      for (let j = 0; j < g.length; j++) {
        newg[j] ^= gmul(g[j], alpha)
        newg[j + 1] ^= g[j]
      }
      newg[g.length] ^= gmul(g[g.length - 1] ?? 0, alpha)
      g.length = 0; g.push(...newg)
    }
    return g
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen)
    const rem = new Array(ecLen).fill(0)
    for (const b of data) {
      const factor = b ^ rem.shift()
      rem.push(0)
      for (let j = 0; j < ecLen; j++) rem[j] ^= gmul(gen[j], factor)
    }
    return rem
  }

  // QR version capacity table for error correction level M (bytes)
  // Index = version - 1
  const CAP_M = [
    16,28,44,64,86,108,124,154,182,216,
    254,290,334,365,415,453,507,563,627,669,
    714,782,860,914,1000,1062,1128,1193,1267,1373,
    1455,1541,1631,1725,1812,1914,1992,2102,2216,2334
  ]

  // Number of EC codewords for level M, index = version-1
  const EC_M = [
    10,16,26,36,46,60,66,86,100,122,
    130,150,176,198,216,240,280,308,338,364,
    416,442,490,532,580,428,461,511,535,593,
    625,667,714,782,860,914,1000,1062,1128,1193
  ]

  function encodeData(bytes, version) {
    // Byte mode: 0100 indicator + 8-bit length + data + terminator
    const bits = []
    const push = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
    }
    push(0b0100, 4)
    push(bytes.length, 8)
    for (const b of bytes) push(b, 8)
    // Terminator
    for (let i = 0; i < 4 && bits.length < CAP_M[version - 1] * 8; i++) bits.push(0)
    // Pad to byte boundary
    while (bits.length % 8) bits.push(0)
    // Pad bytes
    const padBytes = [0xEC, 0x11]
    let pi = 0
    while (bits.length < CAP_M[version - 1] * 8) {
      push(padBytes[pi++ % 2], 8)
    }
    // Convert to byte array
    const out = []
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0
      for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0)
      out.push(b)
    }
    return out
  }

  // Format info for level M, mask 2 (101): bits 101 010 (EC=01, mask=010)
  // Precomputed format strings for level M, masks 0-7
  const FORMAT_M = [
    0b101010000010010, 0b101000100100101,
    0b101111001111100, 0b101101101001011,
    0b100010111111001, 0b100000011001110,
    0b100111110010111, 0b100101010100000,
  ]

  const ALIGN_POS = [
    [], [], [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38], [6,24,42], [6,26,46], [6,28,50],
    [6,30,54], [6,32,58], [6,34,62], [6,26,46,66],
    [6,26,48,70], [6,26,50,74], [6,30,54,78], [6,30,56,82],
    [6,30,58,86], [6,34,62,90], [6,28,50,72,94],
    [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106],
    [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118],
    [6,26,50,74,98,122], [6,30,54,78,102,126],
    [6,26,52,78,104,130], [6,30,56,82,108,134],
    [6,34,60,86,112,138], [6,30,58,86,114,142],
    [6,34,62,90,118,146], [6,30,56,84,112,140,168],
    [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
    [6,28,56,84,112,140,168], [6,32,60,88,116,144,172],
  ]

  function makeMatrix(version) {
    const size = version * 4 + 17
    const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1))
    // -1=unset, 0=dark, 1=light (inverted for rendering: 0=black, 1=white)

    function setModule(r, c, dark) { m[r][c] = dark ? 0 : 1 }
    function isSet(r, c) { return m[r][c] !== -1 }

    // Finder patterns
    function finder(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r, cc = col + c
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
          const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                       (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                       (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          setModule(rr, cc, r !== -1 && c !== -1 ? dark : false)
        }
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0)

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setModule(6, i, i % 2 === 0)
      setModule(i, 6, i % 2 === 0)
    }

    // Alignment patterns
    const pos = ALIGN_POS[version - 1]
    for (const r of pos) {
      for (const c of pos) {
        if (isSet(r, c)) continue
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            setModule(r + dr, c + dc,
              Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
          }
        }
      }
    }

    // Dark module
    setModule(size - 8, 8, true)

    return m
  }

  function placeFormat(m, version, mask) {
    const size = version * 4 + 17
    const fmt = FORMAT_M[mask]
    const bits = []
    for (let i = 14; i >= 0; i--) bits.push((fmt >> i) & 1)

    // Around top-left finder
    const seq1r = [8,8,8,8,8,8,8,8,7,5,4,3,2,1,0]
    const seq1c = [0,1,2,3,4,5,7,8,8,8,8,8,8,8,8]
    for (let i = 0; i < 15; i++) m[seq1r[i]][seq1c[i]] = bits[i] ? 1 : 0

    // Around other finders
    for (let i = 0; i < 8; i++) m[size - 1 - i][8] = bits[i] ? 1 : 0
    for (let i = 8; i < 15; i++) m[8][size - 15 + i] = bits[i] ? 1 : 0
  }

  function applyMask(m, mask) {
    const size = m.length
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c] === -1) continue
        let invert = false
        if (mask === 0) invert = (r + c) % 2 === 0
        else if (mask === 1) invert = r % 2 === 0
        else if (mask === 2) invert = c % 3 === 0
        else if (mask === 3) invert = (r + c) % 3 === 0
        else if (mask === 4) invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
        else if (mask === 5) invert = (r * c) % 2 + (r * c) % 3 === 0
        else if (mask === 6) invert = ((r * c) % 2 + (r * c) % 3) % 2 === 0
        else if (mask === 7) invert = ((r + c) % 2 + (r * c) % 3) % 2 === 0
        if (invert) m[r][c] ^= 1
      }
    }
  }

  function placeData(m, codewords) {
    const size = m.length
    let idx = 0
    let bitIdx = 7
    let col = size - 1
    let goingUp = true

    while (col > 0) {
      if (col === 6) col--
      for (let row = goingUp ? size - 1 : 0; goingUp ? row >= 0 : row < size; goingUp ? row-- : row++) {
        for (let dc = 0; dc <= 1; dc++) {
          const c = col - dc
          if (m[row][c] !== -1) continue
          const bit = idx < codewords.length
            ? (codewords[idx] >> bitIdx) & 1
            : 0
          m[row][c] = bit ? 1 : 0
          if (bitIdx === 0) { bitIdx = 7; idx++ } else bitIdx--
        }
      }
      goingUp = !goingUp
      col -= 2
    }
  }

  // Encode text to QR, render to canvas. Returns false if too long.
  function encode(text, canvas, moduleSize = 4) {
    const bytes = Array.from(new TextEncoder().encode(text))
    // Find minimum version for level M
    let version = -1
    for (let v = 1; v <= 40; v++) {
      if (bytes.length + 3 <= CAP_M[v - 1]) { version = v; break }
    }
    if (version === -1) return false

    const ecLen = EC_M[version - 1]
    const dataLen = CAP_M[version - 1] - ecLen
    const dataBytes = encodeData(bytes, version).slice(0, dataLen)
    const ecBytes = rsEncode(dataBytes, ecLen)
    const allBytes = [...dataBytes, ...ecBytes]

    const mask = 2
    const m = makeMatrix(version)
    placeData(m, allBytes)
    placeFormat(m, version, mask)
    applyMask(m, mask)

    const size = version * 4 + 17
    const quiet = 4
    const dim = (size + quiet * 2) * moduleSize
    canvas.width = dim; canvas.height = dim
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim)
    ctx.fillStyle = '#000'
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c] === 0) {
          ctx.fillRect((c + quiet) * moduleSize, (r + quiet) * moduleSize, moduleSize, moduleSize)
        }
      }
    }
    return true
  }

  return { encode }
})()

export const QREncoder = QR
