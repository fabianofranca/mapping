import { describe, expect, it } from 'vitest';
import { largestFreeRect } from '../../src/canvas/freeArea';

const outer = { x: 0, y: 0, width: 100, height: 100 };

describe('maior área livre (texto do pai)', () => {
  it('sem filhas, a própria área', () => {
    expect(largestFreeRect(outer, [])).toEqual(outer);
  });

  it('filha no topo: sobra a faixa de baixo', () => {
    const child = { x: 0, y: 0, width: 100, height: 30 };
    expect(largestFreeRect(outer, [child])).toEqual({
      x: 0,
      y: 30,
      width: 100,
      height: 70,
    });
  });

  it('filha no meio: vence a maior das quatro faixas em volta', () => {
    const child = { x: 20, y: 10, width: 50, height: 50 };
    // Abaixo da filha: 100 × 40 = 4000 (acima: 1000; esquerda: 2000; direita: 3000).
    expect(largestFreeRect(outer, [child])).toEqual({
      x: 0,
      y: 60,
      width: 100,
      height: 40,
    });
  });

  it('várias filhas: considera as combinações das bordas', () => {
    const children = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 60, y: 60, width: 40, height: 40 },
    ];
    // Faixas em L: 60 × 60 (direita-cima ou esquerda-baixo) = 3600; faixa central 100 × 20 = 2000.
    const result = largestFreeRect(outer, children);
    expect(result && result.width * result.height).toBe(3600);
    for (const c of children) {
      const overlap =
        result !== null &&
        result.x < c.x + c.width &&
        c.x < result.x + result.width &&
        result.y < c.y + c.height &&
        c.y < result.y + result.height;
      expect(overlap).toBe(false);
    }
  });

  it('Header › Back: o texto da Header fica fora da Back', () => {
    const header = { x: 0, y: 0, width: 1080, height: 200 };
    const back = { x: 20, y: 40, width: 120, height: 120 };
    expect(largestFreeRect(header, [back])).toEqual({
      x: 140,
      y: 0,
      width: 940,
      height: 200,
    });
  });

  it('com tamanho mínimo, prefere a área em que o texto cabe', () => {
    // Faixa fina e comprida à esquerda (10 × 100 = 1000) × bloco à direita (30 × 30 = 900).
    const children = [
      { x: 10, y: 0, width: 60, height: 100 },
      { x: 70, y: 30, width: 30, height: 70 },
    ];
    expect(largestFreeRect(outer, children)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 100,
    });
    expect(largestFreeRect(outer, children, { minWidth: 20, minHeight: 20 })).toEqual({
      x: 70,
      y: 0,
      width: 30,
      height: 30,
    });
    // Se nenhuma cabe, a maior de todas.
    expect(largestFreeRect(outer, children, { minWidth: 50, minHeight: 50 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 100,
    });
  });

  it('filhas cobrindo tudo: sem área livre', () => {
    expect(largestFreeRect(outer, [outer])).toBeNull();
  });

  it('funciona com origem fora do zero e filhas passando da borda', () => {
    const o = { x: 1000, y: 500, width: 200, height: 100 };
    const child = { x: 900, y: 450, width: 200, height: 200 };
    expect(largestFreeRect(o, [child])).toEqual({
      x: 1100,
      y: 500,
      width: 100,
      height: 100,
    });
  });
});
