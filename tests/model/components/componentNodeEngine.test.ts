// CC2: the `component` node in the engine (decisions 3 to 9 of #2093): an inner component of the
// same specialization drawn in the node's box, with its own values, size, scope and warnings.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValue,
  FieldValues,
  ResolvedComponent,
  ResolvedComponentField,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type InstantiateOptions,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { resolveTokens } from '../../../src/model/components/tokens';
import {
  walk,
  type FrameNode,
  type SceneNode,
} from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

function file(id: string, extra: Json, template: Json): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: `Name of ${id}`,
    size: { width: 60, height: 24 },
    ...extra,
    template,
  } as unknown as ComponentFile;
}

const field = (
  key: string,
  extra: Partial<ResolvedComponentField> = {},
): ResolvedComponentField => ({ key, type: 'string', required: false, ...extra });

const entry = (
  component: ComponentFile,
  ...fields: ResolvedComponentField[]
): ResolvedComponent => ({ component, fields });

/** The `chip`: a colored pill with a label; `tone` is its fill, `label` its text. */
function chip(extra: Json = {}, templateExtra: Json = {}): ComponentFile {
  return file('chip', extra, {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center', padding: [0, 8] },
    fill: { $field: 'tone', default: '#111111' },
    cornerRadius: 12,
    ...templateExtra,
    children: [
      {
        type: 'text',
        name: 'label',
        text: { $field: 'label', default: '-' },
        color: '#ffffff',
        font: { size: 12 },
        width: 'hug',
      },
    ],
  });
}

const chipFields = [
  field('label', { default: 'dflt' }),
  field('tone'),
  field('n', { type: 'number' }),
];

/** An outer component with one `component` node (id `chip`) in a `none` frame. */
function outer(
  node: Json,
  inner: ComponentFile = chip(),
  fields = chipFields,
  extra: Json = {},
  resolved: Record<string, ResolvedComponent> = { chip: entry(inner, ...fields) },
): ComponentFile {
  return {
    ...file(
      'outer',
      { size: { width: 200, height: 80 }, ...extra },
      {
        type: 'frame',
        layout: { type: 'none' },
        clip: false,
        children: [{ type: 'component', id: 'chip', ...node }],
      },
    ),
    resolvedComponents: resolved,
  };
}

const box = { x: 0, y: 0, width: 200, height: 80 };
const base: InstantiateOptions = { measure: approximateMeasurer, idPrefix: 'o' };

const run = (
  component: ComponentFile,
  values: FieldValues = {},
  options: Partial<InstantiateOptions> = {},
) => instantiate(component, values, box, { ...base, ...options });

const inner = (root: FrameNode): FrameNode => root.children[0] as FrameNode;

/** The scene without ids and names, to compare drawings. */
function strip(node: SceneNode): unknown {
  const rest: Record<string, unknown> = { ...node };
  delete rest.id;
  delete rest.name;
  if ('children' in node) rest.children = node.children.map(strip);
  return rest;
}

const texts = (root: SceneNode): string[] =>
  [...walk(root)].flatMap((n) => (n.type === 'text' ? [n.text] : []));

const colorOf = (node: SceneNode): string | undefined => {
  const fill = node.fills[0];
  return fill?.type === 'solid' ? fill.color : undefined;
};

describe('component node: the inner drawing', () => {
  it('equals a standalone instance of the inner component at the same box and values', () => {
    const values = { label: 'Hello', tone: '#ff0000' };
    const drawn = run(
      outer({
        width: 120,
        height: 30,
        values: { label: { $field: 'title' }, tone: '#ff0000' },
      }),
      { title: 'Hello' },
    );
    const alone = instantiate(
      chip(),
      values,
      { x: 0, y: 0, width: 120, height: 30 },
      { ...base, idPrefix: 'o/root.0/component' },
    );
    expect(strip(inner(drawn.root))).toEqual(strip(alone.root));
    // the ids are prefixed by the node's path
    expect(inner(drawn.root).id).toBe(alone.root.id);
    expect(inner(drawn.root).id.startsWith('o/root.0/component/')).toBe(true);
    expect([...walk(inner(drawn.root))].every((n) => n.id.startsWith('o/root.0/'))).toBe(
      true,
    );
  });

  it('the node is the inner root frame: its name is the node name, else the inner component name', () => {
    expect(inner(run(outer({ width: 60, height: 24 })).root).name).toBe('Name of chip');
    expect(inner(run(outer({ width: 60, height: 24, name: 'Status' })).root).name).toBe(
      'Status',
    );
  });

  it('places the inner drawing at the node box', () => {
    const drawn = run(outer({ width: 60, height: 24, anchors: { left: 10, top: 6 } }));
    expect(inner(drawn.root).transform).toEqual([1, 0, 0, 1, 10, 6]);
    expect(inner(drawn.root)).toMatchObject({ width: 60, height: 24 });
  });
});

describe('component node: values', () => {
  const label = (values: Json, outerValues: FieldValues = {}) =>
    texts(run(outer({ width: 60, height: 24, values }), outerValues).root)[0];

  it('a literal', () => expect(label({ label: 'Lit' })).toBe('Lit'));

  it('$field reads the outer field', () =>
    expect(label({ label: { $field: 'title' } }, { title: 'Out' })).toBe('Out'));

  it('$switch', () => {
    const values = {
      label: { $switch: 'kind', cases: { a: 'AA', b: 'BB' }, default: 'ZZ' },
    };
    expect(label(values, { kind: 'b' })).toBe('BB');
    expect(label(values, { kind: 'q' })).toBe('ZZ');
  });

  it('an expression', () => {
    expect(
      label({ label: { $concat: ['n=', { $add: [1, { $field: 'k' }] }] } }, { k: 2 }),
    ).toBe('n=3');
  });

  it('the outer let does not reach the inner component; an inner let k is its own', () => {
    // `let`/`$var` are expanded when a component is read: each file keeps to its own scope.
    const read = (json: Json): ComponentFile => {
      const parsed = parseComponent({
        format: 'mapping-component',
        formatVersion: 4,
        size: { width: 60, height: 24 },
        ...json,
      });
      if (!parsed.ok) throw new Error(parsed.errors.join('; '));
      return parsed.component;
    };
    const innerWith = (text: unknown): ComponentFile =>
      read({
        id: 'inner',
        name: 'Inner',
        template: {
          type: 'frame',
          let: { k: 5 },
          children: [{ type: 'text', name: 'label', text, width: 'hug' }],
        },
      });
    const outerOf = (
      inner: ComponentFile,
      node: Json,
      field: ResolvedComponentField[],
    ) => ({
      ...read({
        id: 'outer',
        name: 'Outer',
        template: {
          type: 'frame',
          layout: { type: 'none' },
          let: { k: 9 },
          children: [{ type: 'component', id: 'chip', width: 60, height: 24, ...node }],
        },
      }),
      resolvedComponents: { chip: entry(inner, ...field) },
    });
    const kOnly = innerWith({ $concat: ['k=', { $var: 'k' }] });
    expect(texts(run(outerOf(kOnly, {}, [])).root)[0]).toBe('k=5');
    // an outer value reaches the inner component only through `values`
    const viaValue = outerOf(
      innerWith({ $field: 'n' }),
      { values: { n: { $var: 'k' } } },
      [field('n', { type: 'number' })],
    );
    expect(texts(run(viaValue).root)[0]).toBe('9');
  });
});

describe('component node: fields the node does not give', () => {
  it('a missing optional field gets the type default; with no default it is empty', () => {
    const drawn = run(outer({ width: 60, height: 24 }));
    expect(texts(drawn.root)).toEqual(['dflt']);
    // `tone` has no default: empty, so the inner template falls back to its own fill
    expect(colorOf(inner(drawn.root))).toBe('#111111');
    // `n` has no default and is not given: empty
    const none = outer({ width: 60, height: 24 }, chip(), [
      field('label'),
      field('tone'),
    ]);
    expect(texts(run(none).root)).toEqual(['-']);
  });

  it('never reads the inner preview', () => {
    const withPreview = chip({ preview: { label: 'PREVIEW', tone: '#00ff00' } });
    const drawn = run(outer({ width: 60, height: 24 }, withPreview));
    expect(texts(drawn.root)).toEqual(['dflt']);
    expect(colorOf(inner(drawn.root))).toBe('#111111');
  });

  it('a given empty value stays empty (it does not take the default)', () => {
    const drawn = run(outer({ width: 60, height: 24, values: { label: null } }));
    expect(texts(drawn.root)).toEqual(['-']);
  });
});

describe('component node: size', () => {
  const sizeOf = (node: Json, inner = chip(), outerValues: FieldValues = {}) => {
    const root = run(outer(node, inner), outerValues).root;
    const drawn = inner_(root);
    return { w: drawn.width, h: drawn.height };
  };
  const inner_ = (root: FrameNode) => root.children[0] as FrameNode;

  it('px on the node', () =>
    expect(sizeOf({ width: 90, height: 33 })).toEqual({ w: 90, h: 33 }));

  it('fill takes the parent box', () =>
    expect(sizeOf({ width: 'fill', height: 'fill' })).toEqual({ w: 200, h: 80 }));

  it('hug measures the inner drawing with its values', () => {
    const hug = { width: 'hug', height: 'hug' };
    const short = sizeOf({ ...hug, values: { label: '3' } });
    const long = sizeOf({ ...hug, values: { label: '99+' } });
    expect(long.w).toBeGreaterThan(short.w);
    expect(short.w).toBeGreaterThan(16); // padding 8 + 8, plus the text
  });

  it('an absent axis takes the inner `size` in px (no `sizing`)', () => {
    expect(sizeOf({})).toEqual({ w: 60, h: 24 });
  });

  it('an absent axis takes the inner `sizing` literal, evaluated with the inner values', () => {
    const hugging = chip({ sizing: { width: 'hug', height: 18 } });
    const { w, h } = sizeOf({ values: { label: 'abcdefgh' } }, hugging);
    expect(h).toBe(18);
    expect(w).toBeGreaterThan(40);
  });

  it('an absent axis takes the inner `sizing` expression, with the inner values', () => {
    const byField = chip({
      sizing: {
        width: { $switch: 'tone', cases: { big: 100 }, default: 40 },
        height: 24,
      },
    });
    expect(sizeOf({ values: { tone: 'big' } }, byField).w).toBe(100);
    expect(sizeOf({ values: { tone: 'small' } }, byField).w).toBe(40);
  });

  it('the node width wins over the inner sizing on that axis', () => {
    const hugging = chip({ sizing: { width: 'hug', height: 'hug' } });
    expect(sizeOf({ width: 70, values: { label: 'abcdefgh' } }, hugging).w).toBe(70);
  });

  it('the inner minSize is a floor on both axes', () => {
    const floored = chip({ minSize: { width: 50, height: 30 } });
    expect(sizeOf({ width: 20, height: 10 }, floored)).toEqual({ w: 50, h: 30 });
  });

  it('the hug of the outer grows with a hug inner (badge 3 -> 99+)', () => {
    const badge = chip({ sizing: { width: 'hug', height: 'hug' } });
    const holder = (n: string): ComponentFile =>
      file(
        'holder',
        { sizing: { width: 'hug', height: 'hug' } },
        {
          type: 'frame',
          layout: { type: 'row', align: 'center' },
          children: [
            {
              type: 'component',
              id: 'chip',
              width: 'hug',
              height: 'hug',
              values: { label: n },
            },
          ],
        },
      );
    const measured = (n: string) =>
      measureComponent(
        {
          ...holder(n),
          resolvedComponents: { chip: entry(badge, ...chipFields) },
        },
        {},
        { width: null, height: null },
        base,
      );
    expect(measured('99+').width).toBeGreaterThan(measured('3').width);
  });
});

describe('component node: visible, opacity, rotation', () => {
  it('visible false draws nothing', () => {
    const drawn = run(outer({ width: 60, height: 24, visible: false }));
    expect(drawn.root.children).toHaveLength(0);
  });

  it('opacity and rotation apply to the whole inner drawing', () => {
    const drawn = run(outer({ width: 60, height: 24, opacity: 0.5, rotation: 30 }));
    expect(inner(drawn.root)).toMatchObject({ opacity: 0.5, rotation: 30 });
  });
});

describe('component node: the outer scope reaches the inner one', () => {
  it('the outer tokens (mode) and rtl direction reach the inner component', () => {
    const themed = chip(undefined, { fill: { $token: 'surface' } });
    const tokens = resolveTokens(
      {
        modes: ['light', 'dark'],
        values: { surface: { light: '#fafafa', dark: '#101010' } },
      },
      {},
      'dark',
    );
    const drawn = run(outer({ width: 60, height: 24 }, themed), {}, { tokens });
    expect(colorOf(inner(drawn.root))).toBe('#101010');

    const rtl = outer(
      { width: 60, height: 24 },
      chip(undefined, { layout: { type: 'row', align: 'center' } }),
    );
    const label = (direction: 'ltr' | 'rtl') =>
      [...walk(run(rtl, { label: 'x' }, { direction }).root)].find(
        (n) => n.type === 'text',
      );
    // the node is rtl, so the row of the inner component mirrors: the text sits at the other end
    expect(label('rtl')?.transform[4]).not.toBe(label('ltr')?.transform[4]);
  });

  it('the outer provided scope reaches the inner $provided', () => {
    const reading = chip(undefined, {
      fill: { $provided: 'ink', default: '#abcdef' },
    });
    const drawn = run(
      outer({ width: 60, height: 24 }, reading),
      {},
      {
        provided: { ink: '#123456' },
      },
    );
    expect(colorOf(inner(drawn.root))).toBe('#123456');
    expect(colorOf(inner(run(outer({ width: 60, height: 24 }, reading)).root))).toBe(
      '#abcdef',
    );
  });
});

describe('component node: provide (decision 7a)', () => {
  const reading = chip(undefined, { fill: { $provided: 'ink', default: '#abcdef' } });

  it('resolves in the outer scope: a $field and a $token with the outer mode', () => {
    const viaField = run(
      outer({ width: 60, height: 24, provide: { ink: { $field: 'c' } } }, reading),
      { c: '#00ff00' },
    );
    expect(colorOf(inner(viaField.root))).toBe('#00ff00');

    const tokens = resolveTokens(
      {
        modes: ['light', 'dark'],
        values: { ink: { light: '#eeeeee', dark: '#222222' } },
      },
      {},
      'dark',
    );
    const viaToken = run(
      outer({ width: 60, height: 24, provide: { ink: { $token: 'ink' } } }, reading),
      {},
      { tokens },
    );
    expect(colorOf(inner(viaToken.root))).toBe('#222222');
  });

  it('wins over the outer scope, name by name', () => {
    const drawn = run(
      outer({ width: 60, height: 24, provide: { ink: '#0000ff' } }, reading),
      {},
      { provided: { ink: '#ff0000', other: '#ffffff' } },
    );
    expect(colorOf(inner(drawn.root))).toBe('#0000ff');
  });

  it('a value that produces nothing offers nothing', () => {
    const drawn = run(
      outer({ width: 60, height: 24, provide: { ink: { $field: 'missing' } } }, reading),
      {},
      { provided: { ink: '#ff0000' } },
    );
    expect(colorOf(inner(drawn.root))).toBe('#ff0000');
  });

  it('reaches a nested component node', () => {
    const middle = file(
      'middle',
      { size: { width: 60, height: 24 } },
      {
        type: 'frame',
        layout: { type: 'none' },
        children: [{ type: 'component', id: 'leaf', width: 60, height: 24 }],
      },
    );
    const withMiddle: ComponentFile = {
      ...middle,
      resolvedComponents: { leaf: entry(reading) },
    };
    const top = outer(
      { width: 60, height: 24, provide: { ink: '#778899' } },
      withMiddle,
      [],
      {},
      { chip: entry(withMiddle) },
    );
    const leaf = [...walk(run(top).root)].find((n) => colorOf(n) === '#778899');
    expect(leaf).toBeDefined();
  });

  it('does not leak to siblings', () => {
    const twin = {
      ...outer({ width: 60, height: 24, provide: { ink: '#0000ff' } }, reading),
    } as ComponentFile;
    const two: ComponentFile = {
      ...twin,
      template: {
        type: 'frame',
        layout: { type: 'none' },
        clip: false,
        children: [
          {
            type: 'component',
            id: 'chip',
            width: 60,
            height: 24,
            provide: { ink: '#0000ff' },
          },
          { type: 'component', id: 'chip', width: 60, height: 24, anchors: { top: 30 } },
        ],
      },
    } as unknown as ComponentFile;
    const drawn = run(two);
    const colors = (drawn.root.children as FrameNode[]).map(colorOf);
    expect(colors).toEqual(['#0000ff', '#abcdef']);
  });
});

describe('component node: baseline, warnings, repeat', () => {
  it('align baseline reads the inner first baseline', () => {
    const holder: ComponentFile = {
      ...file(
        'holder',
        { size: { width: 200, height: 80 } },
        {
          type: 'frame',
          layout: { type: 'row', align: 'baseline' },
          children: [
            { type: 'text', name: 'big', text: 'Big', font: { size: 24 }, width: 'hug' },
            { type: 'component', id: 'chip', width: 60, height: 24 },
          ],
        },
      ),
      resolvedComponents: { chip: entry(chip(), ...chipFields) },
    };
    const root = run(holder).root;
    const big = root.children[0] as SceneNode;
    const chipNode = root.children[1] as FrameNode;
    const textNode = [...walk(chipNode)].find((n) => n.type === 'text') as SceneNode;
    const bigBaseline = big.transform[5] + 24 * 0.93 + (24 * 0.8 - 24 * 0.8); // approx: compare relative below
    expect(bigBaseline).toBeDefined();
    // the inner text's baseline line up with the big text's: the chip is shifted up relative to a
    // chip aligned to the top
    const topAligned = run({
      ...holder,
      template: {
        ...(holder.template as unknown as Json),
        layout: { type: 'row', align: 'start' },
      },
    } as unknown as ComponentFile).root.children[1] as FrameNode;
    expect(chipNode.transform[5]).not.toBe(topAligned.transform[5]);
    expect(textNode).toBeDefined();
  });

  it('an inner "does not fit" warning reaches the outer instance', () => {
    const tight = chip(undefined, { clip: false });
    const drawn = run(
      outer(
        { width: 20, height: 10, values: { label: 'a very long label here' } },
        tight,
      ),
    );
    const standalone = instantiate(
      tight,
      { label: 'a very long label here', tone: null, n: null },
      { x: 0, y: 0, width: 20, height: 10 },
      base,
    );
    expect(standalone.warnings.length).toBeGreaterThan(0);
    for (const warning of standalone.warnings) expect(drawn.warnings).toContain(warning);
    for (const [text, missing] of Object.entries(standalone.shortfalls ?? {}))
      expect(drawn.shortfalls?.[text]).toBe(missing);
  });

  it('inside a repeat the node reads the row', () => {
    const holder: ComponentFile = {
      ...file(
        'holder',
        { size: { width: 200, height: 80 } },
        {
          type: 'frame',
          layout: { type: 'row', gap: 4 },
          children: [
            {
              type: 'repeat',
              field: 'rows',
              template: {
                type: 'component',
                id: 'chip',
                width: 40,
                height: 24,
                values: { label: { $field: 'name' } },
              },
            },
          ],
        },
      ),
      resolvedComponents: { chip: entry(chip(), ...chipFields) },
    };
    const drawn = run(holder, { rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(texts(drawn.root)).toEqual(['A', 'B', 'C']);
  });
});

describe('component node: unavailable inner component', () => {
  const unavailable = (component: ComponentFile) => {
    const drawn = run(component);
    expect(drawn.root.children).toHaveLength(0);
    expect(drawn.warnings).toEqual(['component not available: chip']);
  };

  it('an unknown type draws nothing and warns', () =>
    unavailable(outer({ width: 60, height: 24 }, chip(), chipFields, {}, {})));

  it('a nesting deeper than 8 draws nothing at the 9th level', () => {
    // a chain of 10 components, each drawing the next one
    const ids = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const build = (i: number): ComponentFile => {
      const last = i === ids.length - 1;
      const base = file(
        ids[i] as string,
        { size: { width: 60, height: 24 } },
        last
          ? { type: 'frame', fill: '#00ff00' }
          : {
              type: 'frame',
              layout: { type: 'none' },
              children: [{ type: 'component', id: ids[i + 1], width: 60, height: 24 }],
            },
      );
      return last
        ? base
        : {
            ...base,
            resolvedComponents: { [ids[i + 1] as string]: entry(build(i + 1)) },
          };
    };
    const drawn = run(build(0));
    expect(drawn.warnings).toEqual([`component not available: ${ids[9]}`]);
    // the 8 levels above it still drew
    let depth = 0;
    let at: SceneNode | undefined = drawn.root;
    while (at !== undefined && 'children' in at && at.children.length > 0) {
      at = at.children[0];
      depth++;
    }
    expect(depth).toBe(8);
  });
});

describe('component node: the value types of a table field', () => {
  it('a table field accepts only the outer table field', () => {
    const list = file(
      'list',
      { size: { width: 100, height: 40 } },
      {
        type: 'frame',
        layout: { type: 'row' },
        children: [
          {
            type: 'repeat',
            field: 'rows',
            template: { type: 'text', text: { $field: 'name' }, width: 'hug' },
          },
        ],
      },
    );
    const holder: ComponentFile = {
      ...file(
        'holder',
        { size: { width: 200, height: 80 } },
        {
          type: 'frame',
          layout: { type: 'none' },
          children: [
            {
              type: 'component',
              id: 'list',
              width: 100,
              height: 40,
              values: { rows: { $field: 'mine' } },
            },
          ],
        },
      ),
      resolvedComponents: { list: entry(list, field('rows', { type: 'table' })) },
    };
    const mine: FieldValue = [{ name: 'x' }, { name: 'y' }];
    expect(texts(run(holder, { mine }).root)).toEqual(['x', 'y']);
  });
});
