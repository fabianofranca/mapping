// Nível de detalhe da marcação pelo tamanho dela na tela (etapa canvas-escala, decisão 4).
export type LevelOfDetail = 'full' | 'border' | 'hidden';

export interface LevelOfDetailInput {
  /** Tamanho da marcação na tela (px). */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Selecionada (inclusive na seleção múltipla), sob o mouse ou com marca da revisão: sempre completa. */
  readonly always: boolean;
  /** `size-lod-min-marking`: abaixo disto (largura ou altura) só a borda. */
  readonly minFull: number;
  /** `size-lod-hide-marking`: abaixo disto nas duas medidas, nada. */
  readonly hide: number;
}

export function levelOfDetail(input: LevelOfDetailInput): LevelOfDetail {
  if (input.always) return 'full';
  const { screenWidth: w, screenHeight: h } = input;
  if (w < input.hide && h < input.hide) return 'hidden';
  return w < input.minFull || h < input.minFull ? 'border' : 'full';
}
