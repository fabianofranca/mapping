import { describe, expect, it } from 'vitest';
import {
  GROWTH_LIMIT,
  GROWTH_OPTIONS,
  expectLinearGrowth,
  growthRetry,
  measureGrowth,
  measureGrowthAsync,
} from '../../support/growth';

// O auxiliar de crescimento com funções sintéticas: a linear passa e a quadrática (laço duplo) falha pela razão.
interface Work {
  readonly size: number;
}
const build = (n: number): Work => ({ size: n });

function linear(w: Work): number {
  let sum = 0;
  for (let i = 0; i < w.size * 400; i++) sum += i % 7;
  return sum;
}

/** Linear curto (< 1 ms em n), o caso que mais oscilava com a medição sequencial. */
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

/** Relógio e coletor falsos: o tempo só anda quando o teste manda, então nada depende do tempo real. */
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

describe('auxiliar de crescimento', () => {
  it('a função linear passa (razão perto de 4×)', GROWTH_OPTIONS, () => {
    const result = expectLinearGrowth('sintético linear', { build, run: linear });
    expect(result.ratio).toBeLessThan(GROWTH_LIMIT);
    expect(result.n).toBe(1250);
    expect(result.largeN).toBe(5000);
  });

  it('a função linear curta (< 1 ms em n) passa', GROWTH_OPTIONS, () => {
    const result = expectLinearGrowth('sintético linear curto', {
      build,
      run: shortLinear,
    });
    expect(result.ratio).toBeLessThan(GROWTH_LIMIT);
  });

  it('a função quadrática falha pela razão (perto de 16×)', GROWTH_OPTIONS, () => {
    const result = measureGrowth({ build, run: quadratic });
    expect(result.ratio).toBeGreaterThan(GROWTH_LIMIT);
    expect(() =>
      expectLinearGrowth('sintético quadrático', { build, run: quadratic }),
    ).toThrow();
  });

  it('o teto é 6×', () => {
    expect(GROWTH_LIMIT).toBe(6);
  });

  it('cada execução mede uma versão nova do projeto, nos dois tamanhos', () => {
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
    // (aquecimento + rodadas) por tamanho, todas objetos diferentes
    expect(seen.size).toBe(8);
  });

  it('n e 4n se intercalam, com a ordem alternada por rodada', () => {
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

  it('coleta uma vez por par, fora do tempo medido', () => {
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

  it('o aquecimento é o mesmo nos dois tamanhos', () => {
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

  it('o prepare roda logo antes da sua execução e fora do tempo', () => {
    const env = fakeEnvironment();
    let prepared: Work | null = null;
    const result = measureGrowth({
      build,
      prepare: (w) => {
        prepared = w;
        env.state.t += 1000; // custoso, mas fora da medida
      },
      run: (w) => {
        expect(prepared).toBe(w);
        env.state.t += w.size / 1250; // 1 ms em n, 4 ms em 4n
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

  it('a razão é a das medianas de uma amostra conhecida, com os quartis das razões par a par', () => {
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
    // razões par a par: 4, 4,44, 2,5, 6,25, 2 → ordenadas: 2, 2,5, 4, 4,44, 6,25
    expect(result.ratioQ1).toBeCloseTo(2.5, 9);
    expect(result.ratioQ3).toBeCloseTo(40 / 9, 9);
  });

  it('a versão assíncrona intercala igual, com o prepare antes de cada execução', async () => {
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
  it('GROWTH_RETRY=0 desliga o retry', () => {
    expect(growthRetry({ GROWTH_RETRY: '0' })).toBe(0);
  });

  it('um inteiro de 0 a 9 vale ele mesmo', () => {
    expect(growthRetry({ GROWTH_RETRY: '5' })).toBe(5);
  });

  it('ausente vale 2', () => {
    expect(growthRetry({})).toBe(2);
  });

  it('inválido vale 2', () => {
    expect(growthRetry({ GROWTH_RETRY: 'x' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '-1' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '10' })).toBe(2);
    expect(growthRetry({ GROWTH_RETRY: '' })).toBe(2);
  });
});
