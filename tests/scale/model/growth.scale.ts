import { describe, expect, it } from 'vitest';
import {
  GROWTH_LIMIT,
  GROWTH_OPTIONS,
  expectLinearGrowth,
  measureGrowth,
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

function quadratic(w: Work): number {
  let sum = 0;
  for (let i = 0; i < w.size * 4; i++) {
    for (let j = 0; j < w.size; j++) sum += (i + j) % 7;
  }
  return sum;
}

describe('auxiliar de crescimento', () => {
  it('a função linear passa (razão perto de 4×)', GROWTH_OPTIONS, () => {
    const result = expectLinearGrowth('sintético linear', { build, run: linear });
    expect(result.ratio).toBeLessThan(GROWTH_LIMIT);
    expect(result.n).toBe(1250);
    expect(result.largeN).toBe(5000);
  });

  it('a função quadrática falha pela razão (perto de 16×)', GROWTH_OPTIONS, () => {
    const result = measureGrowth({ build, run: quadratic });
    expect(result.ratio).toBeGreaterThan(GROWTH_LIMIT);
    expect(() =>
      expectLinearGrowth('sintético quadrático', { build, run: quadratic }),
    ).toThrow();
  });

  it('cada rodada mede uma versão nova do projeto', () => {
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
});
