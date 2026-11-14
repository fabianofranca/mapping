import { describe, expect, it } from 'vitest';
import { paintContainerDrawings } from '../../mcp/image/containerDrawing';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { setFieldValue } from '../../src/model';
import { add, baseProject, cat } from '../model/providedFixtures';

// MF3 (decisions 8 and 9): the MCP PNG of a lone child (`render_marking`: `markingIds`) uses the
// value offered by the ancestor (the cache computes the whole project), and without an ancestor the default applies.

function paint(project: ReturnType<typeof baseProject>, only: string): Raster {
  const raster = createRaster(1000, 800);
  raster.data.fill(255);
  paintContainerDrawings(
    raster,
    { project, catalog: cat },
    'I1',
    { scaleX: 1, scaleY: 1, clip: { x: 0, y: 0, width: 1000, height: 800 } },
    { markingIds: new Set([only]) },
  );
  return raster;
}

/** How many pixels have the `channel` channel (0 = R, 2 = B) dominant over the other two. */
function dominant(raster: Raster, channel: 0 | 1 | 2): number {
  let count = 0;
  for (let i = 0; i < raster.data.length; i += 4) {
    const own = raster.data[i + channel]!;
    const others = [0, 1, 2].filter((c) => c !== channel).map((c) => raster.data[i + c]!);
    if (own > 150 && others.every((v) => v < 100)) count += 1;
  }
  return count;
}

describe('render_marking of a child with an inherited color', () => {
  it('the lone child uses the ancestor color and follows the change of its field', () => {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    expect(dominant(paint(p, 'L'), 2)).toBeGreaterThan(0);
    expect(dominant(paint(p, 'L'), 0)).toBe(0);
    p = setFieldValue(p, 'A_P', 'ink', '#ff0000');
    expect(dominant(paint(p, 'L'), 0)).toBeGreaterThan(0);
    expect(dominant(paint(p, 'L'), 2)).toBe(0);
  });

  it('without an ancestor that offers one the default applies (gray: neither red nor blue)', () => {
    const p = add(baseProject(), 'L', 'label');
    const raster = paint(p, 'L');
    expect(dominant(raster, 0)).toBe(0);
    expect(dominant(raster, 2)).toBe(0);
  });
});
