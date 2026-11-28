// OV1 (decisions 2 to 4 of #2913): `overflow: "intended"` on a node and `childOverflow: "intended"` on a slot.
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

function file(template: Json, formatVersion = 4, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
    ...extra,
  };
}

const root = (children: Json[], extra: Json = {}): Json => ({
  type: 'frame',
  name: 'root',
  layout: { type: 'row' },
  children,
  ...extra,
});

const issues = (template: Json, version = 4): string[] =>
  validateComponent(file(template, version));

const NODES: Record<string, Json> = {
  frame: { type: 'frame', width: 48, height: 48, children: [] },
  rect: { type: 'rect', width: 48, height: 48 },
  text: { type: 'text', text: 'a', width: 48, height: 48 },
  icon: { type: 'icon', name: 'close', width: 48, height: 48 },
  slot: { type: 'slot', id: 'content', width: 48, height: 48 },
  component: { type: 'component', id: 'other', width: 48, height: 48 },
};

describe('overflow: "intended" (decision 3)', () => {
  for (const [type, node] of Object.entries(NODES)) {
    it(`is valid on a ${type} node`, () => {
      expect(issues(root([{ ...node, overflow: 'intended' }]))).toEqual([]);
    });
  }

  it('another value says what is expected, at the key path', () => {
    const found = issues(root([{ ...NODES.rect, overflow: 'allowed' }]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].overflow');
    expect(found[0]).toContain('expected one of: intended');
  });

  it('an expression is not accepted: it stays a literal', () => {
    const found = issues(
      root([{ ...NODES.rect, overflow: { $field: 'f', default: 'intended' } }]),
    );
    expect(found.some((m) => m.includes('overflow'))).toBe(true);
  });

  it('on the template root it is "not valid on the root"', () => {
    const found = issues(root([], { overflow: 'intended' }));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.overflow');
    expect(found[0]).toContain('not valid on the root');
  });

  it('on a repeat it is an unknown key (the drawing belongs to the template)', () => {
    const found = issues(
      root([
        {
          type: 'repeat',
          count: 2,
          overflow: 'intended',
          template: { type: 'frame', children: [] },
        },
      ]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].overflow');
    expect(found[0]).toContain('unknown key');
  });

  it('inside the template of a repeat it is valid', () => {
    expect(
      issues(
        root([
          {
            type: 'repeat',
            count: 2,
            template: { type: 'frame', overflow: 'intended', children: [] },
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('in formatVersion 3 it is only allowed with formatVersion 4, at the key path', () => {
    const found = issues(root([{ ...NODES.rect, overflow: 'intended' }]), 3);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].overflow');
    expect(found[0]).toContain(V4);
  });
});

describe('childOverflow: "intended" on a slot (decision 4)', () => {
  it('is valid on a slot', () => {
    expect(issues(root([{ ...NODES.slot, childOverflow: 'intended' }]))).toEqual([]);
  });

  it('another value says what is expected, at the key path', () => {
    const found = issues(root([{ ...NODES.slot, childOverflow: 'yes' }]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].childOverflow');
    expect(found[0]).toContain('expected one of: intended');
  });

  for (const type of ['frame', 'rect', 'text', 'icon', 'component']) {
    it(`on a ${type} node it is an unknown key`, () => {
      const found = issues(
        root([{ ...(NODES[type] as Json), childOverflow: 'intended' }]),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain('template.children[0].childOverflow');
      expect(found[0]).toContain('unknown key');
    });
  }

  it('in formatVersion 3 it is only allowed with formatVersion 4, at the key path', () => {
    // The slot `id` is itself a v4 key, so the fixture has none.
    const found = issues(
      root([{ type: 'slot', width: 48, height: 48, childOverflow: 'intended' }]),
      3,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('template.children[0].childOverflow');
    expect(found[0]).toContain(V4);
  });
});

describe('the JSON Schema accepts what the parser accepts', () => {
  it('accepts the two keys where the parser does', () => {
    const doc = file(
      root([
        { ...NODES.frame, overflow: 'intended' },
        { ...NODES.rect, overflow: 'intended' },
        { ...NODES.text, overflow: 'intended' },
        { ...NODES.icon, overflow: 'intended' },
        { ...NODES.component, overflow: 'intended' },
        { ...NODES.slot, overflow: 'intended', childOverflow: 'intended' },
      ]),
    );
    expect(checkSchema(schema, doc)).toEqual([]);
  });

  it('rejects another value, and the two keys where the parser rejects them', () => {
    const bad = (child: Json): number => checkSchema(schema, file(root([child]))).length;
    expect(bad({ ...NODES.rect, overflow: 'allowed' })).toBeGreaterThan(0);
    expect(bad({ ...NODES.slot, childOverflow: 'allowed' })).toBeGreaterThan(0);
    expect(bad({ ...NODES.rect, childOverflow: 'intended' })).toBeGreaterThan(0);
    expect(
      bad({
        type: 'repeat',
        count: 2,
        overflow: 'intended',
        template: { type: 'frame', children: [] },
      }),
    ).toBeGreaterThan(0);
  });
});
