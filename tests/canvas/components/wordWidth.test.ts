// A word wider than the box stays whole on the line (as in the model and in the MCP PNG): the
// measurer and the drawing widen the Konva `Text` up to it, and Konva only breaks between words.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 6 px per letter: the measure-only canvas of `wordSafeWidth` (jsdom has no 2D).
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
  () => ({ font: '', measureText: (t: string) => ({ width: t.length * 6 }) }) as never,
);

const configs: Array<{ text?: string; width?: number; wrap?: string }> = [];
vi.mock('konva/lib/shapes/Text', () => ({
  Text: class {
    private readonly config: { text?: string; width?: number };
    constructor(config: { text?: string; width?: number }) {
      this.config = config;
      configs.push(config);
    }
    // 6 px per letter (the text without `width`: the natural width).
    getTextWidth = () => (this.config.text ?? '').length * 6;
    width = () => this.config.width ?? 0;
    height = () => 20;
    textArr: { text: string }[] = [{ text: 'x' }];
    fontSize = () => 14;
    measureSize = () => ({
      width: 0,
      fontBoundingBoxAscent: 12 * 32,
      fontBoundingBoxDescent: 4 * 32,
      actualBoundingBoxAscent: 10 * 32,
      actualBoundingBoxDescent: 0,
    });
    destroy = () => undefined;
  },
}));

import { konvaMeasurer } from '../../../src/canvas/components/konvaMeasurer';
import { wordSafeWidth } from '../../../src/canvas/components/wordWidth';

const face = {
  fontFamily: 'Roboto',
  fontSize: 14,
  fontStyle: 'normal',
  letterSpacing: 0,
};
const font = {
  family: 'Roboto',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

beforeEach(() => {
  configs.length = 0;
});

describe('wordSafeWidth', () => {
  it('returns the width of the widest word when it goes past the box', () => {
    expect(wordSafeWidth('Authorize payment', face, 10)).toBe(54);
    expect(wordSafeWidth('Salvar', face, 10)).toBe(36);
  });

  it('returns the requested width when every word fits', () => {
    expect(wordSafeWidth('Salvar', face, 100)).toBe(100);
    expect(wordSafeWidth('', face, 40)).toBe(40);
  });

  it('the non-breaking space (NBSP) does not split the word, as in Konva and in the model', () => {
    // "R$ 100.000,00" with NBSP: 13 letters of 6 px, a single word.
    expect(wordSafeWidth('R$\u00a0100.000,00', face, 30)).toBe(78);
  });
});

describe('konvaMeasurer: word wider than the box', () => {
  it('the Text gets the width of the widest word (plus the slack), not the box one', () => {
    konvaMeasurer('Salvar', { ...font }, 10);
    expect(configs.at(-1)?.width).toBe(36.5);
  });

  it('with the word fitting, the width is the box one plus the slack', () => {
    konvaMeasurer('Salvar', { ...font }, 100);
    expect(configs.at(-1)?.width).toBe(100.5);
  });

  it('widened by the long word, the text already goes broken where the model breaks', () => {
    // 6 px per letter in a box of 60: the model gives the long word, "ab cd ef" and "gh".
    konvaMeasurer('Supercalifragilistics ab cd ef gh', { ...font }, 60);
    expect(configs.at(-1)?.text).toBe('Supercalifragilistics\nab cd ef\ngh');
    expect(configs.at(-1)?.width).toBe(126.5);
  });

  it('with ellipsis, the cut is the box one: the width is not widened', () => {
    konvaMeasurer('Salvar', { ...font, ellipsis: true }, 10);
    expect(configs.at(-1)?.width).toBe(10.5);
  });
});
