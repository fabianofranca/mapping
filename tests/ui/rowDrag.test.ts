import { describe, expect, it } from 'vitest';
import { dropBefore, dropIndex, moveKeyDelta } from '../../src/ui/rowDrag';

// P6: reordenar pares e linhas por arrasto. Centros das linhas: 15, 45, 75, 105.
const mids = [15, 45, 75, 105];

describe('arrasto de linhas', () => {
  it('posição final: quantas das outras linhas ficam acima do ponteiro', () => {
    expect(dropIndex(mids, 10, 0)).toBe(0);
    expect(dropIndex(mids, 50, 0)).toBe(1);
    expect(dropIndex(mids, 200, 0)).toBe(3);
    expect(dropIndex(mids, 0, 3)).toBe(0);
    expect(dropIndex(mids, 60, 3)).toBe(2);
    // Sem sair do lugar: a própria linha não conta.
    expect(dropIndex(mids, 45, 1)).toBe(1);
  });

  it('linha de destino: antes da linha de destino, ou depois da última', () => {
    expect(dropBefore(3, 0)).toBe(0);
    expect(dropBefore(0, 1)).toBe(2);
    expect(dropBefore(0, 3)).toBe(4);
  });

  it('teclado: Alt+Shift+↑/↓ em qualquer célula; ↑/↓ só na alça', () => {
    const key = (k: string, alt = false, shift = false) =>
      new KeyboardEvent('keydown', { key: k, altKey: alt, shiftKey: shift });
    expect(moveKeyDelta(key('ArrowUp', true, true), false)).toBe(-1);
    expect(moveKeyDelta(key('ArrowDown', true, true), false)).toBe(1);
    expect(moveKeyDelta(key('ArrowDown'), false)).toBe(0);
    expect(moveKeyDelta(key('ArrowDown'), true)).toBe(1);
    expect(moveKeyDelta(key('ArrowDown', true), true)).toBe(0);
    expect(moveKeyDelta(key('Enter', true, true), false)).toBe(0);
  });
});
