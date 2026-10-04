import { describe, expect, it } from 'vitest';
import { lockBadgeSpot } from '../../../src/canvas/renderers/lockBadge';

const VIEW = { x: 0, y: 0, width: 400, height: 700 };

describe('lockBadgeSpot', () => {
  it('item grande: por dentro do canto superior direito, com vão de 2 px', () => {
    const rect = { x: 100, y: 100, width: 200, height: 200 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 300 - 22, y: 102 });
  });

  it('o tamanho em tela não muda com o zoom', () => {
    const rect = { x: 100, y: 100, width: 200, height: 200 };
    expect(lockBadgeSpot(rect, VIEW, 2, 20)).toEqual({ x: 300 - 11, y: 101 });
  });

  it('com a borda direita ou o topo fora da tela, ancora na parte visível', () => {
    const rect = { x: -50, y: -80, width: 1000, height: 1000 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 400 - 22, y: 2 });
  });

  it('item pequeno: por fora, acima do canto superior direito', () => {
    const rect = { x: 100, y: 200, width: 30, height: 30 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 110, y: 200 - 22 });
  });

  it('item pequeno sem espaço acima na tela: por baixo', () => {
    const rect = { x: 100, y: 5, width: 30, height: 30 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 110, y: 35 + 2 });
  });
});
