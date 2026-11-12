import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
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

let gcFunction: (() => void) | undefined;

/**
 * Força uma coleta de lixo, para que ela não caia dentro de uma amostra de tempo (etapa #1698).
 * Usa `globalThis.gc` quando existe; senão liga `--expose-gc` em tempo de execução
 * (`v8.setFlagsFromString`) e pega a função com `vm.runInNewContext('gc')`, uma vez só.
 * O `execArgv: ['--expose-gc']` da #1095 não serve: o projeto `perf-app` roda em `vmThreads`
 * (worker threads), e o Node recusa flags do V8 no `execArgv` de um worker
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
  now?: () => number;
  collect?: () => void;
}

export interface BudgetMeasure {
  median: number;
  p25: number;
  p75: number;
}

/**
 * Mede `run` para um orçamento de tempo apertado (etapa #1698): `warmup` execuções sem medir
 * (10 por padrão) e, a cada uma das `samples` amostras (41; sempre ímpar), `collect()` fora do
 * tempo (gc por padrão) antes de ler o relógio. Instanciar e desenhar no Konva aloca muito, e a
 * cauda de tempo vinha de coletas e da disputa de CPU dentro das amostras. Para o teto vale a
 * `median`; os quartis servem só para o registro (o quantil baixo não ganhou da mediana).
 */
export function measureBudget(
  run: () => void,
  options: BudgetOptions = {},
): BudgetMeasure {
  const {
    warmup = 10,
    samples = 41,
    now = () => performance.now(),
    collect = collectGarbage,
  } = options;
  for (let i = 0; i < warmup; i++) run();
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
  return { median: at(0.5), p25: at(0.25), p75: at(0.75) };
}
