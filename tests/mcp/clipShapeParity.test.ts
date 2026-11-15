// @vitest-environment jsdom
// Owner decision 23: the polygon that the Konva clip of a slot child traces (app) and the pixels
// the raster paints (MCP) agree within 0.5 px at scale 1 and 2. jsdom because it mounts the Konva layer.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../canvas/fakeCanvas';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../src/canvas/components/componentLayer';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { Placement, Rect } from '../../src/model';
import { type FrameNode, baseNode, translate } from '../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

// The scenes have no text: the approximate measurer is enough and the test needs no font.
const measure = approximateMeasurer;
const CLIP: Rect = { x: 10, y: 10, width: 100, height: 40 };
const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 0, y: 0, scale: 1 }],
]);

type Op = [string, ...number[]];

/** The path of the innermost (rounded) clip group of the mounted drawing. */
function roundedTrace(drawing: LayerDrawing): Op[] {
  const parent = new Konva.Group();
  new ComponentLayerRenderer(parent).render(
    new Map([['a', drawing]]),
    () => true,
    PLACEMENTS,
  );
  const outer = parent.find(
    (n: Konva.Node) => n.getAttr('markingId') === 'a',
  )[0] as Konva.Group;
  const rounded = outer.getChildren()[0] as Konva.Group;
  const fn = rounded.clipFunc()!;
  const ops: Op[] = [];
  const rec =
    (name: string) =>
    (...a: number[]) =>
      ops.push([name, ...a]);
  const ctx = {
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arcTo: rec('arcTo'),
  };
  fn(ctx as unknown as Parameters<typeof fn>[0], rounded);
  return ops;
}

// Silhouette parity: the polygon the Konva clip traces vs the pixels the raster paints.
type Pt = [number, number];

/** Flattens the recorded path (moveTo, lineTo, arcTo) into a polygon. */
function flatten(ops: Op[]): Pt[] {
  const pts: Pt[] = [];
  let at: Pt = [0, 0];
  for (const [name, ...a] of ops) {
    if (name === 'moveTo' || name === 'lineTo') {
      at = [a[0]!, a[1]!];
      pts.push(at);
    } else if (name === 'arcTo') {
      const [x1, y1, x2, y2, r] = a as [number, number, number, number, number];
      if (r === 0) {
        at = [x1, y1];
        pts.push(at);
        continue;
      }
      // Corner (x1, y1) between the current point and (x2, y2); the circle touches both legs.
      const unit = (from: Pt, to: Pt): Pt => {
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
        return [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
      };
      const u = unit([x1, y1], at);
      const v = unit([x1, y1], [x2, y2]);
      const start: Pt = [x1 + u[0] * r, y1 + u[1] * r];
      const end: Pt = [x1 + v[0] * r, y1 + v[1] * r];
      const center: Pt = [start[0] + v[0] * r, start[1] + v[1] * r];
      const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
      let sweep = Math.atan2(end[1] - center[1], end[0] - center[0]) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      for (let i = 0; i <= 32; i++) {
        const t = a0 + (sweep * i) / 32;
        pts.push([center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)]);
      }
      at = end;
    }
  }
  return pts;
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) in_ = !in_;
  }
  return in_;
}

function edgeDistance(poly: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    const [dx, dy] = [bx - ax, by - ay];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

describe('clipShape: Konva and raster silhouettes agree (<= 0.5 px)', () => {
  for (const scale of [1, 2]) {
    it(`scale ${scale}`, () => {
      const root: FrameNode = {
        ...baseNode({
          id: 'a',
          name: 'a',
          width: 100,
          height: 40,
          transform: translate(10, 10),
        }),
        type: 'frame',
        clip: false,
        cornerRadius: 0,
        fills: [{ type: 'solid', color: '#ff0000' }],
        children: [],
      };
      const drawing: LayerDrawing = {
        markingId: 'a',
        containerId: 'img-1',
        root,
        clip: CLIP,
        clipShape: [{ box: CLIP, radius: [16, 4, 20, 0] }],
      };
      const poly = flatten(roundedTrace(drawing));
      const raster = createRaster(120 * scale, 60 * scale);
      raster.data.fill(255);
      paintScene(
        raster,
        [{ root: drawing.root, clip: CLIP, clipShape: drawing.clipShape }],
        measure,
        {
          scaleX: scale,
          scaleY: scale,
          clip: { x: 0, y: 0, width: raster.width, height: raster.height },
        },
      );
      let checked = 0;
      for (let py = 0; py < raster.height; py++) {
        for (let px = 0; px < raster.width; px++) {
          const [x, y] = [(px + 0.5) / scale, (py + 0.5) / scale];
          if (edgeDistance(poly, x, y) * scale <= 0.5) continue;
          const painted = raster.data[(py * raster.width + px) * 4 + 1]! < 128;
          expect(painted, `pixel ${px},${py}`).toBe(inside(poly, x, y));
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
    });
  }
});
