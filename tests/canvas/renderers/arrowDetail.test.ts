import { describe, expect, it } from 'vitest';
import {
  arrowDetail,
  type ArrowDetailInput,
  type ArrowEnd,
} from '../../../src/canvas/renderers/arrowDetail';

const BIG: ArrowEnd = { screenWidth: 100, screenHeight: 100, always: false };
const dot = (side: number, always = false): ArrowEnd => ({
  screenWidth: side,
  screenHeight: side,
  always,
});

function input(over: Partial<ArrowDetailInput> = {}): ArrowDetailInput {
  return {
    screenLength: 100,
    always: false,
    from: BIG,
    to: BIG,
    minFull: 24,
    hide: 2,
    ...over,
  };
}

describe('arrowDetail', () => {
  it('a seta longa com pontas visíveis é inteira', () => {
    expect(arrowDetail(input())).toBe('full');
  });

  it('comprimento: 23 px é só o traço e 24 px é inteira', () => {
    expect(arrowDetail(input({ screenLength: 23 }))).toBe('thin');
    expect(arrowDetail(input({ screenLength: 24 }))).toBe('full');
  });

  it('some só se as duas pontas são invisíveis: 1 px nas duas medidas some, 2 px não', () => {
    expect(arrowDetail(input({ from: dot(1), to: dot(1) }))).toBe('hidden');
    expect(arrowDetail(input({ from: dot(2), to: dot(1) }))).not.toBe('hidden');
    expect(arrowDetail(input({ from: dot(1), to: dot(2) }))).not.toBe('hidden');
    // Uma medida basta para a ponta não ser invisível.
    const thinTall: ArrowEnd = { screenWidth: 1, screenHeight: 2, always: false };
    expect(arrowDetail(input({ from: thinTall, to: dot(1) }))).not.toBe('hidden');
  });

  it('a seta entre uma ponta visível e outra invisível não some', () => {
    expect(arrowDetail(input({ from: dot(1), to: BIG }))).toBe('full');
    expect(arrowDetail(input({ from: BIG, to: dot(1), screenLength: 10 }))).toBe('thin');
  });

  it('a que liga duas pontas invisíveis some mesmo sendo longa ou curta', () => {
    expect(arrowDetail(input({ from: dot(1), to: dot(1), screenLength: 500 }))).toBe(
      'hidden',
    );
    expect(arrowDetail(input({ from: dot(1), to: dot(1), screenLength: 5 }))).toBe(
      'hidden',
    );
  });

  it('a seta selecionada é sempre inteira', () => {
    const tiny = { from: dot(1), to: dot(1), screenLength: 3 };
    expect(arrowDetail(input({ ...tiny, always: true }))).toBe('full');
  });

  it('a ligada a uma marcação selecionada ou sob o mouse é sempre inteira', () => {
    const tiny = { screenLength: 3 };
    expect(arrowDetail(input({ ...tiny, from: dot(1, true), to: dot(1) }))).toBe('full');
    expect(arrowDetail(input({ ...tiny, from: dot(1), to: dot(1, true) }))).toBe('full');
  });
});
