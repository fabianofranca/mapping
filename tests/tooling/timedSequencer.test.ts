// @vitest-environment node
// Etapa Vitest rápido (VT1): `--shard=i/N` divide os arquivos pelo tempo de cada um
// (guloso, maior primeiro), não pelo número de arquivos nem pelo hash do caminho.
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
    'com %i shards, a união é o conjunto inteiro, sem repetição',
    (n) => {
      const list = paths(23);
      const d = durations(list);
      const shards = balanceShards(list, d, n);
      expect(shards).toHaveLength(n);
      expect(shards.flat().sort()).toEqual([...list].sort());
    },
  );

  it('não depende da ordem de entrada', () => {
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

  it('arquivo sem tempo entra, com a mediana dos conhecidos', () => {
    const list = [...paths(6), 'tests/new/novo.test.ts'];
    const d = durations(paths(6));
    const shards = balanceShards(list, d, 3);
    expect(shards.flat()).toContain('tests/new/novo.test.ts');
    expect(shards.flat()).toHaveLength(7);
    expect(medianDuration({ a: 1, b: 9, c: 3 })).toBe(3);
    expect(medianDuration({ a: 1, b: 3 })).toBe(2);
    expect(medianDuration({})).toBe(1);
  });

  it('tempo de arquivo que não existe mais só é ignorado', () => {
    const list = paths(5);
    const d = { ...durations(list), 'tests/removido.test.ts': 99 };
    expect(balanceShards(list, d, 2).flat().sort()).toEqual([...list].sort());
  });

  it('com tempos desiguais, fica mais equilibrado que a divisão por contagem', () => {
    const list = paths(12);
    // Três arquivos pesados no começo da lista: a divisão por contagem (blocos
    // contíguos de 3) põe os três no mesmo shard.
    const d: Record<string, number> = {};
    list.forEach((p, i) => (d[p] = i < 3 ? 30 : 2));
    const byCount = [0, 1, 2, 3].map((i) => list.slice(i * 3, i * 3 + 3));
    const timed = balanceShards(list, d, 4);
    const max = (s: string[][]): number => Math.max(...s.map((x) => load(x, d, 0)));
    expect(max(byCount)).toBe(90);
    expect(max(timed)).toBeLessThan(max(byCount));
    expect(max(timed)).toBeLessThanOrEqual(34);
  });

  it('cada arquivo custa também a montagem (import, ambiente), mesmo com tempo zero', () => {
    // O tempo medido de um arquivo não inclui o import dele: 200 arquivos de 0 s não são
    // de graça. Sem esse custo fixo, todos cairiam no mesmo shard (o de menor índice).
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

  it('os shards 1..N particionam os arquivos entre si', async () => {
    const list = paths(15);
    const specs = list.map(spec);
    const parts = await Promise.all(
      [1, 2, 3, 4].map((i) => make(i, 4).shard(specs as never)),
    );
    const got = parts.flat().map((s) => (s as { moduleId: string }).moduleId);
    expect(got.sort()).toEqual(specs.map((s) => s.moduleId).sort());
  });
});
