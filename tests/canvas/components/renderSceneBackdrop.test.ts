// `backdropBlur` (format 4, stage #2915, DG6): a frame or rect blurs what the layer already painted under
// its outline, before its own fills (CSS `backdrop-filter: blur()`). A recording 2D context stands for
// the layer's canvas; the shape that does it is the node's first one, so it comes before the fill.
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { RENDER_WARNING_CODES } from '../../../src/canvas/components/renderWarnings';
import { catalogEnUS, catalogPtBR } from '../../../src/i18n/catalog';
import {
  type CornerRadius,
  type Scene,
  baseNode,
} from '../../../src/model/components/scene';
import { fakeContext, installFakeCanvas } from '../harness';

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** A context that records its calls (and the `filter` value each `drawImage` saw). */
function recorder(matrix: Matrix, withFilter: boolean) {
  const calls: string[] = [];
  const filters: string[] = [];
  const target: Record<string, unknown> = {
    canvas: { width: 400, height: 300 },
    getTransform: () => ({ ...matrix, e: 0, f: 0 }),
  };
  if (withFilter) target.filter = 'none';
  const ctx = new Proxy(target, {
    get(t, key) {
      if (typeof key === 'string' && key in t) return t[key];
      return (...args: unknown[]) => {
        const name = String(key);
        calls.push(name);
        if (name === 'drawImage') filters.push(String(t.filter));
        return args.length > 0 ? undefined : undefined;
      };
    },
    set(t, key, value) {
      t[String(key)] = value;
      if (key === 'filter') calls.push(`filter=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, filters };
}

/** The fake 2D context of every canvas gets (or lacks) `filter`, the property the support check reads. */
function supportFilter(on: boolean): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const ctx = fakeContext(this);
    if (on) ctx.filter = 'none';
    return ctx;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
}

function sceneWith(backdropBlur: number | undefined, cornerRadius: CornerRadius): Scene {
  return {
    root: {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 100,
        height: 40,
        fills: [{ type: 'solid', color: '#ffffff80' }],
      }),
      type: 'rect',
      cornerRadius,
      ...(backdropBlur === undefined ? {} : { backdropBlur }),
    },
    warnings: [],
  };
}

/** Runs the scene function of `shape` on a recording context. */
function paint(shape: Konva.Shape, ctx: CanvasRenderingContext2D): void {
  const run = shape.sceneFunc() as (c: unknown, s: Konva.Shape) => void;
  run({ _context: ctx }, shape);
}

beforeEach(() => installFakeCanvas());
afterEach(() => vi.restoreAllMocks());

describe('renderScene: backdropBlur', () => {
  it('clips to the rounded outline and draws the blurred canvas before the fill', () => {
    supportFilter(true);
    const { root, warnings } = renderScene(sceneWith(8, [10, 4, 4, 4]));
    const shapes = root.find('Shape') as Konva.Shape[];
    const fillIndex = shapes.findIndex((s) => s instanceof Konva.Rect);
    expect(fillIndex).toBeGreaterThan(0);
    const { ctx, calls, filters } = recorder({ a: 2, b: 0, c: 0, d: 2 }, true);
    paint(shapes[0]!, ctx);
    expect(warnings).toEqual([]);
    expect(calls[0]).toBe('save');
    expect(calls).toContain('arcTo');
    expect(calls.indexOf('clip')).toBeGreaterThan(calls.indexOf('arcTo'));
    expect(calls.indexOf('drawImage')).toBeGreaterThan(calls.indexOf('clip'));
    expect(calls.at(-1)).toBe('restore');
    // The matrix goes back to identity for the copy; 8 px of the node's space at scale 2 = 16 device px.
    expect(calls.indexOf('setTransform')).toBeLessThan(calls.indexOf('drawImage'));
    expect(filters).toEqual(['blur(16px)']);
    // The shape that does it sits below the fill in the node's group.
    expect(shapes.indexOf(shapes[0]!)).toBeLessThan(fillIndex);
  });

  it('draws no blur without `filter` on the context, warns once, and still fills', () => {
    supportFilter(false);
    const { root, warnings } = renderScene(sceneWith(8, 0));
    expect(warnings).toEqual([{ code: 'backdrop-blur-unsupported' }]);
    const shapes = root.find('Shape') as Konva.Shape[];
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toBeInstanceOf(Konva.Rect);
    const { ctx, calls } = recorder({ a: 1, b: 0, c: 0, d: 1 }, false);
    for (const shape of shapes) if (!(shape instanceof Konva.Rect)) paint(shape, ctx);
    expect(calls).not.toContain('drawImage');
  });

  it('adds nothing for 0 or an absent backdropBlur', () => {
    supportFilter(true);
    for (const blur of [0, undefined]) {
      const { root, warnings } = renderScene(sceneWith(blur, 0));
      expect(root.find('Shape')).toHaveLength(1);
      expect(warnings).toEqual([]);
    }
  });

  it('scales the blur with the zoom (the current matrix)', () => {
    supportFilter(true);
    const { root } = renderScene(sceneWith(4, 0));
    const first = (root.find('Shape') as Konva.Shape[])[0]!;
    const seen = [1, 3].map((zoom) => {
      const { ctx, filters } = recorder({ a: zoom, b: 0, c: 0, d: zoom }, true);
      paint(first, ctx);
      return filters[0];
    });
    expect(seen).toEqual(['blur(4px)', 'blur(12px)']);
  });

  it('registers the warning with text in both languages', () => {
    expect(RENDER_WARNING_CODES).toContain('backdrop-blur-unsupported');
    const key = 'catalog.drawWarning.backdrop-blur-unsupported' as const;
    expect(catalogEnUS[key]).toBeTruthy();
    expect(catalogPtBR[key]).toBeTruthy();
  });
});
