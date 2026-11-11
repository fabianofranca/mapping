/**
 * Motor dos componentes: a quebra de fileira (`layout.wrap`, v4). Funções puras sobre números: o
 * motor (`instantiate.ts`, o quadro e o `repeat`) e a arrumação do slot (`arrange.ts`, `layout.ts`)
 * decidem com elas quais filhos ficam em cada linha e onde cada linha fica no eixo cruzado.
 */

/** Tolerância (px) de "cabe na linha": a mesma da arrumação e da posição da filha nova. */
export const WRAP_EPS = 0.001;

export interface LineBreakOptions {
  /** Espaço entre filhos da mesma linha. */
  readonly gap: number;
  /** Filhos por linha, no máximo (`layout.maxPerLine`). */
  readonly maxPerLine?: number | undefined;
  /** Linhas, no máximo (`layout.maxLines`): o resto é cortado. */
  readonly maxLines?: number | undefined;
}

export interface BrokenLines {
  /** Os índices dos filhos de cada linha, na ordem; só as linhas que ficam. */
  readonly lines: readonly (readonly number[])[];
  /** Quantos filhos ficaram fora por causa do `maxLines`. */
  readonly dropped: number;
}

/** O filho cabe na linha atual (ou a linha está vazia: um filho maior que a linha fica sozinho)? */
function fitsLine(
  count: number,
  used: number,
  size: number,
  available: number | null,
  options: LineBreakOptions,
): boolean {
  if (count === 0) return true;
  if (options.maxPerLine !== undefined && count >= options.maxPerLine) return false;
  return available === null || used + options.gap + size <= available + WRAP_EPS;
}

/**
 * Reparte os filhos (pelos tamanhos no eixo principal) em linhas, como o `flex-wrap`: o filho que
 * não cabe no que resta de `available` vai para a linha seguinte; `available` nulo = sem limite
 * (só o `maxPerLine` quebra). Os filhos além de `maxLines` linhas saem (`dropped`).
 */
export function breakLines(
  sizes: readonly number[],
  available: number | null,
  options: LineBreakOptions,
): BrokenLines {
  const all: number[][] = [];
  let current: number[] = [];
  let used = 0;
  sizes.forEach((size, index) => {
    if (!fitsLine(current.length, used, size, available, options)) {
      all.push(current);
      current = [];
      used = 0;
    }
    used += (current.length === 0 ? 0 : options.gap) + size;
    current.push(index);
  });
  if (current.length > 0) all.push(current);
  const lines = options.maxLines === undefined ? all : all.slice(0, options.maxLines);
  const dropped = all.slice(lines.length).reduce((sum, line) => sum + line.length, 0);
  return { lines, dropped };
}

export interface StackedLines {
  /** Onde cada linha começa no eixo cruzado, a partir do início da área de conteúdo. */
  readonly tops: readonly number[];
  /** A extensão ocupada pelas linhas, com os `lineGap`. */
  readonly total: number;
}

/**
 * Empilha as linhas no eixo cruzado (cada uma com a sua extensão), separadas por `lineGap`; com
 * `reverse` (`wrap-reverse`) a ordem das linhas é a inversa: a primeira fica no fim do bloco, e a
 * linha nova, no início. O bloco começa no início da área de conteúdo nos dois casos.
 */
export function stackLines(
  extents: readonly number[],
  lineGap: number,
  reverse: boolean,
): StackedLines {
  const total =
    extents.reduce((sum, extent) => sum + extent, 0) +
    lineGap * Math.max(0, extents.length - 1);
  let cursor = 0;
  const tops = extents.map((extent) => {
    const top = reverse ? total - cursor - extent : cursor;
    cursor += extent + lineGap;
    return top;
  });
  return { tops, total };
}
