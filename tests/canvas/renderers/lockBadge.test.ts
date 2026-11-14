import { describe, expect, it } from 'vitest';
import { lockBadgeSpot } from '../../../src/canvas/renderers/lockBadge';

const VIEW = { x: 0, y: 0, width: 400, height: 700 };

describe('lockBadgeSpot', () => {
  it('large item: inside the top right corner, with a 2 px gap', () => {
    const rect = { x: 100, y: 100, width: 200, height: 200 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 300 - 22, y: 102 });
  });

  it('the screen size does not change with the zoom', () => {
    const rect = { x: 100, y: 100, width: 200, height: 200 };
    expect(lockBadgeSpot(rect, VIEW, 2, 20)).toEqual({ x: 300 - 11, y: 101 });
  });

  it('with the right border or the top off screen, it anchors to the visible part', () => {
    const rect = { x: -50, y: -80, width: 1000, height: 1000 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 400 - 22, y: 2 });
  });

  it('small item: outside, above the top right corner', () => {
    const rect = { x: 100, y: 200, width: 30, height: 30 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 110, y: 200 - 22 });
  });

  it('small item without room above on screen: below', () => {
    const rect = { x: 100, y: 5, width: 30, height: 30 };
    expect(lockBadgeSpot(rect, VIEW, 1, 20)).toEqual({ x: 110, y: 35 + 2 });
  });
});
