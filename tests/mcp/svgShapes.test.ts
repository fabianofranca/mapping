// FG2: the outline of the basic shapes converted by `svgShapes.ts` and `svgIcon.ts`, read back with
// `flattenPath` (the path parser of the MCP raster). It lives here because `flattenPath` needs the
// font plugin of the `mcp` Vitest project; the rest of the converter is tested in `tests/model/`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenPath } from '../../mcp/image/sceneRaster';
import { svgToIcon } from '../../src/model/components/svgIcon';
import { shapePath } from '../../src/model/components/svgShapes';

const FIXTURES = join(__dirname, '../fixtures/svg-icons');

const attributes =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

function pathOf(element: string, values: Record<string, string>): string {
  const result = shapePath(element, attributes(values));
  if (result === undefined || !result.ok) throw new Error(`no path for ${element}`);
  return result.d;
}

/** Whether some flattened point is at (x, y). */
function hasPoint(d: string, x: number, y: number): boolean {
  return flattenPath(d).some((sub) =>
    sub.points.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6),
  );
}

function pathsOf(file: string): readonly { d: string }[] {
  const result = svgToIcon(readFileSync(join(FIXTURES, file), 'utf8'));
  if (!result.ok) throw new Error(result.problems.map((p) => p.text).join('; '));
  return result.icon.paths;
}

describe('basic shapes as path data, flattened', () => {
  it('rect without radii is the four corners, closed', () => {
    const d = pathOf('rect', { x: '2', y: '3', width: '10', height: '20' });
    const [sub, ...rest] = flattenPath(d);
    expect(rest).toHaveLength(0);
    expect(sub?.closed).toBe(true);
    expect(sub?.points.slice(0, 4)).toEqual([
      { x: 2, y: 3 },
      { x: 12, y: 3 },
      { x: 12, y: 23 },
      { x: 2, y: 23 },
    ]);
  });

  it('rect with rx and ry starts the corners on the outline', () => {
    const d = pathOf('rect', { width: '20', height: '10', rx: '4', ry: '2' });
    expect(d).toContain('A4 2 0 0 1');
    for (const [x, y] of [
      [4, 0],
      [16, 0],
      [20, 2],
      [20, 8],
      [16, 10],
      [4, 10],
      [0, 8],
      [0, 2],
    ] as const)
      expect(hasPoint(d, x, y), `${x},${y}`).toBe(true);
  });

  it('rect clamps the radii to half the side', () => {
    const d = pathOf('rect', { width: '10', height: '20', rx: '100' });
    // rx clamps to 5 (half the width); ry takes the 100 and clamps to 10 (half the height).
    expect(d).toContain('A5 10 0 0 1');
    expect(hasPoint(d, 5, 0)).toBe(true);
    expect(hasPoint(d, 10, 10)).toBe(true);
  });

  it('circle has its four quarter points on the outline', () => {
    const d = pathOf('circle', { cx: '10', cy: '12', r: '5' });
    for (const [x, y] of [
      [15, 12],
      [10, 17],
      [5, 12],
      [10, 7],
    ] as const)
      expect(hasPoint(d, x, y), `${x},${y}`).toBe(true);
    expect(d).toMatch(/Z$/);
  });

  it('circle centered at the origin by default', () => {
    expect(hasPoint(pathOf('circle', { r: '3' }), 3, 0)).toBe(true);
  });

  it('ellipse has its four extremes on the outline, and one radius gives both', () => {
    const d = pathOf('ellipse', { cx: '10', cy: '10', rx: '8', ry: '3' });
    for (const [x, y] of [
      [18, 10],
      [10, 13],
      [2, 10],
      [10, 7],
    ] as const)
      expect(hasPoint(d, x, y), `${x},${y}`).toBe(true);
    expect(pathOf('ellipse', { rx: '4' })).toBe(pathOf('circle', { r: '4' }));
    expect(pathOf('ellipse', { ry: '4' })).toBe(pathOf('circle', { r: '4' }));
  });

  it('line is a segment between its two points', () => {
    const [sub, ...rest] = flattenPath(
      pathOf('line', { x1: '1', y1: '2', x2: '30', y2: '4.5' }),
    );
    expect(rest).toHaveLength(0);
    expect(sub?.closed).toBe(false);
    expect(sub?.points).toEqual([
      { x: 1, y: 2 },
      { x: 30, y: 4.5 },
    ]);
  });

  it('polyline and polygon read the points list like SVG does', () => {
    const points = ' 0,0 10 0 , 10,10  0-10 ';
    const open = flattenPath(pathOf('polyline', { points }));
    expect(open).toHaveLength(1);
    expect(open[0]?.closed).toBe(false);
    expect(open[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: -10 },
    ]);
    const closed = flattenPath(pathOf('polygon', { points }));
    expect(closed[0]?.closed).toBe(true);
    expect(closed[0]?.points).toEqual(open[0]?.points);
  });

  it('the circle and ellipse of the shapes fixture reach their extremes', () => {
    const paths = pathsOf('icon-shapes.svg');
    expect(hasPoint(paths[0]?.d ?? '', 10, 6)).toBe(true);
    expect(hasPoint(paths[1]?.d ?? '', 22, 6)).toBe(true);
  });

  it('the rounded rect of the flag fixture starts its corners on the outline', () => {
    const paths = pathsOf('icon-flag.svg');
    expect(hasPoint(paths[0]?.d ?? '', 2, 0)).toBe(true);
    // The third rect gives only ry="2": the corner is rounded by 2 on both axes.
    expect(hasPoint(paths[2]?.d ?? '', 16, 0)).toBe(false);
    expect(hasPoint(paths[2]?.d ?? '', 18, 0)).toBe(true);
  });
});
