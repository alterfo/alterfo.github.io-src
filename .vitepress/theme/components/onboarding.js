// First-visit onboarding gate, shared by the app root components (IDEF0 / Journal / Piano).
//
// `shouldShowOnboarding(key)` returns true the FIRST time a given key is seen — and records
// that visit so every later call returns false. The caller decides *when* to run it (e.g.
// `onMounted`, or a `phase` watcher for the journal) and what to do with the result.
//
// `storage` is injectable so the logic is unit-testable under `node --test` with a plain
// object mock (same pattern as Piano/userScores.js). Defaults to `localStorage` in the
// browser, or `null` under SSR/node — in which case it is a safe no-op returning false.

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function shouldShowOnboarding(key, storage = defaultStorage()) {
  if (!storage) return false
  if (storage.getItem(key)) return false
  storage.setItem(key, '1')
  return true
}
