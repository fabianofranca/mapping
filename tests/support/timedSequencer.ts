// Vitest sequencer that splits `--shard=i/N` by the time of each file (fast Vitest stage).
// The default splits by number of files (path hash): with 4 shards, the slowest took
// 53 s and the fastest 33 s. Here the split is greedy (biggest first, to the least
// loaded shard), with the times from `tests/support/durations.json` (`npm run test:durations`).
// Stale times only unbalance: every file lands in exactly one shard.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

export type Durations = Record<string, number>;

/**
 * Fixed cost of each file, in seconds (import, transform, environment), which the measured
 * time of the file does not include: a shard of ~200 small files took ~55 s against ~36 s
 * for one of ~50 files with the same sum of times (≈ 0.2 s per file).
 */
export const FILE_OVERHEAD = 0.2;

/** Median of the known times (1 s with none): it is the time of a file that has no record yet. */
export function medianDuration(durations: Durations): number {
  const values = Object.values(durations).sort((a, b) => a - b);
  if (values.length === 0) return 1;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Splits the paths into `count` shards (index 0 = shard 1). Deterministic and independent
 * of the input order: sorts by time (biggest first) and, on a tie, by path; each
 * file goes to the least loaded shard (tie: the one with the lowest index).
 */
export function balanceShards(
  paths: readonly string[],
  durations: Durations,
  count: number,
): string[][] {
  const fallback = medianDuration(durations);
  const timed = [...new Set(paths)]
    .map((path) => ({ path, seconds: (durations[path] ?? fallback) + FILE_OVERHEAD }))
    .sort(
      (a, b) => b.seconds - a.seconds || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
  const shards: string[][] = Array.from({ length: count }, () => []);
  const loads: number[] = new Array<number>(count).fill(0);
  for (const { path, seconds } of timed) {
    let target = 0;
    for (let i = 1; i < count; i++) if (loads[i]! < loads[target]!) target = i;
    shards[target]!.push(path);
    loads[target]! += seconds;
  }
  return shards;
}

const durationsFile = new URL('./durations.json', import.meta.url);

function readDurations(): Durations {
  try {
    return JSON.parse(readFileSync(durationsFile, 'utf8')) as Durations;
  } catch {
    return {}; // no times file, everything is worth the same (split by count)
  }
}

export default class TimedSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;
    const byPath = new Map<string, TestSpecification[]>();
    for (const spec of files) {
      const path = relative(root, spec.moduleId).split('\\').join('/');
      byPath.set(path, [...(byPath.get(path) ?? []), spec]);
    }
    const mine = balanceShards([...byPath.keys()], readDurations(), shard.count)[
      shard.index - 1
    ];
    return (mine ?? []).flatMap((path) => byPath.get(path) ?? []);
  }
}
