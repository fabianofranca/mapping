import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { expect } from 'vitest';

/**
 * Checks a time budget and prints the measure with `console.info`, to record the baseline
 * and compare later (`npm run test:perf`). The limit does not change: the `expect` is the same as before.
 * `label` tells apart the measures of the same test; the test name goes along.
 */
export function expectBelow(value: number, limit: number, label?: string): void {
  const test = expect.getState().currentTestName ?? '';
  const name = label === undefined ? test : `${test} › ${label}`;
  console.info(`[perf] ${name}: ${value.toFixed(3)} ms (limit ${limit} ms)`);
  expect(value, label).toBeLessThan(limit);
}

let gcFunction: (() => void) | undefined;

/**
 * Forces a garbage collection, so it does not fall inside a time sample (stage #1698).
 * Uses `globalThis.gc` when it exists; otherwise turns on `--expose-gc` at run time
 * (`v8.setFlagsFromString`) and gets the function with `vm.runInNewContext('gc')`, only once.
 * The `execArgv: ['--expose-gc']` of #1095 does not work: the `perf-app` project runs in `vmThreads`
 * (worker threads), and Node refuses V8 flags in the `execArgv` of a worker
 * (`ERR_WORKER_INVALID_EXEC_ARGV`).
 */
export function collectGarbage(): void {
  if (gcFunction === undefined) {
    const existing = (globalThis as { gc?: unknown }).gc;
    if (typeof existing === 'function') {
      gcFunction = existing as () => void;
    } else {
      setFlagsFromString('--expose-gc');
      const created: unknown = runInNewContext('gc');
      gcFunction =
        typeof created === 'function' ? (created as () => void) : () => undefined;
    }
  }
  gcFunction();
}

export interface BudgetOptions {
  warmup?: number;
  samples?: number;
  rounds?: number;
  now?: () => number;
  collect?: () => void;
}

export interface BudgetMeasure {
  /** Smallest median among the batches: it is the one that counts for the limit. */
  median: number;
  /** Quartiles of the batch that gave the smallest median (only for the record). */
  p25: number;
  p75: number;
  /** The median of each batch, in the order they ran (only for the record). */
  medians: number[];
}

/**
 * Measures `run` for a tight time budget (stage #1698): `warmup` unmeasured runs
 * (10 by default) and `rounds` batches (3) of `samples` samples (41; always odd). At each sample,
 * `collect()` outside the timing (gc by default) before reading the clock. Instantiating and drawing in Konva
 * allocates a lot, and the time tail came from collections and CPU contention inside the samples. Under
 * contention, the bad phase of the runner covered the 41 samples in a row and the median of a single batch only went past
 * 4 ms (phase CL1); so the smallest median among the batches counts, which follows the cost of the
 * code and not the phase of the machine (a real regression raises all of them). For the limit the `median` counts; the
 * quartiles and `medians` serve only for the record.
 */
export function measureBudget(
  run: () => void,
  options: BudgetOptions = {},
): BudgetMeasure {
  const {
    warmup = 10,
    samples = 41,
    rounds = 3,
    now = () => performance.now(),
    collect = collectGarbage,
  } = options;
  for (let i = 0; i < warmup; i++) run();
  const batches: BudgetMeasure[] = [];
  for (let r = 0; r < rounds; r++) {
    const times: number[] = [];
    for (let i = 0; i < samples; i++) {
      collect();
      const start = now();
      run();
      times.push(now() - start);
    }
    times.sort((a, b) => a - b);
    const at = (q: number): number =>
      times[Math.floor((times.length - 1) * q)] ?? Number.NaN;
    batches.push({ median: at(0.5), p25: at(0.25), p75: at(0.75), medians: [] });
  }
  const medians = batches.map((b) => b.median);
  const best = batches.reduce((a, b) => (b.median < a.median ? b : a));
  return { median: best.median, p25: best.p25, p75: best.p75, medians };
}
