import { describe, expect, it } from 'vitest';
import { barPosition } from '../../../src/ui/review/QuickReviewBar';

// Findings CL1.2 and CL1.3 of #2743: the bar moves out of the way of the minimap and of the corner
// notices instead of sitting under or over them.
const area = { width: 600, height: 400 };
const bar = { width: 300, height: 90 };
const overlaps = (
  a: { left: number; top: number },
  r: { x: number; y: number; width: number; height: number },
) =>
  a.left < r.x + r.width &&
  r.x < a.left + bar.width &&
  a.top < r.y + r.height &&
  r.y < a.top + bar.height;

describe('barPosition', () => {
  it('goes below the box and clamps inside the area', () => {
    const box = { x: 500, y: 100, width: 80, height: 40 };
    expect(barPosition(box, bar, area, 8)).toEqual({ left: 300, top: 148 });
  });

  it('does not sit over the minimap at the lower right', () => {
    const minimap = { x: 460, y: 300, width: 132, height: 92 };
    const box = { x: 480, y: 220, width: 100, height: 40 };
    const pos = barPosition(box, bar, area, 8, [minimap]);
    expect(overlaps(pos, minimap)).toBe(false);
    expect(barPosition(box, bar, area, 8)).toEqual({ left: 300, top: 268 });
  });

  it('does not sit under the notices at the top right', () => {
    const notice = { x: 380, y: 8, width: 212, height: 120 };
    const box = { x: 400, y: 60, width: 100, height: 40 };
    const pos = barPosition(box, bar, area, 8, [notice]);
    expect(overlaps(pos, notice)).toBe(false);
  });
});
