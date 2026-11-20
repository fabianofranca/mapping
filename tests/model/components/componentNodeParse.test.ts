// CC1: the `component` node (v4) — level 1: keys, `id`, `values`, `provide` and the version gate.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const AT = 'template.children[0]';

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

const node = (extra: Record<string, unknown> = {}) => ({
  type: 'component',
  id: 'button',
  ...extra,
});

describe('component node: shape', () => {
  it('accepts the bare node and the node with values', () => {
    expect(validateComponent(withChild(node()))).toEqual([]);
    expect(
      validateComponent(
        withChild(
          node({
            values: {
              label: { $field: 'title' },
              count: 3,
              on: true,
              off: false,
              none: null,
              text: 'x',
              tone: { $token: 'primary' },
              total: { $add: [{ $field: 'a' }, 1] },
              pick: { $if: { $has: 'a' }, then: 'x', else: 'y' },
              joined: { $concat: ['a', { $field: 'b' }] },
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('parses into a node of type component', () => {
    const result = parseComponent(
      withChild(node({ values: { label: 'x' }, provide: { ink: '#fff' } })),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts the base keys', () => {
    expect(
      validateComponent(
        withChild(
          node({
            name: 'Inner',
            visible: { $has: 'a' },
            opacity: 0.5,
            rotation: 10,
            direction: 'rtl',
            width: 'fill',
            height: 20,
            minWidth: 1,
            maxWidth: 50,
            minHeight: 1,
            maxHeight: 30,
            anchors: { left: 0, top: 0 },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('weight is only valid on a fill child of a row or column', () => {
    expect(validateComponent(withChild(node({ weight: 2 })))).toEqual([
      `${AT}.weight: weight: only valid on a fill child on the main axis of a row or column`,
    ]);
    const row = {
      ...(withChild(node()) as Record<string, unknown>),
      template: {
        type: 'frame',
        layout: { type: 'row' },
        children: [node({ width: 'fill', weight: 2 })],
      },
    };
    expect(validateComponent(row)).toEqual([]);
  });

  it('span is only valid in a grid, like on any node', () => {
    expect(validateComponent(withChild(node({ span: 2 })))).toEqual([
      `${AT}.span: span: only valid on a child of a grid layout`,
    ]);
    const grid = {
      ...(withChild(node({ span: 2 })) as Record<string, unknown>),
      template: {
        type: 'frame',
        layout: { type: 'grid', columns: 2 },
        children: [node({ span: 2 })],
      },
    };
    expect(validateComponent(grid)).toEqual([]);
  });

  it('size rules are the usual ones', () => {
    expect(validateComponent(withChild(node({ minWidth: 9, maxWidth: 2 })))).toEqual([
      `${AT}.minWidth: cannot be greater than maxWidth`,
    ]);
  });

  it('fill, stroke, shadow, cornerRadius and children are unknown keys', () => {
    for (const [key, value] of [
      ['fill', '#fff'],
      ['stroke', { color: '#000', width: 1 }],
      ['shadow', { color: '#000', blur: 2, x: 0, y: 1 }],
      ['cornerRadius', 4],
      ['children', []],
      ['layout', { type: 'row' }],
      ['clip', true],
    ] as const)
      expect(validateComponent(withChild(node({ [key]: value })))).toEqual([
        `${AT}.${key}: unknown key: ${key}`,
      ]);
  });

  it('id is required and follows the type id pattern', () => {
    expect(validateComponent(withChild({ type: 'component' }))).toEqual([
      `${AT}.id: required field`,
    ]);
    for (const id of ['Button', '', 3, '-x', 'a b'])
      expect(validateComponent(withChild(node({ id })))).toEqual([
        `${AT}.id: expected text matching ^[a-z0-9][a-z0-9_-]*$`,
      ]);
  });
});

describe('component node: values', () => {
  it('must be an object', () => {
    expect(validateComponent(withChild(node({ values: [] })))).toEqual([
      `${AT}.values: expected an object`,
    ]);
    expect(validateComponent(withChild(node({ values: 'x' })))).toEqual([
      `${AT}.values: expected an object`,
    ]);
  });

  it('checks each value as an expression, at its own path', () => {
    expect(
      validateComponent(withChild(node({ values: { label: { $field: '' } } }))),
    ).toEqual([`${AT}.values.label.$field: expected a field key (non-empty text)`]);
    expect(validateComponent(withChild(node({ values: { a: [1] } })))).not.toEqual([]);
    expect(
      validateComponent(withChild(node({ values: { a: { $bogus: 1 } } }))),
    ).not.toEqual([]);
    expect(
      validateComponent(withChild(node({ values: { a: { $field: 'x', extra: 1 } } }))),
    ).not.toEqual([]);
  });
});

describe('component node: provide', () => {
  it('accepts text, number and color expressions', () => {
    expect(
      validateComponent(
        withChild(
          node({
            provide: {
              'content-color': { $token: 'on-primary' },
              size: 12,
              label: { $field: 'ink', default: '#111' },
              mixed: { $concat: ['a', 1] },
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('gives the slot error texts', () => {
    expect(validateComponent(withChild(node({ provide: { '': '#fff' } })))).toEqual([
      `${AT}.provide: empty name`,
    ]);
    expect(validateComponent(withChild(node({ provide: { ink: true } })))).toEqual([
      `${AT}.provide.ink: expected text or a number`,
    ]);
    expect(validateComponent(withChild(node({ provide: 'ink' })))).toEqual([
      `${AT}.provide: expected an object`,
    ]);
  });
});

describe('component node: version and position', () => {
  it('is only allowed with formatVersion 4, at the node type path', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(node(), version))).toContain(
        `${AT}.type: ${V4}`,
      );
  });

  it('works inside a repeat template and a slot fallback', () => {
    const repeat = {
      type: 'repeat',
      field: 'rows',
      template: { type: 'frame', children: [node({ values: { a: { $field: 'x' } } })] },
    };
    expect(validateComponent(withChild(repeat))).toEqual([]);
    const slot = {
      type: 'slot',
      id: 'content',
      fallback: { type: 'frame', children: [node()] },
    };
    expect(validateComponent(withChild(slot))).toEqual([]);
  });

  it('a fallback root must still be a frame', () => {
    const slot = { type: 'slot', id: 'content', fallback: node() };
    expect(validateComponent(withChild(slot))).toContain(
      `${AT}.fallback.type: the fallback must be of type "frame"`,
    );
  });

  it('refuses resolvedComponents in the file', () => {
    const file = withChild(node()) as Record<string, unknown>;
    file.resolvedComponents = {};
    expect(validateComponent(file)).toEqual([
      'resolvedComponents: unknown key: resolvedComponents',
    ]);
  });
});
