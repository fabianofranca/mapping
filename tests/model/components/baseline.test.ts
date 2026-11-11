// MC0 (decisão 28 da #898): a conta única da linha de base e do `cap-middle`, pura e sem navegador.
import { describe, expect, it } from 'vitest';
import {
  CAP_HEIGHT_RATIO,
  capMetricsFallback,
  capMiddleShift,
  lineBaseline,
} from '../../../src/model/components/baseline';

describe('capMetricsFallback', () => {
  it('é a reserva de 0,8 / 0,2 / 0,7 do corpo', () => {
    expect(capMetricsFallback(10)).toEqual({ ascent: 8, descent: 2, capHeight: 7 });
    expect(CAP_HEIGHT_RATIO).toBe(0.7);
  });
});

describe('lineBaseline', () => {
  it('é o centro da linha mais metade de (ascent − descent)', () => {
    // linha de 20 que começa em 100, ascent 10 e descent 3: 100 + 10 + 3,5
    expect(lineBaseline(100, 20, { ascent: 10, descent: 3 })).toBe(113.5);
  });

  it('com ascent = descent a linha de base é o centro da linha', () => {
    expect(lineBaseline(0, 12, { ascent: 5, descent: 5 })).toBe(6);
  });
});

describe('capMiddleShift', () => {
  const metrics = { ascent: 10, descent: 3, capHeight: 8 };
  const shift = (boxHeight: number, lines: number, lineHeight = 14) =>
    capMiddleShift({
      boxHeight,
      capHeight: metrics.capHeight,
      firstBaseline: lineBaseline(0, lineHeight, metrics),
      lastBaseline: lineBaseline((lines - 1) * lineHeight, lineHeight, metrics),
    });

  it('uma linha: o topo da maiúscula e a base ficam centrados na caixa', () => {
    // baseline = 7 + 3,5 = 10,5; bloco = 8; (30 − 8)/2 + 8 − 10,5 = 8,5
    expect(shift(30, 1)).toBe(8.5);
  });

  it('com mais linhas o bloco cresce uma altura de linha por linha', () => {
    // 2 linhas: bloco = 14 + 8 = 22; (40 − 22)/2 + 8 − 10,5 = 6,5
    expect(shift(40, 2)).toBe(6.5);
  });

  it('é 0 com a caixa sem altura', () => {
    expect(shift(0, 1)).toBe(0);
    expect(shift(-4, 3)).toBe(0);
  });
});
