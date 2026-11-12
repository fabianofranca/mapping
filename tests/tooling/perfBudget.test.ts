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
  it('roda warmup + rounds × samples vezes e usa os padrões 10, 3 e 41', () => {
    const h = harness([1]);
    measureBudget(h.run, { now: h.now, collect: h.collect });
    expect(h.events.filter((e) => e === 'run')).toHaveLength(10 + 3 * 41);
    expect(h.events.filter((e) => e === 'collect')).toHaveLength(3 * 41);
  });

  it('coleta uma vez por amostra, nunca no aquecimento nem dentro do tempo', () => {
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

  it('devolve a mediana e os quartis de uma amostra conhecida', () => {
    // 9 amostras fora de ordem: ordenadas 1..9; mediana = 5, p25 = [floor(8·0,25)] = 3, p75 = [6] = 7.
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

  // Etapa #1698, fase CL1: sob disputa de CPU a fase ruim cobria as 41 amostras seguidas e a
  // mediana inteira passava dos 4 ms (11 a 20 ms nas rodadas sob carga do `test:perf` completo).
  // A medida passa a ter `rounds` levas de `samples`; vale a menor mediana entre elas.
  it('com várias levas vale a menor mediana: uma leva inteira em fase ruim não conta', () => {
    // 3 levas de 3 amostras: a 1ª em disputa (10 ms), a 2ª limpa (2 ms), a 3ª média (6 ms).
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

  it('as levas seguem a ordem coleta → relógio → run e o aquecimento só vem antes da 1ª', () => {
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

  it('os quartis acompanham a leva da menor mediana', () => {
    // leva 1 (ordenada 5,5,5): mediana 5; leva 2 (ordenada 1,2,3): mediana 2, p25 = 1, p75 = 2.
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

  it('o aquecimento não entra na medida', () => {
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
  it('pode ser chamada sem lançar erro', () => {
    expect(() => collectGarbage()).not.toThrow();
    expect(() => collectGarbage()).not.toThrow();
  });
});
