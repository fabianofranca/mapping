// R2 (#1107): `Screen.direction` carries the reading direction into each component. The `rtl`
// screen (the one from `layoutScreen`, or built by hand) mirrors the `row` inside the instance; the
// `direction` option of `update` wins over the screen's; with neither, nothing changes (ltr).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import { DEFAULT_PALETTE } from '../../../src/canvas/components/palette';
import {
  ScreenRenderer,
  type ScreenRendererLabels,
} from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (name) => name,
  unknownType: (id) => id,
  warningTypeWithoutComponent: 'x',
  warningUnknownType: 'y',
  drawWarning: ({ code }) => code,
};

/** A 100x40 `row` with two fixed children (20 and 30 wide), without gap or padding. */
const PAIR = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'pair',
  name: 'Par',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    name: 'par',
    layout: { type: 'row', align: 'start' },
    children: [
      { type: 'rect', name: 'a', width: 20, height: 10, fill: '#FF0000' },
      { type: 'rect', name: 'b', width: 30, height: 10, fill: '#0000FF' },
    ],
  },
};

const library = loadLibrary([
  {
    path: 'spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'mini',
      name: 'Mini',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          annotationTypes: [
            { id: 'pair', name: 'Par', component: 'components/pair.json', fields: [] },
          ],
        },
      ],
    }),
  },
  { path: 'components/pair.json', text: JSON.stringify(PAIR) },
]);

/** The same instances (same objects) in every screen: only the direction changes between them. */
const INSTANCES: Screen['instances'] = [
  { id: 'p', typeId: 'pair', box: { x: 100, y: 10, width: 100, height: 40 }, values: {} },
];

function screenOf(direction?: 'ltr' | 'rtl'): Screen {
  return {
    id: 's',
    name: 'S',
    width: 300,
    height: 100,
    background: '#FFFFFF',
    ...(direction ? { direction } : {}),
    instances: INSTANCES,
  };
}

/** x (on the screen) and width of the pair's two rectangles: the red one (width 20) and the blue one (30). */
function rects(screen: Screen, direction?: 'ltr' | 'rtl'): { red: number; blue: number } {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
    palette: DEFAULT_PALETTE,
  });
  renderer.update(library, screen, direction ? { direction } : {});
  const xOf = (fill: string) =>
    (group.find('Rect') as Konva.Rect[])
      .filter((r) => String(r.fill()).toLowerCase() === fill)
      .map((r) => r.getAbsolutePosition().x)[0]!;
  return { red: xOf('#ff0000'), blue: xOf('#0000ff') };
}

describe('ScreenRenderer: screen direction', () => {
  it('the ltr screen (without the key) goes on as always: red at 100, blue at 120', () => {
    expect(rects(screenOf())).toEqual({ red: 100, blue: 120 });
    expect(rects(screenOf('ltr'))).toEqual({ red: 100, blue: 120 });
  });

  it("the rtl screen mirrors the component interior: x' = width - x - w inside the box", () => {
    // inside the instance (width 100): red 0..20 -> 80; blue 20..50 -> 50 (plus the box at 100)
    expect(rects(screenOf('rtl'))).toEqual({ red: 180, blue: 150 });
  });

  it("the update direction option wins over the screen's", () => {
    expect(rects(screenOf('rtl'), 'ltr')).toEqual({ red: 100, blue: 120 });
    expect(rects(screenOf(), 'rtl')).toEqual({ red: 180, blue: 150 });
  });

  it('changing the screen direction redraws the instances', () => {
    const group = new Konva.Group();
    const renderer = new ScreenRenderer(group, {
      labels: LABELS,
      measure: approximateMeasurer,
    });
    expect(renderer.update(library, screenOf())).toBe(true);
    expect(renderer.update(library, screenOf('ltr'))).toBe(false);
    expect(renderer.update(library, screenOf('rtl'))).toBe(true);
    expect(renderer.update(library, screenOf('rtl'))).toBe(false);
  });
});
