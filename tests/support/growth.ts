import { expect } from 'vitest';

/**
 * Teste de crescimento (#881, #882): mede a mesma operação com n e 4n marcações e exige a razão das
 * medianas < 5×. Linear dá ~4×, quadrático ~16×, e a razão quase não sofre com a velocidade do runner.
 * A razão não se negocia: passar do teto é defeito, não teto a subir.
 */
export const GROWTH_LIMIT = 5;
/** Tamanhos padrão: 1.250 e 5.000 marcações. */
export const GROWTH_N = 1250;
export const GROWTH_FACTOR = 4;
/**
 * Um runner compartilhado ruidoso estoura por acaso (as operações de poucos ms chegam a 5–7× numa rodada, por cache e coleta de
 * lixo, e voltam a ~4× na seguinte); a regressão real (~16×) estoura nas três.
 */
export const GROWTH_OPTIONS = { retry: 2 };

export interface GrowthResult {
  readonly n: number;
  readonly largeN: number;
  readonly smallMs: number;
  readonly largeMs: number;
  readonly ratio: number;
}

export interface GrowthOptions<P extends object> {
  /** Monta o projeto (ou o que a operação lê) com `n` marcações. */
  readonly build: (n: number) => P;
  /** A operação medida; recebe sempre uma versão nova (`{ ...p }`) para não medir o memo do `projectIndex`. */
  readonly run: (p: P) => unknown;
  /** Opcional: roda sobre cada versão nova antes de `run`, fora do tempo (ex.: o índice, que outro caso já mede). */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  /** Rodadas de aquecimento no tamanho pequeno (JIT); no grande são no máximo 10. Padrão 24. */
  readonly warmup?: number;
  /** Rodadas medidas por tamanho. Padrão 21 (a mediana de poucas rodadas oscila nos tamanhos de poucos ms). */
  readonly runs?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianMs<P extends object>(
  run: (p: P) => unknown,
  prepare: ((p: P) => unknown) | undefined,
  p: P,
  warmup: number,
  runs: number,
): number {
  for (let i = 0; i < warmup; i++) {
    const version = { ...p };
    prepare?.(version);
    run(version);
  }
  const times = Array.from({ length: runs }, () => {
    const version = { ...p };
    prepare?.(version);
    // O lixo da rodada anterior não pode cair na medida desta (sem `--expose-gc`, não coleta).
    (globalThis as { gc?: () => void }).gc?.();
    const start = performance.now();
    run(version);
    return performance.now() - start;
  });
  return median(times);
}

/** Mede n e 4n: aquece, mediana de rodadas (cada uma numa versão nova) e a razão. */
export function measureGrowth<P extends object>(options: GrowthOptions<P>): GrowthResult {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const { warmup = 24, runs = 21 } = options;
  const largeN = n * factor;
  const small = build(n);
  const large = build(largeN);
  const smallMs = medianMs(run, prepare, small, warmup, runs);
  const largeMs = medianMs(run, prepare, large, Math.min(warmup, 10), runs);
  return { n, largeN, smallMs, largeMs, ratio: largeMs / Math.max(smallMs, 1e-6) };
}

/** Mede, imprime para o log do CI mostrar a folga e exige a razão < 5×. Devolve o resultado. */
export function expectLinearGrowth<P extends object>(
  label: string,
  options: GrowthOptions<P>,
): GrowthResult {
  const result = measureGrowth(options);
  console.info(
    `crescimento · ${label}: n=${result.n} ${result.smallMs.toFixed(2)} ms · ` +
      `4n=${result.largeN} ${result.largeMs.toFixed(2)} ms · razão ${result.ratio.toFixed(2)}× (teto ${GROWTH_LIMIT}×)`,
  );
  expect(result.ratio, `${label}: razão 4n/n`).toBeLessThan(GROWTH_LIMIT);
  return result;
}

export interface AsyncGrowthOptions<P extends object> {
  readonly build: (n: number) => P | Promise<P>;
  /** A operação assíncrona medida (ex.: gravar pela sessão); recebe sempre uma cópia rasa nova de `build`. */
  readonly run: (p: P) => unknown;
  /** Roda antes de cada `run`, fora do tempo. */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  readonly warmup?: number;
  readonly runs?: number;
}

async function medianMsAsync<P extends object>(
  run: (p: P) => unknown,
  prepare: ((p: P) => unknown) | undefined,
  p: P,
  warmup: number,
  runs: number,
): Promise<number> {
  for (let i = 0; i < warmup; i++) {
    const version = { ...p };
    await prepare?.(version);
    await run(version);
  }
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const version = { ...p };
    await prepare?.(version);
    (globalThis as { gc?: () => void }).gc?.();
    const start = performance.now();
    await run(version);
    times.push(performance.now() - start);
  }
  return median(times);
}

/** Como `measureGrowth`, para operação assíncrona (a mediana é de rodadas sequenciais). */
export async function measureGrowthAsync<P extends object>(
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const { warmup = 24, runs = 21 } = options;
  const largeN = n * factor;
  const small = await build(n);
  const large = await build(largeN);
  const smallMs = await medianMsAsync(run, prepare, small, warmup, runs);
  const largeMs = await medianMsAsync(run, prepare, large, Math.min(warmup, 10), runs);
  return { n, largeN, smallMs, largeMs, ratio: largeMs / Math.max(smallMs, 1e-6) };
}

/** Como `expectLinearGrowth`, para operação assíncrona. */
export async function expectLinearGrowthAsync<P extends object>(
  label: string,
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const result = await measureGrowthAsync(options);
  console.info(
    `crescimento · ${label}: n=${result.n} ${result.smallMs.toFixed(2)} ms · ` +
      `4n=${result.largeN} ${result.largeMs.toFixed(2)} ms · razão ${result.ratio.toFixed(2)}× (teto ${GROWTH_LIMIT}×)`,
  );
  expect(result.ratio, `${label}: razão 4n/n`).toBeLessThan(GROWTH_LIMIT);
  return result;
}
