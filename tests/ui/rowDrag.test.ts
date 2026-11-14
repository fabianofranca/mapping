import { describe, expect, it } from 'vitest';
import { dropBefore, dropIndex, moveKeyDelta } from '../../src/ui/rowDrag';

// P6: reorder pairs and rows by dragging. Row centers: 15, 45, 75, 105.
const mids = [15, 45, 75, 105];

describe('row dragging', () => {
  it('final position: how many of the other rows stay above the pointer', () => {
    expect(dropIndex(mids, 10, 0)).toBe(0);
    expect(dropIndex(mids, 50, 0)).toBe(1);
    expect(dropIndex(mids, 200, 0)).toBe(3);
    expect(dropIndex(mids, 0, 3)).toBe(0);
    expect(dropIndex(mids, 60, 3)).toBe(2);
    // Without leaving its place: the row itself does not count.
    expect(dropIndex(mids, 45, 1)).toBe(1);
  });

  it('target row: before the target row, or after the last one', () => {
    expect(dropBefore(3, 0)).toBe(0);
    expect(dropBefore(0, 1)).toBe(2);
    expect(dropBefore(0, 3)).toBe(4);
  });

  it('keyboard: Alt+Shift+↑/↓ in any cell; ↑/↓ only on the handle', () => {
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
