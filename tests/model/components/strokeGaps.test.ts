// MF2: the geometry of the outline with a gap (`gapOutlines`): the usual outline, with the radius of each
// corner, interrupted at the runs of `Stroke.gaps`; shared by Konva and by the raster.
import { describe, expect, it } from 'vitest';
import { gapOutlines } from '../../../src/model/components/strokeGaps';
import type { Stroke } from '../../../src/model/components/scene';

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#000' }],
  width: 2,
  align: 'center',
  ...extra,
});

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('gapOutlines', () => {
  const gapped = stroke({ gaps: [{ side: 'top', from: 20, to: 50 }] });
  const lines = gapOutlines(gapped, 100, 40, 6);

  it('with one gap, the outline is a single open line: starts where the gap ends and ends where it begins', () => {
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(near(line[0]!.x, 50) && near(line[0]!.y, 0)).toBe(true);
    const last = line[line.length - 1]!;
    expect(near(last.x, 20) && near(last.y, 0)).toBe(true);
  });

  it('no point of the top side falls inside the gap', () => {
    for (const p of lines.flat())
      expect(near(p.y, 0) && p.x > 20 + 1e-6 && p.x < 50 - 1e-6).toBe(false);
  });

  it('the four corners follow the radius (arcs, not straight tips)', () => {
    const points = lines.flat();
    // The arc point at 45° of the bottom-right corner: (100 - 6 + 6·cos45°, 40 - 6 + 6·sin45°).
    const k = 6 * Math.SQRT1_2;
    const corners = [
      [6 - k, 6 - k],
      [94 + k, 6 - k],
      [94 + k, 34 + k],
      [6 - k, 34 + k],
    ];
    for (const [x, y] of corners)
      expect(
        points.some((p) => Math.abs(p.x - x!) < 0.1 && Math.abs(p.y - y!) < 0.1),
      ).toBe(true);
    // and no point goes beyond the rectangle
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x).toBeLessThanOrEqual(100 + 1e-6);
      expect(p.y).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  it('two gaps on different sides give two open lines', () => {
    const two = gapOutlines(
      stroke({
        gaps: [
          { side: 'top', from: 20, to: 50 },
          { side: 'bottom', from: 30, to: 60 },
        ],
      }),
      100,
      40,
      6,
    );
    expect(two).toHaveLength(2);
  });

  it('the align inside takes the outline half a width inwards', () => {
    const inside = gapOutlines(
      stroke({ align: 'inside', gaps: [{ side: 'top', from: 20, to: 50 }] }),
      100,
      40,
      6,
    );
    const top = inside.flat().filter((p) => p.x >= 50 && p.x <= 90 && p.y < 3);
    expect(top.length).toBeGreaterThan(0);
    for (const p of top) expect(near(p.y, 1)).toBe(true);
  });

  it('a pill (straight sides of size 0) with a gap on top is still a single line', () => {
    const pill = gapOutlines(
      stroke({ gaps: [{ side: 'top', from: 30, to: 60 }] }),
      100,
      40,
      20,
    );
    expect(pill).toHaveLength(1);
  });

  it('without any cut run, there are no lines, the usual outline applies', () => {
    expect(
      gapOutlines(stroke({ gaps: [{ side: 'top', from: 200, to: 300 }] }), 100, 40, 6),
    ).toEqual([]);
  });
});
