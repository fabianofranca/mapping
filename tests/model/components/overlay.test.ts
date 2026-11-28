// Format 4, stage #2915 (DG4): `overlay: true` draws a node above the child markings of the same
// container. The format and the engine only carry the flag (`overlay: true` on the scene node, the tree
// unchanged); `splitOverlay` cuts the scene into the base and the overlay that the renderers draw.
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  type ComponentFile,
  type FieldValues,
  type ResolvedComponent,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { splitOverlay } from '../../../src/model/components/overlay';
import {
  type FrameNode,
  type SceneNode,
  walk,
} from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

const V4 = 'only allowed with formatVersion 4';

function file(template: unknown, version = 4, extra: Raw = {}): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    ...extra,
    template,
  };
}

function parse(template: Raw, extra: Raw = {}): ComponentFile {
  const r = parseComponent(file(template, 4, extra));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

const bar = (extra: Raw = {}): Raw => ({
  type: 'rect',
  name: 'bar',
  width: 40,
  height: 10,
  fill: '#ff0000',
  ...extra,
});

const root = (children: Raw[], extra: Raw = {}): Raw => ({
  type: 'frame',
  layout: { type: 'none' },
  children,
  ...extra,
});

function scene(component: ComponentFile, values: FieldValues = {}): FrameNode {
  return instantiate(
    component,
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer },
  ).root;
}

function named(node: SceneNode, name: string): SceneNode {
  for (const n of walk(node)) if (n.name === name) return n;
  throw new Error(`no node ${name}`);
}

describe('overlay in the validator', () => {
  it('a literal true or false is valid on a child', () => {
    expect(
      validateComponent(
        file(root([bar({ overlay: true }), bar({ name: 'two', overlay: false })])),
      ),
    ).toEqual([]);
  });

  it('on the root it is an error', () => {
    expect(validateComponent(file(root([], { overlay: true })))).toEqual([
      'template.overlay: not valid on the root',
    ]);
  });

  it('a value that is not a boolean fails at the key path', () => {
    expect(validateComponent(file(root([bar({ overlay: 'yes' })])))).toEqual([
      'template.children[0].overlay: expected true or false',
    ]);
  });

  it('an expression is not accepted (the key stays a literal)', () => {
    expect(
      validateComponent(file(root([bar({ overlay: { $field: 'a' } })]))),
    ).not.toEqual([]);
  });

  it('in a formatVersion 1 to 3 it gives the version error at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(file(root([bar({ overlay: true })]), version))).toEqual([
        `template.children[0].overlay: ${V4}`,
      ]);
    }
  });

  it('on the root of a formatVersion 3 only the version error appears', () => {
    expect(validateComponent(file(root([], { overlay: true }), 3))).toEqual([
      `template.overlay: ${V4}`,
    ]);
  });
});

describe('overlay in the scene', () => {
  it('the flagged node carries overlay: true and the others do not', () => {
    const drawn = scene(parse(root([bar({ overlay: true }), bar({ name: 'plain' })])));
    expect(named(drawn, 'bar')).toMatchObject({ overlay: true });
    expect(named(drawn, 'plain').overlay).toBeUndefined();
    expect(drawn.overlay).toBeUndefined();
  });

  it('the flagged node keeps its place in the layout', () => {
    const tpl = (overlay: boolean): Raw =>
      root(
        [bar({ name: 'a', ...(overlay ? { overlay: true } : {}) }), bar({ name: 'b' })],
        {
          layout: { type: 'column', gap: 4 },
        },
      );
    const flagged = scene(parse(tpl(true)));
    const plain = scene(parse(tpl(false)));
    expect(named(flagged, 'b').transform).toEqual(named(plain, 'b').transform);
    expect(named(flagged, 'a').transform).toEqual(named(plain, 'a').transform);
  });

  it('a false flag leaves the node as it was', () => {
    const drawn = scene(parse(root([bar({ overlay: false })])));
    expect(named(drawn, 'bar').overlay).toBeUndefined();
  });

  it('in a component with screen the flag stays out', () => {
    const drawn = scene(parse(root([bar({ overlay: true })]), { screen: {} }));
    expect(named(drawn, 'bar').overlay).toBeUndefined();
  });

  it('inside a component node the flag stays out', () => {
    const inner: ComponentFile = parse(
      root([bar({ name: 'inner-bar', overlay: true })]),
      {
        id: 'inner',
      },
    );
    const resolved: Record<string, ResolvedComponent> = {
      inner: { component: inner, fields: [] },
    };
    const outer = {
      ...parse(
        root([
          { type: 'component', id: 'inner', width: 100, height: 50 },
          bar({ name: 'outer-bar', overlay: true }),
        ]),
        { id: 'outer' },
      ),
      resolvedComponents: resolved,
    } as ComponentFile;
    const drawn = scene(outer);
    expect(named(drawn, 'inner-bar').overlay).toBeUndefined();
    expect(named(drawn, 'outer-bar').overlay).toBe(true);
  });
});

describe('splitOverlay', () => {
  it('a root with no flag gives the same object and no overlay', () => {
    const drawn = scene(parse(root([bar()])));
    const split = splitOverlay(drawn);
    expect(split.base).toBe(drawn);
    expect(split.overlay).toBeUndefined();
  });

  const nested = (): FrameNode =>
    scene(
      parse(
        root(
          [
            {
              type: 'frame',
              name: 'mid',
              layout: { type: 'none' },
              width: 120,
              height: 60,
              opacity: 0.5,
              rotation: 10,
              fill: '#00ff00',
              stroke: { color: '#000000', width: 2 },
              shadow: { color: '#000000', blur: 4 },
              children: [bar({ overlay: true }), bar({ name: 'plain' })],
            },
          ],
          { fill: '#0000ff', stroke: { color: '#111111', width: 1 } },
        ),
      ),
    );

  it('a flagged grandchild leaves the base and stays in the overlay', () => {
    const drawn = nested();
    const { base, overlay } = splitOverlay(drawn);
    const baseNames = [...walk(base)].map((n) => n.name);
    expect(baseNames).toContain('plain');
    expect(baseNames).not.toContain('bar');
    expect(overlay).toBeDefined();
    const overlayNames = [...walk(overlay as SceneNode)].map((n) => n.name);
    expect(overlayNames).toContain('bar');
    expect(overlayNames).not.toContain('plain');
    // The flagged node itself is the original one.
    expect(named(overlay as SceneNode, 'bar')).toBe(named(drawn, 'bar'));
  });

  it('the overlay keeps both ancestors’ transform, clip, opacity and rotation, with no ancestor paint', () => {
    const drawn = nested();
    const { overlay } = splitOverlay(drawn);
    const top = overlay as FrameNode;
    expect(top.id).toBe(drawn.id);
    expect(top.transform).toEqual(drawn.transform);
    expect(top.clip).toBe(drawn.clip);
    expect(top.opacity).toBe(drawn.opacity);
    expect(top.fills).toEqual([]);
    expect(top.stroke).toBeUndefined();
    expect(top.effects).toEqual([]);

    const mid = named(top, 'mid') as FrameNode;
    const original = named(drawn, 'mid') as FrameNode;
    expect(mid.transform).toEqual(original.transform);
    expect(mid.opacity).toBe(0.5);
    expect(mid.rotation).toBe(10);
    expect(mid.width).toBe(original.width);
    expect(mid.height).toBe(original.height);
    expect(mid.clip).toBe(original.clip);
    expect(mid.clipBox).toEqual(original.clipBox);
    expect(mid.fills).toEqual([]);
    expect(mid.stroke).toBeUndefined();
    expect(mid.effects).toEqual([]);
  });

  it('the base keeps the ancestors’ paint', () => {
    const drawn = nested();
    const { base } = splitOverlay(drawn);
    const mid = named(base, 'mid');
    expect(mid.fills).toEqual(named(drawn, 'mid').fills);
    expect(mid.stroke).toEqual(named(drawn, 'mid').stroke);
    expect(base.fills).toEqual(drawn.fills);
  });

  it('the same root returns the same pair', () => {
    const drawn = nested();
    expect(splitOverlay(drawn)).toBe(splitOverlay(drawn));
  });

  it('two overlay nodes keep their drawing order', () => {
    const drawn = scene(
      parse(
        root([
          bar({ name: 'first', overlay: true }),
          bar({ name: 'middle' }),
          bar({ name: 'last', overlay: true }),
        ]),
      ),
    );
    const { overlay } = splitOverlay(drawn);
    expect((overlay as FrameNode).children.map((n) => n.name)).toEqual(['first', 'last']);
  });
});
