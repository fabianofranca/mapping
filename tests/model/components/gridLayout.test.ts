// L3 (decisões 10 a 12 da #1078): as funções puras da grade.
import { describe, expect, it } from 'vitest';
import {
  alignInCell,
  clampSpan,
  placeCells,
  spanExtent,
  trackCount,
  trackOffset,
  trackSize,
} from '../../../src/model/components/gridLayout';

describe('trackCount', () => {
  it('columns fixas', () => {
    expect(trackCount({ count: 3 }, 400, 8)).toBe(3);
  });
  it('minColumnWidth 120 numa largura de 400 com gap 8 dá 3 colunas', () => {
    expect(trackCount({ min: 120 }, 400, 8)).toBe(3);
  });
  it('minColumnWidth sem largura conhecida: uma coluna; largura menor que o mínimo: uma', () => {
    expect(trackCount({ min: 120 }, null, 8)).toBe(1);
    expect(trackCount({ min: 120 }, 50, 8)).toBe(1);
  });
});

describe('trackSize e spanExtent', () => {
  it('3 colunas de 400 com gap 8: (400 − 16) / 3', () => {
    expect(trackSize(400, 3, 8)).toBeCloseTo(128);
    expect(spanExtent(128, 2, 8)).toBeCloseTo(264);
    expect(trackOffset(2, 128, 8)).toBeCloseTo(272);
  });
});

describe('placeCells', () => {
  it('3 colunas com 7 filhos: 3 linhas, a última com 1', () => {
    const { cells, lines } = placeCells(Array(7).fill(1), 3);
    expect(lines).toBe(3);
    expect(cells.map((c) => [c.line, c.track])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ]);
  });
  it('span 2 que não cabe no fim da linha vai para a próxima e deixa o buraco', () => {
    const { cells } = placeCells([1, 1, 2, 1], 3);
    expect(cells.map((c) => [c.line, c.track, c.span])).toEqual([
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 2],
      [1, 2, 1],
    ]);
  });
  it('span maior que as trilhas é limitado', () => {
    expect(clampSpan(5, 3)).toBe(3);
    expect(placeCells([5, 1], 3).cells.map((c) => [c.line, c.track, c.span])).toEqual([
      [0, 0, 3],
      [1, 0, 1],
    ]);
  });
  it('sem filhos, zero linhas', () => {
    expect(placeCells([], 3)).toEqual({ cells: [], lines: 0 });
  });
});

describe('alignInCell', () => {
  it('start, center, end e stretch', () => {
    expect(alignInCell('start', 100, 40)).toEqual({ pos: 0, size: 40 });
    expect(alignInCell('center', 100, 40)).toEqual({ pos: 30, size: 40 });
    expect(alignInCell('end', 100, 40)).toEqual({ pos: 60, size: 40 });
    expect(alignInCell('stretch', 100, 40)).toEqual({ pos: 0, size: 100 });
  });
});
