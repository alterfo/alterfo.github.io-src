import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { brierScore, calibrationBuckets, counts } from './stats.js';

// Minimal Decision factory for the pure stats functions (only the fields they read).
function dec({ confidence = 50, outcome = null, reviewDate = null, deleted = false } = {}) {
  return { confidence, outcome, reviewDate, deleted };
}

describe('brierScore', () => {
  it('returns null when there are no reviewed decisions', () => {
    assert.equal(brierScore([]), null);
    assert.equal(brierScore([dec({ confidence: 80, outcome: null })]), null);
    assert.equal(brierScore(undefined), null);
  });

  it('100% confidence + correct → 0 (perfect)', () => {
    assert.equal(brierScore([dec({ confidence: 100, outcome: 'correct' })]), 0);
  });

  it('100% confidence + wrong → 1 (maximally wrong-and-sure)', () => {
    assert.equal(brierScore([dec({ confidence: 100, outcome: 'wrong' })]), 1);
  });

  it('50% confidence → 0.25 regardless of outcome (coin-flip)', () => {
    assert.equal(brierScore([dec({ confidence: 50, outcome: 'correct' })]), 0.25);
    assert.equal(brierScore([dec({ confidence: 50, outcome: 'wrong' })]), 0.25);
  });

  it('averages the per-decision squared error', () => {
    // 80% correct → (0.8-1)^2 = 0.04 ; 80% wrong → (0.8-0)^2 = 0.64 ; mean = 0.34
    const score = brierScore([
      dec({ confidence: 80, outcome: 'correct' }),
      dec({ confidence: 80, outcome: 'wrong' }),
    ]);
    assert.ok(Math.abs(score - 0.34) < 1e-9);
  });

  it('ignores open and deleted decisions', () => {
    const score = brierScore([
      dec({ confidence: 100, outcome: 'correct' }),
      dec({ confidence: 100, outcome: 'wrong', deleted: true }), // tombstone — excluded
      dec({ confidence: 100, outcome: null }), // open — excluded
    ]);
    assert.equal(score, 0); // only the single live reviewed (correct) counts
  });

  it('treats a non-finite confidence as 50%', () => {
    assert.equal(brierScore([dec({ confidence: NaN, outcome: 'correct' })]), 0.25);
  });
});

describe('calibrationBuckets', () => {
  it('returns six buckets with the default edges and human labels', () => {
    const buckets = calibrationBuckets([]);
    assert.equal(buckets.length, 6);
    assert.deepEqual(
      buckets.map((b) => b.label),
      ['0–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'],
    );
  });

  it('empty buckets report n:0 with null (not NaN) avgConfidence/hitRate', () => {
    for (const b of calibrationBuckets([])) {
      assert.equal(b.n, 0);
      assert.equal(b.avgConfidence, null);
      assert.equal(b.hitRate, null);
      assert.ok(!Number.isNaN(b.avgConfidence));
      assert.ok(!Number.isNaN(b.hitRate));
    }
  });

  it('places a confidence in [lo,hi): upper boundary belongs to the next bucket', () => {
    // 60 → [60,70), not [50,60) ; 70 → [70,80) ; 100 → [90,100] (hi=101)
    const buckets = calibrationBuckets([
      dec({ confidence: 60, outcome: 'correct' }),
      dec({ confidence: 70, outcome: 'correct' }),
      dec({ confidence: 100, outcome: 'correct' }),
    ]);
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]));
    assert.equal(byLabel['50–60%'].n, 0);
    assert.equal(byLabel['60–70%'].n, 1);
    assert.equal(byLabel['70–80%'].n, 1);
    assert.equal(byLabel['90–100%'].n, 1);
  });

  it('puts sub-50% confidence into the leading 0–50 bucket', () => {
    const buckets = calibrationBuckets([
      dec({ confidence: 20, outcome: 'wrong' }),
      dec({ confidence: 49, outcome: 'correct' }),
    ]);
    const lead = buckets.find((b) => b.label === '0–50%');
    assert.equal(lead.n, 2);
    assert.equal(lead.avgConfidence, 34.5);
    assert.equal(lead.hitRate, 0.5);
  });

  it('computes avgConfidence and hitRate per bucket', () => {
    const buckets = calibrationBuckets([
      dec({ confidence: 72, outcome: 'correct' }),
      dec({ confidence: 78, outcome: 'wrong' }),
      dec({ confidence: 75, outcome: 'correct' }),
    ]);
    const b = buckets.find((x) => x.label === '70–80%');
    assert.equal(b.n, 3);
    assert.equal(b.avgConfidence, 75); // (72+78+75)/3
    assert.ok(Math.abs(b.hitRate - 2 / 3) < 1e-9);
  });

  it('ignores open and deleted decisions', () => {
    const buckets = calibrationBuckets([
      dec({ confidence: 95, outcome: 'correct' }),
      dec({ confidence: 95, outcome: null }), // open
      dec({ confidence: 95, outcome: 'wrong', deleted: true }), // tombstone
    ]);
    const b = buckets.find((x) => x.label === '90–100%');
    assert.equal(b.n, 1);
    assert.equal(b.hitRate, 1);
  });

  it('honors custom edges', () => {
    const buckets = calibrationBuckets([dec({ confidence: 30, outcome: 'correct' })], [40, 70, 101]);
    assert.deepEqual(buckets.map((b) => b.label), ['0–40%', '40–70%', '70–100%']);
    assert.equal(buckets[0].n, 1);
  });
});

describe('counts', () => {
  it('counts total/open/reviewed, ignoring deleted tombstones', () => {
    const decisions = [
      dec({ outcome: null, reviewDate: '2026-06-01' }),
      dec({ outcome: null, reviewDate: '2026-08-01' }),
      dec({ outcome: 'correct' }),
      dec({ outcome: 'wrong', deleted: true }), // tombstone — excluded everywhere
    ];
    const c = counts(decisions, '2026-06-10');
    assert.equal(c.total, 3);
    assert.equal(c.open, 2);
    assert.equal(c.reviewed, 1);
  });

  it('due = open decisions whose reviewDate has arrived (boundary inclusive)', () => {
    const decisions = [
      dec({ outcome: null, reviewDate: '2026-06-01' }), // overdue
      dec({ outcome: null, reviewDate: '2026-06-10' }), // today — inclusive
      dec({ outcome: null, reviewDate: '2026-07-01' }), // future
      dec({ outcome: null, reviewDate: null }), // no date
    ];
    assert.equal(counts(decisions, '2026-06-10').due, 2);
  });

  it('reports due:0 when no todayISO is given', () => {
    const decisions = [dec({ outcome: null, reviewDate: '2026-06-01' })];
    assert.equal(counts(decisions).due, 0);
  });

  it('handles an empty/undefined input', () => {
    assert.deepEqual(counts([], '2026-06-10'), { total: 0, open: 0, due: 0, reviewed: 0 });
    assert.deepEqual(counts(undefined), { total: 0, open: 0, due: 0, reviewed: 0 });
  });
});
