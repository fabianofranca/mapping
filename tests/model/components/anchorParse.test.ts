// R3 (#1096, decisões 10 e 11): a validação do `anchor` da raiz do componente e dos pseudo-campos
// `$anchor.*` do molde (versão 4 só; nome fora do conjunto é erro).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'só é permitido com formatVersion 4';

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

describe('anchor na raiz do componente', () => {
  it('vale na v4, completo ou com campos ausentes', () => {
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

  it('side e align fora do conjunto: esperava um de', () => {
    expect(validateComponent(file({ anchor: { side: 'left' } }))).toEqual([
      'anchor.side: esperava um de: top, bottom, start, end',
    ]);
    expect(validateComponent(file({ anchor: { align: 'top' } }))).toEqual([
      'anchor.align: esperava um de: start, center, end',
    ]);
  });

  it('chave desconhecida e offset inválido', () => {
    expect(validateComponent(file({ anchor: { gap: 1 } }))).toEqual([
      'anchor.gap: chave desconhecida: gap',
    ]);
    expect(
      validateComponent(file({ anchor: { offset: { main: 'x', depth: 1 } } })),
    ).toEqual([
      'anchor.offset.depth: chave desconhecida: depth',
      'anchor.offset.main: esperava número',
    ]);
    expect(validateComponent(file({ anchor: { offset: 3 } }))).toEqual([
      'anchor.offset: esperava objeto',
    ]);
    expect(validateComponent(file({ anchor: 'top' }))).toEqual([
      'anchor: esperava objeto',
    ]);
  });

  it('numa versão 1 a 3, o erro de versão no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(file({ anchor: { side: 'top' } }, version))).toEqual([
        `anchor: ${V4}`,
      ]);
  });
});

describe('pseudo-campos $anchor.*', () => {
  const names = ['side', 'x', 'y', 'width', 'height'];

  it('valem em $field, $switch, $eq, $has e nas operações numéricas', () => {
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

  it('outro $anchor.* é campo que não existe, no caminho da citação', () => {
    const msg = 'campo não existe: $anchor.foo';
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
    ).toEqual([`template.children[0].fill.$switch: campo não existe: $anchor.`]);
  });

  it('numa versão 1 a 3, o erro de versão no caminho da citação', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(
          withChild(rect({ visible: { $eq: ['$anchor.side', 'top'] } }), version),
        ),
      ).toEqual([`template.children[0].visible.$eq[0]: ${V4}`]);
  });

  it('o texto "$anchor.x" em literal não é citação', () => {
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

describe('docs/component.schema.json e o anchor da raiz', () => {
  const schema: Record<string, unknown> = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  );

  it('aceita o anchor válido e recusa valor e chave fora do conjunto', () => {
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
