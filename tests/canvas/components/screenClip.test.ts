// L2 (#1078): in the viewer screens, the child of a slot with `clip` is clipped by the box of the
// parent's slot (`Instance.parentId`); without `clip` nothing changes.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import {
  ScreenRenderer,
  type ScreenRendererLabels,
} from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (name) => name,
  unknownType: (id) => id,
  warningTypeWithoutComponent: 'no component',
  warningUnknownType: 'unknown',
  drawWarning: ({ code }) => code,
};

const header = { format: 'mapping-component', formatVersion: 4 };
const panel = (id: string, clip?: boolean) => ({
  ...header,
  id,
  name: id,
  size: { width: 300, height: 100 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        anchors: { left: 20, right: 20, top: 10, bottom: 10 },
        ...(clip === undefined ? {} : { clip }),
      },
    ],
  },
});
const FILES = [
  {
    path: 'clip.spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'clip',
      name: 'Clip',
      version: 1,
      layers: [
        {
          id: 'c',
          name: 'C',
          color: '#1E88E5',
          annotationTypes: ['cut', 'open', 'dot'].map((id) => ({
            id,
            name: id,
            component: `components/${id}.json`,
            fields: [],
          })),
        },
      ],
    }),
  },
  { path: 'components/cut.json', text: JSON.stringify(panel('cut', true)) },
  { path: 'components/open.json', text: JSON.stringify(panel('open')) },
  {
    path: 'components/dot.json',
    text: JSON.stringify({
      ...header,
      id: 'dot',
      name: 'dot',
      size: { width: 20, height: 20 },
      template: { type: 'frame', fill: '#123456' },
    }),
  },
];
const library = loadLibrary(FILES);

function screenOf(parentType: string): Screen {
  return {
    id: 's',
    name: 's',
    width: 800,
    height: 400,
    background: '#fff',
    instances: [
      {
        id: 'P',
        typeId: parentType,
        box: { x: 100, y: 50, width: 300, height: 100 },
        values: {},
      },
      // The child goes past the slot box (which runs from 120,60 to 380,140 on the screen).
      {
        id: 'D',
        typeId: 'dot',
        box: { x: 360, y: 120, width: 60, height: 60 },
        values: {},
        parentId: 'P',
      },
    ],
  };
}

function setup() {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
  });
  /** The rectangle (node local space) that the child clips; `null` without a clip. */
  const clipOf = (id: string): number[] | null => {
    const node = renderer.nodeOf(id);
    if (!node) return null;
    const fn = node.clipFunc();
    if (fn) {
      const rects: number[][] = [];
      const ctx = {
        beginPath() {},
        closePath() {},
        rect: (...a: number[]) => rects.push(a),
      };
      fn(ctx as unknown as Parameters<typeof fn>[0], node);
      return rects[0] ?? null;
    }
    const w = node.clipWidth();
    return w === undefined || w === 0
      ? null
      : [node.clipX(), node.clipY(), w, node.clipHeight()];
  };
  return { renderer, clipOf };
}

describe('ScreenRenderer: slot clip', () => {
  it("clips the child by the parent's slot box, in the child's local space", () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('cut'));
    // Slot on the screen: x 120..380, y 60..140. The child is at 360,120: the local clip starts at -240,-60.
    expect(clipOf('D')).toEqual([-240, -60, 260, 80]);
    expect(clipOf('P')).toBeNull();
  });

  it('without clip on the slot the child is not clipped', () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('open'));
    expect(clipOf('D')).toBeNull();
  });

  it("a parent that changes type updates the child's clip without redrawing it", () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, screenOf('cut'));
    expect(clipOf('D')).not.toBeNull();
    renderer.update(library, screenOf('open'));
    expect(clipOf('D')).toBeNull();
  });
});

/** P (cut) with Q (`qType`) half outside P's slot and the point D inside Q. */
function nestedScreen(qType: string): Screen {
  return {
    id: 's',
    name: 's',
    width: 800,
    height: 400,
    background: '#fff',
    instances: [
      {
        id: 'P',
        typeId: 'cut',
        box: { x: 100, y: 50, width: 300, height: 100 },
        values: {},
      },
      // Q's slot on the screen: x 320..480, y 90..130 (goes past P's slot, which ends at 380).
      {
        id: 'Q',
        typeId: qType,
        box: { x: 300, y: 80, width: 200, height: 60 },
        values: {},
        parentId: 'P',
      },
      {
        id: 'D',
        typeId: 'dot',
        box: { x: 440, y: 95, width: 20, height: 20 },
        values: {},
        parentId: 'Q',
      },
    ],
  };
}

describe('ScreenRenderer: slot clip on grandchildren (code review #1078)', () => {
  it("a child without clip passes the parent's clip along: the grandchild is clipped by the grandparent's slot", () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, nestedScreen('open'));
    // P's slot: 120..380 × 60..140; D is at 440,95.
    expect(clipOf('D')).toEqual([-320, -35, 260, 80]);
  });

  it('slot with clip inside another: the grandchild gets the intersection of both', () => {
    const { renderer, clipOf } = setup();
    renderer.update(library, nestedScreen('cut'));
    // 320..380 × 90..130, in the space of D (440,95).
    expect(clipOf('D')).toEqual([-120, -5, 60, 40]);
  });
});

describe('ScreenRenderer: slot with a clip that collapses (code review #1078)', () => {
  function collapsed(): Screen {
    const s = screenOf('cut');
    const [parent, child] = s.instances;
    // Slot with anchors of 20 on the sides in a box 40 wide: width 0.
    return {
      ...s,
      instances: [{ ...parent!, box: { x: 100, y: 50, width: 40, height: 100 } }, child!],
    };
  }

  it('the width-0 clip stays applied and the next sync reports no change', () => {
    const { renderer } = setup();
    const s = collapsed();
    expect(renderer.update(library, s)).toBe(true);
    const node = renderer.nodeOf('D')!;
    expect(node.clipWidth()).toBe(0);
    expect(renderer.update(library, s)).toBe(false);
  });
});
