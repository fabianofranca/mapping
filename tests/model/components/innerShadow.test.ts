// DX2: `shadow.inner` (format 4) — validator, scene and clip.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';

const V4 = 'only allowed with formatVersion 4';
const shadow = (extra: Record<string, unknown> = {}) => ({ color: '#000', ...extra });

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

const node = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  width: 10,
  height: 10,
  ...extra,
});

describe('shadow.inner (decision 8)', () => {
  it('inner: true on a single shadow of frame, rect and ellipse is valid', () => {
    for (const type of ['frame', 'rect', 'ellipse'])
      expect(
        validateComponent(withChild(node(type, { shadow: shadow({ inner: true }) }))),
      ).toEqual([]);
  });

  it('inner: false is valid (it is the default)', () => {
    expect(
      validateComponent(withChild(node('ellipse', { shadow: shadow({ inner: false }) }))),
    ).toEqual([]);
  });

  it('works in a list mixed with outer shadows; the limit of 4 counts both', () => {
    const ok = [shadow(), shadow({ inner: true }), shadow(), shadow({ inner: true })];
    expect(validateComponent(withChild(node('rect', { shadow: ok })))).toEqual([]);
    const five = [...ok, shadow({ inner: true })];
    expect(validateComponent(withChild(node('rect', { shadow: five })))).toEqual([
      'template.children[0].shadow: expected 1 to 4 shadows',
    ]);
  });

  it('inner on text, path, icon or image is refused at the key', () => {
    for (const type of ['text', 'path', 'icon', 'image']) {
      const issues = validateComponent(
        withChild(node(type, { shadow: shadow({ inner: true }) })),
      ).filter((m) => m.includes('inner'));
      expect(issues).toEqual([
        'template.children[0].shadow.inner: only valid on frame, rect and ellipse',
      ]);
    }
  });

  it('the refusal in a list points at the item', () => {
    const issues = validateComponent(
      withChild(node('text', { shadow: [shadow(), shadow({ inner: true })] })),
    ).filter((m) => m.includes('inner'));
    expect(issues).toEqual([
      'template.children[0].shadow[1].inner: only valid on frame, rect and ellipse',
    ]);
  });

  it('a non-boolean value is an error', () => {
    for (const bad of ['true', 1, null]) {
      expect(
        validateComponent(withChild(node('rect', { shadow: shadow({ inner: bad }) }))),
      ).toEqual(['template.children[0].shadow.inner: expected true or false']);
    }
  });

  it('in versions 1 to 3 it is only allowed with formatVersion 4', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(
          withChild(node('rect', { shadow: shadow({ inner: true }) }), version),
        ),
      ).toEqual([`template.children[0].shadow.inner: ${V4}`]);
  });
});

function component(rootExtra: Record<string, unknown>, child?: Record<string, unknown>) {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      ...rootExtra,
      children: child ? [child] : [],
    },
  };
}

const draw = (c: unknown) =>
  instantiate(
    c as never,
    {},
    { x: 0, y: 0, width: 100, height: 40 },
    { measure: approximateMeasurer },
  );

describe('shadow.inner in the scene', () => {
  it('carries inner: true in effects, in list order, with spread and offset', () => {
    const { root } = draw(
      component({
        shadow: [
          { color: '#000', x: 1, y: 2, blur: 3, spread: 4, inner: true },
          { color: '#111', y: 1, blur: 2 },
        ],
      }),
    );
    expect(root.effects).toEqual([
      { color: '#000', offset: { x: 1, y: 2 }, blur: 3, spread: 4, inner: true },
      { color: '#111', offset: { x: 0, y: 1 }, blur: 2 },
    ]);
  });

  it('inner: false is the same as no inner', () => {
    const { root } = draw(
      component({ shadow: { color: '#000', blur: 2, inner: false } }),
    );
    expect(root.effects[0]).not.toHaveProperty('inner');
  });

  it('an inner shadow does not enlarge the root clip, an outer one does', () => {
    const inner = draw(
      component({ shadow: { color: '#000', blur: 10, spread: 5, inner: true } }),
    ).root as { clipBox?: unknown };
    expect(inner.clipBox).toBeUndefined();
    const outer = draw(component({ shadow: { color: '#000', blur: 10 } })).root as {
      clipBox?: unknown;
    };
    expect(outer.clipBox).toBeDefined();
  });
});
