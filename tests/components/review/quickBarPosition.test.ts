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

  // Finding CL2.1 of #2746, the retest's numbers at 900×720: the area is 360×262, the bar 360×122,
  // the notices fill the top (page 235..572 × 80..162 → area 15..352 × 8..90) and the minimap the
  // lower right. No spot is free: the bar goes where it covers the least, never over the notices.
  it('takes the spot that covers the least when none is free, never under the notices', () => {
    const small = { width: 360, height: 262 };
    const wide = { width: 360, height: 122 };
    const notices = { x: 15, y: 8, width: 337, height: 82 };
    const minimap = { x: 244, y: 158, width: 108, height: 96 };
    const box = { x: 100, y: 20, width: 60, height: 30 };
    const pos = barPosition(box, wide, small, 8, [notices, minimap]);
    const at = { x: pos.left, y: pos.top, ...wide };
    const inter = (r: { x: number; y: number; width: number; height: number }) =>
      Math.max(0, Math.min(at.x + at.width, r.x + r.width) - Math.max(at.x, r.x)) *
      Math.max(0, Math.min(at.y + at.height, r.y + r.height) - Math.max(at.y, r.y));
    expect(inter(notices)).toBe(0);
    expect(inter(minimap)).toBeLessThan(108 * 96);
  });
});
