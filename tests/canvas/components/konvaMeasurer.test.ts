// O medidor e o desenho usam a mesma função de família: o mesmo valor para a mesma entrada.
import { describe, expect, it, vi } from 'vitest';

const configs: Array<{ fontFamily?: string }> = [];
vi.mock('konva/lib/shapes/Text', () => ({
  Text: class {
    constructor(config: { fontFamily?: string }) {
      configs.push(config);
    }
    // Como o Konva: `width()` devolve a largura fixada (o `maxWidth`) e `getTextWidth()`, a natural.
    width = () => 400;
    getTextWidth = () => 10;
    height = () => 10;
    textArr: { text: string }[] = [{ text: 'OK' }];
    // Para a linha de base (`capMetricsOf`): ascent 12, descent 4 e `H` de 10 em qualquer corpo.
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
  it('a largura é a natural do texto, limitada ao maxWidth', () => {
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
    'mede com a família %s igual ao desenho',
    (family) => {
      configs.length = 0;
      konvaMeasurer(
        'Olá',
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

describe('konvaMeasurer: linha de base (MC1, decisão 2)', () => {
  const font = {
    family: 'Roboto',
    size: 14,
    weight: 400,
    italic: false,
    lineHeight: 20,
    letterSpacing: 0,
  };

  it('devolve firstBaseline, lastBaseline e lineCount pela lineBaseline do canvas', () => {
    const m = konvaMeasurer('OK', font, 400);
    // centro da linha (10) + (ascent 12 − descent 4) / 2
    expect(m.firstBaseline).toBe(14);
    expect(m.lastBaseline).toBe(14);
    expect(m.lineCount).toBe(1);
  });
});
