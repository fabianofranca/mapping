// CL2 (#896, achado 4.2 da CL1): as métricas do `cap-middle` não podem vir arredondadas em px
// inteiros. O canvas do navegador devolve ascent, descent e `H` inteiros nos tamanhos pequenos
// (16 px: 14, 3 e 12, quando valem 14,5, 3,4 e 11,25), e o desvio de ~0,5 unidade deixava o texto
// 2 a 3 px de tela abaixo do centro a 420%.
import type { Text as KonvaText } from 'konva/lib/shapes/Text';
import { describe, expect, it } from 'vitest';
import { capMetricsOf } from '../../../src/canvas/components/capMiddle';

/** Uma fonte de proporções 0,906 / 0,213 / 0,703 que o navegador mede arredondando ao pixel. */
function roundingSample(initial: number): KonvaText {
  let size = initial;
  const sample = {
    fontSize: (value?: number) => {
      if (value === undefined) return size;
      size = value;
      return sample;
    },
    measureSize: (text: string) => ({
      width: 0,
      fontBoundingBoxAscent: Math.round(0.906 * size),
      fontBoundingBoxDescent: Math.round(0.213 * size),
      actualBoundingBoxAscent: Math.round((text === 'H' ? 0.703 : 0.75) * size),
      actualBoundingBoxDescent: 0,
    }),
  };
  return sample as unknown as KonvaText;
}

describe('capMetricsOf', () => {
  it('mede num tamanho grande e devolve as métricas fracionárias no tamanho do nó', () => {
    const metrics = capMetricsOf(roundingSample(16), 16);
    expect(metrics.ascent).toBeCloseTo(0.906 * 16, 1);
    expect(metrics.descent).toBeCloseTo(0.213 * 16, 1);
    expect(metrics.capHeight).toBeCloseTo(0.703 * 16, 1);
  });

  it('devolve o nó no tamanho que tinha', () => {
    const sample = roundingSample(16);
    capMetricsOf(sample, 16);
    expect(sample.fontSize()).toBe(16);
  });
});
