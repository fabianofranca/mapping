// The measurer and the drawing use the same family function: the same value for the same input.
import { describe, expect, it, vi } from 'vitest';

const configs: Array<{ fontFamily?: string }> = [];
vi.mock('konva/lib/shapes/Text', () => ({
  Text: class {
    constructor(config: { fontFamily?: string }) {
      configs.push(config);
    }
    // Like Konva: `width()` returns the fixed width (the `maxWidth`) and `getTextWidth()`, the natural one.
    width = () => 400;
    getTextWidth = () => 10;
    height = () => 10;
    textArr: { text: string }[] = [{ text: 'OK' }];
    // For the baseline (`capMetricsOf`): ascent 12, descent 4 and `H` of 10 at any size.
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
import { canvasFontFamily } from '../../../src/model/components/fontFamily';

describe('konvaMeasurer', () => {
  it('the width is the natural one of the text, limited to maxWidth', () => {
    const font = {
      family: 'Roboto',
      size: 14,
      weight: 400,
      italic: false,
      lineHeight: 20,
      letterSpacing: 0,
    };
    expect(konvaMeasurer('OK', font, 400).width).toBe(10);
    expect(konvaMeasurer('OK', font, 4).width).toBe(4);
    expect(konvaMeasurer('OK', font, undefined).width).toBe(10);
  });

  it.each(['Roboto', 'system-ui', 'system-ui, "Segoe UI", sans-serif', '"Segoe UI, x'])(
    'measures with the family %s the same as the drawing',
    (family) => {
      configs.length = 0;
      konvaMeasurer(
        'Hello',
        {
          family,
          size: 14,
          weight: 400,
          italic: false,
          lineHeight: 20,
          letterSpacing: 0,
        },
        undefined,
      );
      expect(configs[0]?.fontFamily).toBe(canvasFontFamily(family));
    },
  );
});

describe('konvaMeasurer: baseline (MC1, decision 2)', () => {
  const font = {
    family: 'Roboto',
    size: 14,
    weight: 400,
    italic: false,
    lineHeight: 20,
    letterSpacing: 0,
  };

  it('returns firstBaseline, lastBaseline and lineCount from the canvas lineBaseline', () => {
    const m = konvaMeasurer('OK', font, 400);
    // line center (10) + (ascent 12 − descent 4) / 2
    expect(m.firstBaseline).toBe(14);
    expect(m.lastBaseline).toBe(14);
    expect(m.lineCount).toBe(1);
  });
});
