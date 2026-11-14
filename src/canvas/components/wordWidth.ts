/**
 * The widest word of a text, measured with Konva. The model and the MCP PNG break the line only
 * between words (a word wider than the box stays alone on the line and overflows the edge); the
 * Konva `Text`, with no space to break at, splits the word letter by letter. The app's measurer
 * and drawing widen the text up to the widest word, and Konva then breaks where the model
 * breaks.
 */
import type { TextConfig } from 'konva/lib/shapes/Text';
import { wrapWords } from '../../model/components/instantiate';

/** How many words (the ones with the most letters) the text measures: enough to find the widest. */
const WORDS_MEASURED = 8;

/** What the width of a word reads from the text's font. */
export type WordFont = Pick<
  TextConfig,
  'fontFamily' | 'fontSize' | 'fontStyle' | 'letterSpacing'
>;

/**
 * `width` or, if a word of the text is wider, its width: the width with which Konva breaks
 * the text only between words. Text with no extra space (a single word that fits) returns
 * `width`. Without a canvas to measure on (tests without it), returns `width`.
 */
export function wordSafeWidth(text: string, font: WordFont, width: number): number {
  // A word of `n` letters is at most `n × (size + spacing)`: one that fits in the box by that
  // is not even measured (the common case), and only the ones that may exceed it go to Konva.
  const advance = Number(font.fontSize ?? 0) + Number(font.letterSpacing ?? 0);
  // The whole text fits by that: no word exceeds the box (the common case, no split or sort).
  if (text.length * advance <= width) return width;
  const words = [
    ...new Set(
      // Only space, tab and newline split: the NBSP is part of the word (in Konva and the model).
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
 * The text and the width with which Konva breaks like the model: with a word wider than the
 * box, the `Text` widens up to it (`wordSafeWidth`) and the other lines already go pre-broken
 * (`\n`) where the model breaks them at the box width, otherwise Konva would join them at the
 * larger width.
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

/** The width of a text in the font (with the letter spacing); `null` without a canvas. */
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

/** The 2D context of a measure-only canvas (nothing from the `Stage`); `null` without a canvas
 * (tests in jsdom). */
function measureContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  return context;
}
