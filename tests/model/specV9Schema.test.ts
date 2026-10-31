import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec } from '../../src/model';

// Especialização formatVersion 9 (etapa Biblioteca Material 3): `variants` na entrada de `code`.
// O JSON Schema (`docs/spec.schema.json`) e o parser da app concordam nas regras estruturais;
// as conferências contra o tipo (field, cases) são do validador da app (tests/model/specVariants*).

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
        id: 'componentes',
        name: 'Componentes',
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
                      notes: 'outra nota',
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

describe('formatVersion 9: variants no code', () => {
  it('o JSON Schema aceita a 9 com variants, e a app também', () => {
    const spec = button();
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    expect(parseSpec(spec).ok).toBe(true);
  });

  const bad: [string, (s: Json) => void][] = [
    ['variants sem field', (s) => delete variantsOf(s).field],
    ['variants sem cases', (s) => delete variantsOf(s).cases],
    ['cases vazio', (s) => (variantsOf(s).cases = {})],
    ['caso vazio', (s) => (variantsOf(s).cases.outlined = {})],
    ['propriedade desconhecida em variants', (s) => (variantsOf(s).extra = 1)],
    ['propriedade desconhecida no caso', (s) => (variantsOf(s).cases.outlined.extra = 1)],
    ['symbol vazio no caso', (s) => (variantsOf(s).cases.outlined.symbol = '')],
    ['path inválido no caso', (s) => (variantsOf(s).cases.text.path = '../Button.kt')],
    [
      'variants aninhado no caso',
      (s) => (variantsOf(s).cases.text.variants = variantsOf(s)),
    ],
    [
      'params com valor vazio no caso',
      (s) => (variantsOf(s).cases.text.params.label = ''),
    ],
  ];

  it.each(bad)('o JSON Schema e a app rejeitam: %s', (_name, mutate) => {
    const spec = button();
    mutate(spec);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
    expect(parseSpec(spec).ok).toBe(false);
  });

  it('o JSON Schema descreve variants na entrada de code e recusa formatVersion 10', () => {
    const defs = (jsonSchema as Json).$defs;
    expect(Object.keys(defs.codeEntry.properties)).toContain('variants');
    expect(Object.keys(defs.codeVariants.properties).sort()).toEqual(['cases', 'field']);
    expect(Object.keys(defs.codeCase.properties).sort()).toEqual([
      'notes',
      'params',
      'path',
      'symbol',
      'values',
    ]);
    expect(jsonValidator.safeParse({ ...button(), formatVersion: 10 }).success).toBe(
      false,
    );
  });

  it('variants numa versão anterior à 9 é erro no caminho exato (validador da app)', () => {
    const spec = button();
    spec.formatVersion = 8;
    const result = parseSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) =>
            e.startsWith('layers[0].annotationTypes[0].code.compose.variants') &&
            e.includes('só é permitido com formatVersion 9'),
        ),
      ).toBe(true);
    }
  });
});
