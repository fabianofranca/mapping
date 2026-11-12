import { expect } from 'vitest';

/**
 * Confere um orçamento de tempo e imprime a medida com `console.info`, para registrar a linha de
 * base e comparar depois (`npm run test:perf`). O limite não muda: o `expect` é o mesmo de antes.
 * `label` distingue as medidas de um mesmo teste; o nome do teste vai junto.
 */
export function expectBelow(value: number, limit: number, label?: string): void {
  const test = expect.getState().currentTestName ?? '';
  const name = label === undefined ? test : `${test} › ${label}`;
  console.info(`[perf] ${name}: ${value.toFixed(3)} ms (limite ${limit} ms)`);
  expect(value, label).toBeLessThan(limit);
}
