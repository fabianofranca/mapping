import { expect } from 'vitest';

/**
 * Teste de crescimento (#881, #882, etapa #1095): mede a mesma operação com n e 4n marcações e exige a razão
 * das medianas < 6×. O auxiliar vale para os casos do `npm run test:scale` e para os de crescimento do
 * `npm run test:perf` (`tests/model/performance.test.ts`; `tests/mcp/batchPerf.test.ts` só lê o teto).
 *
 * Por que 6×: com a medição estável (n e 4n intercalados, ver abaixo), código linear mede 4,4 a 5,1× nestes
 * tamanhos (1.250 e 5.000 marcações), por efeito de memória, não por ruído: 5.000 marcações saem do cache e
 * 1.250 não (`projectIndex` sozinho, Maps de 5.000 chaves, dá ~5×). O quadrático mede 13 a 17×. O teto de 6×
 * separa os dois por mais de 2,5× e deixa ao menos 0,8× de folga a todo caso linear de hoje.
 * A razão não se negocia: passar do teto é defeito, não teto a subir; 6× é o teto calibrado pela medição, não
 * um ajuste a um caso. Caso com centro em 5× ou mais é "documentado" no próprio caso (de onde vem o excedente).
 *
 * Como mede: depois de um aquecimento igual nos dois tamanhos, cada rodada coleta o lixo uma vez (`globalThis.gc`,
 * fora do tempo) e executa **uma** vez em n e **uma** em 4n, em ordem alternada por rodada, cada execução sobre
 * uma versão nova do projeto e com o `prepare` dela imediatamente antes, fora do tempo. Assim os dois tamanhos
 * veem em média o mesmo estado de heap e de cache; repetir `k` vezes em lote subia o centro e foi descartado.
 */
export const GROWTH_LIMIT = 6;
/** Tamanhos padrão: 1.250 e 5.000 marcações. */
export const GROWTH_N = 1250;
export const GROWTH_FACTOR = 4;

/**
 * O retry, de `GROWTH_RETRY` (`0` desliga; inteiro de 0 a 9 vale ele; ausente ou inválido vale 2). Função pura
 * exportada porque `GROWTH_OPTIONS` é avaliado no import. Com a medição intercalada, o retry é rede para o
 * runner compartilhado ruidoso, não para "operações de poucos ms que oscilam"; o aceite roda com `GROWTH_RETRY=0`.
 */
export function growthRetry(env: Record<string, string | undefined>): number {
  const raw = env.GROWTH_RETRY;
  return raw !== undefined && /^[0-9]$/.test(raw) ? Number(raw) : 2;
}

export const GROWTH_OPTIONS = { retry: growthRetry(process.env) };

export interface GrowthResult {
  readonly n: number;
  readonly largeN: number;
  readonly smallMs: number;
  readonly largeMs: number;
  /** Razão das medianas. */
  readonly ratio: number;
  /** Quartis inferior e superior das razões 4n/n de cada par (a folga de verdade, para o log). */
  readonly ratioQ1: number;
  readonly ratioQ3: number;
}

/** Relógio e coletor injetáveis, só para os testes do próprio auxiliar. */
interface MeasureHooks {
  /** Relógio em ms. Padrão `performance.now`. */
  readonly now?: () => number;
  /** Coleta de lixo antes de cada par. Padrão `globalThis.gc` (sem `--expose-gc`, não coleta). */
  readonly collect?: () => void;
}

export interface GrowthOptions<P extends object> extends MeasureHooks {
  /** Monta o projeto (ou o que a operação lê) com `n` marcações. */
  readonly build: (n: number) => P;
  /** A operação medida; recebe sempre uma versão nova (`{ ...p }`) para não medir o memo do `projectIndex`. */
  readonly run: (p: P) => unknown;
  /** Opcional: roda sobre cada versão nova imediatamente antes de `run`, fora do tempo (ex.: o índice, que outro caso já mede). */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  /** Rodadas de aquecimento (JIT), iguais nos dois tamanhos. Padrão 24. */
  readonly warmup?: number;
  /** Rodadas medidas por tamanho. Padrão 21 (a mediana de poucas rodadas oscila nos tamanhos de poucos ms). */
  readonly runs?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function quartile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * q)] ?? 0;
}

function defaultCollect(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

/** Índices (0 = n, 1 = 4n) da rodada `r`: par n depois 4n, ímpar 4n depois n. */
function pairOrder(r: number): readonly [0 | 1, 0 | 1] {
  return r % 2 === 0 ? [0, 1] : [1, 0];
}

function summarize(
  n: number,
  largeN: number,
  small: number[],
  large: number[],
): GrowthResult {
  const smallMs = median(small);
  const largeMs = median(large);
  const pairRatios = small.map((s, i) => (large[i] ?? 0) / Math.max(s, 1e-6));
  return {
    n,
    largeN,
    smallMs,
    largeMs,
    ratio: largeMs / Math.max(smallMs, 1e-6),
    ratioQ1: quartile(pairRatios, 0.25),
    ratioQ3: quartile(pairRatios, 0.75),
  };
}

/** Mede n e 4n: aquece igual nos dois, intercala um par por rodada (gc antes, ordem alternada) e dá a razão das medianas. */
export function measureGrowth<P extends object>(options: GrowthOptions<P>): GrowthResult {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const {
    warmup = 24,
    runs = 21,
    now = () => performance.now(),
    collect = defaultCollect,
  } = options;
  const largeN = n * factor;
  const sizes = [build(n), build(largeN)] as const;
  for (let i = 0; i < warmup; i++) {
    for (const p of sizes) {
      const version = { ...p };
      prepare?.(version);
      run(version);
    }
  }
  const times: [number[], number[]] = [[], []];
  for (let r = 0; r < runs; r++) {
    collect();
    for (const idx of pairOrder(r)) {
      const version = { ...sizes[idx] };
      prepare?.(version);
      const start = now();
      run(version);
      times[idx].push(now() - start);
    }
  }
  return summarize(n, largeN, times[0], times[1]);
}

function report(label: string, result: GrowthResult): void {
  console.info(
    `crescimento · ${label}: n=${result.n} ${result.smallMs.toFixed(2)} ms · ` +
      `4n=${result.largeN} ${result.largeMs.toFixed(2)} ms · razão ${result.ratio.toFixed(2)}× (teto ${GROWTH_LIMIT}×) · ` +
      `quartis par a par ${result.ratioQ1.toFixed(2)}–${result.ratioQ3.toFixed(2)}×`,
  );
}

/** Mede, imprime para o log do CI mostrar a folga e exige a razão < 6×. Devolve o resultado. */
export function expectLinearGrowth<P extends object>(
  label: string,
  options: GrowthOptions<P>,
): GrowthResult {
  const result = measureGrowth(options);
  report(label, result);
  expect(result.ratio, `${label}: razão 4n/n`).toBeLessThan(GROWTH_LIMIT);
  return result;
}

export interface AsyncGrowthOptions<P extends object> extends MeasureHooks {
  readonly build: (n: number) => P | Promise<P>;
  /** A operação assíncrona medida (ex.: gravar pela sessão); recebe sempre uma cópia rasa nova de `build`. */
  readonly run: (p: P) => unknown;
  /** Roda imediatamente antes de cada `run`, fora do tempo. */
  readonly prepare?: (p: P) => unknown;
  readonly n?: number;
  readonly factor?: number;
  readonly warmup?: number;
  readonly runs?: number;
}

/** Como `measureGrowth`, para operação assíncrona (`await` em cada execução). */
export async function measureGrowthAsync<P extends object>(
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const { build, run, prepare, n = GROWTH_N, factor = GROWTH_FACTOR } = options;
  const {
    warmup = 24,
    runs = 21,
    now = () => performance.now(),
    collect = defaultCollect,
  } = options;
  const largeN = n * factor;
  const sizes = [await build(n), await build(largeN)] as const;
  for (let i = 0; i < warmup; i++) {
    for (const p of sizes) {
      const version = { ...p };
      await prepare?.(version);
      await run(version);
    }
  }
  const times: [number[], number[]] = [[], []];
  for (let r = 0; r < runs; r++) {
    collect();
    for (const idx of pairOrder(r)) {
      const version = { ...sizes[idx] };
      await prepare?.(version);
      const start = now();
      await run(version);
      times[idx].push(now() - start);
    }
  }
  return summarize(n, largeN, times[0], times[1]);
}

/** Como `expectLinearGrowth`, para operação assíncrona. */
export async function expectLinearGrowthAsync<P extends object>(
  label: string,
  options: AsyncGrowthOptions<P>,
): Promise<GrowthResult> {
  const result = await measureGrowthAsync(options);
  report(label, result);
  expect(result.ratio, `${label}: razão 4n/n`).toBeLessThan(GROWTH_LIMIT);
  return result;
}
