/**
 * A palavra mais larga de um texto, medida com o Konva. O modelo e o PNG do MCP quebram a linha só
 * entre palavras (uma palavra mais larga que a caixa fica sozinha na linha e passa da borda); o
 * `Text` do Konva, sem espaço para quebrar, parte a palavra letra por letra. O medidor e o desenho
 * da app alargam o texto até a palavra mais larga, e o Konva passa a quebrar onde o modelo quebra.
 */
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { TextConfig } from 'konva/lib/shapes/Text';

/** Quantas palavras (as de mais letras) o texto mede: o bastante para achar a mais larga. */
const WORDS_MEASURED = 8;

/** O que a largura de uma palavra lê da fonte do texto. */
export type WordFont = Pick<
  TextConfig,
  'fontFamily' | 'fontSize' | 'fontStyle' | 'letterSpacing'
>;

/**
 * `width` ou, se uma palavra do texto é mais larga, a largura dela: a largura com que o Konva
 * quebra o texto só entre palavras. Texto sem espaço de sobra (uma palavra só que cabe) devolve
 * `width`. Sem canvas para medir (testes sem ele), devolve `width`.
 */
export function wordSafeWidth(text: string, font: WordFont, width: number): number {
  const words = [...new Set(text.split(/\s+/).filter((word) => word.length > 0))]
    .sort((a, b) => b.length - a.length)
    .slice(0, WORDS_MEASURED);
  let widest = width;
  for (const word of words) {
    try {
      const probe = new KonvaText({ ...font, text: word, wrap: 'none' });
      widest = Math.max(widest, probe.getTextWidth());
      probe.destroy();
    } catch {
      return width;
    }
  }
  return widest;
}
