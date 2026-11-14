// @vitest-environment node
// Stage #1698, phase OL1: `measureBudget` and `collectGarbage` (`tests/support/perfReport.ts`) with the
// clock and the collector injected, without depending on real time.
import { describe, expect, it } from 'vitest';
import { collectGarbage, measureBudget } from '../support/perfReport';

/** Fake clock: each `run` advances `durations[i]`; `collect` advances `collectCost` outside the measure. */
function harness(durations: number[], collectCost = 0) {
  let clock = 0;
  let runIndex = 0;
  const events: string[] = [];
  let measuring = false;
  const now = (): number => {
    measuring = !measuring;
    return clock;
  };
  const run = (): void => {
    events.push('run');
    clock += durations[runIndex++ % durations.length] ?? 0;
  };
  const collect = (): void => {
    events.push(measuring ? 'collect-inside' : 'collect');
    clock += collectCost;
  };
  return { now, run, collect, events };
}

describe('measureBudget', () => {
  it('runs warmup + rounds × samples times and uses the defaults 10, 3 and 41', () => {
    const h = harness([1]);
    measureBudget(h.run, { now: h.now, collect: h.collect });
    expect(h.events.filter((e) => e === 'run')).toHaveLength(10 + 3 * 41);
    expect(h.events.filter((e) => e === 'collect')).toHaveLength(3 * 41);
  });

  it('collects once per sample, never in the warm-up nor inside the timing', () => {
    const h = harness([2], 100);
    const r = measureBudget(h.run, {
      warmup: 3,
      samples: 5,
      rounds: 1,
      now: h.now,
      collect: h.collect,
    });
    expect(h.events).toEqual([
      'run',
      'run',
      'run',
      ...Array.from({ length: 5 }, () => ['collect', 'run']).flat(),
    ]);
    expect(r.median).toBe(2);
  });

  it('returns the median and the quartiles of a known sample', () => {
    // 9 samples out of order: sorted 1..9; median = 5, p25 = [floor(8·0.25)] = 3, p75 = [6] = 7.
    const h = harness([9, 1, 5, 3, 7, 2, 8, 4, 6]);
    const r = measureBudget(h.run, {
      warmup: 0,
      samples: 9,
      rounds: 1,
      now: h.now,
      collect: h.collect,
    });
    expect(r).toEqual({ median: 5, p25: 3, p75: 7, medians: [5] });
  });

  // Stage #1698, phase CL1: under CPU contention the bad phase covered the 41 samples in a row and the
  // whole median went past 4 ms (11 to 20 ms in the runs under load of the full `test:perf`).
  // The measure now has `rounds` batches of `samples`; the smallest median among them counts.
  it('with several batches the smallest median counts: a whole batch in a bad phase does not count', () => {
    // 3 batches of 3 samples: the 1st under contention (10 ms), the 2nd clean (2 ms), the 3rd average (6 ms).
    const h = harness([10, 10, 10, 2, 2, 2, 6, 6, 6]);
    const r = measureBudget(h.run, {
      warmup: 0,
      samples: 3,
      rounds: 3,
      now: h.now,
      collect: h.collect,
    });
    expect(r.median).toBe(2);
    expect(r.medians).toEqual([10, 2, 6]);
  });

  it('the batches follow the order collect → clock → run and the warm-up only comes before the 1st', () => {
    const h = harness([1]);
    measureBudget(h.run, {
      warmup: 2,
      samples: 2,
      rounds: 2,
      now: h.now,
      collect: h.collect,
    });
    expect(h.events).toEqual([
      'run',
      'run',
      ...Array.from({ length: 4 }, () => ['collect', 'run']).flat(),
    ]);
  });

  it('the quartiles follow the batch of the smallest median', () => {
    // batch 1 (sorted 5,5,5): median 5; batch 2 (sorted 1,2,3): median 2, p25 = 1, p75 = 2.
    const h = harness([5, 5, 5, 3, 1, 2]);
    const r = measureBudget(h.run, {
      warmup: 0,
      samples: 3,
      rounds: 2,
      now: h.now,
      collect: h.collect,
    });
    expect(r).toEqual({ median: 2, p25: 1, p75: 2, medians: [5, 2] });
  });

  it('the warm-up does not enter the measure', () => {
    const h = harness([1000, 1000, 2, 2, 2]);
    const r = measureBudget(h.run, {
      warmup: 2,
      samples: 3,
      rounds: 1,
      now: h.now,
      collect: h.collect,
    });
    expect(r.median).toBe(2);
  });
});

describe('collectGarbage', () => {
  it('can be called without throwing an error', () => {
    expect(() => collectGarbage()).not.toThrow();
    expect(() => collectGarbage()).not.toThrow();
  });
});
