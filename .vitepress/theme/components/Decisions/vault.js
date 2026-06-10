// Pure vault logic for the Decision Journal: no DOM, no crypto, no IndexedDB —
// fully unit-testable under Node 22. Mirrors Journal/vault.js (envelope-free pure
// model) and Planner/store.js (id-keyed last-write-wins merge with tombstones).
//
// A Decision records a choice made under uncertainty so it can be reviewed later and
// the author's confidence calibrated (see stats.js). Shape:
//   { id, title, context, options: string[], chosen, expectedOutcome,
//     confidence (0–100 int), reviewDate ('YYYY-MM-DD' | null),
//     outcome (null | 'correct' | 'wrong'), actualOutcome (''),
//     reviewedAt (null | ISO), deleted (false), createdAt (ISO), updatedAt (ISO) }

export function emptyVault() {
  return {
    version: 1,
    decisions: {},
    createdAt: new Date().toISOString(),
  };
}

// Short, collision-resistant enough for a single-user local app (mirrors Planner makeId).
export function makeDecisionId() {
  return crypto.randomUUID().slice(0, 8);
}

const VALID_OUTCOMES = new Set(['correct', 'wrong']);

// Clamp confidence to an integer 0–100. Non-finite → 50 (a coin-flip default).
export function clampConfidence(c) {
  const n = Math.round(Number(c));
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

// Create or edit a decision. Fields present on `decision` override the stored copy;
// missing fields fall back to the existing decision (partial edit) then to a default.
// createdAt is preserved across edits; updatedAt is always bumped to `now`.
// Returns the stored decision object.
export function upsertDecision(vault, decision, now = new Date().toISOString()) {
  const id = decision.id || makeDecisionId();
  const existing = vault.decisions[id];

  const stored = {
    id,
    title: decision.title ?? existing?.title ?? '',
    context: decision.context ?? existing?.context ?? '',
    options: Array.isArray(decision.options)
      ? [...decision.options]
      : existing?.options
        ? [...existing.options]
        : [],
    chosen: decision.chosen ?? existing?.chosen ?? '',
    expectedOutcome: decision.expectedOutcome ?? existing?.expectedOutcome ?? '',
    confidence: clampConfidence(decision.confidence ?? existing?.confidence ?? 50),
    reviewDate: decision.reviewDate !== undefined ? decision.reviewDate : (existing?.reviewDate ?? null),
    outcome: decision.outcome !== undefined ? decision.outcome : (existing?.outcome ?? null),
    actualOutcome: decision.actualOutcome ?? existing?.actualOutcome ?? '',
    reviewedAt: decision.reviewedAt !== undefined ? decision.reviewedAt : (existing?.reviewedAt ?? null),
    deleted: decision.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (decision.createdAt ?? now),
    updatedAt: now,
  };

  vault.decisions[id] = stored;
  return stored;
}

// Mark a decision reviewed: record the outcome (correct/wrong), the free-text actual
// outcome, the review timestamp, and bump updatedAt. Returns the decision, or null if
// the id is unknown. An invalid outcome is stored as null (keeps it in the review queue).
export function markReviewed(vault, id, outcome, actualOutcome = '', now = new Date().toISOString()) {
  const d = vault.decisions[id];
  if (!d) return null;
  d.outcome = VALID_OUTCOMES.has(outcome) ? outcome : null;
  d.actualOutcome = actualOutcome ?? '';
  d.reviewedAt = now;
  d.updatedAt = now;
  return d;
}

// Tombstone (deleted:true + bump updatedAt) rather than hard-delete — required so the LWW
// merge propagates the deletion to other devices/tabs instead of them resurrecting the id
// as "unknown" (absence ≠ deletion). Returns the decision, or undefined if id is unknown.
export function removeDecision(vault, id, now = new Date().toISOString()) {
  const d = vault.decisions[id];
  if (!d) return;
  d.deleted = true;
  d.updatedAt = now;
  return d;
}

// Decisions awaiting review: not deleted, not yet reviewed (outcome === null), with a
// reviewDate that has arrived (reviewDate <= todayISO). Sorted by reviewDate ascending
// (most overdue first). Equality on todayISO counts as due (boundary is inclusive).
export function dueForReview(vault, todayISO) {
  return Object.values(vault.decisions)
    .filter(d => !d.deleted && d.outcome == null && d.reviewDate && d.reviewDate <= todayISO)
    .sort((a, b) => (a.reviewDate < b.reviewDate ? -1 : a.reviewDate > b.reviewDate ? 1 : 0));
}

// All open (un-reviewed, not deleted) decisions, soonest review first; null reviewDate last.
export function openDecisions(vault) {
  return Object.values(vault.decisions)
    .filter(d => !d.deleted && d.outcome == null)
    .sort((a, b) => {
      const ra = a.reviewDate || '￿';
      const rb = b.reviewDate || '￿';
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
}

// All reviewed (outcome set, not deleted) decisions, most recently reviewed first.
export function reviewedDecisions(vault) {
  return Object.values(vault.decisions)
    .filter(d => !d.deleted && d.outcome != null)
    .sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
}

// Union-by-id last-write-wins merge (by updatedAt). Returns a NEW vault; does not mutate
// inputs. Deterministic, commutative, idempotent — safe for file sync / cross-tab merge,
// no CRDT needed. On equal updatedAt, `a` wins (stable, mirrors Journal mergeVaults).
export function mergeVaults(a, b) {
  const da = a.decisions || {};
  const db = b.decisions || {};
  const merged = {
    version: Math.max(a.version || 1, b.version || 1),
    decisions: {},
    createdAt: (a.createdAt || '￿') < (b.createdAt || '￿') ? a.createdAt : b.createdAt,
  };

  const allIds = new Set([...Object.keys(da), ...Object.keys(db)]);
  for (const id of allIds) {
    const ea = da[id];
    const eb = db[id];
    if (!ea) {
      merged.decisions[id] = { ...eb };
    } else if (!eb) {
      merged.decisions[id] = { ...ea };
    } else {
      merged.decisions[id] = (ea.updatedAt || '') >= (eb.updatedAt || '') ? { ...ea } : { ...eb };
    }
  }

  return merged;
}
