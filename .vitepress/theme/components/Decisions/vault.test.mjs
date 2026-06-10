import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyVault,
  makeDecisionId,
  clampConfidence,
  upsertDecision,
  markReviewed,
  removeDecision,
  dueForReview,
  openDecisions,
  reviewedDecisions,
  mergeVaults,
} from './vault.js';

describe('emptyVault', () => {
  it('has version 1, empty decisions, an ISO createdAt', () => {
    const v = emptyVault();
    assert.equal(v.version, 1);
    assert.deepEqual(v.decisions, {});
    assert.ok(!Number.isNaN(Date.parse(v.createdAt)));
  });
});

describe('makeDecisionId', () => {
  it('returns an 8-char id', () => {
    const id = makeDecisionId();
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 8);
  });
});

describe('clampConfidence', () => {
  it('rounds to an int and clamps to 0–100', () => {
    assert.equal(clampConfidence(70.4), 70);
    assert.equal(clampConfidence(70.6), 71);
    assert.equal(clampConfidence(-5), 0);
    assert.equal(clampConfidence(150), 100);
  });

  it('falls back to 50 for non-finite input', () => {
    assert.equal(clampConfidence(NaN), 50);
    assert.equal(clampConfidence(undefined), 50);
    assert.equal(clampConfidence('abc'), 50);
  });
});

describe('upsertDecision', () => {
  it('creates a new decision with a generated id and defaults', () => {
    const v = emptyVault();
    const now = '2026-06-10T10:00:00.000Z';
    const d = upsertDecision(
      v,
      { title: 'Switch DB', confidence: 70, reviewDate: '2026-07-10' },
      now,
    );
    assert.equal(typeof d.id, 'string');
    assert.equal(d.title, 'Switch DB');
    assert.equal(d.confidence, 70);
    assert.equal(d.reviewDate, '2026-07-10');
    assert.equal(d.outcome, null);
    assert.equal(d.actualOutcome, '');
    assert.equal(d.reviewedAt, null);
    assert.equal(d.deleted, false);
    assert.deepEqual(d.options, []);
    assert.equal(d.createdAt, now);
    assert.equal(d.updatedAt, now);
    assert.equal(v.decisions[d.id], d);
  });

  it('copies the options array (no shared reference)', () => {
    const v = emptyVault();
    const opts = ['a', 'b'];
    const d = upsertDecision(v, { title: 'x', options: opts }, '2026-06-10T10:00:00.000Z');
    opts.push('c');
    assert.deepEqual(d.options, ['a', 'b']);
  });

  it('clamps confidence to an int', () => {
    const v = emptyVault();
    const d = upsertDecision(v, { title: 'x', confidence: 72.8 }, '2026-06-10T10:00:00.000Z');
    assert.equal(d.confidence, 73);
  });

  it('edits an existing decision: preserves createdAt, bumps updatedAt', () => {
    const v = emptyVault();
    const t1 = '2026-06-10T10:00:00.000Z';
    const t2 = '2026-06-11T10:00:00.000Z';
    const created = upsertDecision(v, { title: 'first', confidence: 60 }, t1);
    const edited = upsertDecision(v, { id: created.id, title: 'second', confidence: 80 }, t2);
    assert.equal(edited.id, created.id);
    assert.equal(edited.title, 'second');
    assert.equal(edited.confidence, 80);
    assert.equal(edited.createdAt, t1);
    assert.equal(edited.updatedAt, t2);
    assert.equal(Object.keys(v.decisions).length, 1);
  });

  it('partial edit keeps unspecified fields from the existing decision', () => {
    const v = emptyVault();
    const t1 = '2026-06-10T10:00:00.000Z';
    const created = upsertDecision(
      v,
      { title: 'keep', context: 'ctx', confidence: 65, reviewDate: '2026-07-01' },
      t1,
    );
    const edited = upsertDecision(v, { id: created.id, confidence: 90 }, '2026-06-12T10:00:00.000Z');
    assert.equal(edited.title, 'keep');
    assert.equal(edited.context, 'ctx');
    assert.equal(edited.reviewDate, '2026-07-01');
    assert.equal(edited.confidence, 90);
  });
});

describe('markReviewed', () => {
  it('records outcome, actualOutcome, reviewedAt, and bumps updatedAt', () => {
    const v = emptyVault();
    const d = upsertDecision(v, { title: 'x', confidence: 70 }, '2026-06-10T10:00:00.000Z');
    const now = '2026-07-10T10:00:00.000Z';
    const r = markReviewed(v, d.id, 'correct', 'it worked', now);
    assert.equal(r.outcome, 'correct');
    assert.equal(r.actualOutcome, 'it worked');
    assert.equal(r.reviewedAt, now);
    assert.equal(r.updatedAt, now);
  });

  it('returns null for an unknown id', () => {
    const v = emptyVault();
    assert.equal(markReviewed(v, 'nope', 'correct'), null);
  });

  it('stores an invalid outcome as null', () => {
    const v = emptyVault();
    const d = upsertDecision(v, { title: 'x' }, '2026-06-10T10:00:00.000Z');
    const r = markReviewed(v, d.id, 'maybe', '', '2026-07-10T10:00:00.000Z');
    assert.equal(r.outcome, null);
  });
});

describe('removeDecision', () => {
  it('tombstones (deleted:true) and bumps updatedAt, never hard-deletes', () => {
    const v = emptyVault();
    const t1 = '2026-06-10T10:00:00.000Z';
    const d = upsertDecision(v, { title: 'x' }, t1);
    const t2 = '2026-06-11T10:00:00.000Z';
    removeDecision(v, d.id, t2);
    assert.equal(v.decisions[d.id].deleted, true);
    assert.equal(v.decisions[d.id].updatedAt, t2);
    assert.equal(Object.keys(v.decisions).length, 1);
  });

  it('is a no-op for an unknown id', () => {
    const v = emptyVault();
    assert.equal(removeDecision(v, 'nope'), undefined);
  });
});

describe('dueForReview', () => {
  function seed() {
    const v = emptyVault();
    upsertDecision(v, { id: 'past', title: 'past', reviewDate: '2026-06-01' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'today', title: 'today', reviewDate: '2026-06-10' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'future', title: 'future', reviewDate: '2026-07-01' }, '2026-05-01T00:00:00.000Z');
    return v;
  }

  it('includes past and today (boundary inclusive), excludes future', () => {
    const v = seed();
    const due = dueForReview(v, '2026-06-10').map(d => d.id);
    assert.deepEqual(due, ['past', 'today']); // sorted by reviewDate ascending
  });

  it('excludes already-reviewed decisions', () => {
    const v = seed();
    markReviewed(v, 'past', 'correct', '', '2026-06-02T00:00:00.000Z');
    const due = dueForReview(v, '2026-06-10').map(d => d.id);
    assert.deepEqual(due, ['today']);
  });

  it('excludes deleted (tombstoned) decisions', () => {
    const v = seed();
    removeDecision(v, 'today', '2026-06-09T00:00:00.000Z');
    const due = dueForReview(v, '2026-06-10').map(d => d.id);
    assert.deepEqual(due, ['past']);
  });

  it('excludes decisions with no reviewDate', () => {
    const v = emptyVault();
    upsertDecision(v, { id: 'nodate', title: 'x', reviewDate: null }, '2026-05-01T00:00:00.000Z');
    assert.deepEqual(dueForReview(v, '2026-06-10'), []);
  });
});

describe('openDecisions / reviewedDecisions', () => {
  it('openDecisions excludes reviewed and deleted, sorts by reviewDate (null last)', () => {
    const v = emptyVault();
    upsertDecision(v, { id: 'b', title: 'b', reviewDate: '2026-08-01' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'a', title: 'a', reviewDate: '2026-07-01' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'n', title: 'n', reviewDate: null }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'r', title: 'r', reviewDate: '2026-06-01' }, '2026-05-01T00:00:00.000Z');
    markReviewed(v, 'r', 'correct', '', '2026-06-02T00:00:00.000Z');
    upsertDecision(v, { id: 'd', title: 'd', reviewDate: '2026-06-15' }, '2026-05-01T00:00:00.000Z');
    removeDecision(v, 'd', '2026-06-03T00:00:00.000Z');
    const open = openDecisions(v).map(d => d.id);
    assert.deepEqual(open, ['a', 'b', 'n']);
  });

  it('reviewedDecisions includes only reviewed, most recent first', () => {
    const v = emptyVault();
    upsertDecision(v, { id: 'open', title: 'open' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'old', title: 'old' }, '2026-05-01T00:00:00.000Z');
    upsertDecision(v, { id: 'new', title: 'new' }, '2026-05-01T00:00:00.000Z');
    markReviewed(v, 'old', 'wrong', '', '2026-06-01T00:00:00.000Z');
    markReviewed(v, 'new', 'correct', '', '2026-06-09T00:00:00.000Z');
    const reviewed = reviewedDecisions(v).map(d => d.id);
    assert.deepEqual(reviewed, ['new', 'old']);
  });
});

describe('mergeVaults', () => {
  it('union by id: includes ids unique to each vault', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'x' }, '2026-06-01T00:00:00.000Z');
    const b = emptyVault();
    upsertDecision(b, { id: 'y', title: 'y' }, '2026-06-02T00:00:00.000Z');
    const m = mergeVaults(a, b);
    assert.ok(m.decisions['x']);
    assert.ok(m.decisions['y']);
  });

  it('LWW: newer updatedAt wins on a shared id', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'older' }, '2026-06-01T00:00:00.000Z');
    const b = emptyVault();
    upsertDecision(b, { id: 'x', title: 'newer' }, '2026-06-05T00:00:00.000Z');
    assert.equal(mergeVaults(a, b).decisions['x'].title, 'newer');
    assert.equal(mergeVaults(b, a).decisions['x'].title, 'newer');
  });

  it('a tombstone with a newer updatedAt wins over a live older copy', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'live' }, '2026-06-01T00:00:00.000Z');
    const b = emptyVault();
    upsertDecision(b, { id: 'x', title: 'live' }, '2026-06-01T00:00:00.000Z');
    removeDecision(b, 'x', '2026-06-05T00:00:00.000Z');
    assert.equal(mergeVaults(a, b).decisions['x'].deleted, true);
  });

  it('is commutative (same result regardless of argument order)', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'A' }, '2026-06-03T00:00:00.000Z');
    upsertDecision(a, { id: 'shared', title: 'a-old' }, '2026-06-01T00:00:00.000Z');
    const b = emptyVault();
    upsertDecision(b, { id: 'y', title: 'B' }, '2026-06-04T00:00:00.000Z');
    upsertDecision(b, { id: 'shared', title: 'b-new' }, '2026-06-09T00:00:00.000Z');
    const ab = mergeVaults(a, b);
    const ba = mergeVaults(b, a);
    assert.deepEqual(ab.decisions, ba.decisions);
    assert.equal(ab.decisions['shared'].title, 'b-new');
  });

  it('is idempotent: merging a vault with itself is equivalent', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'x' }, '2026-06-01T00:00:00.000Z');
    const m = mergeVaults(a, a);
    assert.equal(Object.keys(m.decisions).length, 1);
    assert.equal(m.decisions['x'].title, 'x');
  });

  it('does not mutate inputs', () => {
    const a = emptyVault();
    upsertDecision(a, { id: 'x', title: 'original' }, '2026-06-01T00:00:00.000Z');
    const b = emptyVault();
    upsertDecision(b, { id: 'x', title: 'newer' }, '2026-06-05T00:00:00.000Z');
    mergeVaults(a, b);
    assert.equal(a.decisions['x'].title, 'original');
    assert.equal(b.decisions['x'].title, 'newer');
  });

  it('uses the earliest createdAt for the merged vault', () => {
    const a = emptyVault();
    a.createdAt = '2026-06-01T00:00:00.000Z';
    const b = emptyVault();
    b.createdAt = '2026-06-05T00:00:00.000Z';
    assert.equal(mergeVaults(a, b).createdAt, '2026-06-01T00:00:00.000Z');
  });
});
