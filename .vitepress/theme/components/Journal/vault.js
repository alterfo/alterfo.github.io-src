// Pure vault logic: no DOM, no crypto, no IndexedDB — fully unit-testable under Node 22.

export function emptyVault() {
  return {
    version: 1,
    entries: {},
    createdAt: new Date().toISOString(),
  };
}

// Count words: split on whitespace, ignore empty tokens.
export function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function goalMet(entry, goal = 500) {
  return entry != null && entry.words >= goal;
}

// Upsert an entry for a given ISO date string (YYYY-MM-DD).
// `now` is an ISO timestamp string (defaults to current time) — injectable for tests.
export function upsertEntry(vault, dateISO, text, now = new Date().toISOString()) {
  const words = countWords(text);
  const existing = vault.entries[dateISO];
  vault.entries[dateISO] = {
    text,
    words,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  return vault;
}

// Walk back from todayISO counting consecutive days where goalMet is true.
// Today that has not yet met the goal does NOT break a prior streak (streak is preserved
// until the day actually rolls over with insufficient words).
export function computeStreak(vault, todayISO, goal = 500) {
  let streak = 0;
  // Parse as UTC noon to avoid DST/timezone issues with getDate()/setDate().
  let d = new Date(todayISO + 'T12:00:00Z');

  const todayEntry = vault.entries[todayISO];
  if (todayEntry && goalMet(todayEntry, goal)) streak++;
  d = new Date(d.getTime() - 86400000);

  // Walk backward until a day without a qualifying entry.
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    const entry = vault.entries[iso];
    if (!entry || !goalMet(entry, goal)) break;
    streak++;
    d = new Date(d.getTime() - 86400000);
  }

  return streak;
}

// Per-date last-write-wins merge (by updatedAt). Returns a new vault; does not mutate inputs.
export function mergeVaults(a, b) {
  const merged = {
    version: Math.max(a.version || 1, b.version || 1),
    entries: {},
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
  };

  const allDates = new Set([...Object.keys(a.entries), ...Object.keys(b.entries)]);
  for (const date of allDates) {
    const ea = a.entries[date];
    const eb = b.entries[date];
    if (!ea) {
      merged.entries[date] = { ...eb };
    } else if (!eb) {
      merged.entries[date] = { ...ea };
    } else {
      // Both exist — newer updatedAt wins.
      merged.entries[date] = ea.updatedAt >= eb.updatedAt ? { ...ea } : { ...eb };
    }
  }

  return merged;
}
