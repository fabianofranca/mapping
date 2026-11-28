// OV2 (decisions 2 and 6 of #2913): `position: "absolute"` on a node of a `row`, `column` or `grid`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Json = Record<string, unknown>;
const V4 = 'only allowed with formatVersion 4';

function file(template: Json, formatVersion = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
  };
}

const root = (children: Json[], extra: Json = {}): Json => ({
  type: 'frame',
  name: 'root',
  layout: { type: 'column' },
  children,
  ...extra,
});

const issues = (template: Json, version = 4): string[] =>
  validateComponent(file(template, version));

const NODES: Record<string, Json> = {
  frame: { type: 'frame', width: 48, height: 48, children: [] },
  rect: { type: 'rect', width: 48, height: 48 },
  ellipse: { type: 'ellipse', width: 48, height: 48 },
  text: { type: 'text', text: 'a', width: 48, height: 48 },
  icon: { type: 'icon', name: 'close', width: 48, height: 48 },
  path: { type: 'path', d: 'M0 0L1 1', viewBox: [1, 1], width: 48, height: 48 },
  slot: { type: 'slot', id: 'content', width: 48, height: 48 },
  component: { type: 'component', id: 'other', width: 48, height: 48 },
  repeat: {
    type: 'repeat',
    count: 2,
    template: { type: 'frame', children: [] },
  },
};

describe('position: "absolute" (decision 6)', () => {
  for (const [type, node] of Object.entries(NODES)) {
    it(`is valid on a ${type} node`, () => {
      expect(issues(root([{ ...node, position: 'absolute' }]))).toEqual([]);
    });
  }

  it('is valid in a row and in a grid parent too', () => {
    for (const layout of [{ type: 'row' }, { type: 'grid', columns: 2 }])
      expect(issues(root([{ ...NODES.rect, position: 'absolute' }], { layout }))).toEqual(
        [],
      );
  });

  it('"relative" says what is expected, at the key path', () => {
    const found = issues(root([{ ...NODES.rect, position: 'relative' }]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].position');
    expect(found[0]).toContain('expected one of: absolute');
  });

  it('an expression is not accepted: it stays a literal', () => {
    const found = issues(
      root([{ ...NODES.rect, position: { $field: 'f', default: 'absolute' } }]),
    );
    expect(found.some((m) => m.includes('position'))).toBe(true);
  });

  it('on the template root it is "not valid on the root"', () => {
    const found = issues(root([], { position: 'absolute' }));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.position');
    expect(found[0]).toContain('not valid on the root');
  });

  it('on a repeat\'s template it is "not valid on the root"', () => {
    const found = issues(
      root([
        {
          type: 'repeat',
          count: 2,
          template: { type: 'frame', position: 'absolute', children: [] },
        },
      ]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].template.position');
    expect(found[0]).toContain('not valid on the root');
  });

  it('in formatVersion 3 it is only allowed with formatVersion 4, at the key path', () => {
    const found = issues(root([{ ...NODES.rect, position: 'absolute' }]), 3);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].position');
    expect(found[0]).toContain(V4);
  });

  it('in formatVersion 3 on a repeat it is only allowed with formatVersion 4 too', () => {
    const found = issues(root([{ ...NODES.repeat, position: 'absolute' }]), 3).filter(
      (m) => m.includes('position'),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].position');
    expect(found[0]).toContain(V4);
  });
});

describe('the JSON Schema accepts what the parser accepts', () => {
  it('accepts the key on every node type', () => {
    const doc = file(
      root(Object.values(NODES).map((node) => ({ ...node, position: 'absolute' }))),
    );
    expect(checkSchema(schema, doc)).toEqual([]);
  });

  it('rejects another value', () => {
    const doc = file(root([{ ...NODES.rect, position: 'relative' }]));
    expect(checkSchema(schema, doc).length).toBeGreaterThan(0);
  });
});
