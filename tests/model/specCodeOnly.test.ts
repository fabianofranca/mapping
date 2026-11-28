// `formatVersion` 24 (stage #2829, LG4; decision 8): `codeOnly: true` on a top-level field marks a
// deliberately non-visual property. Valid from 24; before it `only allowed with formatVersion 24`;
// on a `table` column it is an error; a value that is not a boolean is refused at its path.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
  serializeSpec,
} from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const FIELD = 'layers[0].annotationTypes[0].fields[0]';
const COLUMN = `layers[0].annotationTypes[0].fields[1].columns[0]`;

/** A specialization with one type: a `mask` field and a table with one column. */
function spec(formatVersion: number, edit?: (spec: Json) => void): Json {
  const result: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'code-only',
    name: 'Code only',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'Interface',
        color: '#6750A4',
        annotationTypes: [
          {
            id: 'field',
            name: 'Field',
            fields: [
              { key: 'mask', type: 'string' },
              {
                key: 'rows',
                type: 'table',
                columns: [{ key: 'cell', type: 'string' }],
              },
            ],
          },
        ],
      },
    ],
  };
  edit?.(result);
  return result;
}

const issuesOf = (value: Json) => {
  const result = parseSpec(value);
  return result.ok ? [] : result.issues;
};

const onField = (value: unknown) => (s: Json) => {
  s.layers[0].annotationTypes[0].fields[0].codeOnly = value;
};
const onColumn = (value: unknown) => (s: Json) => {
  s.layers[0].annotationTypes[0].fields[1].columns[0].codeOnly = value;
};

describe('formatVersion 24: codeOnly on a field', () => {
  it('24 is in the list and is no longer the current version', () => {
    expect(SPEC_FORMAT_VERSION).toBe(27);
    expect(SPEC_FORMAT_VERSIONS).toContain(24);
  });

  it('codeOnly: true is valid in 24 and is kept in the parsed field', () => {
    const result = parseSpec(spec(24, onField(true)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.layers[0]?.annotationTypes[0]?.fields[0]).toMatchObject({
      key: 'mask',
      codeOnly: true,
    });
    expect(serializeSpec(result.spec)).toContain('"codeOnly": true');
  });

  it('codeOnly: false is the same as no key, in 24', () => {
    expect(issuesOf(spec(24, onField(false)))).toEqual([]);
  });

  it('in 23 the key is refused at its path, with the version in the text', () => {
    expect(issuesOf(spec(23, onField(true)))).toContainEqual(
      expect.objectContaining({
        path: `${FIELD}.codeOnly`,
        message: 'only allowed with formatVersion 24',
      }),
    );
  });

  it('in 23 even codeOnly: false is refused (the key is what the version gates)', () => {
    expect(issuesOf(spec(23, onField(false)))).toContainEqual(
      expect.objectContaining({
        path: `${FIELD}.codeOnly`,
        message: 'only allowed with formatVersion 24',
      }),
    );
  });

  it('on a table column it is an error, at the column', () => {
    expect(issuesOf(spec(24, onColumn(true)))).toContainEqual(
      expect.objectContaining({
        path: `${COLUMN}.codeOnly`,
        message: 'only valid on a field, not on a table column',
      }),
    );
  });

  it('a value that is not a boolean is refused at its path', () => {
    for (const value of ['yes', 1, null, {}]) {
      const issues = issuesOf(spec(24, onField(value)));
      expect(
        issues.some((issue) => issue.path === `${FIELD}.codeOnly`),
        JSON.stringify(value),
      ).toBe(true);
    }
  });

  it('without the key, 24 and 23 are valid as before', () => {
    expect(issuesOf(spec(24))).toEqual([]);
    expect(issuesOf(spec(23))).toEqual([]);
  });

  it('the JSON Schema mirrors the zod: codeOnly true passes, a non-boolean does not', () => {
    expect(jsonValidator.safeParse(spec(24, onField(true))).success).toBe(true);
    expect(jsonValidator.safeParse(spec(24, onField('yes'))).success).toBe(false);
  });

  it('adding or removing codeOnly is additive in the version contract (no difference)', () => {
    const plain = parseSpec(spec(24));
    const marked = parseSpec(spec(24, onField(true)));
    expect(plain.ok && marked.ok).toBe(true);
    if (!plain.ok || !marked.ok) return;
    expect(diffSpecs(plain.spec, marked.spec)).toEqual([]);
    expect(diffSpecs(marked.spec, plain.spec)).toEqual([]);
  });
});
