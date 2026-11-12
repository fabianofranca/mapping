/**
 * Motor dos componentes: contas puras do plano de uma grade (`layout.type: "grid"`) que não
 * dependem do fechamento do motor (`instantiate.ts`). As contas de trilhas e células ficam em
 * `gridLayout.ts`; aqui, as de medida: a maior célula (`hug`) e a extensão de cada linha de fluxo.
 */
import type { GridCell } from './gridLayout';

/** As trilhas da grade: quantas (`columns`/`rows`) ou o mínimo (`minColumnWidth`/`minRowHeight`). */
export interface GridTracks {
  readonly count?: number | undefined;
  readonly min?: number | undefined;
  /** `true` = as trilhas são as colunas (largura); `false` = as linhas (grade horizontal). */
  readonly vertical: boolean;
}

/** As quatro chaves de trilha, com o rótulo do aviso e o que cada uma é. */
export const TRACK_KEYS = [
  { key: 'columns', field: 'count', vertical: true },
  { key: 'minColumnWidth', field: 'min', vertical: true },
  { key: 'rows', field: 'count', vertical: false },
  { key: 'minRowHeight', field: 'min', vertical: false },
] as const;

/** O número que um valor de expressão representa (número ou texto numérico); `NaN` se nenhum. */
export function numericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/** Um valor de trilha válido: inteiro ≥ 1 para `columns`/`rows`, número > 0 para o mínimo. */
export function validTrack(field: 'count' | 'min', value: unknown): number | undefined {
  const n = numericValue(value);
  if (field === 'count') return Number.isInteger(n) && n >= 1 ? n : undefined;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * A trilha mais larga que as células pedem: cada filho de `span` trilhas pede `(tamanho − gaps do
 * span) / span` por trilha (colunas iguais pela maior, o `IntrinsicSize.Min` com `weight(1f)`).
 */
export function maxCellOf(
  cells: readonly GridCell[],
  sizes: readonly number[],
  gap: number,
): number {
  return cells.reduce((widest, cell, i) => {
    const share = ((sizes[i] ?? 0) - gap * (cell.span - 1)) / cell.span;
    return Math.max(widest, share);
  }, 0);
}

/** A extensão de cada linha de fluxo: a do filho maior nela. */
export function lineExtents(
  cells: readonly GridCell[],
  lines: number,
  sizes: readonly number[],
): number[] {
  const extents = Array.from({ length: lines }, () => 0);
  cells.forEach((cell, i) => {
    extents[cell.line] = Math.max(extents[cell.line] ?? 0, sizes[i] ?? 0);
  });
  return extents;
}
