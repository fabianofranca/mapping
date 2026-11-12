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
  rounds?: number;
  now?: () => number;
  collect?: () => void;
}

export interface BudgetMeasure {
  /** Menor mediana entre as levas: é a que vale para o teto. */
  median: number;
  /** Quartis da leva que deu a menor mediana (só para o registro). */
  p25: number;
  p75: number;
  /** A mediana de cada leva, na ordem em que rodaram (só para o registro). */
  medians: number[];
}

/**
 * Mede `run` para um orçamento de tempo apertado (etapa #1698): `warmup` execuções sem medir
 * (10 por padrão) e `rounds` levas (3) de `samples` amostras (41; sempre ímpar). A cada amostra,
 * `collect()` fora do tempo (gc por padrão) antes de ler o relógio. Instanciar e desenhar no Konva
 * aloca muito, e a cauda de tempo vinha de coletas e da disputa de CPU dentro das amostras. Sob
 * disputa, a fase ruim do runner cobria as 41 amostras seguidas e a mediana de uma leva só passava
 * dos 4 ms (fase CL1); por isso vale a menor mediana entre as levas, que acompanha o custo do
 * código e não a fase da máquina (uma regressão real sobe todas). Para o teto vale a `median`; os
 * quartis e `medians` servem só para o registro.
 */
export function measureBudget(
  run: () => void,
  options: BudgetOptions = {},
): BudgetMeasure {
  const {
    warmup = 10,
    samples = 41,
    rounds = 3,
    now = () => performance.now(),
    collect = collectGarbage,
  } = options;
  for (let i = 0; i < warmup; i++) run();
  const batches: BudgetMeasure[] = [];
  for (let r = 0; r < rounds; r++) {
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
    batches.push({ median: at(0.5), p25: at(0.25), p75: at(0.75), medians: [] });
  }
  const medians = batches.map((b) => b.median);
  const best = batches.reduce((a, b) => (b.median < a.median ? b : a));
  return { median: best.median, p25: best.p25, p75: best.p75, medians };
}
