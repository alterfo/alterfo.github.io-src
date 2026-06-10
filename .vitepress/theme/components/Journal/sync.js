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

// How long to wait for the DataChannel to open before giving up.
export const CHANNEL_TIMEOUT_MS = 60000

// --- Initiator side ---
// createOffer(onState?) → { blobStr, waitForChannel(onEnvelope), acceptAnswer, pc }
// Call createOffer() → show blobStr to peer → peer calls acceptOffer → gets answerBlobStr
// → you call acceptAnswer(answerBlobStr) → channel opens → onEnvelope fires with received str.
// onState(state) (optional) mirrors pc.connectionState for the UI (connecting/connected/failed).
export async function createOffer(onState) {
  const pc = makePc()
  if (onState) pc.onconnectionstatechange = () => onState(pc.connectionState)
  const dc = pc.createDataChannel('journal-sync')
  pc._syncDc = dc

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const localDesc = await gatheringComplete(pc)
  const blobStr = packBlob(localDesc.sdp)

  function waitForChannel(onEnvelope, timeoutMs = CHANNEL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Тайм-аут соединения (60 с). Проверьте, что оба устройства в одной сети.'))
      }, timeoutMs)
      pc._syncTimer = timer  // so closeSync can cancel it on teardown
      dc.onopen = () => { clearTimeout(timer); resolve(dc) }
      dc.onerror = (e) => { clearTimeout(timer); reject(e) }
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
// acceptOffer(offerBlobStr, onState?) → { blobStr, waitForChannel(onEnvelope), pc }
export async function acceptOffer(offerBlobStr, onState) {
  const pc = makePc()
  if (onState) pc.onconnectionstatechange = () => onState(pc.connectionState)

  const offerSdp = unpackBlob(offerBlobStr)
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const localDesc = await gatheringComplete(pc)
  const blobStr = packBlob(localDesc.sdp)

  function waitForChannel(onEnvelope, timeoutMs = CHANNEL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Тайм-аут соединения (60 с). Проверьте, что оба устройства в одной сети.'))
      }, timeoutMs)
      pc._syncTimer = timer  // so closeSync can cancel it on teardown
      pc.ondatachannel = (e) => {
        const dc = e.channel
        pc._syncDc = dc
        dc.onopen = () => { clearTimeout(timer); resolve(dc) }
        dc.onerror = (err) => { clearTimeout(timer); reject(err) }
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

// Close a sync connection (DataChannel + peer connection). Idempotent —
// safe to call on a half-open or already-closed pc, on modal close / unmount / lock.
export function closeSync(pc) {
  if (!pc) return
  if (pc._syncTimer) { clearTimeout(pc._syncTimer); pc._syncTimer = null }
  try {
    if (pc._syncDc && pc._syncDc.readyState !== 'closed') pc._syncDc.close()
  } catch { /* already gone */ }
  try {
    if (pc.connectionState !== 'closed') pc.close()
  } catch { /* already gone */ }
}

// Pure receive-and-merge reducer (testable without RTCPeerConnection).
// Returns the merged vault object.
import { mergeVaults } from './vault.js'

export function receiveAndMerge(currentVault, importedVault) {
  return mergeVaults(currentVault, importedVault)
}

// Pure diff of two vaults by date entry (testable). Compares the pre-merge vault
// (`before`) against the post-merge vault (`after`) and reports what the merge
// brought in, so the UI can summarize a sync as «Объединено N записей (M обновлено)»:
//   added   — dates present in `after` but not in `before`
//   updated — dates present in both whose entry actually changed (text/updatedAt)
export function diffVaultDates(before, after) {
  const beforeEntries = (before && before.entries) || {}
  const afterEntries = (after && after.entries) || {}
  let added = 0
  let updated = 0
  for (const date of Object.keys(afterEntries)) {
    const b = beforeEntries[date]
    if (!b) { added++; continue }
    const a = afterEntries[date]
    if (a.updatedAt !== b.updatedAt || a.text !== b.text) updated++
  }
  return { added, updated }
}
