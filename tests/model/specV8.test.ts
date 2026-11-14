// `formatVersion` 8: `suggestions` on a `string` field and column (Suggestions in the text field stage).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  type Spec,
} from '../../src/model/spec';
import { diffSpecs } from '../../src/model/specVersions';
import { checkSimpleValue } from '../../src/model/typed';

type Json = Record<string, unknown>;

function spec(formatVersion: number, field: Json, asColumn = false, version = 1): Json {
  const fields = asColumn
    ? [
        {
          key: 'tabela',
          type: 'table',
          columns: [{ key: 'label', type: 'string' }, field],
        },
      ]
    : [field];
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 't', name: 'T', fields }],
      },
    ],
  };
}

const fieldPath = 'layers[0].annotationTypes[0].fields[0]';
const columnPath = 'layers[0].annotationTypes[0].fields[0].columns[1]';

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

function parsed(input: unknown): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

const str = (extra: Json = {}): Json => ({ key: 'tipo', type: 'string', ...extra });

describe('formatVersion 8: suggestions', () => {
  it('the current version is 16 and the earlier ones are still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    for (const v of SPEC_FORMAT_VERSIONS) expect(parseSpec(spec(v, str())).ok).toBe(true);
  });

  it('accepts suggestions on a string field and returns them', () => {
    const s = parsed(spec(8, str({ suggestions: ['String', 'Int'] })));
    expect(s.layers[0]?.annotationTypes[0]?.fields[0]).toMatchObject({
      suggestions: ['String', 'Int'],
    });
  });

  it('accepts suggestions on a string column of a table', () => {
    expect(parseSpec(spec(8, str({ suggestions: ['A'] }), true)).ok).toBe(true);
  });

  it('a default outside the list is valid', () => {
    expect(
      parseSpec(spec(8, str({ suggestions: ['String'], default: 'Outro' }))).ok,
    ).toBe(true);
  });

  it('in an earlier version it is the error "only allowed with formatVersion 8", at the exact path', () => {
    for (const v of [1, 4, 7]) {
      expect(issuesOf(spec(v, str({ suggestions: ['A'] })))).toContainEqual({
        path: `${fieldPath}.suggestions`,
        message: 'only allowed with formatVersion 8',
      });
      expect(issuesOf(spec(v, str({ suggestions: ['A'] }), true))).toContainEqual({
        path: `${columnPath}.suggestions`,
        message: 'only allowed with formatVersion 8',
      });
    }
  });

  it('on a field or column that is not a string it is an error, pointing at the key', () => {
    const cases: Json[] = [
      { key: 'n', type: 'number' },
      { key: 'd', type: 'date' },
      { key: 'e', type: 'enum', options: ['a'] },
      { key: 'r', type: 'ref', accepts: { free: true } },
    ];
    for (const base of cases) {
      expect(issuesOf(spec(8, { ...base, suggestions: ['A'] }))).toContainEqual({
        path: `${fieldPath}.suggestions`,
        message: 'only allowed in a string field or column',
      });
      expect(issuesOf(spec(8, { ...base, suggestions: ['A'] }, true))).toContainEqual({
        path: `${columnPath}.suggestions`,
        message: 'only allowed in a string field or column',
      });
    }
    const table = spec(8, {
      key: 'tb',
      type: 'table',
      columns: [{ key: 'c', type: 'string' }],
      suggestions: ['A'],
    });
    expect(issuesOf(table)).toContainEqual({
      path: `${fieldPath}.suggestions`,
      message: 'only allowed in a string field or column',
    });
  });

  it('rejects an empty list, more than 200, repeated, an empty item and spaces at the ends', () => {
    const many = Array.from({ length: 201 }, (_, i) => `v${i}`);
    const bad: [unknown[], string][] = [
      [[], 'cannot be empty'],
      [many, 'at most 200 suggestions'],
      [['A', 'A'], 'repeated suggestions'],
      [['A', ''], 'suggestions cannot be empty'],
      [[' A'], 'suggestions cannot have spaces at the start or the end'],
      [['A '], 'suggestions cannot have spaces at the start or the end'],
    ];
    for (const [suggestions, text] of bad) {
      const issues = issuesOf(spec(8, str({ suggestions })));
      expect(
        issues.some(
          (i) => i.path === `${fieldPath}.suggestions` && i.message.includes(text),
        ),
        text,
      ).toBe(true);
    }
    expect(parseSpec(spec(8, str({ suggestions: many.slice(0, 200) }))).ok).toBe(true);
    expect(parseSpec(spec(8, str({ suggestions: ['List<A>', 'a b'] }))).ok).toBe(true);
  });

  it('an item that is not text is an error', () => {
    expect(parseSpec(spec(8, str({ suggestions: [1] }))).ok).toBe(false);
  });
});

describe('suggestions and the version contract', () => {
  it('adding, changing or removing suggestions makes no difference, and 7 moves to 8', () => {
    const before = parsed(spec(7, str(), false, 1));
    const added = parsed(spec(8, str({ suggestions: ['A'] }), false, 2));
    const changed = parsed(spec(8, str({ suggestions: ['A', 'B'] }), false, 3));
    const removed = parsed(spec(8, str(), false, 4));
    expect(diffSpecs(before, added)).toEqual([]);
    expect(diffSpecs(added, changed)).toEqual([]);
    expect(diffSpecs(changed, removed)).toEqual([]);
    const col = parsed(spec(8, str({ suggestions: ['A'] }), true, 2));
    expect(diffSpecs(parsed(spec(7, str(), true, 1)), col)).toEqual([]);
  });
});

describe('suggestions does not restrict the value', () => {
  it('text outside the list is not a value problem', () => {
    const s = parsed(spec(8, str({ suggestions: ['String', 'Int'] })));
    const field = s.layers[0]?.annotationTypes[0]?.fields[0];
    if (field?.type !== 'string') throw new Error('string field expected');
    expect(checkSimpleValue(field, 'String')).toBeNull();
    expect(checkSimpleValue(field, 'List<Endereco>?')).toBeNull();
    expect(checkSimpleValue(field, 3)).toBe('invalid-value');
  });
});

// `linkedRef`: links the text to a sibling `ref` field/column (same type / same table).
function linkedSpec(
  formatVersion: number,
  field: Json,
  asColumn = false,
  version = 1,
  withRef = true,
): Json {
  const ref = { key: 'typeRef', type: 'ref', accepts: { free: true } };
  const siblings = [{ key: 'label', type: 'string' }, ...(withRef ? [ref] : []), field];
  const fields = asColumn
    ? [{ key: 'tabela', type: 'table', columns: siblings }]
    : siblings;
  const base = spec(formatVersion, field, false, version);
  const layers = base.layers as { annotationTypes: Json[] }[];
  layers[0]!.annotationTypes = [{ id: 't', name: 'T', fields }];
  return base;
}

const linkedField = 'layers[0].annotationTypes[0].fields[2]';
const linkedColumn = 'layers[0].annotationTypes[0].fields[0].columns[2]';
const linked = (extra: Json = {}): Json => ({
  key: 'tipo',
  type: 'string',
  linkedRef: 'typeRef',
  ...extra,
});

describe('formatVersion 8: linkedRef', () => {
  it('accepts linkedRef on a string field and column, with or without suggestions', () => {
    expect(
      parsed(linkedSpec(8, linked())).layers[0]?.annotationTypes[0]?.fields[2],
    ).toMatchObject({
      linkedRef: 'typeRef',
    });
    expect(parseSpec(linkedSpec(8, linked(), true)).ok).toBe(true);
    expect(parseSpec(linkedSpec(8, linked({ suggestions: ['Int'] }))).ok).toBe(true);
    expect(parseSpec(linkedSpec(8, linked({ suggestions: ['Int'] }), true)).ok).toBe(
      true,
    );
  });

  it('on a field or column that is not a string it is an error, pointing at the key', () => {
    const cases: Json[] = [
      { key: 'n', type: 'number' },
      { key: 'e', type: 'enum', options: ['a'] },
    ];
    for (const base of cases) {
      expect(issuesOf(linkedSpec(8, { ...base, linkedRef: 'typeRef' }))).toContainEqual({
        path: `${linkedField}.linkedRef`,
        message: 'only allowed in a string field or column',
      });
      expect(
        issuesOf(linkedSpec(8, { ...base, linkedRef: 'typeRef' }, true)),
      ).toContainEqual({
        path: `${linkedColumn}.linkedRef`,
        message: 'only allowed in a string field or column',
      });
    }
  });

  it('a nonexistent key is an error', () => {
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nada' })))).toContainEqual({
      path: `${linkedField}.linkedRef`,
      message: '"nada" is not a field of the type',
    });
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nada' }), true))).toContainEqual({
      path: `${linkedColumn}.linkedRef`,
      message: '"nada" is not a column of the table',
    });
  });

  it('a key that exists but is not a ref is an error', () => {
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'label' })))).toContainEqual({
      path: `${linkedField}.linkedRef`,
      message: '"label" must be a ref field',
    });
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'label' }), true))).toContainEqual({
      path: `${linkedColumn}.linkedRef`,
      message: '"label" must be a ref column',
    });
  });

  it('the column does not see a field from outside the table', () => {
    const raw = linkedSpec(8, linked(), true, 1, false);
    const layers = raw.layers as { annotationTypes: { fields: Json[] }[] }[];
    const type = layers[0]!.annotationTypes[0]!;
    type.fields.push({ key: 'typeRef', type: 'ref', accepts: { free: true } });
    expect(issuesOf(raw)).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].columns[1].linkedRef',
      message: '"typeRef" is not a column of the table',
    });
  });

  it('in an earlier version it is the error "only allowed with formatVersion 8", at the exact path', () => {
    for (const v of [1, 4, 7]) {
      expect(issuesOf(linkedSpec(v, linked()))).toContainEqual({
        path: `${linkedField}.linkedRef`,
        message: 'only allowed with formatVersion 8',
      });
      expect(issuesOf(linkedSpec(v, linked(), true))).toContainEqual({
        path: `${linkedColumn}.linkedRef`,
        message: 'only allowed with formatVersion 8',
      });
    }
  });

  it('adding, changing or removing linkedRef (and suggestions) makes no difference; 7 moves to 8', () => {
    const plain = (v: number, version: number, asColumn = false) =>
      parsed(linkedSpec(v, { key: 'tipo', type: 'string' }, asColumn, version));
    for (const asColumn of [false, true]) {
      const before = plain(7, 1, asColumn);
      const added = parsed(linkedSpec(8, linked({ suggestions: ['Int'] }), asColumn, 2));
      const changed = parsed(
        linkedSpec(8, linked({ suggestions: ['Int', 'Long'] }), asColumn, 3),
      );
      const removed = plain(8, 4, asColumn);
      expect(diffSpecs(before, added)).toEqual([]);
      expect(diffSpecs(added, changed)).toEqual([]);
      expect(diffSpecs(changed, removed)).toEqual([]);
      expect(diffSpecs(before, added).filter((c) => c.kind === 'breaking')).toEqual([]);
    }
  });
});
