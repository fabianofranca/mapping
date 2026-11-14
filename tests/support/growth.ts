import { expect } from 'vitest';

/**
 * Growth test (#881, #882, stage #1095): measures the same operation with n and 4n markings and requires the ratio
 * of the medians < 6×. The helper serves the cases of `npm run test:scale` and the growth cases of
 * `npm run test:perf` (`tests/model/performance.test.ts`; `tests/mcp/batchPerf.test.ts` only reads the limit).
 *
 * Why 6×: with the stable measurement (n and 4n interleaved, see below), linear code measures 4.4 to 5.1× at these
 * sizes (1,250 and 5,000 markings), because of a memory effect, not noise: 5,000 markings fall out of the cache and
 * 1,250 do not (`projectIndex` alone, Maps of 5,000 keys, gives ~5×). The quadratic one measures 13 to 17×. The 6× limit
 * separates the two by more than 2.5× and leaves at least 0.8× of slack to every linear case today.
 * The ratio is not negotiable: going over the limit is a defect, not a limit to raise; 6× is the limit calibrated by the measurement, not
 * an adjustment to one case. A case with its center at 5× or more is "documented" in the case itself (where the excess comes from).
 *
 * How it measures: after an equal warm-up at both sizes, each round collects garbage once (`globalThis.gc`,
 * outside the timing) and runs **one** execution at n and **one** at 4n, in alternating order per round, each run on
 * a fresh version of the project and with its `prepare` immediately before, outside the timing. This way both sizes
 * see on average the same heap and cache state; repeating `k` times in a batch raised the center and was discarded.
 */
export const GROWTH_LIMIT = 6;
/** Default sizes: 1,250 and 5,000 markings. */
export const GROWTH_N = 1250;
export const GROWTH_FACTOR = 4;

/**
 * The retry, from `GROWTH_RETRY` (`0` turns it off; an integer from 0 to 9 is itself; absent or invalid is 2). Pure function
 * exported because `GROWTH_OPTIONS` is evaluated at import. With the interleaved measurement, the retry is a net for the
 * noisy shared runner, not for "operations of a few ms that oscillate"; acceptance runs with `GROWTH_RETRY=0`.
 */
export function growthRetry(env: Record<string, string | undefined>): number {
  const raw = env.GROWTH_RETRY;
  return raw !== undefined && /^[0-9]$/.test(raw) ? Number(raw) : 2;
}

export const GROWTH_OPTIONS = { retry: growthRetry(process.env) };

export interface GrowthResult {
  readonly n: number;
  readonly largeN: number;
  readonly smallMs: number;
  readonly largeMs: number;
  /** Ratio of the medians. */
  readonly ratio: number;
  /** Lower and upper quartiles of the 4n/n ratios of each pair (the real slack, for the log). */
  readonly ratioQ1: number;
  readonly ratioQ3: number;
}

/** Injectable clock and collector, only for the tests of the helper itself. */
interface MeasureHooks {
  /** Clock in ms. Default `performance.now`. */
  readonly now?: () => number;
  /** Garbage collection before each pair. Default `globalThis.gc` (without `--expose-gc`, it does not collect). */
  readonly collect?: () => void;
}

export interface GrowthOptions<P extends object> extends MeasureHooks {
  /** Builds the project (or what the operation reads) with `n` markings. */
  readonly build: (n: number) => P;
  /** The measured operation; always receives a fresh version (`{ ...p }`) so it does not measure the `projectIndex` memo. */
  readonly run: (p: P) => unknown;
  /** Optional: runs on each fresh version immediately before `run`, outside the timing (e.g. the index, which another case already measures). */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  /** Warm-up rounds (JIT), equal at both sizes. Default 24. */
  readonly warmup?: number;
  /** Measured rounds per size. Default 21 (the median of few rounds oscillates at sizes of a few ms). */
  readonly runs?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function quartile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * q)] ?? 0;
}

function defaultCollect(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

/** Indices (0 = n, 1 = 4n) of round `r`: even pairs n then 4n, odd pairs 4n then n. */
function pairOrder(r: number): readonly [0 | 1, 0 | 1] {
  return r % 2 === 0 ? [0, 1] : [1, 0];
}

function summarize(
  n: number,
  largeN: number,
  small: number[],
  large: number[],
): GrowthResult {
  const smallMs = median(small);
  const largeMs = median(large);
  const pairRatios = small.map((s, i) => (large[i] ?? 0) / Math.max(s, 1e-6));
  return {
    n,
    largeN,
    smallMs,
    largeMs,
    ratio: largeMs / Math.max(smallMs, 1e-6),
    ratioQ1: quartile(pairRatios, 0.25),
    ratioQ3: quartile(pairRatios, 0.75),
  };
}

/** Measures n and 4n: warms up equally at both, interleaves one pair per round (gc before, alternating order) and gives the ratio of the medians. */
export function measureGrowth<P extends object>(options: GrowthOptions<P>): GrowthResult {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const {
    warmup = 24,
    runs = 21,
    now = () => performance.now(),
    collect = defaultCollect,
  } = options;
  const largeN = n * factor;
  const sizes = [build(n), build(largeN)] as const;
  for (let i = 0; i < warmup; i++) {
    for (const p of sizes) {
      const version = { ...p };
      prepare?.(version);
      run(version);
    }
  }
  const times: [number[], number[]] = [[], []];
  for (let r = 0; r < runs; r++) {
    collect();
    for (const idx of pairOrder(r)) {
      const version = { ...sizes[idx] };
      prepare?.(version);
      const start = now();
      run(version);
      times[idx].push(now() - start);
    }
  }
  return summarize(n, largeN, times[0], times[1]);
}

function report(label: string, result: GrowthResult): void {
  console.info(
    `growth · ${label}: n=${result.n} ${result.smallMs.toFixed(2)} ms · ` +
      `4n=${result.largeN} ${result.largeMs.toFixed(2)} ms · ratio ${result.ratio.toFixed(2)}× (limit ${GROWTH_LIMIT}×) · ` +
      `pairwise quartiles ${result.ratioQ1.toFixed(2)}–${result.ratioQ3.toFixed(2)}×`,
  );
}

/** Measures, prints so the CI log shows the slack, and requires the ratio < 6×. Returns the result. */
export function expectLinearGrowth<P extends object>(
  label: string,
  options: GrowthOptions<P>,
): GrowthResult {
  const result = measureGrowth(options);
  report(label, result);
  expect(result.ratio, `${label}: 4n/n ratio`).toBeLessThan(GROWTH_LIMIT);
  return result;
}

export interface AsyncGrowthOptions<P extends object> extends MeasureHooks {
  readonly build: (n: number) => P | Promise<P>;
  /** The measured async operation (e.g. saving through the session); always receives a fresh shallow copy of `build`. */
  readonly run: (p: P) => unknown;
  /** Runs immediately before each `run`, outside the timing. */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  readonly warmup?: number;
  readonly runs?: number;
}

/** Like `measureGrowth`, for an async operation (`await` on each run). */
export async function measureGrowthAsync<P extends object>(
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const {
    warmup = 24,
    runs = 21,
    now = () => performance.now(),
    collect = defaultCollect,
  } = options;
  const largeN = n * factor;
  const sizes = [await build(n), await build(largeN)] as const;
  for (let i = 0; i < warmup; i++) {
    for (const p of sizes) {
      const version = { ...p };
      await prepare?.(version);
      await run(version);
    }
  }
  const times: [number[], number[]] = [[], []];
  for (let r = 0; r < runs; r++) {
    collect();
    for (const idx of pairOrder(r)) {
      const version = { ...sizes[idx] };
      await prepare?.(version);
      const start = now();
      await run(version);
      times[idx].push(now() - start);
    }
  }
  return summarize(n, largeN, times[0], times[1]);
}

/** Like `expectLinearGrowth`, for an async operation. */
export async function expectLinearGrowthAsync<P extends object>(
  label: string,
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const result = await measureGrowthAsync(options);
  report(label, result);
  expect(result.ratio, `${label}: 4n/n ratio`).toBeLessThan(GROWTH_LIMIT);
  return result;
}
