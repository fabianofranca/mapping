// Layout fidelity (Faithful Components stage, phase CF2): two-pass measurement (B1),
// `repeat.distribute` (B2), expression in layout keys (B3) and min/max limits (B4).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { layoutScreen } from '../../../src/model/components/layout';
import { loadLibrary } from '../../../src/model/components/library';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

const LINE = 16.8; // font 14, line height 1.2

function file(template: Raw, formatVersion = 4, extra: Raw = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'fid',
    name: 'Fidelity',
    size: { width: 200, height: 300 },
    template,
    ...extra,
  } as unknown as ComponentFile;
}

function root(
  template: Raw,
  values: FieldValues = {},
  box = { x: 0, y: 0, width: 200, height: 300 },
  measure: TextMeasurer = approximateMeasurer,
  formatVersion = 4,
) {
  return instantiate(file(template, formatVersion), values, box, { measure });
}

function kid(node: SceneNode, index: number): SceneNode {
  if (node.type !== 'frame') throw new Error('not a frame');
  const found = node.children[index];
  if (!found) throw new Error(`no child ${index}`);
  return found;
}

const xOf = (n: SceneNode) => n.transform[4];
const yOf = (n: SceneNode) => n.transform[5];

const frame = (over: Raw, children: Raw[] = []): Raw => ({
  type: 'frame',
  children,
  ...over,
});
const rect = (over: Raw = {}): Raw => ({ type: 'rect', ...over });
const label = (over: Raw = {}): Raw => ({
  type: 'text',
  text: 'The deadline is near',
  font: { size: 14, lineHeight: 1.2 },
  ...over,
});

/** Spy measurer: records the calls (text and maxWidth) and delegates to the approximate one. */
function spy() {
  const calls: { text: string; maxWidth: number | undefined }[] = [];
  const measure: TextMeasurer = (text, font, maxWidth) => {
    calls.push({ text, maxWidth });
    return approximateMeasurer(text, font, maxWidth);
  };
  return { calls, measure };
}

// --- B1: two-pass measurement ---------------------------------------------------------

const HUG_COLUMN = (): Raw =>
  frame({ layout: { type: 'column' } }, [
    frame({ name: 'card', layout: { type: 'column' }, width: 'hug', height: 'hug' }, [
      label({ name: 'text', width: 'fill' }),
    ]),
  ]);

describe.each([4, 1])('B1: hug frame with fill text (formatVersion %i)', (version) => {
  it('measures the text within the parent limit: does not wrap word by word', () => {
    const { calls, measure } = spy();
    const { root: scene } = root(HUG_COLUMN(), {}, undefined, measure, version);
    const card = kid(scene, 0);
    const text = kid(card, 0);
    expect(calls.some((c) => c.maxWidth === 200)).toBe(true);
    expect(card.width).toBeGreaterThan(0);
    expect(card.width).toBeLessThanOrEqual(200);
    expect(text.width).toBe(card.width);
    expect(text.height).toBeLessThanOrEqual(2 * LINE + 0.01);
    expect(card.height).toBe(text.height);
  });
});

describe('B1: regressions and warning', () => {
  it('fill on the main axis of a hug frame is still 0, with the warning', () => {
    const { root: scene, warnings } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          label({ width: 'fill' }),
        ]),
      ]),
    );
    expect(kid(scene, 0).width).toBe(0);
    expect(warnings).toContain('fill inside hug becomes 0');
  });

  it('hug text is still measured without wrapping', () => {
    const { root: scene } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'column' }, width: 'hug', height: 'hug' }, [label()]),
      ]),
      {},
      { x: 0, y: 0, width: 100, height: 300 },
    );
    const card = kid(scene, 0);
    expect(card.width).toBeCloseTo(154, 3);
    expect(kid(card, 0).height).toBeCloseTo(LINE, 5);
  });

  it('text measured with width 0 warns with the node name', () => {
    const { warnings } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          label({ name: 'label', width: 'fill' }),
        ]),
      ]),
    );
    expect(warnings).toContain('text measured with width 0: label');
  });
});

// --- B2: repeat.distribute ------------------------------------------------------------------

describe('B2: repeat.distribute', () => {
  const rows: FieldValues = { rows: [{ a: '1' }, { a: '2' }, { a: '3' }] };
  const repeat = (extra: Raw, template: Raw = {}): Raw => ({
    type: 'repeat',
    field: 'rows',
    gap: 6,
    template: frame({ layout: { type: 'row' }, ...template }, [
      label({ text: { $field: 'a' } }),
    ]),
    ...extra,
  });
  const tree = (extra: Raw, template: Raw = {}) =>
    frame({ layout: { type: 'column' } }, [repeat(extra, template)]);

  it('distribute fill: the rows split the axis minus the gaps (96 each)', () => {
    const { root: scene, warnings } = root(tree({ distribute: 'fill' }), rows);
    const list = kid(scene, 0) as FrameNode;
    expect(list.height).toBe(300);
    expect(list.children.map((c) => c.height)).toEqual([96, 96, 96]);
    expect(list.children.map(yOf)).toEqual([0, 102, 204]);
    expect(warnings).toEqual([]);
  });

  it('distribute fill with explicit height fill in the template is worth the fraction', () => {
    const { root: scene } = root(tree({ distribute: 'fill' }, { height: 'fill' }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([
      96, 96, 96,
    ]);
  });

  it('distribute fill with explicit px in the template keeps the px', () => {
    const { root: scene } = root(tree({ distribute: 'fill' }, { height: 30 }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([
      30, 30, 30,
    ]);
  });

  it('without distribute, height fill in the template is 0 with the current warning', () => {
    const { root: scene, warnings } = root(tree({}, { height: 'fill' }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([0, 0, 0]);
    expect(warnings).toContain('fill inside hug becomes 0');
  });
});

// --- B3: expression in layout keys -----------------------------------------------------

describe('B3: expression in layout and size', () => {
  const two = (layout: Raw) =>
    frame({ layout }, [rect({ width: 40, height: 20 }), rect({ width: 40, height: 20 })]);

  it('layout.type by expression arranges in a row; outside the set it falls back to none with a warning', () => {
    const tree = two({ type: { $field: 'dir' }, gap: 10 });
    const ok = root(tree, { dir: 'row' });
    expect(ok.root.children.map(xOf)).toEqual([0, 50]);
    expect(ok.warnings).toEqual([]);
    const bad = root(tree, { dir: 'diagonal' });
    expect(bad.root.children.map(xOf)).toEqual([0, 0]);
    expect(bad.warnings).toContain('invalid value in layout.type: diagonal');
  });

  it('width by $switch: fill, hug, % and px', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({
        height: 20,
        width: { $switch: 'w', cases: { a: 'fill', b: 'hug', c: '50%', d: 120 } },
      }),
    ]);
    const widthOf = (w: string) => kid(root(tree, { w }).root, 0).width;
    expect(widthOf('a')).toBe(200);
    expect(widthOf('b')).toBe(0);
    expect(widthOf('c')).toBe(100);
    expect(widthOf('d')).toBe(120);
  });

  it('numeric width in plain text is the number; invalid falls back to the default with a warning', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ height: 20, width: { $field: 'w' } }),
    ]);
    expect(kid(root(tree, { w: '120' }).root, 0).width).toBe(120);
    const bad = root(tree, { w: 'zzz' });
    expect(kid(bad.root, 0).width).toBe(200);
    expect(bad.warnings).toContain('invalid value in width: zzz');
    const negative = root(tree, { w: -5 });
    expect(negative.warnings).toContain('invalid value in width: -5');
  });

  it('invalid height warns with height', () => {
    const tree = frame({ layout: { type: 'column' } }, [
      rect({ width: 20, height: { $field: 'h' } }),
    ]);
    expect(root(tree, { h: 'x' }).warnings).toContain('invalid value in height: x');
  });

  it('justify and align by expression', () => {
    const tree = frame(
      { layout: { type: 'row', justify: { $field: 'j' }, align: { $field: 'a' } } },
      [rect({ width: 50, height: 20 })],
    );
    const at = (values: FieldValues) => {
      const kidNode = kid(root(tree, values).root, 0);
      return [xOf(kidNode), yOf(kidNode)];
    };
    expect(at({ j: 'end', a: 'end' })).toEqual([150, 280]);
    expect(at({ j: 'center', a: 'center' })).toEqual([75, 140]);
    const bad = root(tree, { j: 'bogus', a: 'nothing' });
    expect(xOf(kid(bad.root, 0))).toBe(0);
    expect(bad.warnings).toContain('invalid value in layout.justify: bogus');
    expect(bad.warnings).toContain('invalid value in layout.align: nothing');
  });
});

// --- B4: min/max ----------------------------------------------------------------------------

describe('B4: minWidth, maxWidth, minHeight and maxHeight', () => {
  it('minWidth raises a 40 px hug node to 80', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      frame({ width: 'hug', height: 20, minWidth: 80 }, [
        rect({ width: 40, height: 20, anchors: { left: 0, top: 0 } }),
      ]),
    ]);
    expect(kid(root(tree).root, 0).width).toBe(80);
  });

  it('maxWidth on a fill gives the excess back to the other fill', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 'fill', height: 20, maxWidth: 100 }),
      rect({ width: 'fill', height: 20 }),
    ]);
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 320, height: 100 });
    expect(scene.children.map((c) => c.width)).toEqual([100, 220]);
    expect(xOf(kid(scene, 1))).toBe(100);
  });

  it('minWidth on a fill freezes the node and the others split the rest', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 'fill', height: 20, minWidth: 150 }),
      rect({ width: 'fill', height: 20 }),
      rect({ width: 'fill', height: 20 }),
    ]);
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 300, height: 100 });
    expect(scene.children.map((c) => c.width)).toEqual([150, 75, 75]);
  });

  it('limits by expression; invalid or negative = absent; min greater than max is the min', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 200, height: 20, maxWidth: { $field: 'max' } }),
      rect({ width: 200, height: 20, maxWidth: -10 }),
      rect({ width: 200, height: 20, minWidth: 120, maxWidth: 60 }),
    ]);
    const { root: scene } = root(
      tree,
      { max: 90 },
      { x: 0, y: 0, width: 800, height: 40 },
    );
    expect(scene.children.map((c) => c.width)).toEqual([90, 200, 120]);
  });

  it('minHeight and maxHeight apply on the vertical axis', () => {
    const tree = frame({ layout: { type: 'column' } }, [
      rect({ width: 20, height: 10, minHeight: 40 }),
      rect({ width: 20, height: 100, maxHeight: 30 }),
    ]);
    const { root: scene } = root(tree);
    expect(scene.children.map((c) => c.height)).toEqual([40, 30]);
  });

  it('hug text cut by maxWidth measures the height wrapping at the cut width', () => {
    const tree = frame({ layout: { type: 'column' } }, [label({ maxWidth: 50 })]);
    const text = kid(root(tree).root, 0);
    expect(text.width).toBe(50);
    expect(text.height).toBeGreaterThan(3 * LINE);
  });

  it('hug root: measureComponent applies the max and measures the height at the limited width', () => {
    const tree = frame({ layout: { type: 'column' }, maxWidth: 100 }, [
      label({ width: 'hug' }),
      rect({ width: 150, height: 10 }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBeLessThanOrEqual(100);
    expect(measured.width).toBe(100);
  });

  it('hug root: the fill text of the root measures within the maxWidth and the height follows', () => {
    const tree = frame({ layout: { type: 'column' }, maxWidth: 100 }, [
      label({ width: 'fill' }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.width).toBeLessThanOrEqual(100);
    expect(measured.height).toBeGreaterThan(1.5 * LINE);
  });

  it('hug root: minWidth raises the result', () => {
    const tree = frame({ layout: { type: 'row' }, minWidth: 90 }, [
      rect({ width: 30, height: 10 }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBe(90);
  });

  it('with a given box, the root fills the box and its limits do not apply', () => {
    const tree = frame({ layout: { type: 'row' }, maxWidth: 100 });
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 200, height: 50 });
    expect(scene.width).toBe(200);
  });
});

// --- B4 in layoutScreen: the minSize of the instance comes after the max --------------------------

describe('B4: minSize of the instance after the max of the root', () => {
  function build(extra: Raw) {
    const component = file(
      frame({ layout: { type: 'row' }, maxWidth: 100 }, [
        rect({ width: 150, height: 20 }),
      ]),
      4,
      { id: 'capped', name: 'capped', sizing: { width: 'hug', height: 'hug' }, ...extra },
    );
    const spec = {
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'fid',
      name: 'Fid',
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#1E88E5',
          annotationTypes: [
            {
              id: 'capped',
              name: 'capped',
              component: 'components/capped.json',
              fields: [],
            },
          ],
        },
      ],
    };
    const library = loadLibrary([
      { path: 'spec.json', text: JSON.stringify(spec) },
      { path: 'components/capped.json', text: JSON.stringify(component) },
    ]);
    expect(library.problems).toEqual([]);
    return layoutScreen(
      {
        id: 's',
        name: 'Screen',
        width: 400,
        height: 400,
        background: '#FFF',
        roots: [{ node: { id: 'n', typeId: 'capped', values: {}, children: [] } }],
      },
      library,
      approximateMeasurer,
    ).screen.instances[0]?.box;
  }

  it('the max of the root limits the hug of the instance', () => {
    expect(build({})?.width).toBe(100);
  });

  it('the minSize of the instance rises above the max', () => {
    expect(build({ minSize: { width: 150, height: 10 } })?.width).toBe(150);
  });
});
