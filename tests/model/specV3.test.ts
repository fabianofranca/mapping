import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  findTypesBySource,
  parseSpec,
  parseSpecText,
  type Spec,
  type SpecParseResult,
} from '../../src/model';

// formatVersion 3 specialization (stage 4): `sources` on types and fields (including
// on table columns). v1 and v2 still open; `sources` only exists in v3.
// pt-BR kept: shared fixture data (tests/fixtures/sdui-v2.json and examples/specs/modelo-de-dados.json:
// layer `componentes`, spec `modelo-dados`, type `classe`), outside this phase

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('tests/fixtures/sdui-v2.json');
const dataModel = read('examples/specs/modelo-de-dados.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BUTTON = 'layers[0].annotationTypes[0]';
const ON_CLICK = 'layers[1].annotationTypes[0]';

/** The example SDUI in v3, with sources on the Button (type, enum field and text field) and on a column. */
function v3(): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = 3;
  const button = spec.layers[0].annotationTypes[0];
  button.sources = [
    { system: 'figma', id: '3f2a9c', name: 'DS/Button' },
    { system: 'figma', name: 'DS/Button (legacy)' },
  ];
  button.fields[1].sources = [{ system: 'figma', name: 'Label' }];
  button.fields[2].sources = [
    {
      system: 'figma',
      name: 'Style',
      values: { Primary: 'primary', Secondary: 'secondary', Text: 'text' },
    },
  ];
  const onClick = spec.layers[1].annotationTypes[0];
  onClick.sources = [{ system: 'figma', id: 'evt-1' }];
  onClick.fields[2].columns[0].sources = [{ system: 'figma', name: 'Param' }];
  return spec;
}

function errorsOf(result: SpecParseResult): string[] {
  if (result.ok) throw new Error('should have failed');
  return result.errors;
}

function parsed(data: Json): Spec {
  const result = parseSpec(data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

describe('formatVersion 3 specialization (sources)', () => {
  it('the current format version is 16', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
  });

  it('accepts sources on types, fields and table columns, in zod and in the JSON Schema', () => {
    const spec = parsed(v3());
    expect(spec.formatVersion).toBe(3);
    const button = spec.layers[0]?.annotationTypes[0];
    expect(button?.sources).toEqual([
      { system: 'figma', id: '3f2a9c', name: 'DS/Button' },
      { system: 'figma', name: 'DS/Button (legacy)' },
    ]);
    expect(button?.fields[2]?.sources?.[0]?.values).toEqual({
      Primary: 'primary',
      Secondary: 'secondary',
      Text: 'text',
    });
    const table = spec.layers[1]?.annotationTypes[0]?.fields[2];
    expect(table?.type === 'table' && table.columns[0]?.sources).toEqual([
      { system: 'figma', name: 'Param' },
    ]);
    expect(jsonValidator.safeParse(v3()).success).toBe(true);
  });

  it('a v3 without sources is the v2 (platforms and code are still valid)', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 3;
    const result = parsed(spec);
    expect(result.platforms?.map((p) => p.id)).toEqual(['android', 'ios', 'bff']);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('values only on an enum field and with targets that exist in the options', () => {
    const cases: [string, (s: Json) => void, string][] = [
      [
        'target outside the options',
        (s) =>
          (s.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary = 'main'),
        `${BUTTON}.fields[2].sources[0].values.Primary: "main" is not in the options`,
      ],
      [
        'values on a string field',
        (s) => (s.layers[0].annotationTypes[0].fields[1].sources[0].values = { A: 'a' }),
        `${BUTTON}.fields[1].sources[0].values: only allowed in enum fields`,
      ],
      [
        'values on a string column of a table',
        (s) =>
          (s.layers[1].annotationTypes[0].fields[2].columns[0].sources[0].values = {
            A: 'a',
          }),
        `${ON_CLICK}.fields[2].columns[0].sources[0].values: only allowed in enum fields`,
      ],
      [
        'type source without id or name',
        (s) => (s.layers[0].annotationTypes[0].sources[1] = { system: 'figma' }),
        `${BUTTON}.sources[1]: needs "id" or "name"`,
      ],
      [
        'type source without system',
        (s) => delete s.layers[0].annotationTypes[0].sources[0].system,
        `${BUTTON}.sources[0].system:`,
      ],
      [
        'field source without name',
        (s) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].name,
        `${BUTTON}.fields[1].sources[0].name:`,
      ],
      [
        'unknown property on the source',
        (s) => (s.layers[0].annotationTypes[0].sources[0].extra = 1),
        `${BUTTON}.sources[0]:`,
      ],
    ];
    for (const [name, mutate, expected] of cases) {
      const spec = v3();
      mutate(spec);
      const errors = errorsOf(parseSpec(spec));
      expect(
        errors.some((e) => e.startsWith(expected)),
        `${name}: ${errors.join(' | ')}`,
      ).toBe(true);
    }
  });

  it('the JSON Schema also refuses the structural errors of the sources', () => {
    const structural: ((s: Json) => void)[] = [
      (s) => (s.layers[0].annotationTypes[0].sources[1] = { system: 'figma' }),
      (s) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].name,
      (s) => (s.layers[0].annotationTypes[0].sources[0].extra = 1),
      (s) => (s.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary = 1),
    ];
    for (const mutate of structural) {
      const spec = v3();
      mutate(spec);
      expect(parseSpec(spec).ok).toBe(false);
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    }
  });

  it('sources only allowed with formatVersion 3, pointing at each use', () => {
    const spec = v3();
    spec.formatVersion = 2;
    const errors = errorsOf(parseSpec(spec));
    expect(errors).toEqual(
      expect.arrayContaining([
        `${BUTTON}.sources: only allowed with formatVersion 3`,
        `${BUTTON}.fields[1].sources: only allowed with formatVersion 3`,
        `${BUTTON}.fields[2].sources: only allowed with formatVersion 3`,
        `${ON_CLICK}.sources: only allowed with formatVersion 3`,
        `${ON_CLICK}.fields[2].columns[0].sources: only allowed with formatVersion 3`,
      ]),
    );
  });

  it('v1 and v2 still open (the examples do not use sources)', () => {
    const v2 = parseSpecText(sdui);
    const v1 = parseSpecText(dataModel);
    expect(v2.ok && v2.spec.formatVersion).toBe(2);
    expect(v1.ok && v1.spec.formatVersion).toBe(1);
  });
});

describe('findTypesBySource', () => {
  const sduiV3 = () => parsed(v3());
  const other = (): Spec => {
    const spec = JSON.parse(dataModel) as Json;
    spec.formatVersion = 3;
    spec.layers[0].annotationTypes[0].sources = [{ system: 'figma', name: 'DS/Button' }];
    return parsed(spec);
  };

  it('finds by id and by name, with the id ones first', () => {
    const byId = findTypesBySource([sduiV3(), other()], 'figma', { id: '3f2a9c' });
    expect(byId.map((m) => [m.specId, m.type.id, m.by])).toEqual([
      ['sdui', 'button', 'id'],
    ]);
    const both = findTypesBySource([other(), sduiV3()], 'figma', {
      id: '3f2a9c',
      name: 'DS/Button',
    });
    expect(both.map((m) => [m.specId, m.type.id, m.by])).toEqual([
      ['sdui', 'button', 'id'],
      ['modelo-dados', 'classe', 'name'],
    ]);
    expect(both[0]?.layer.id).toBe('componentes');
    expect(both[0]?.source).toEqual({ system: 'figma', id: '3f2a9c', name: 'DS/Button' });
  });

  it('a type can match several elements (old and new variant)', () => {
    const old = findTypesBySource([sduiV3()], 'figma', { name: 'DS/Button (legacy)' });
    expect(old.map((m) => m.type.id)).toEqual(['button']);
    expect(old[0]?.by).toBe('name');
  });

  it('does not interpret the system: another system, a different name or an empty search find nothing', () => {
    expect(findTypesBySource([sduiV3()], 'sketch', { name: 'DS/Button' })).toEqual([]);
    expect(findTypesBySource([sduiV3()], 'figma', { name: 'ds/button' })).toEqual([]);
    expect(findTypesBySource([sduiV3()], 'figma', {})).toEqual([]);
    expect(findTypesBySource([null], 'figma', { id: '3f2a9c' })).toEqual([]);
  });
});
