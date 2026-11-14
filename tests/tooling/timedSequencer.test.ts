// @vitest-environment node
// Fast Vitest stage (VT1): `--shard=i/N` splits the files by the time of each one
// (greedy, biggest first), not by the number of files nor by the path hash.
import { describe, expect, it } from 'vitest';
import TimedSequencer, { balanceShards, medianDuration } from '../support/timedSequencer';

const paths = (n: number): string[] =>
  Array.from(
    { length: n },
    (_, i) => `tests/a/file${String(i).padStart(2, '0')}.test.ts`,
  );

const durations = (list: string[]): Record<string, number> =>
  Object.fromEntries(list.map((p, i) => [p, ((i * 7) % 11) + 1 + (i % 3) * 0.5]));

const load = (shard: string[], d: Record<string, number>, fallback: number): number =>
  shard.reduce((sum, p) => sum + (d[p] ?? fallback), 0);

describe('balanceShards', () => {
  it.each([1, 2, 3, 4])(
    'with %i shards, the union is the whole set, without repetition',
    (n) => {
      const list = paths(23);
      const d = durations(list);
      const shards = balanceShards(list, d, n);
      expect(shards).toHaveLength(n);
      expect(shards.flat().sort()).toEqual([...list].sort());
    },
  );

  it('does not depend on the input order', () => {
    const list = paths(17);
    const d = durations(list);
    const reversed = [...list].reverse();
    const shuffled = [...list].sort(
      (a, b) => ((a.length + a.charCodeAt(12)) % 5) - ((b.length + b.charCodeAt(12)) % 5),
    );
    const base = balanceShards(list, d, 4).map((s) => [...s].sort());
    expect(balanceShards(reversed, d, 4).map((s) => [...s].sort())).toEqual(base);
    expect(balanceShards(shuffled, d, 4).map((s) => [...s].sort())).toEqual(base);
  });

  it('a file without a time enters, with the median of the known ones', () => {
    const list = [...paths(6), 'tests/new/new.test.ts'];
    const d = durations(paths(6));
    const shards = balanceShards(list, d, 3);
    expect(shards.flat()).toContain('tests/new/new.test.ts');
    expect(shards.flat()).toHaveLength(7);
    expect(medianDuration({ a: 1, b: 9, c: 3 })).toBe(3);
    expect(medianDuration({ a: 1, b: 3 })).toBe(2);
    expect(medianDuration({})).toBe(1);
  });

  it('the time of a file that no longer exists is just ignored', () => {
    const list = paths(5);
    const d = { ...durations(list), 'tests/removed.test.ts': 99 };
    expect(balanceShards(list, d, 2).flat().sort()).toEqual([...list].sort());
  });

  it('with uneven times, it is more balanced than the split by count', () => {
    const list = paths(12);
    // Three heavy files at the start of the list: the split by count (contiguous
    // blocks of 3) puts the three in the same shard.
    const d: Record<string, number> = {};
    list.forEach((p, i) => (d[p] = i < 3 ? 30 : 2));
    const byCount = [0, 1, 2, 3].map((i) => list.slice(i * 3, i * 3 + 3));
    const timed = balanceShards(list, d, 4);
    const max = (s: string[][]): number => Math.max(...s.map((x) => load(x, d, 0)));
    expect(max(byCount)).toBe(90);
    expect(max(timed)).toBeLessThan(max(byCount));
    expect(max(timed)).toBeLessThanOrEqual(34);
  });

  it('each file also costs the setup (import, environment), even with zero time', () => {
    // The measured time of a file does not include its import: 200 files of 0 s are not
    // free. Without this fixed cost, all of them would fall in the same shard (the one with the lowest index).
    const heavy = paths(4);
    const tiny = Array.from({ length: 200 }, (_, i) => `tests/b/tiny${i}.test.ts`);
    const d: Record<string, number> = {};
    heavy.forEach((p) => (d[p] = 20));
    tiny.forEach((p) => (d[p] = 0));
    const sizes = balanceShards([...heavy, ...tiny], d, 4).map((s) => s.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

describe('TimedSequencer', () => {
  const root = '/repo';
  const spec = (path: string): { moduleId: string; project: { name: string } } => ({
    moduleId: `${root}/${path}`,
    project: { name: 'app' },
  });
  const make = (index: number, count: number): TimedSequencer =>
    new TimedSequencer({ config: { root, shard: { index, count } } } as never);

  it('shards 1..N partition the files among themselves', async () => {
    const list = paths(15);
    const specs = list.map(spec);
    const parts = await Promise.all(
      [1, 2, 3, 4].map((i) => make(i, 4).shard(specs as never)),
    );
    const got = parts.flat().map((s) => (s as { moduleId: string }).moduleId);
    expect(got.sort()).toEqual(specs.map((s) => s.moduleId).sort());
  });
});
