import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// formatVersion 10 specialization (stage Notices in the specialization): `notices` on the type, on
// the field and on the table column. The JSON Schema (`docs/spec.schema.json`) describes the
// structure; the uniqueness of kind + message, the real date and the `only allowed with
// formatVersion 10` belong to the app's validator (tests/model/spec*).

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
    id: 'notices',
    name: 'Notices',
    version: 1,
    layers: [
      {
        id: 'components',
        name: 'Components',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'alert',
            name: 'Alert',
            notices: [
              {
                kind: 'pending',
                message:
                  'The contract accepts avatarVariant; the BFF SDK does not have it yet.',
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
                    notices: [
                      { kind: 'diverges', message: 'The code uses another name.' },
                    ],
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
  it('the JSON Schema accepts 10 with notices on the type, the field and the column', () => {
    expect(jsonValidator.safeParse(alert()).success).toBe(true);
  });

  it('accepts the four kinds, an empty list and only the required fields', () => {
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
    ['kind outside the four', (s) => (first(s).kind = 'info')],
    ['without kind', (s) => delete first(s).kind],
    ['without message', (s) => delete first(s).message],
    ['empty message', (s) => (first(s).message = '')],
    ['message of only spaces', (s) => (first(s).message = '   ')],
    ['since without a date format', (s) => (first(s).since = '04/11/2026')],
    ['since with an invalid month', (s) => (first(s).since = '2026-13-01')],
    ['empty ref', (s) => (first(s).ref = '')],
    ['unknown property', (s) => (first(s).extra = 1)],
    ['notices that is not a list', (s) => (type(s).notices = first(s))],
    [
      'unknown property in the field notice',
      (s) => (type(s).fields[0].notices[0].level = 'high'),
    ],
  ];

  it.each(bad)('the JSON Schema rejects: %s', (_name, mutate) => {
    const spec = alert();
    mutate(spec);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('the JSON Schema describes notice and refuses formatVersion 17', () => {
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
    expect(jsonValidator.safeParse({ ...alert(), formatVersion: 17 }).success).toBe(
      false,
    );
  });
});
