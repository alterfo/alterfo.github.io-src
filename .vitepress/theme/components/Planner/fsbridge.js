// Planner File System Access bridge — the agent-facing interface.
//
// Writes a PLAINTEXT tasks.json (everything except private notes) to a user-chosen local
// folder so an agent (Claude Code) can read and edit tasks directly on disk — no server.
// Chrome/Edge only; everything degrades gracefully elsewhere via `fsSupported === false`.
//
// Gotchas (why the UI is wired the way it is):
//   1. User gesture required. `showDirectoryPicker` and `requestPermission` may only run
//      inside a user gesture (a click handler). The "Connect folder" / "Reconnect folder"
//      buttons call pickDirectory()/ensurePermission() DIRECTLY — never from onMounted or a
//      watcher, which would throw a SecurityError.
//   2. Permission lapses on reload. A handle restored from IndexedDB often reports
//      'prompt' (not 'granted') after a page reload. Call checkPermission() on start to
//      decide whether to auto-sync or show a "Reconnect folder" button — do NOT fail silently.
//   3. No file-watch API. There is no way to observe external edits to tasks.json, so the
//      app re-reads on window `focus` (see PlannerEditor.vue) and merges via mergeFromFile.

// Feature detect — guard for SSR (no window) and non-Chromium browsers.
export const fsSupported =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window

// MUST be called from a click handler (user gesture). Opens the OS folder picker and
// returns a FileSystemDirectoryHandle with read/write intent.
export async function pickDirectory() {
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

// Returns 'granted' | 'prompt' | 'denied' WITHOUT prompting — safe to call on start.
export async function checkPermission(handle) {
  if (!handle) return 'denied'
  return handle.queryPermission({ mode: 'readwrite' })
}

// MUST be called from a click handler when checkPermission() !== 'granted'.
// Returns true once read/write access is granted.
export async function ensurePermission(handle) {
  if (!handle) return false
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

// Atomically write tasks.json into the connected folder. createWritable() buffers; close()
// commits the file in one shot, so a reader never sees a half-written file.
export async function writeTasksJson(handle, fileObj) {
  const fh = await handle.getFileHandle('tasks.json', { create: true })
  const w = await fh.createWritable()
  await w.write(JSON.stringify(fileObj, null, 2))
  await w.close()
}

// Read and parse tasks.json. Returns null when the file is missing or unreadable
// (e.g. first connect before the first write, or invalid JSON from a bad edit) so the
// caller can skip the merge rather than crash.
export async function readTasksJson(handle) {
  try {
    const fh = await handle.getFileHandle('tasks.json') // throws if missing
    return JSON.parse(await (await fh.getFile()).text())
  } catch {
    return null
  }
}
