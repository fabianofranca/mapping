// Components Lab: arrangement by sizes (`layoutScreen`).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  TemplateNode,
} from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import {
  type LayoutNode,
  type LayoutRoot,
  type LayoutAnchor,
  layoutScreen,
} from '../../../src/model/components/layout';
import { type Library, loadLibrary } from '../../../src/model/components/library';
import { M3_CARD, M3_COLUMN, M3_BUTTON } from '../../../viewer/samples/samplesMaterial3';

// --- library assembled in memory ----------------------------------------------------------

type Sizing = NonNullable<ComponentFile['sizing']>;

function component(
  id: string,
  template: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, ...template },
    ...extra,
  } as ComponentFile;
}

/** Leaf without children: only the size (px of `size` or the `sizing`). */
function block(
  id: string,
  size: { width: number; height: number },
  sizing?: Sizing,
  minSize?: { width: number; height: number },
) {
  return component(
    id,
    {},
    { size, ...(sizing ? { sizing } : {}), ...(minSize ? { minSize } : {}) },
  );
}

/** `hug` × `hug` text: font 10 (0.55 · 10 = 5.5 px per character), given line height. */
function label(id: string, lineHeight: number) {
  return component(
    id,
    {
      children: [
        {
          type: 'text',
          text: { $field: 'text' },
          font: { size: 10, lineHeight },
          anchors: { left: 0, top: 0 },
        },
      ],
    },
    { sizing: { width: 'hug', height: 'hug' } },
  );
}

interface ContainerOptions {
  readonly align?: string;
  readonly justify?: string;
  readonly sizing?: Sizing;
  readonly size?: { width: number; height: number };
}

/** Container: `none` frame with a slot that fills everything, with the given layout. */
function container(
  id: string,
  type: 'row' | 'column' | 'none',
  o: ContainerOptions = {},
) {
  const layout: Record<string, unknown> =
    type === 'none'
      ? { type: 'none' }
      : {
          type,
          gap: { $field: 'gap', default: 0 },
          padding: { $field: 'padding', default: 0 },
          ...(o.align ? { align: o.align } : {}),
          ...(o.justify ? { justify: o.justify } : {}),
        };
  return component(
    id,
    {
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout,
        },
      ],
    },
    {
      ...(o.size ? { size: o.size } : {}),
      sizing: o.sizing ?? { width: 'fill', height: 'hug' },
    },
  );
}

const HUG_HUG: Sizing = { width: 'hug', height: 'hug' };

const COMPONENTS: ComponentFile[] = [
  block('fixed', { width: 100, height: 40 }),
  block('tall', { width: 300, height: 500 }),
  block('filler', { width: 10, height: 10 }, { width: 'fill', height: 'fill' }),
  block(
    'filler-min',
    { width: 50, height: 30 },
    { width: 'fill', height: 'fill' },
    { width: 50, height: 30 },
  ),
  block('hug-min', { width: 80, height: 30 }, HUG_HUG, { width: 80, height: 30 }),
  label('label', 12),
  label('label-frac', 12.5),
  container('col', 'column'),
  container('col-fill', 'column', { sizing: { width: 'fill', height: 'fill' } }),
  container('col-px', 'column', { sizing: { width: 'fill', height: 100 } }),
  container('col-px-center', 'column', {
    align: 'center',
    justify: 'center',
    sizing: { width: 'fill', height: 100 },
  }),
  container('col-stretch', 'column', { align: 'stretch' }),
  container('col-hug', 'column', { sizing: HUG_HUG }),
  container('row', 'row', { sizing: { width: 'fill', height: 60 } }),
  container('row-center', 'row', {
    align: 'center',
    justify: 'center',
    sizing: { width: 'fill', height: 60 },
  }),
  container('row-end', 'row', { justify: 'end', sizing: { width: 'fill', height: 60 } }),
  container('row-between', 'row', {
    justify: 'space-between',
    sizing: { width: 'fill', height: 60 },
  }),
  container('row-hug', 'row'),
  container('row-hug-all', 'row', { sizing: HUG_HUG }),
  container('box', 'none'),
  container('box-fixed', 'none', { sizing: { width: 100, height: 100 } }),
  component('plain', {}, { size: { width: 80, height: 30 } }),
];

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'layout-test',
  name: 'Layout',
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: COMPONENTS.map((c) => ({
        id: c.id,
        name: c.id,
        component: `components/${c.id}.json`,
        fields:
          c.id === 'filler'
            ? [{ key: 'tone', label: 'Tone', type: 'string', default: 'light' }]
            : [],
      })),
    },
  ],
};

function build(components: readonly ComponentFile[], spec: object = SPEC): Library {
  return loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    ...components.map((c) => ({
      path: `components/${c.id}.json`,
      text: JSON.stringify(c),
    })),
  ]);
}

const library = build(COMPONENTS);

it('the test library loads without problems', () => {
  expect(library.problems).toEqual([]);
});

// --- constructors -----------------------------------------------------------------------------

function node(
  id: string,
  typeId: string,
  values: LayoutNode['values'] = {},
  children: readonly LayoutNode[] = [],
): LayoutNode {
  return { id, typeId, values, children };
}

function root(n: LayoutNode, extra: Partial<Omit<LayoutRoot, 'node'>> = {}): LayoutRoot {
  return { node: n, ...extra };
}

function run(roots: readonly LayoutRoot[], width = 300, height = 600, lib = library) {
  return layoutScreen(
    { id: 's', name: 'Screen', width, height, background: '#FFF', roots },
    lib,
    approximateMeasurer,
  );
}

function boxOf(result: ReturnType<typeof run>, id: string) {
  const instance = result.screen.instances.find((i) => i.id === id);
  if (!instance) throw new Error(`no instance ${id}`);
  return instance.box;
}

const ids = (result: ReturnType<typeof run>) => result.screen.instances.map((i) => i.id);

// "AAAAAAAAAA" = 10 characters of 5.5 px = 55 px wide, 12 px high.
const TEN = 'AAAAAAAAAA';

// --- column --------------------------------------------------------------------------------------

describe('layoutScreen: column', () => {
  it('px, hug and fill: the fill gets what is left after the fixed ones and the gaps', () => {
    const result = run([
      root(
        node('c', 'col-fill', { gap: 10 }, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
          node('f', 'filler'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'c')).toEqual({ x: 0, y: 0, width: 300, height: 600 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(boxOf(result, 'b')).toEqual({ x: 0, y: 50, width: 55, height: 12 });
    // 600 − 40 − 12 − 2 gaps of 10
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 72, width: 300, height: 528 });
    expect(result.warnings).toEqual([]);
  });

  it('two fills split the rest equally', () => {
    const result = run([
      root(
        node('c', 'col-fill', {}, [
          node('a', 'fixed'),
          node('f1', 'filler'),
          node('f2', 'filler'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'f1').height).toBe(280);
    expect(boxOf(result, 'f2')).toMatchObject({ y: 320, height: 280 });
  });

  it('the hug height of the container is the sum of the children, gaps and padding', () => {
    const result = run([
      root(
        node('c', 'col', { gap: 4, padding: 8 }, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
        ]),
      ),
    ]);
    // padding 8 + 40 + gap 4 + 12 + padding 8
    expect(boxOf(result, 'c')).toEqual({ x: 0, y: 0, width: 300, height: 72 });
    expect(boxOf(result, 'a')).toMatchObject({ x: 8, y: 8 });
    expect(boxOf(result, 'b')).toMatchObject({ x: 8, y: 52 });
  });

  it('fill on the main axis inside a hug parent falls back to hug, with a warning', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('b', 'label', { text: TEN }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // filler-min in hug: the empty one becomes the minSize (30)
    expect(boxOf(result, 'f')).toMatchObject({ y: 12, height: 30 });
    expect(boxOf(result, 'c').height).toBe(42);
    expect(result.warnings).toEqual(['f: fill inside hug: using hug']);
  });

  it('fill on the cross axis takes the width of the content; hug with stretch too', () => {
    const result = run(
      [
        root(
          node('c', 'col-stretch', { padding: 10 }, [
            node('a', 'label', { text: TEN }),
            node('f', 'filler-min'),
          ]),
        ),
      ],
      300,
      600,
    );
    expect(boxOf(result, 'a').width).toBe(280);
    expect(boxOf(result, 'f').width).toBe(280);
  });

  it('justify and align: center in the fixed-height container', () => {
    const result = run([
      root(node('c', 'col-px-center', {}, [node('b', 'label', { text: TEN })])),
    ]);
    expect(boxOf(result, 'c').height).toBe(100);
    expect(boxOf(result, 'b')).toEqual({ x: 122.5, y: 44, width: 55, height: 12 });
  });

  it('width hug limited by the available width', () => {
    const result = run(
      [root(node('c', 'col', {}, [node('b', 'label', { text: TEN })]))],
      40,
      600,
    );
    expect(boxOf(result, 'b').width).toBe(40);
  });
});

// --- row -------------------------------------------------------------------------------------------

describe('layoutScreen: row', () => {
  it('px, hug and fill: the fill splits the rest of the width; the cross fill is the row height', () => {
    const result = run([
      root(
        node('r', 'row', { gap: 10 }, [
          node('a', 'fixed'),
          node('f', 'filler'),
          node('b', 'label', { text: TEN }),
        ]),
      ),
    ]);
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 300, height: 60 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    // 300 − 100 − 55 − 2 gaps of 10
    expect(boxOf(result, 'f')).toEqual({ x: 110, y: 0, width: 125, height: 60 });
    expect(boxOf(result, 'b')).toEqual({ x: 245, y: 0, width: 55, height: 12 });
  });

  it('cross-axis fill in a hug row: the row height is the largest among the others', () => {
    const result = run([
      root(
        node('r', 'row-hug', { gap: 5 }, [
          node('b', 'label', { text: TEN }),
          node('f', 'filler'),
          node('a', 'fixed'),
        ]),
      ),
    ]);
    // row height = max(12, 40) = 40; the fill inherits 40
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 300, height: 40 });
    expect(boxOf(result, 'f').height).toBe(40);
  });

  it('hug row with only fill: each child in hug', () => {
    const result = run([root(node('r', 'row-hug', {}, [node('f', 'filler-min')]))]);
    expect(boxOf(result, 'r').height).toBe(30);
    expect(boxOf(result, 'f').height).toBe(30);
  });

  it('justify end, center and space-between', () => {
    const kids = () => [node('a', 'fixed'), node('b', 'fixed')];
    const end = run([root(node('r', 'row-end', {}, kids()))], 400);
    expect(boxOf(end, 'a').x).toBe(200);
    expect(boxOf(end, 'b').x).toBe(300);
    const center = run([root(node('r', 'row-center', {}, kids()))], 400);
    expect(boxOf(center, 'a')).toMatchObject({ x: 100, y: 10 });
    const between = run(
      [root(node('r', 'row-between', {}, [...kids(), node('c', 'fixed')]))],
      400,
    );
    expect([boxOf(between, 'a').x, boxOf(between, 'b').x, boxOf(between, 'c').x]).toEqual(
      [0, 150, 300],
    );
  });

  it('align center on the cross axis', () => {
    const result = run([
      root(node('r', 'row-center', {}, [node('b', 'label', { text: TEN })])),
    ]);
    expect(boxOf(result, 'b').y).toBe(24);
  });

  it('hug row on both axes: fill children stay in their own hug and the width is the sum', () => {
    const result = run([
      root(
        node('r', 'row-hug-all', { gap: 5 }, [
          node('a', 'fixed'),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // filler-min in hug: 50 (minSize) × 30
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 155, height: 40 });
    expect(boxOf(result, 'f')).toMatchObject({ x: 105, width: 50 });
  });
});

// --- Box -------------------------------------------------------------------------------------------

describe('layoutScreen: Box (none)', () => {
  it('each child in the corner of the content; the hug height is that of the largest', () => {
    const result = run([
      root(
        node('x', 'box', {}, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'x')).toEqual({ x: 0, y: 0, width: 300, height: 40 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(boxOf(result, 'b')).toEqual({ x: 0, y: 0, width: 55, height: 12 });
    // width fill = content; the height, with a hug parent, falls back to hug (the minSize)
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 0, width: 300, height: 30 });
  });

  it('fill takes the content when the Box has a fixed height', () => {
    const result = run([root(node('x', 'box-fixed', {}, [node('f', 'filler')]))]);
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

// --- anchored roots, scrim and screen -------------------------------------------------------------

describe('layoutScreen: anchored roots', () => {
  const anchored = (anchor: LayoutAnchor, margin?: number) =>
    run(
      [
        root(node('flow', 'fixed')),
        root(node('a', 'fixed'), { anchor, ...(margin !== undefined ? { margin } : {}) }),
      ],
      400,
      800,
    );

  it('anchored roots do not enter the flow', () => {
    const result = anchored('bottom', 16);
    expect(boxOf(result, 'flow')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });

  it.each<[LayoutAnchor, number, number, number]>([
    ['top-start', 16, 16, 16],
    ['top', 16, 150, 16],
    ['top-end', 8, 292, 8],
    ['start', 16, 16, 380],
    ['center', 0, 150, 380],
    ['end', 10, 290, 380],
    ['bottom-start', 4, 4, 756],
    ['bottom', 16, 150, 744],
    ['bottom-end', 4, 296, 756],
  ])('anchor %s with margin %d', (anchor, margin, x, y) => {
    const result = anchored(anchor, margin);
    expect(boxOf(result, 'a')).toEqual({ x, y, width: 100, height: 40 });
  });

  it('default margin is 0', () => {
    expect(boxOf(anchored('top-start'), 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('fill takes the screen minus the margin on both sides; hug uses the content', () => {
    const result = run(
      [
        root(node('f', 'filler'), { anchor: 'bottom', margin: 10 }),
        root(node('h', 'label', { text: TEN }), { anchor: 'bottom-end', margin: 4 }),
      ],
      400,
      800,
    );
    expect(boxOf(result, 'f')).toEqual({ x: 10, y: 10, width: 380, height: 780 });
    expect(boxOf(result, 'h')).toEqual({ x: 341, y: 784, width: 55, height: 12 });
  });

  it('an anchored container root arranges the children inside it', () => {
    const result = run(
      [
        root(
          node('sheet', 'col', { gap: 8, padding: 16 }, [
            node('b', 'label', { text: TEN }),
          ]),
          {
            anchor: 'bottom',
          },
        ),
      ],
      400,
      800,
    );
    // padding 16 + 12 + 16
    expect(boxOf(result, 'sheet')).toEqual({ x: 0, y: 756, width: 400, height: 44 });
    expect(boxOf(result, 'b')).toEqual({ x: 16, y: 772, width: 55, height: 12 });
  });
});

describe('layoutScreen: scrim', () => {
  it('the scrim comes before the root, with id #scrim and the whole screen', () => {
    const result = run(
      [
        root(node('base', 'fixed')),
        root(node('modal', 'fixed'), { anchor: 'bottom', scrimTypeId: 'filler' }),
      ],
      400,
      800,
    );
    expect(ids(result)).toEqual(['base', 'modal#scrim', 'modal']);
    expect(result.screen.instances[1]).toMatchObject({
      typeId: 'filler',
      box: { x: 0, y: 0, width: 400, height: 800 },
      values: { tone: 'light' },
    });
    expect(result.screen.instances[1]?.parentId).toBeUndefined();
  });

  it('unknown scrim type: warning and the root continues', () => {
    const result = run([root(node('modal', 'fixed'), { scrimTypeId: 'does-not-exist' })]);
    expect(ids(result)).toEqual(['modal']);
    expect(result.warnings).toEqual([
      'modal#scrim: type without a component: does-not-exist',
    ]);
  });
});

describe('layoutScreen: limits and warnings', () => {
  it('minSize limits the final sizes (split fill and hug)', () => {
    const result = run([
      root(
        node('c', 'col-px', {}, [
          node('f1', 'filler-min'),
          node('f2', 'filler-min'),
          node('f3', 'filler-min'),
          node('h', 'hug-min'),
        ]),
      ),
    ]);
    // 100 of height for 3 fills of minimum 30: 30 each (the sum exceeds 100, without clipping)
    expect(boxOf(result, 'f1')).toMatchObject({ height: 30, width: 300 });
    expect(boxOf(result, 'f3').y).toBe(60);
    // hug of an empty component becomes the minSize
    expect(boxOf(result, 'h')).toMatchObject({ width: 80, height: 30 });
  });

  it('measured hugs round up to the next integer; the rest stays exact', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('t', 'label-frac', { text: 'AAA' }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // 3 · 5.5 = 16.5 → 17; 12.5 → 13
    expect(boxOf(result, 't')).toEqual({ x: 0, y: 0, width: 17, height: 13 });
  });

  it('type without a component: warning and the subtree is left out', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('ok', 'fixed'),
          node('x', 'does-not-exist', {}, [node('xx', 'fixed')]),
        ]),
      ),
      root(node('y', 'another-that-does-not-exist')),
    ]);
    expect(ids(result)).toEqual(['c', 'ok']);
    expect(result.warnings).toEqual([
      'x: type without a component: does-not-exist',
      'y: type without a component: another-that-does-not-exist',
    ]);
  });

  it('children in a component without a slot: warning and the children are left out', () => {
    const result = run([root(node('p', 'plain', {}, [node('k', 'fixed')]))]);
    expect(ids(result)).toEqual(['p']);
    expect(boxOf(result, 'p')).toEqual({ x: 0, y: 0, width: 80, height: 30 });
    expect(result.warnings).toEqual(['p: children ignored (component without a slot)']);
  });

  it('content taller than the screen warns, without clipping', () => {
    const result = run([root(node('a', 'tall')), root(node('b', 'tall'))], 300, 600);
    expect(result.warnings).toEqual(['screen: content taller than the screen height']);
    expect(boxOf(result, 'b')).toMatchObject({ y: 500, height: 500 });
    expect(run([root(node('a', 'tall'))], 300, 600).warnings).toEqual([]);
  });

  it('warnings do not repeat', () => {
    const result = run([
      root(node('c', 'col', {}, [node('f', 'filler-min')])),
      root(node('c2', 'col', {}, [node('f', 'filler-min')])),
    ]);
    expect(result.warnings).toEqual(['f: fill inside hug: using hug']);
  });
});

describe('layoutScreen: output', () => {
  it('copies the screen data and puts each root followed by its subtree in pre-order, with parentId', () => {
    const values = { gap: 3 };
    const result = run([
      root(
        node('r', 'col', values, [
          node('row', 'row-hug', {}, [node('a', 'fixed'), node('b', 'fixed')]),
          node('c', 'fixed'),
        ]),
      ),
      root(node('z', 'fixed'), { anchor: 'center' }),
    ]);
    expect(result.screen).toMatchObject({
      id: 's',
      name: 'Screen',
      width: 300,
      height: 600,
      background: '#FFF',
    });
    expect(ids(result)).toEqual(['r', 'row', 'a', 'b', 'c', 'z']);
    const parent = (id: string) =>
      result.screen.instances.find((i) => i.id === id)?.parentId;
    expect([
      parent('r'),
      parent('row'),
      parent('a'),
      parent('b'),
      parent('c'),
      parent('z'),
    ]).toEqual([undefined, 'r', 'row', 'row', 'r', undefined]);
    expect(result.screen.instances[0]?.values).toBe(values);
    expect(result.screen.instances[0]?.typeId).toBe('col');
  });

  it('the first root stays at the bottom: the order of roots is the drawing order', () => {
    const result = run([
      root(node('top', 'fixed'), { anchor: 'center' }),
      root(node('flow', 'fixed')),
    ]);
    expect(ids(result)).toEqual(['top', 'flow']);
  });
});

// --- proof case: Material 3 ---------------------------------------------------------------------

describe('layoutScreen: Material 3 card inside a column', () => {
  const card: ComponentFile = {
    ...M3_CARD,
    sizing: { width: 'fill', height: 'hug' },
    template: {
      ...M3_CARD.template,
      children: (M3_CARD.template.children ?? []).map((child): TemplateNode =>
        child.type === 'slot'
          ? { ...child, layout: { type: 'row', gap: 8, justify: 'end' } }
          : child,
      ),
    },
  };
  const column: ComponentFile = {
    ...M3_COLUMN,
    sizing: { width: 'fill', height: 'hug' },
  };
  const button: ComponentFile = { ...M3_BUTTON, sizing: { width: 'hug', height: 40 } };

  const m3 = build([card, column, button], {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'm3-test',
    name: 'M3',
    layers: [
      {
        id: 'components',
        name: 'Components',
        color: '#6750A4',
        annotationTypes: [card, column, button].map((c) => ({
          id: c.id,
          name: c.name,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  });

  const SHORT = 'Short text.';
  const LONG =
    'A much longer supporting text, which needs to wrap across several lines inside the card to ' +
    'push its height and that of the column down, and along with them the card that comes after.';

  function screenWith(body: string) {
    return run(
      [
        root(
          node('col', 'm3-column', { spacing: 8, padding: 0 }, [
            node('card', 'm3-card', { headline: 'Title', subhead: 'Sub', body }, [
              node('ok', 'm3-button', { label: 'OK' }),
            ]),
            node('next', 'm3-card', { headline: 'Next', body: SHORT }),
          ]),
        ),
      ],
      360,
      900,
      m3,
    );
  }

  it('the height of the card and of the column grow with the body, and the sibling goes down by the same amount', () => {
    const short = screenWith(SHORT);
    const long = screenWith(LONG);
    expect(short.warnings).toEqual([]);
    expect(long.warnings).toEqual([]);

    const shortCard = boxOf(short, 'card');
    const longCard = boxOf(long, 'card');
    const delta = longCard.height - shortCard.height;
    // several more lines (line height of bodyMedium)
    expect(delta).toBeGreaterThan(40);

    expect(boxOf(long, 'col').height - boxOf(short, 'col').height).toBeCloseTo(delta);
    expect(boxOf(long, 'next').y - boxOf(short, 'next').y).toBeCloseTo(delta);
    // the width does not change and the next card keeps its own height
    expect(longCard.width).toBe(360);
    expect(boxOf(long, 'next').height).toBe(boxOf(short, 'next').height);

    // the column is the sum of the two cards and the spacing
    for (const result of [short, long]) {
      expect(boxOf(result, 'col').height).toBeCloseTo(
        boxOf(result, 'card').height + 8 + boxOf(result, 'next').height,
      );
      expect(boxOf(result, 'next').y).toBeCloseTo(boxOf(result, 'card').height + 8);
    }
  });

  it('the button of the actions slot sits in the bottom right corner of the card (justify end)', () => {
    for (const body of [SHORT, LONG]) {
      const result = screenWith(body);
      const cardBox = boxOf(result, 'card');
      const ok = boxOf(result, 'ok');
      expect(ok.height).toBe(40);
      // card padding 16: the button ends 16 px before the bottom and right edges
      expect(ok.y + ok.height).toBeCloseTo(cardBox.y + cardBox.height - 16);
      expect(ok.x + ok.width).toBeCloseTo(cardBox.x + cardBox.width - 16);
    }
  });
});

describe('layoutScreen: fill with minSize and anchor (#CR-13, #CR-14)', () => {
  it('an anchored fill root with a margin larger than the screen does not go negative', () => {
    const result = run(
      [root(node('f', 'filler'), { anchor: 'center', margin: 500 })],
      400,
      800,
    );
    const box = boxOf(result, 'f');
    expect(box.width).toBeGreaterThanOrEqual(0);
    expect(box.height).toBeGreaterThanOrEqual(0);
  });

  it('fill on the main axis redistributes the excess when a child hits the minSize', () => {
    // 100 px column: one fill child with minSize 80 and another without a minimum.
    // distributeFill: 80 and 20 (sum 100); without redistributing it would be 80 and 50.
    const lib = build(
      [
        ...COMPONENTS,
        component(
          'fill-min80',
          {},
          {
            size: { width: 10, height: 80 },
            sizing: { width: 'fill', height: 'fill' },
            minSize: { width: 10, height: 80 },
          },
        ),
      ],
      {
        ...SPEC,
        layers: [
          {
            ...SPEC.layers[0]!,
            annotationTypes: [
              ...SPEC.layers[0]!.annotationTypes,
              {
                id: 'fill-min80',
                name: 'fill-min80',
                component: 'components/fill-min80.json',
                fields: [],
              },
            ],
          },
        ],
      },
    );
    const result = run(
      [root(node('c', 'col-px', {}, [node('a', 'fill-min80'), node('b', 'filler')]))],
      300,
      600,
      lib,
    );
    expect(lib.problems).toEqual([]);
    expect(boxOf(result, 'a').height).toBe(80);
    expect(boxOf(result, 'b').height).toBe(20);
    // The same on the horizontal axis (row with width 300).
  });
});

// --- sizing by expression (MC2, decision 9 of #898) --------------------------------------------

describe('layoutScreen: sizing by expression', () => {
  /** The `top-app-bar`: the height by `style` (64, 112, 152); the `size` 80 applies if the expression fails. */
  const bar: ComponentFile = {
    ...component('bar', {}, { size: { width: 100, height: 80 } }),
    formatVersion: 4,
    sizing: {
      width: 'fill',
      height: {
        $switch: 'style',
        cases: { small: 64, medium: 112, large: 152 },
        default: { $field: 'h' },
      },
    },
  } as unknown as ComponentFile;
  const barLib = build([...COMPONENTS, bar], {
    ...SPEC,
    layers: [
      {
        ...SPEC.layers[0]!,
        annotationTypes: [
          ...SPEC.layers[0]!.annotationTypes,
          {
            id: 'bar',
            name: 'bar',
            component: 'components/bar.json',
            fields: [{ key: 'style', label: 'Style', type: 'string', default: 'small' }],
          },
        ],
      },
    ],
  });
  const stack = (...styles: (string | [string, string | number])[]) =>
    run(
      [
        root(
          node(
            'c',
            'col',
            {},
            styles.map((style, i) =>
              node(
                `b${i}`,
                'bar',
                typeof style === 'string' ? { style } : { style: style[0], h: style[1] },
              ),
            ),
          ),
        ),
      ],
      300,
      600,
      barLib,
    );

  it('the test library loads without problems', () => {
    expect(barLib.problems).toEqual([]);
  });

  it('64, 112 and 152 by the field value', () => {
    const result = stack('small', 'medium', 'large');
    expect(result.warnings).toEqual([]);
    expect(boxOf(result, 'b0').height).toBe(64);
    expect(boxOf(result, 'b1')).toMatchObject({ y: 64, height: 112 });
    expect(boxOf(result, 'b2')).toMatchObject({ y: 176, height: 152 });
  });

  it('an invalid value falls back to the size of that axis and warns', () => {
    const result = stack(['nope', -4], ['other', 'banana']);
    expect(boxOf(result, 'b0').height).toBe(80);
    expect(boxOf(result, 'b1').height).toBe(80);
    expect(result.warnings).toContain('invalid value in sizing.height: -4');
    expect(result.warnings).toContain('invalid value in sizing.height: banana');
  });
});

// --- MC4: row wrapping (wrap) in the screen arrangement (decisions 11 and 12 of #898) ---------------

describe('layoutScreen: wrap', () => {
  function flowContainer(id: string, layout: Record<string, unknown>, sizing: Sizing) {
    return {
      ...component(
        id,
        {
          children: [
            {
              type: 'slot',
              anchors: { left: 0, right: 0, top: 0, bottom: 0 },
              layout,
            },
          ],
        },
        { sizing },
      ),
      formatVersion: 4,
    } as ComponentFile;
  }

  const FLOW = { type: 'row', gap: 8, wrap: 'wrap', lineGap: 12 };
  const WRAP_COMPONENTS: ComponentFile[] = [
    block('b100', { width: 100, height: 20 }),
    block('tall80', { width: 60, height: 80 }),
    flowContainer('flow', FLOW, { width: 'fill', height: 'hug' }),
    flowContainer('flow-hug', FLOW, { width: 'hug', height: 'hug' }),
    flowContainer(
      'flow-max1',
      { ...FLOW, maxLines: 1 },
      { width: 'fill', height: 'hug' },
    ),
    flowContainer(
      'flow-reverse',
      { ...FLOW, type: 'row', wrap: 'wrap-reverse' },
      { width: 'fill', height: 'hug' },
    ),
    flowContainer(
      'flow-col',
      { type: 'column', gap: 4, wrap: 'wrap', lineGap: 10 },
      { width: 'fill', height: 100 },
    ),
    flowContainer(
      'flow-per-line',
      { type: 'row', gap: 4, wrap: 'wrap', maxPerLine: 2 },
      { width: 'hug', height: 'hug' },
    ),
  ];
  const wrapSpec = {
    ...SPEC,
    id: 'wrap-layout',
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: WRAP_COMPONENTS.map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  };
  const wrapLibrary = build(WRAP_COMPONENTS, wrapSpec);
  const kids = (count: number) =>
    Array.from({ length: count }, (_, i) => node(`k${i}`, 'b100'));
  const flowRun = (typeId: string, count: number, width = 320) =>
    run([root(node('c', typeId, {}, kids(count)))], width, 600, wrapLibrary);

  it('the library with wrap loads', () => {
    expect(wrapLibrary.problems).toEqual([]);
  });

  it('5 children of 100 in a row of 320, gap 8, lineGap 12: 3 + 2, and the container measures both lines', () => {
    const result = flowRun('flow', 5);
    const x = (i: number) => boxOf(result, `k${i}`).x;
    const y = (i: number) => boxOf(result, `k${i}`).y;
    expect([0, 1, 2].map(x)).toEqual([0, 108, 216]);
    expect([3, 4].map(x)).toEqual([0, 108]);
    expect([0, 1, 2].map(y)).toEqual([0, 0, 0]);
    expect([3, 4].map(y)).toEqual([32, 32]);
    expect(boxOf(result, 'c').height).toBe(52);
    expect(result.warnings).toEqual([]);
  });

  it('wrap-reverse: the new line goes above', () => {
    const result = flowRun('flow-reverse', 5);
    expect([0, 3].map((i) => boxOf(result, `k${i}`).y)).toEqual([32, 0]);
  });

  it('hug on the width measures a single line (max-content)', () => {
    // On a screen wide enough (the `hug` never exceeds the available width, like `fit-content`).
    const result = flowRun('flow-hug', 5, 600);
    expect(boxOf(result, 'c')).toMatchObject({ width: 532, height: 20 });
    expect(boxOf(result, 'k4').y).toBe(0);
  });

  it('hug with maxPerLine: the width is that of the fullest line and the height sums the lines', () => {
    const result = flowRun('flow-per-line', 5);
    expect(boxOf(result, 'c')).toMatchObject({
      width: 204,
      height: 60,
    });
  });

  it('maxLines 1: the children beyond the first line disappear and the engine warns', () => {
    const result = flowRun('flow-max1', 5);
    expect(ids(result)).toEqual(['c', 'k0', 'k1', 'k2']);
    expect(result.warnings).toContain('2 children outside maxLines: c');
    expect(result.messages.map((m) => m.code)).toContain(
      'engine.childrenOutsideMaxLines',
    );
  });

  it('column with wrap: the columns line up from left to right', () => {
    const result = run(
      [
        root(
          node(
            'c',
            'flow-col',
            {},
            Array.from({ length: 5 }, (_, i) => node(`k${i}`, 'tall80')),
          ),
        ),
      ],
      320,
      600,
      wrapLibrary,
    );
    // The height is 100: each column takes one child of 80 (the second does not fit: 80 + 4 + 80 > 100).
    expect([0, 1, 2].map((i) => boxOf(result, `k${i}`).x)).toEqual([0, 70, 140]);
    expect([0, 1, 2].map((i) => boxOf(result, `k${i}`).y)).toEqual([0, 0, 0]);
  });
});

// --- min-content and max-content in sizing (L4, decision 17 of #1078) ---------------------------------

describe('layoutScreen: sizing min-content and max-content', () => {
  /** A label (formatVersion 4) of two words: 10 + 1 + 5 characters (88 px; the widest, 55 px). */
  function sentence(id: string, sizing: Sizing) {
    return component(
      id,
      {
        children: [
          {
            type: 'text',
            text: { $field: 'text' },
            width: 'fill',
            font: { size: 10, lineHeight: 12 },
            anchors: { left: 0, right: 0, top: 0 },
          },
        ],
      },
      { formatVersion: 4, sizing },
    );
  }

  const intrinsic: ComponentFile[] = [
    container('col', 'column'),
    sentence('s-hug', { width: 'hug', height: 'hug' }),
    sentence('s-max', { width: 'max-content', height: 'hug' }),
    sentence('s-min', { width: 'min-content', height: 'hug' }),
    component(
      'wrap-min',
      {
        children: [
          {
            type: 'slot',
            anchors: { left: 0, right: 0, top: 0, bottom: 0 },
            layout: { type: 'row', wrap: 'wrap', gap: 0 },
          },
        ],
      },
      { formatVersion: 4, sizing: { width: 'min-content', height: 'hug' } },
    ),
  ];
  const lib = build(intrinsic, {
    ...SPEC,
    id: 'layout-intrinsic',
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: intrinsic.map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  });
  const TEXT = `${TEN} BBBBB`;
  const widthOf = (typeId: string, screenWidth: number) =>
    boxOf(
      run(
        [root(node('c', 'col', {}, [node('b', typeId, { text: TEXT })]))],
        screenWidth,
        600,
        lib,
      ),
      'b',
    ).width;

  it('the test library loads without problems', () => {
    expect(lib.problems).toEqual([]);
  });

  it('max-content does not wrap, even on a screen narrower than the text; hug is limited by it', () => {
    expect(widthOf('s-max', 40)).toBeCloseTo(16 * 5.5, 9);
    expect(widthOf('s-hug', 40)).toBe(40);
  });

  it('min-content is the widest word', () => {
    expect(widthOf('s-min', 300)).toBeCloseTo(10 * 5.5, 9);
  });

  it('the height follows the width: min-content wraps into two lines', () => {
    const result = run(
      [root(node('c', 'col', {}, [node('b', 's-min', { text: TEXT })]))],
      300,
      600,
      lib,
    );
    expect(boxOf(result, 'b').height).toBe(24);
  });

  it('a slot with wrap in min-content is worth the largest child, not the sum', () => {
    const result = run(
      [
        root(
          node('c', 'col', {}, [
            node('w', 'wrap-min', {}, [
              node('k1', 's-hug', { text: TEXT }),
              node('k2', 's-hug', { text: TEXT }),
            ]),
          ]),
        ),
      ],
      300,
      600,
      lib,
    );
    expect(boxOf(result, 'w').width).toBeCloseTo(10 * 5.5, 9);
  });

  it('an anchored root also measures the intrinsic sizing', () => {
    const result = run(
      [root(node('b', 's-max', { text: TEXT }), { anchor: 'top-start' })],
      40,
      600,
      lib,
    );
    expect(boxOf(result, 'b').width).toBeCloseTo(16 * 5.5, 9);
  });
});
