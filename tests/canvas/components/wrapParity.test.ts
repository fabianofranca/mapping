// MC4 (decision 13 of #898): `layout.wrap` draws in the app (Konva) where the model puts each child,
// within ≤ 0.5 px: 5 children of 100 in a row of 320, `gap` 8, `lineGap` 12, at the `FlowRow` positions.
// The MCP raster has its own test in `tests/mcp/wrapRaster.test.ts`.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];

function component(layout: Record<string, unknown>) {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'flow',
    name: 'Flow',
    size: { width: 320, height: 200 },
    template: {
      type: 'frame',
      layout: { type: 'row', ...layout },
      children: COLORS.map((color, i) => ({
        type: 'rect',
        name: `k${i}`,
        width: 100,
        height: 20,
        fill: color,
      })),
    },
  };
}

function scene(layout: Record<string, unknown>) {
  const { root } = instantiate(
    component(layout) as never,
    {},
    { x: 0, y: 0, width: 320, height: 200 },
    { measure: approximateMeasurer },
  );
  return root;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;

describe.each([
  ['wrap', { wrap: 'wrap', gap: 8, lineGap: 12 }],
  ['wrap-reverse', { wrap: 'wrap-reverse', gap: 8, lineGap: 12 }],
  [
    'space-between per line',
    { wrap: 'wrap', gap: 8, lineGap: 12, justify: 'space-between' },
  ],
])('wrap: Konva × model (%s)', (name, layout) => {
  const root = scene(layout);
  const model = absoluteBoxes(root);
  const kids = [...walk(root)].filter((n) => /^k\d$/.test(n.name ?? ''));

  it('the model puts 3 + 2 (the FlowRow)', () => {
    expect(kids).toHaveLength(5);
    const ys = kids.map((n) => model.get(n.id)?.y);
    const top = name === 'wrap-reverse' ? [32, 32, 32, 0, 0] : [0, 0, 0, 32, 32];
    expect(ys).toEqual(top);
  });

  it('Konva draws each child where the model put it', () => {
    const { root: konva } = renderScene({ root, warnings: [] });
    const rects = konva.find('Rect') as Konva.Rect[];
    kids.forEach((n, i) => {
      const box = model.get(n.id);
      const found = rects.find((r) => r.fill() === COLORS[i]);
      expect(found, `k${i}`).toBeDefined();
      const at = found?.getAbsolutePosition(konva);
      expect(close(at?.x ?? NaN, box?.x ?? 0), `k${i}.x`).toBe(true);
      expect(close(at?.y ?? NaN, box?.y ?? 0), `k${i}.y`).toBe(true);
    });
  });
});
