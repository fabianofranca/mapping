// Nível de detalhe da seta pelo tamanho dela e o das pontas na tela (etapa canvas-desempenho, decisão 7).
import { levelOfDetail } from './levelOfDetail';

export type ArrowDetail = 'full' | 'thin' | 'hidden';

/** Uma ponta da seta: a marcação ligada, com o tamanho na tela (px). */
export interface ArrowEnd {
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Selecionada (inclusive na seleção múltipla), sob o mouse ou com marca da revisão. */
  readonly always: boolean;
}

export interface ArrowDetailInput {
  /** Comprimento do traço na tela (px): soma dos trechos do `path` × zoom. */
  readonly screenLength: number;
  /** A seta está selecionada. */
  readonly always: boolean;
  readonly from: ArrowEnd;
  readonly to: ArrowEnd;
  /** `size-lod-min-marking`: abaixo disto o comprimento só dá o traço. */
  readonly minFull: number;
  /** `size-lod-hide-marking`: abaixo disto, nas duas medidas, a ponta é invisível. */
  readonly hide: number;
}

/** A ponta é invisível pelo tamanho (a mesma regra das marcações, `levelOfDetail`). */
function endHidden(end: ArrowEnd, input: ArrowDetailInput): boolean {
  return (
    levelOfDetail({
      screenWidth: end.screenWidth,
      screenHeight: end.screenHeight,
      always: end.always,
      minFull: input.minFull,
      hide: input.hide,
    }) === 'hidden'
  );
}

/**
 * Inteira se a seta está selecionada ou liga uma marcação selecionada, sob o mouse (ou com marca
 * da revisão); some se as duas pontas são invisíveis; só o traço (sem halo, ponta nem rótulo) se o
 * comprimento na tela é menor que `minFull`.
 */
export function arrowDetail(input: ArrowDetailInput): ArrowDetail {
  if (input.always || input.from.always || input.to.always) return 'full';
  if (endHidden(input.from, input) && endHidden(input.to, input)) return 'hidden';
  return input.screenLength < input.minFull ? 'thin' : 'full';
}
