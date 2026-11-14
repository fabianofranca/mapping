// R3 (#1096, decisions 10 and 11): validation of the component root's `anchor` and of the template's
// `$anchor.*` pseudo-fields (version 4 only; a name outside the set is an error).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';

function file(extra: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [] },
    ...extra,
  };
}

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return file(
    { template: { type: 'frame', layout: { type: 'none' }, children: [child] } },
    version,
  );
}

const rect = (extra: Record<string, unknown>) => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

describe('anchor on the component root', () => {
  it('is valid in v4, complete or with missing fields', () => {
    expect(
      validateComponent(
        file({
          anchor: { side: 'bottom', align: 'start', offset: { main: 4, cross: -2 } },
        }),
      ),
    ).toEqual([]);
    expect(validateComponent(file({ anchor: {} }))).toEqual([]);
    expect(validateComponent(file({ anchor: { side: 'end' } }))).toEqual([]);
    expect(validateComponent(file({ anchor: { offset: { main: 4 } } }))).toEqual([]);
  });

  it('side and align outside the set: expected one of', () => {
    expect(validateComponent(file({ anchor: { side: 'left' } }))).toEqual([
      'anchor.side: expected one of: top, bottom, start, end',
    ]);
    expect(validateComponent(file({ anchor: { align: 'top' } }))).toEqual([
      'anchor.align: expected one of: start, center, end',
    ]);
  });

  it('unknown key and invalid offset', () => {
    expect(validateComponent(file({ anchor: { gap: 1 } }))).toEqual([
      'anchor.gap: unknown key: gap',
    ]);
    expect(
      validateComponent(file({ anchor: { offset: { main: 'x', depth: 1 } } })),
    ).toEqual([
      'anchor.offset.depth: unknown key: depth',
      'anchor.offset.main: expected a number',
    ]);
    expect(validateComponent(file({ anchor: { offset: 3 } }))).toEqual([
      'anchor.offset: expected an object',
    ]);
    expect(validateComponent(file({ anchor: 'top' }))).toEqual([
      'anchor: expected an object',
    ]);
  });

  it('in a version 1 to 3, the version error on the key path', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(file({ anchor: { side: 'top' } }, version))).toEqual([
        `anchor: ${V4}`,
      ]);
  });
});

describe('$anchor.* pseudo-fields', () => {
  const names = ['side', 'x', 'y', 'width', 'height'];

  it('are valid in $field, $switch, $eq, $has and in the numeric operations', () => {
    for (const name of names) {
      const key = `$anchor.${name}`;
      expect(
        validateComponent(
          withChild(
            rect({
              anchors: { left: { $sub: [{ $field: key }, 8] } },
              fill: { $switch: key, cases: { top: '#000000' }, default: '#ffffff' },
              visible: { $and: [{ $eq: [key, 'top'] }, { $has: key }] },
            }),
          ),
        ),
      ).toEqual([]);
    }
  });

  it('another $anchor.* is a field that does not exist, on the citation path', () => {
    const msg = 'field does not exist: $anchor.foo';
    expect(
      validateComponent(
        withChild(rect({ anchors: { left: { $field: '$anchor.foo' } } })),
      ),
    ).toEqual([`template.children[0].anchors.left.$field: ${msg}`]);
    expect(
      validateComponent(withChild(rect({ visible: { $has: '$anchor.foo' } }))),
    ).toEqual([`template.children[0].visible.$has: ${msg}`]);
    expect(
      validateComponent(withChild(rect({ visible: { $eq: ['$anchor.foo', 'a'] } }))),
    ).toEqual([`template.children[0].visible.$eq[0]: ${msg}`]);
    expect(
      validateComponent(
        withChild(rect({ fill: { $switch: '$anchor.', cases: { a: '#000000' } } })),
      ),
    ).toEqual([`template.children[0].fill.$switch: field does not exist: $anchor.`]);
  });

  it('in a version 1 to 3, the version error on the citation path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(
          withChild(rect({ visible: { $eq: ['$anchor.side', 'top'] } }), version),
        ),
      ).toEqual([`template.children[0].visible.$eq[0]: ${V4}`]);
  });

  it('the text "$anchor.x" in a literal is not a citation', () => {
    expect(
      validateComponent(
        withChild({
          type: 'text',
          text: '$anchor.foo',
          font: { size: 12 },
          color: '#000000',
        }),
      ),
    ).toEqual([]);
  });
});

describe('docs/component.schema.json and the root anchor', () => {
  const schema: Record<string, unknown> = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  );

  it('accepts the valid anchor and rejects a value and key outside the set', () => {
    expect(
      checkSchema(
        schema,
        file({ anchor: { side: 'end', align: 'start', offset: { main: 4, cross: 0 } } }),
      ),
    ).toEqual([]);
    expect(checkSchema(schema, file({ anchor: { side: 'left' } })).join('\n')).toContain(
      '$.anchor.side',
    );
    expect(checkSchema(schema, file({ anchor: { gap: 1 } })).join('\n')).toContain(
      '$.anchor.gap: chave desconhecida',
    );
  });
});
