// @vitest-environment node
// Etapa #1698, fase OL1: `measureBudget` e `collectGarbage` (`tests/support/perfReport.ts`) com o
// relógio e o coletor injetados, sem depender de tempo real.
import { describe, expect, it } from 'vitest';
import { collectGarbage, measureBudget } from '../support/perfReport';

/** Relógio falso: cada `run` avança `durations[i]`; o `collect` avança `collectCost` fora da medida. */
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
    events.push(measuring ? 'collect-dentro' : 'collect');
    clock += collectCost;
  };
  return { now, run, collect, events };
}

describe('measureBudget', () => {
  it('roda warmup + samples vezes e usa os padrões 10 e 41', () => {
    const h = harness([1]);
    measureBudget(h.run, { now: h.now, collect: h.collect });
    expect(h.events.filter((e) => e === 'run')).toHaveLength(10 + 41);
    expect(h.events.filter((e) => e === 'collect')).toHaveLength(41);
  });

  it('coleta uma vez por amostra, nunca no aquecimento nem dentro do tempo', () => {
    const h = harness([2], 100);
    const r = measureBudget(h.run, {
      warmup: 3,
      samples: 5,
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

  it('devolve a mediana e os quartis de uma amostra conhecida', () => {
    // 9 amostras fora de ordem: ordenadas 1..9; mediana = 5, p25 = [floor(8·0,25)] = 3, p75 = [6] = 7.
    const h = harness([9, 1, 5, 3, 7, 2, 8, 4, 6]);
    const r = measureBudget(h.run, {
      warmup: 0,
      samples: 9,
      now: h.now,
      collect: h.collect,
    });
    expect(r).toEqual({ median: 5, p25: 3, p75: 7 });
  });

  it('o aquecimento não entra na medida', () => {
    const h = harness([1000, 1000, 2, 2, 2]);
    const r = measureBudget(h.run, {
      warmup: 2,
      samples: 3,
      now: h.now,
      collect: h.collect,
    });
    expect(r.median).toBe(2);
  });
});

describe('collectGarbage', () => {
  it('pode ser chamada sem lançar erro', () => {
    expect(() => collectGarbage()).not.toThrow();
    expect(() => collectGarbage()).not.toThrow();
  });
});
