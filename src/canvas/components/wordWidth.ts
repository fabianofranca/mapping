/**
 * A palavra mais larga de um texto, medida com o Konva. O modelo e o PNG do MCP quebram a linha só
 * entre palavras (uma palavra mais larga que a caixa fica sozinha na linha e passa da borda); o
 * `Text` do Konva, sem espaço para quebrar, parte a palavra letra por letra. O medidor e o desenho
 * da app alargam o texto até a palavra mais larga, e o Konva passa a quebrar onde o modelo quebra.
 */
import type { TextConfig } from 'konva/lib/shapes/Text';
import { wrapWords } from '../../model/components/instantiate';

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
  // Uma palavra de `n` letras não passa de `n × (corpo + espaçamento)`: a que cabe nisso na caixa
  // nem é medida (o caso comum), e só as que podem passar dela vão ao Konva.
  const advance = Number(font.fontSize ?? 0) + Number(font.letterSpacing ?? 0);
  // O texto inteiro cabe nisso: nenhuma palavra passa da caixa (o caso comum, sem dividir nem ordenar).
  if (text.length * advance <= width) return width;
  const words = [
    ...new Set(
      // Só espaço, tab e quebra dividem: o NBSP é parte da palavra (no Konva e no modelo).
      text
        .split(/[ \t\n]+/)
        .filter((word) => word.length > 0 && word.length * advance > width),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, WORDS_MEASURED);
  let widest = width;
  const widthOf = fontWidth(font);
  if (widthOf === null) return width;
  for (const word of words) widest = Math.max(widest, widthOf(word));
  return widest;
}

/**
 * O texto e a largura com que o Konva quebra como o modelo: com uma palavra mais larga que a
 * caixa, o `Text` se alarga até ela (`wordSafeWidth`) e as outras linhas já vão quebradas (`\n`)
 * onde o modelo as quebra na largura da caixa, senão o Konva as juntaria na largura maior.
 */
export function wordSafeText(
  text: string,
  font: WordFont,
  width: number,
): { text: string; width: number } {
  const safe = wordSafeWidth(text, font, width);
  const widthOf = safe > width ? fontWidth(font) : null;
  if (widthOf === null) return { text, width: safe };
  const broken = text
    .split('\n')
    .map((paragraph) => wrapWords(paragraph, widthOf, width).join('\n'))
    .join('\n');
  return { text: broken, width: safe };
}

/** A largura de um texto na fonte (com o espaçamento entre letras); `null` sem canvas. */
function fontWidth(font: WordFont): ((text: string) => number) | null {
  const ctx = measureContext();
  if (ctx === null) return null;
  const css = `${font.fontStyle ?? 'normal'} ${Number(font.fontSize ?? 12)}px ${font.fontFamily ?? 'sans-serif'}`;
  const spacing = Number(font.letterSpacing ?? 0);
  return (value) => {
    ctx.font = css;
    return ctx.measureText(value).width + spacing * [...value].length;
  };
}

let context: CanvasRenderingContext2D | null | undefined;

/** O contexto 2D de um canvas só de medida (nada do `Stage`); `null` sem canvas (testes em jsdom). */
function measureContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  return context;
}
