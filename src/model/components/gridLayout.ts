/**
 * Motor dos componentes: a grade (`layout.type: "grid"`, v4). Funções puras sobre números: o motor
 * (`instantiate.ts`, o quadro e o `repeat`) e a arrumação do slot (`arrange.ts`, `layout.ts`,
 * `componentArrange.ts`, `componentMarkings.ts`) decidem com elas quantas trilhas há, em que célula
 * cada filho cai e onde fica a célula.
 *
 * Vocabulário (a grade vertical é a de `columns`/`minColumnWidth`; a horizontal, a de
 * `rows`/`minRowHeight`, troca os eixos): as **trilhas** são as colunas da grade vertical (as
 * linhas da horizontal), todas do mesmo tamanho; as **linhas de fluxo** são as que se formam ao
 * preencher, da trilha inicial à final, uma depois da outra (as colunas da grade horizontal). O
 * **eixo das trilhas** é o horizontal na grade vertical; o **eixo das linhas**, o outro.
 */
import type { LayoutAlign, LayoutJustify } from './componentFormat';

/** Um filho colocado: a linha de fluxo, a trilha onde começa e quantas ocupa. */
export interface GridCell {
  /** Índice do filho na lista dada (a ordem de colocação). */
  readonly index: number;
  /** A linha de fluxo (0 é a primeira). */
  readonly line: number;
  /** A trilha onde começa (0 é a inicial). */
  readonly track: number;
  /** As trilhas que ocupa (já limitado ao número de trilhas). */
  readonly span: number;
}

/**
 * O `span` de um filho: inteiro ≥ 1, limitado ao número de trilhas. Valor ausente, não inteiro ou
 * menor que 1 vale 1.
 */
export function clampSpan(value: unknown, count: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, count));
}

/**
 * Quantas trilhas a grade tem. `count` (`columns`/`rows`) já vem inteiro ≥ 1. Com `min`
 * (`minColumnWidth`/`minRowHeight`), `max(1, floor((conteúdo + gap) / (min + gap)))`, o
 * `GridCells.Adaptive`; sem conteúdo conhecido (`null`), uma trilha.
 */
export function trackCount(
  spec: { readonly count?: number | undefined; readonly min?: number | undefined },
  content: number | null,
  gap: number,
): number {
  if (spec.count !== undefined) return Math.max(1, Math.floor(spec.count));
  if (spec.min === undefined || content === null || !(spec.min > 0)) return 1;
  return Math.max(1, Math.floor((content + gap) / (spec.min + gap) + 1e-9));
}

/** O tamanho de cada trilha: `(conteúdo − gaps) / n` (o `1fr` de cada). */
export function trackSize(content: number, count: number, gap: number): number {
  return Math.max(0, (content - gap * Math.max(0, count - 1)) / Math.max(1, count));
}

/** A extensão de `span` trilhas vizinhas de tamanho `size`, com os `gap` entre elas. */
export function spanExtent(size: number, span: number, gap: number): number {
  return size * span + gap * Math.max(0, span - 1);
}

/** Onde a trilha `track` começa, a partir do início da área de conteúdo. */
export function trackOffset(track: number, size: number, gap: number): number {
  return track * (size + gap);
}

/**
 * Coloca os filhos (cada um com o seu `span`) nas células, na ordem: cada linha de fluxo se
 * preenche da trilha inicial à final; o filho que não cabe no que resta da linha vai para a
 * próxima e deixa o buraco (sem `dense`, como o `LazyVerticalGrid` e o auto-placement do CSS).
 */
export function placeCells(
  spans: readonly number[],
  count: number,
): { cells: GridCell[]; lines: number } {
  const n = Math.max(1, Math.floor(count));
  const cells: GridCell[] = [];
  let line = 0;
  let track = 0;
  spans.forEach((raw, index) => {
    const span = clampSpan(raw, n);
    if (track > 0 && track + span > n) {
      line += 1;
      track = 0;
    }
    cells.push({ index, line, track, span });
    track += span;
    if (track >= n) {
      line += 1;
      track = 0;
    }
  });
  const last = cells[cells.length - 1];
  return { cells, lines: last === undefined ? 0 : last.line + 1 };
}

/**
 * Posição e tamanho de um filho de tamanho `size` dentro da célula de extensão `cell` (a partir do
 * início dela): `start` (padrão), `center` e `end` guardam o tamanho; `stretch` o faz ocupar a
 * célula. O filho maior que a célula começa no início dela (o excesso passa pelo fim).
 */
export function alignInCell(
  align: LayoutAlign | LayoutJustify,
  cell: number,
  size: number,
): { pos: number; size: number } {
  if (align === 'stretch') return { pos: 0, size: Math.max(0, cell) };
  if (align === 'center') return { pos: (cell - size) / 2, size };
  if (align === 'end') return { pos: cell - size, size };
  return { pos: 0, size };
}
