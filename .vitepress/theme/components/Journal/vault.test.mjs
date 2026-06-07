import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyVault,
  countWords,
  goalMet,
  upsertEntry,
  computeStreak,
  mergeVaults,
} from './vault.js';

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    assert.equal(countWords(''), 0);
  });

  it('returns 0 for whitespace-only', () => {
    assert.equal(countWords('   \n\t  '), 0);
  });

  it('returns 0 for null/undefined', () => {
    assert.equal(countWords(null), 0);
    assert.equal(countWords(undefined), 0);
  });

  it('counts single word', () => {
    assert.equal(countWords('hello'), 1);
  });

  it('counts multiple words with varied whitespace', () => {
    assert.equal(countWords('  hello   world  '), 2);
  });

  it('counts words with punctuation attached', () => {
    assert.equal(countWords('Hello, world! How are you?'), 5);
  });

  it('counts unicode words', () => {
    assert.equal(countWords('Привет мир'), 2);
  });

  it('handles newlines as whitespace', () => {
    assert.equal(countWords('one\ntwo\nthree'), 3);
  });
});

describe('goalMet', () => {
  it('returns false for null entry', () => {
    assert.equal(goalMet(null), false);
  });

  it('returns false when words < 500', () => {
    assert.equal(goalMet({ words: 499 }), false);
  });

  it('returns true when words === 500', () => {
    assert.equal(goalMet({ words: 500 }), true);
  });

  it('returns true when words > 500', () => {
    assert.equal(goalMet({ words: 600 }), true);
  });

  it('respects custom goal', () => {
    assert.equal(goalMet({ words: 100 }, 100), true);
    assert.equal(goalMet({ words: 99 }, 100), false);
  });
});

describe('upsertEntry', () => {
  it('creates a new entry with correct words and timestamps', () => {
    const vault = emptyVault();
    const now = '2026-06-08T10:00:00.000Z';
    upsertEntry(vault, '2026-06-08', 'Hello world', now);
    const e = vault.entries['2026-06-08'];
    assert.equal(e.text, 'Hello world');
    assert.equal(e.words, 2);
    assert.equal(e.createdAt, now);
    assert.equal(e.updatedAt, now);
  });

  it('preserves createdAt on update, updates updatedAt', () => {
    const vault = emptyVault();
    const t1 = '2026-06-08T10:00:00.000Z';
    const t2 = '2026-06-08T11:00:00.000Z';
    upsertEntry(vault, '2026-06-08', 'First version', t1);
    upsertEntry(vault, '2026-06-08', 'Second longer version here', t2);
    const e = vault.entries['2026-06-08'];
    assert.equal(e.createdAt, t1);
    assert.equal(e.updatedAt, t2);
    assert.equal(e.words, 4);
  });

  it('returns the vault', () => {
    const vault = emptyVault();
    const result = upsertEntry(vault, '2026-06-08', 'test');
    assert.equal(result, vault);
  });
});

describe('computeStreak', () => {
  function makeVault(days) {
    // days: array of { date, words }
    const vault = emptyVault();
    for (const { date, words, updatedAt } of days) {
      const text = 'word '.repeat(words).trim();
      vault.entries[date] = {
        text,
        words,
        createdAt: updatedAt || `${date}T10:00:00.000Z`,
        updatedAt: updatedAt || `${date}T10:00:00.000Z`,
      };
    }
    return vault;
  }

  it('returns 0 when vault is empty', () => {
    const vault = emptyVault();
    assert.equal(computeStreak(vault, '2026-06-08'), 0);
  });

  it('counts today if goal met', () => {
    const vault = makeVault([{ date: '2026-06-08', words: 500 }]);
    assert.equal(computeStreak(vault, '2026-06-08'), 1);
  });

  it('does not break prior streak when today sub-goal', () => {
    const vault = makeVault([
      { date: '2026-06-06', words: 500 },
      { date: '2026-06-07', words: 500 },
      { date: '2026-06-08', words: 100 }, // today, not yet met
    ]);
    // today doesn't count, but yesterday and the day before do
    assert.equal(computeStreak(vault, '2026-06-08'), 2);
  });

  it('a gap in prior days breaks the streak', () => {
    const vault = makeVault([
      { date: '2026-06-05', words: 500 },
      // gap: June 6 missing
      { date: '2026-06-07', words: 500 },
      { date: '2026-06-08', words: 500 },
    ]);
    assert.equal(computeStreak(vault, '2026-06-08'), 2);
  });

  it('sub-goal days do not count in streak', () => {
    const vault = makeVault([
      { date: '2026-06-06', words: 500 },
      { date: '2026-06-07', words: 300 }, // sub-goal — breaks streak
      { date: '2026-06-08', words: 500 },
    ]);
    assert.equal(computeStreak(vault, '2026-06-08'), 1);
  });

  it('counts a multi-day streak correctly', () => {
    const vault = makeVault([
      { date: '2026-06-04', words: 500 },
      { date: '2026-06-05', words: 600 },
      { date: '2026-06-06', words: 500 },
      { date: '2026-06-07', words: 700 },
      { date: '2026-06-08', words: 500 },
    ]);
    assert.equal(computeStreak(vault, '2026-06-08'), 5);
  });
});

describe('mergeVaults', () => {
  function entry(text, updatedAt, createdAt) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { text, words, createdAt: createdAt || updatedAt, updatedAt };
  }

  it('union of dates: includes all dates from both vaults', () => {
    const a = emptyVault();
    a.entries['2026-06-06'] = entry('from a', '2026-06-06T10:00:00.000Z');
    const b = emptyVault();
    b.entries['2026-06-07'] = entry('from b', '2026-06-07T10:00:00.000Z');
    const merged = mergeVaults(a, b);
    assert.ok(merged.entries['2026-06-06']);
    assert.ok(merged.entries['2026-06-07']);
  });

  it('newer updatedAt wins for shared date', () => {
    const a = emptyVault();
    a.entries['2026-06-08'] = entry('older version', '2026-06-08T09:00:00.000Z');
    const b = emptyVault();
    b.entries['2026-06-08'] = entry('newer version', '2026-06-08T11:00:00.000Z');
    const merged = mergeVaults(a, b);
    assert.equal(merged.entries['2026-06-08'].text, 'newer version');
  });

  it('equal updatedAt: a wins (stable)', () => {
    const ts = '2026-06-08T10:00:00.000Z';
    const a = emptyVault();
    a.entries['2026-06-08'] = entry('version a', ts);
    const b = emptyVault();
    b.entries['2026-06-08'] = entry('version b', ts);
    const merged = mergeVaults(a, b);
    assert.equal(merged.entries['2026-06-08'].text, 'version a');
  });

  it('no data loss: all entries preserved', () => {
    const a = emptyVault();
    for (let i = 1; i <= 5; i++) {
      a.entries[`2026-06-0${i}`] = entry(`day ${i}`, `2026-06-0${i}T10:00:00.000Z`);
    }
    const b = emptyVault();
    for (let i = 6; i <= 9; i++) {
      b.entries[`2026-06-0${i}`] = entry(`day ${i}`, `2026-06-0${i}T10:00:00.000Z`);
    }
    const merged = mergeVaults(a, b);
    assert.equal(Object.keys(merged.entries).length, 9);
  });

  it('idempotent: merging vault with itself returns equivalent result', () => {
    const a = emptyVault();
    a.entries['2026-06-08'] = entry('hello world', '2026-06-08T10:00:00.000Z');
    const merged = mergeVaults(a, a);
    assert.equal(merged.entries['2026-06-08'].text, 'hello world');
    assert.equal(Object.keys(merged.entries).length, 1);
  });

  it('does not mutate inputs', () => {
    const a = emptyVault();
    a.entries['2026-06-08'] = entry('original', '2026-06-08T10:00:00.000Z');
    const b = emptyVault();
    b.entries['2026-06-08'] = entry('newer', '2026-06-08T12:00:00.000Z');
    mergeVaults(a, b);
    assert.equal(a.entries['2026-06-08'].text, 'original');
    assert.equal(b.entries['2026-06-08'].text, 'newer');
  });

  it('uses earliest createdAt for the merged vault', () => {
    const a = emptyVault();
    a.createdAt = '2026-06-01T00:00:00.000Z';
    const b = emptyVault();
    b.createdAt = '2026-06-05T00:00:00.000Z';
    const merged = mergeVaults(a, b);
    assert.equal(merged.createdAt, '2026-06-01T00:00:00.000Z');
  });
});
