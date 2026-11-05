import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Especialização formatVersion 10 (etapa Avisos na especialização): `notices` no tipo, no campo
// e na coluna de table. O JSON Schema (`docs/spec.schema.json`) descreve a estrutura; a unicidade
// de kind + message, a data real e o `só é permitido com formatVersion 10` são do validador da
// app (tests/model/spec*).

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function alert(): Json {
  return {
    format: 'mapping-spec',
    formatVersion: 10,
    id: 'avisos',
    name: 'Avisos',
    version: 1,
    layers: [
      {
        id: 'componentes',
        name: 'Componentes',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'alert',
            name: 'Alert',
            notices: [
              {
                kind: 'pending',
                message: 'O contrato aceita avatarVariant; o SDK do BFF ainda não tem.',
                since: '2026-11-04',
                ref: 'cross/sdui/all/pe-core/base/plugins/alert.md',
              },
            ],
            fields: [
              {
                key: 'legacyStyle',
                type: 'string',
                notices: [{ kind: 'deprecated', message: 'Use variant.' }],
              },
              {
                key: 'events',
                type: 'table',
                columns: [
                  {
                    key: 'name',
                    type: 'string',
                    notices: [{ kind: 'diverges', message: 'O código usa outro nome.' }],
                  },
                  { key: 'target', type: 'ref', accepts: { free: true }, notices: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

const type = (spec: Json): Json => spec.layers[0].annotationTypes[0];
const first = (spec: Json): Json => type(spec).notices[0];

describe('formatVersion 10: notices', () => {
  it('o JSON Schema aceita a 10 com avisos no tipo, no campo e na coluna', () => {
    expect(jsonValidator.safeParse(alert()).success).toBe(true);
  });

  it('aceita os quatro kind, lista vazia e só os campos obrigatórios', () => {
    for (const kind of ['pending', 'deprecated', 'diverges', 'removed']) {
      const spec = alert();
      type(spec).notices = [{ kind, message: 'x' }];
      expect(jsonValidator.safeParse(spec).success, kind).toBe(true);
    }
    const spec = alert();
    type(spec).notices = [];
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  const bad: [string, (s: Json) => void][] = [
    ['kind fora dos quatro', (s) => (first(s).kind = 'info')],
    ['sem kind', (s) => delete first(s).kind],
    ['sem message', (s) => delete first(s).message],
    ['message vazia', (s) => (first(s).message = '')],
    ['message só de espaços', (s) => (first(s).message = '   ')],
    ['since sem formato de data', (s) => (first(s).since = '04/11/2026')],
    ['since com mês inválido', (s) => (first(s).since = '2026-13-01')],
    ['ref vazia', (s) => (first(s).ref = '')],
    ['propriedade desconhecida', (s) => (first(s).extra = 1)],
    ['notices que não é lista', (s) => (type(s).notices = first(s))],
    [
      'propriedade desconhecida no aviso do campo',
      (s) => (type(s).fields[0].notices[0].level = 'high'),
    ],
  ];

  it.each(bad)('o JSON Schema rejeita: %s', (_name, mutate) => {
    const spec = alert();
    mutate(spec);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('o JSON Schema descreve notice e recusa formatVersion 12', () => {
    const defs = (jsonSchema as Json).$defs;
    expect(Object.keys(defs.notice.properties).sort()).toEqual([
      'kind',
      'message',
      'ref',
      'since',
    ]);
    expect(defs.notice.properties.kind.enum).toEqual([
      'pending',
      'deprecated',
      'diverges',
      'removed',
    ]);
    expect(Object.keys(defs.annotationType.properties)).toContain('notices');
    expect(jsonValidator.safeParse({ ...alert(), formatVersion: 12 }).success).toBe(
      false,
    );
  });
});
