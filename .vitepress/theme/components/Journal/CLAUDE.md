# Journal app

Root component: `.vitepress/theme/components/Journal.vue` (`<ClientOnly>`): unlock screen, editor, sync UI.
Page: `journal.md` (`layout: false`).
Shared crypto substrate: `components/crypto.js` (reused by planner, decisions).

## Modules

| File | Purpose |
|------|---------|
| `components/crypto.js` | `randomBytes`, `deriveKey` (PBKDF2-SHA-256 → AES-GCM 256), `encryptJSON`/`decryptJSON`, `packEnvelope`/`unpackEnvelope` (base64 at-rest format) |
| `vault.js` | `emptyVault`, `upsertEntry`, `countWords`, `goalMet`, `computeStreak`, `mergeVaults` (per-date LWW by `updatedAt`) |
| `db.js` | IndexedDB open/save/load for a single packed envelope string; debounced save 300 ms; cross-tab sync via localStorage |
| `exporter.js` | `exportEnvelope` → download `.journal` file; `readEnvelopeFile` → string |
| `sync.js` | P2P sync v2 data layer (WebRTC DataChannel, no server/STUN/TURN). `packBlob(sdp, type)`/`unpackBlob(str)→{sdp,type}` (type='offer'/'answer' included for wrong-paste detection), `createOffer`/`acceptOffer` (non-trickle ICE), `sendEnvelope`, `receiveAndMerge`, `diffVaultDates`, `closeSync`. Pure helpers tested in `sync.test.mjs`; RTC paths are browser-only |
| `../Sync/qr.js` | QR + URL encoding shared by all sync flows. `blobToSyncUrl(blob,role)→URL`, `parseSyncUrl(url)→{role,blobStr}`. `drawQR(canvas,text)` via `qrcode` npm (bundled). URL encodes blob in `#sync-offer=<btoa>` / `#sync-answer=<btoa>` fragments |
| `../QRDisplay.vue` | Canvas component rendering a QR from `:text` prop via `drawQR` |
| `../QRScanner.vue` | Camera scanner using `BarcodeDetector` API (Chrome 83+, Safari 17.4+); emits `scanned(string)` / `error(string)`; manual-paste is the fallback for unsupported browsers |

## Crypto model

- Key derivation: `PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256
- Per-encryption: `iv` = 12 random bytes; `salt` is per-vault (generated once on vault creation)
- At-rest envelope: `{ salt, iterations, iv, ciphertext }` all base64-encoded — no key, no plaintext ever persisted
- Key lives only in memory for the session; re-derived on unlock

## Vault shape

```
{ version, createdAt, entries: { "YYYY-MM-DD": { text, words, createdAt, updatedAt } } }
```

## Merge (single-user LWW)

Union of dates; for a shared date keep the entry with the greater `updatedAt`. Deterministic, idempotent, commutative — safe for file sync, no CRDT.

## Streak

Walk back from today; a day counts if `goalMet` (≥ 500 words); first miss ends the streak. Today's in-progress entry does not break a prior streak until the day rolls over.

## Sync

- **v1**: encrypted file export/import — Export downloads a `.journal` envelope; Import reads it, decrypts with current key (or prompts separately), merges with LWW, saves.
- **v2 (P2P) — QR + link + paste**: WebRTC DataChannel, same-LAN, no server. Blob now includes `type` field for wrong-paste detection. Initiator «Показать QR / ссылку» → shows QR + "Copy link"; responder scans QR OR opens link OR pastes text → auto-generates answer → shows answer QR + link. Laptop↔laptop: AirDrop/messenger link. Laptop↔phone: QR scan. `blobToSyncUrl(blob,'offer')` encodes blob in `#sync-offer=<btoa>` fragment; `Journal.vue` detects this hash on `onMounted` and after unlock auto-opens sync modal in answer mode. Both sides send their **encrypted envelope** on channel open; receiver re-derives key with peer's salt → `receiveAndMerge` (LWW, commutative → both converge). `OperationError` = wrong password → retry. `closeSync` on lock/modal-close/unmount.
- **Cross-tab sync**: localStorage event triggers re-load + merge on other open tabs.

## Change password (re-key)

Verifies current password by re-deriving from the stored envelope's own salt/iterations → decrypt. Generates **fresh salt** (full re-key, not just re-encryption). Writes durably via `saveEnvelopeNow` (awaited, rejects on failure). In-memory `_key`/`_salt`/`_iterations` swap only **after** the write succeeds → a failed write leaves the old envelope and key intact. Other tabs hit `OperationError` on cross-tab ping → `lockVault({ flush: false })` (no clobber of the new envelope).

## Tests

```
node --test .vitepress/theme/components/crypto.test.mjs
node --test .vitepress/theme/components/Journal/vault.test.mjs
node --test .vitepress/theme/components/Journal/exporter.test.mjs
node --test .vitepress/theme/components/Journal/change-password.test.mjs
node --test .vitepress/theme/components/Journal/sync.test.mjs
```
