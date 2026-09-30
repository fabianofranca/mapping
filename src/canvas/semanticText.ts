// Zoom semântico: quando e o que escrever dentro de cada marcação. Funções puras.
import type { LayerAnnotations } from '../model';

/** Tamanho mínimo na tela (px) para a marcação mostrar texto. Ajustáveis. */
export const SEMANTIC_MIN_WIDTH = 180;
export const SEMANTIC_MIN_HEIGHT = 100;

/** `header`: só a linha de cabeçalho (marcação com filhas). `full`: cabeçalho e pares. */
export type SemanticMode = 'none' | 'header' | 'full';

export interface SemanticInput {
  readonly enabled: boolean;
  /** Tamanho do retângulo da marcação na tela, em px. */
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly hasChildren: boolean;
}

/** Avaliado por marcação: o texto aparece quando o retângulo é grande o bastante na tela. */
export function semanticMode(input: SemanticInput): SemanticMode {
  if (
    !input.enabled ||
    input.screenWidth < SEMANTIC_MIN_WIDTH ||
    input.screenHeight < SEMANTIC_MIN_HEIGHT
  ) {
    return 'none';
  }
  return input.hasChildren ? 'header' : 'full';
}

export interface TextLine {
  readonly text: string;
  /** Cor da camada da linha. */
  readonly color: string;
  readonly bold: boolean;
}

/**
 * Linhas do corpo do texto: para cada camada visível, o nome de cada anotação
 * (quando tiver) e os pares `chave: valor`.
 */
export function bodyLines(sections: readonly LayerAnnotations[]): TextLine[] {
  const lines: TextLine[] = [];
  for (const { layer, annotations } of sections) {
    const base = { color: layer.color };
    for (const annotation of annotations) {
      if (annotation.name !== null) {
        lines.push({ ...base, text: annotation.name, bold: true });
      }
      for (const entry of annotation.entries) {
        lines.push({ ...base, text: `${entry.key}: ${entry.value}`, bold: false });
      }
    }
  }
  return lines;
}
