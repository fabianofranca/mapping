// Zoom semântico: quando a marcação mostra o nome. Função pura: o
// CanvasController só desenha o resultado (linha de cabeçalho com o nome).

/** Tamanho mínimo na tela (px) da marcação para o cabeçalho aparecer. Ajustáveis. */
export const SEMANTIC_MIN_WIDTH = 180;
export const SEMANTIC_MIN_HEIGHT = 100;

/** `none`: sem texto. `header`: a linha de cabeçalho (nome + indicadores). */
export type SemanticMode = 'none' | 'header';

export interface SemanticInput {
  /** Tamanho do retângulo da marcação na tela, em px. */
  readonly screenWidth: number;
  readonly screenHeight: number;
}

/** Avaliado por marcação: o cabeçalho aparece quando ela é grande o bastante na tela. */
export function semanticMode(input: SemanticInput): SemanticMode {
  return input.screenWidth >= SEMANTIC_MIN_WIDTH &&
    input.screenHeight >= SEMANTIC_MIN_HEIGHT
    ? 'header'
    : 'none';
}
