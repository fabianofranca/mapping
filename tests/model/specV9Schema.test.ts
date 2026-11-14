import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec } from '../../src/model';

// Specialization formatVersion 9 (Material 3 library stage): `variants` in the `code` entry.
// The JSON Schema (`docs/spec.schema.json`) and the app parser agree on the structural rules;
// the checks against the type (field, cases) belong to the app validator (tests/model/specVariants*).

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function button(): Json {
  return {
    format: 'mapping-spec',
    formatVersion: 9,
    id: 'm3-mini',
    name: 'M3 mini',
    version: 1,
    platforms: [{ id: 'compose', name: 'Compose', language: 'kotlin' }],
    layers: [
      {
        id: 'components',
        name: 'Components',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              {
                key: 'style',
                type: 'enum',
                options: ['filled', 'outlined', 'text'],
                default: 'filled',
              },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.Button',
                params: { label: 'label' },
                notes: 'content = { Text(label) }',
                variants: {
                  field: 'style',
                  cases: {
                    outlined: { symbol: 'androidx.compose.material3.OutlinedButton' },
                    text: {
                      symbol: 'androidx.compose.material3.TextButton',
                      path: 'compose/material3/Button.kt',
                      params: { label: 'text' },
                      values: { style: { text: 'x' } },
                      notes: 'another note',
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

const variantsOf = (spec: Json): Json =>
  spec.layers[0].annotationTypes[0].code.compose.variants;

describe('formatVersion 9: variants in code', () => {
  it('the JSON Schema accepts 9 with variants, and so does the app', () => {
    const spec = button();
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    expect(parseSpec(spec).ok).toBe(true);
  });

  const bad: [string, (s: Json) => void][] = [
    ['variants without field', (s) => delete variantsOf(s).field],
    ['variants without cases', (s) => delete variantsOf(s).cases],
    ['empty cases', (s) => (variantsOf(s).cases = {})],
    ['empty case', (s) => (variantsOf(s).cases.outlined = {})],
    ['unknown property in variants', (s) => (variantsOf(s).extra = 1)],
    ['unknown property in the case', (s) => (variantsOf(s).cases.outlined.extra = 1)],
    ['empty symbol in the case', (s) => (variantsOf(s).cases.outlined.symbol = '')],
    ['invalid path in the case', (s) => (variantsOf(s).cases.text.path = '../Button.kt')],
    [
      'variants nested in the case',
      (s) => (variantsOf(s).cases.text.variants = variantsOf(s)),
    ],
    [
      'params with an empty value in the case',
      (s) => (variantsOf(s).cases.text.params.label = ''),
    ],
  ];

  it.each(bad)('the JSON Schema and the app reject: %s', (_name, mutate) => {
    const spec = button();
    mutate(spec);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
    expect(parseSpec(spec).ok).toBe(false);
  });

  it('the JSON Schema describes variants in the code entry and rejects formatVersion 17', () => {
    const defs = (jsonSchema as Json).$defs;
    expect(Object.keys(defs.codeEntry.properties)).toContain('variants');
    expect(Object.keys(defs.codeVariants.properties).sort()).toEqual(['cases', 'field']);
    expect(Object.keys(defs.codeCase.properties).sort()).toEqual([
      'calls',
      'formats',
      'ignore',
      'notes',
      'params',
      'path',
      'signature',
      'symbol',
      'values',
    ]);
    expect(jsonValidator.safeParse({ ...button(), formatVersion: 17 }).success).toBe(
      false,
    );
  });

  it('variants in a version earlier than 9 is an error at the exact path (app validator)', () => {
    const spec = button();
    spec.formatVersion = 8;
    const result = parseSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) =>
            e.startsWith('layers[0].annotationTypes[0].code.compose.variants') &&
            e.includes('only allowed with formatVersion 9'),
        ),
      ).toBe(true);
    }
  });
});
