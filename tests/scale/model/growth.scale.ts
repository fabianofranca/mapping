import { describe, expect, it } from 'vitest';
import {
  GROWTH_LIMIT,
  GROWTH_OPTIONS,
  expectLinearGrowth,
  growthRetry,
  measureGrowth,
  measureGrowthAsync,
} from '../../support/growth';

// The growth helper with synthetic functions: the linear one passes and the quadratic one (double loop) fails on the ratio.
interface Work {
  readonly size: number;
}
const build = (n: number): Work => ({ size: n });

function linear(w: Work): number {
  let sum = 0;
  for (let i = 0; i < w.size * 400; i++) sum += i % 7;
  return sum;
}

/** Short linear (< 1 ms at n), the case that fluctuated most with sequential measurement. */
function shortLinear(w: Work): number {
  let sum = 0;
  for (let i = 0; i < w.size * 30; i++) sum += i % 7;
  return sum;
}

function quadratic(w: Work): number {
  let sum = 0;
  for (let i = 0; i < w.size * 4; i++) {
    for (let j = 0; j < w.size; j++) sum += (i + j) % 7;
  }
  return sum;
}

/** Fake clock and collector: time only moves when the test says so, so nothing depends on real time. */
function fakeEnvironment() {
  const state = { t: 0 };
  const log: string[] = [];
  return {
    state,
    log,
    now: () => {
      log.push('now');
      return state.t;
    },
    collect: () => {
      log.push('collect');
    },
  };
}

describe('growth helper', () => {
  it('the linear function passes (ratio close to 4×)', GROWTH_OPTIONS, () => {
    const result = expectLinearGrowth('synthetic linear', { build, run: linear });
    expect(result.ratio).toBeLessThan(GROWTH_LIMIT);
    expect(result.n).toBe(1250);
    expect(result.largeN).toBe(5000);
  });

  it('the short linear function (< 1 ms at n) passes', GROWTH_OPTIONS, () => {
    const result = expectLinearGrowth('synthetic short linear', {
      build,
      run: shortLinear,
    });
    expect(result.ratio).toBeLessThan(GROWTH_LIMIT);
  });

  it('the quadratic function fails on the ratio (close to 16×)', GROWTH_OPTIONS, () => {
    const result = measureGrowth({ build, run: quadratic });
    expect(result.ratio).toBeGreaterThan(GROWTH_LIMIT);
    expect(() =>
      expectLinearGrowth('synthetic quadratic', { build, run: quadratic }),
    ).toThrow();
  });

  it('the ceiling is 6×', () => {
    expect(GROWTH_LIMIT).toBe(6);
  });

  it('each run measures a new version of the project, at both sizes', () => {
    const seen = new Set<Work>();
    measureGrowth({
      build,
      run: (w) => {
        seen.add(w);
        return 0;
      },
      warmup: 1,
      runs: 3,
    });
    // (warmup + rounds) per size, all different objects
    expect(seen.size).toBe(8);
  });

  it('n and 4n are interleaved, with the order alternating per round', () => {
    const env = fakeEnvironment();
    const order: number[] = [];
    measureGrowth({
      build,
      run: (w) => {
        order.push(w.size);
        return 0;
      },
      warmup: 0,
      runs: 4,
      now: env.now,
      collect: env.collect,
    });
    expect(order).toEqual([1250, 5000, 5000, 1250, 1250, 5000, 5000, 1250]);
  });

  it('collects once per pair, outside the measured time', () => {
    const env = fakeEnvironment();
    measureGrowth({
      build,
      prepare: () => env.log.push('prepare'),
      run: () => env.log.push('run'),
      warmup: 0,
      runs: 2,
      now: env.now,
      collect: env.collect,
    });
    const pair = ['prepare', 'now', 'run', 'now', 'prepare', 'now', 'run', 'now'];
    expect(env.log).toEqual(['collect', ...pair, 'collect', ...pair]);
  });

  it('the warmup is the same at both sizes', () => {
    const count: Record<number, number> = { 1250: 0, 5000: 0 };
    measureGrowth({
      build,
      run: (w) => {
        count[w.size] = (count[w.size] ?? 0) + 1;
        return 0;
      },
      warmup: 25,
      runs: 3,
      collect: () => undefined,
    });
    expect(count).toEqual({ 1250: 28, 5000: 28 });
  });

  it('prepare runs right before its run and outside the measured time', () => {
    const env = fakeEnvironment();
    let prepared: Work | null = null;
    const result = measureGrowth({
      build,
      prepare: (w) => {
        prepared = w;
        env.state.t += 1000; // costly, but outside the measurement
      },
      run: (w) => {
        expect(prepared).toBe(w);
        env.state.t += w.size / 1250; // 1 ms at n, 4 ms at 4n
      },
      warmup: 2,
      runs: 5,
      now: env.now,
      collect: env.collect,
    });
    expect(result.smallMs).toBeCloseTo(1, 9);
    expect(result.largeMs).toBeCloseTo(4, 9);
    expect(result.ratio).toBeCloseTo(4, 9);
  });

  it('the ratio is the one of the medians of a known sample, with the quartiles of the pairwise ratios', () => {
    const env = fakeEnvironment();
    const durations: Record<number, number[]> = {
      1250: [1, 9, 2, 8, 3],
      5000: [4, 40, 5, 50, 6],
    };
    const next: Record<number, number> = { 1250: 0, 5000: 0 };
    const result = measureGrowth({
      build,
      run: (w) => {
        const list = durations[w.size] ?? [];
        env.state.t += list[next[w.size] ?? 0] ?? 0;
        next[w.size] = (next[w.size] ?? 0) + 1;
      },
      warmup: 0,
      runs: 5,
      now: env.now,
      collect: env.collect,
    });
    expect(result.smallMs).toBe(3);
    expect(result.largeMs).toBe(6);
    expect(result.ratio).toBe(2);
    // pairwise ratios: 4, 4.44, 2.5, 6.25, 2 → sorted: 2, 2.5, 4, 4.44, 6.25
    expect(result.ratioQ1).toBeCloseTo(2.5, 9);
    expect(result.ratioQ3).toBeCloseTo(40 / 9, 9);
  });

  it('the async version interleaves the same way, with prepare before each run', async () => {
    const env = fakeEnvironment();
    await measureGrowthAsync({
      build,
      prepare: async () => {
        env.log.push('prepare');
      },
      run: async () => {
        env.log.push('run');
      },
      warmup: 1,
      runs: 2,
      now: env.now,
      collect: env.collect,
    });
    const warm = ['prepare', 'run', 'prepare', 'run'];
    const pair = ['prepare', 'now', 'run', 'now', 'prepare', 'now', 'run', 'now'];
    expect(env.log).toEqual([...warm, 'collect', ...pair, 'collect', ...pair]);
  });
});

describe('growthRetry', () => {
  it('GROWTH_RETRY=0 turns the retry off', () => {
    expect(growthRetry({ GROWTH_RETRY: '0' })).toBe(0);
  });

  it('an integer from 0 to 9 is itself', () => {
    expect(growthRetry({ GROWTH_RETRY: '5' })).toBe(5);
  });

  it('absent is 2', () => {
    expect(growthRetry({})).toBe(2);
  });

  it('invalid is 2', () => {
    expect(growthRetry({ GROWTH_RETRY: 'x' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '-1' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '10' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '' })).toBe(2);
  });
});
