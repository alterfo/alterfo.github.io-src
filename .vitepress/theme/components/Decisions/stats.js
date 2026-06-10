// Pure calibration math for the Decision Journal: no DOM, no crypto, no IndexedDB —
// fully unit-testable under Node 22. Operates on a plain ARRAY of Decision objects (see
// vault.js for the shape). Only reviewed decisions (outcome === 'correct' | 'wrong')
// contribute to scoring; deleted tombstones are ignored everywhere.

const isLive = (d) => d && !d.deleted;
const isReviewed = (d) => isLive(d) && (d.outcome === 'correct' || d.outcome === 'wrong');

// Confidence as a clean 0–100 number (vault already clamps, but be defensive against
// raw/imported data — a missing/non-finite confidence is treated as a 50% coin-flip).
function confidenceOf(d) {
  return Number.isFinite(d.confidence) ? d.confidence : 50;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

// Brier score: mean squared error between the stated confidence (as a probability) and
// the realized outcome (correct → 1, wrong → 0), over reviewed decisions. 0 is perfect,
// 0.25 is a coin-flip (50% confidence with random results), 1 is maximally wrong-and-sure.
// Returns null when there are no reviewed decisions (nothing to score yet).
export function brierScore(decisions) {
  const reviewed = (decisions || []).filter(isReviewed);
  if (reviewed.length === 0) return null;
  const sum = reviewed.reduce((acc, d) => {
    const p = clamp01(confidenceOf(d) / 100);
    const o = d.outcome === 'correct' ? 1 : 0;
    const diff = p - o;
    return acc + diff * diff;
  }, 0);
  return sum / reviewed.length;
}

// Calibration table: group reviewed decisions by stated confidence into buckets and, per
// bucket, report how often the author was actually right (hitRate) vs. how confident they
// claimed to be (avgConfidence). A well-calibrated author has hitRate ≈ avgConfidence/100.
//
// `edges` are the upper bounds of the confidence buckets; an implicit 0 floor is prepended
// so confidences below the first edge land in a leading bucket (the user may state <50%
// confidence in the chosen option). Default edges [50,60,70,80,90,101] → buckets
// [0,50) [50,60) [60,70) [70,80) [80,90) [90,101) (the 101 makes 100% inclusive).
// A confidence c lands in bucket [lo,hi) when lo <= c < hi.
// Empty buckets report n:0, avgConfidence:null, hitRate:null (never NaN).
export function calibrationBuckets(decisions, edges = [50, 60, 70, 80, 90, 101]) {
  const reviewed = (decisions || []).filter(isReviewed);
  const bounds = [0, ...edges];
  const buckets = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    const inBucket = reviewed.filter((d) => {
      const c = confidenceOf(d);
      return c >= lo && c < hi;
    });
    const n = inBucket.length;
    const avgConfidence = n ? inBucket.reduce((a, d) => a + confidenceOf(d), 0) / n : null;
    const hits = inBucket.filter((d) => d.outcome === 'correct').length;
    const hitRate = n ? hits / n : null;
    buckets.push({
      label: `${lo}–${Math.min(hi, 100)}%`,
      n,
      avgConfidence,
      hitRate,
    });
  }
  return buckets;
}

// Headline counts for the stats panel. `total/open/reviewed` ignore deleted tombstones;
// `due` is the subset of open decisions whose reviewDate has arrived (reviewDate <= today,
// boundary inclusive). Pass todayISO ('YYYY-MM-DD'); omit it and `due` is reported as 0.
export function counts(decisions, todayISO) {
  const live = (decisions || []).filter(isLive);
  const open = live.filter((d) => d.outcome == null);
  const reviewed = live.filter((d) => d.outcome != null);
  const due = todayISO
    ? open.filter((d) => d.reviewDate && d.reviewDate <= todayISO)
    : [];
  return {
    total: live.length,
    open: open.length,
    due: due.length,
    reviewed: reviewed.length,
  };
}
