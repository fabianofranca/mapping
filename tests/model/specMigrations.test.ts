import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, type Spec, type SpecIssue } from '../../src/model';

// `migrations` of the formatVersion 4 specialization: only the structural rules, which a file
// alone can check (versions, unique `from`, keys per `op`, new side existing, old side
// absent, `default` of `fill-field`). Which breaks a migration covers is up to `diffSpecs`.

const read = (path: string): string => readFileSync(path, 'utf8');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Version 3 of the package: Button (label, style enum, size number, when date, rows table) and
 * Badge (text). No migrations; each test builds its own.
 */
function base(): Json {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lib',
    name: 'Lib',
    version: 3,
    layers: [
      {
        id: 'c',
        name: 'Components',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'style', type: 'enum', options: ['primary', 'text'] },
              { key: 'size', type: 'number' },
              { key: 'when', type: 'date' },
              { key: 'rows', type: 'table', columns: [{ key: 'col', type: 'string' }] },
            ],
          },
          { id: 'badge', name: 'Badge', fields: [{ key: 'text', type: 'string' }] },
        ],
      },
    ],
  };
}

/** `base()` with a migration from 1 to 2 with these steps. */
function withSteps(...steps: Json[]): Json {
  const spec = base();
  spec.migrations = [{ from: 1, to: 2, steps }];
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('should have failed');
  return result.issues.map(({ path, message }) => ({ path, message }));
}

function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual({ path, message });
}

function expectIssuePath(spec: Json, path: string): void {
  const paths = issuesOf(spec).map((i) => i.path);
  expect(paths, paths.join(' | ')).toContain(path);
}

const M0 = 'migrations[0]';

describe('migrations: what is accepted', () => {
  it('the six steps, in chained migrations', () => {
    const spec = base();
    spec.migrations = [
      {
        from: 1,
        to: 2,
        steps: [
          { op: 'rename-type', from: 'chip', to: 'badge' },
          { op: 'rename-field', type: 'button', from: 'caption', to: 'label' },
          { op: 'remove-field', type: 'badge', field: 'color' },
          {
            op: 'map-values',
            type: 'button',
            field: 'style',
            values: { filled: 'primary' },
          },
          { op: 'fill-field', type: 'button', field: 'size', default: 12 },
        ],
      },
      {
        from: 2,
        to: 3,
        steps: [
          { op: 'remove-type', type: 'old', mode: 'convert' },
          { op: 'remove-type', type: 'older', mode: 'delete' },
        ],
      },
    ];
    const result = parseSpec(spec);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const migrations = (result.ok ? result.spec : ({} as Spec)).migrations;
    expect(migrations).toHaveLength(2);
    expect(migrations?.[1]?.steps[1]).toEqual({
      op: 'remove-type',
      type: 'older',
      mode: 'delete',
    });
  });

  it('a migration that skips several versions (from 1 to 3)', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 3;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('fill-field with a default of each field type', () => {
    for (const [field, value] of [
      ['label', 'No name'],
      ['size', 0],
      ['when', '2026-01-31'],
      ['style', 'text'],
    ] as const) {
      const spec = withSteps({ op: 'fill-field', type: 'button', field, default: value });
      expect(parseSpec(spec).ok, field).toBe(true);
    }
  });

  it('without migrations it is as before', () => {
    expect(parseSpec(base()).ok).toBe(true);
  });
});

describe('migrations: versions', () => {
  it('from less than 1', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].from = 0;
    expectIssue(spec, `${M0}.from`, 'must be >= 1');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each(['from', 'to'])('%s not an integer', (key) => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0][key] = 1.5;
    expectIssue(spec, `${M0}.${key}`, 'must be an integer');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('to that is not greater than from', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 1;
    expectIssue(spec, `${M0}.to`, 'must be greater than "from" (1)');
    spec.migrations[0].from = 2;
    spec.migrations[0].to = 1;
    expectIssue(spec, `${M0}.to`, 'must be greater than "from" (2)');
  });

  it('to beyond the package's version', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 4;
    expectIssue(spec, `${M0}.to`, 'cannot exceed "version" (3)');
  });

  it('to equal to version is accepted', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 3;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('repeated from', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations.push({
      from: 1,
      to: 3,
      steps: [{ op: 'remove-type', type: 'older', mode: 'delete' }],
    });
    expectIssue(
      spec,
      'migrations[1].from',
      'there is already a migration from version 1',
    );
  });

  it('empty steps', () => {
    const spec = withSteps();
    expectIssue(spec, `${M0}.steps`, 'cannot be an empty list');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('unknown migration key', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].note = 'x';
    expectIssue(spec, M0, 'Unrecognized key: "note"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('migrations: keys per op', () => {
  it('unknown op', () => {
    const spec = withSteps({ op: 'drop-type', type: 'x' });
    expectIssue(
      spec,
      `${M0}.steps[0].op`,
      'invalid "op"; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" or "set-role"',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('step without op', () => {
    const spec = withSteps({ type: 'x' });
    expectIssuePath(spec, `${M0}.steps[0].op`);
  });

  it.each([
    ['rename-type', { from: 'a', to: 'badge' }],
    ['remove-type', { type: 'old', mode: 'delete' }],
    ['rename-field', { type: 'button', from: 'caption', to: 'label' }],
    ['remove-field', { type: 'badge', field: 'color' }],
    ['map-values', { type: 'button', field: 'style', values: { a: 'primary' } }],
    ['fill-field', { type: 'button', field: 'size', default: 1 }],
  ])('%s refuses an unknown key', (op, keys) => {
    const spec = withSteps({ op, ...keys, extra: 1 });
    expectIssue(spec, `${M0}.steps[0]`, 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([
    ['rename-type', { from: 'a', to: 'badge' }, 'to'],
    ['remove-type', { type: 'old', mode: 'delete' }, 'type'],
    ['rename-field', { type: 'button', from: 'caption', to: 'label' }, 'from'],
    ['remove-field', { type: 'badge', field: 'color' }, 'field'],
    [
      'map-values',
      { type: 'button', field: 'style', values: { a: 'primary' } },
      'values',
    ],
    ['fill-field', { type: 'button', field: 'size', default: 1 }, 'default'],
  ])('%s without the key %s', (op, keys, missing) => {
    const step: Json = { op, ...keys };
    delete step[missing];
    const spec = withSteps(step);
    expectIssuePath(spec, `${M0}.steps[0].${missing}`);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('remove-type with an invalid mode', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'drop' });
    expectIssue(spec, `${M0}.steps[0].mode`, 'use "convert" or "delete"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('fill-field with a default that is neither text nor number', () => {
    const spec = withSteps({
      op: 'fill-field',
      type: 'button',
      field: 'size',
      default: true,
    });
    expectIssue(spec, `${M0}.steps[0].default`, 'must be text or a number');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('empty names', () => {
    const spec = withSteps({ op: 'remove-field', type: '', field: 'color' });
    expectIssue(spec, `${M0}.steps[0].type`, 'cannot be empty');
  });

  it('map-values with an empty target', () => {
    const spec = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'style',
      values: { filled: '' },
    });
    expectIssue(spec, `${M0}.steps[0].values.filled`, 'cannot be empty');
  });
});

describe('migrations: the new side exists in this version', () => {
  it('rename-type.to is a type from here', () => {
    const ok = withSteps({ op: 'rename-type', from: 'chip', to: 'badge' });
    expect(parseSpec(ok).ok).toBe(true);
    const spec = withSteps({ op: 'rename-type', from: 'chip', to: 'tag' });
    expectIssue(spec, `${M0}.steps[0].to`, 'type "tag" does not exist in this version');
  });

  it.each(['rename-field', 'remove-field', 'map-values', 'fill-field'])(
    '%s: the type must exist',
    (op) => {
      const step: Json =
        op === 'rename-field'
          ? { op, type: 'ghost', from: 'a', to: 'b' }
          : op === 'remove-field'
            ? { op, type: 'ghost', field: 'a' }
            : op === 'map-values'
              ? { op, type: 'ghost', field: 'a', values: { x: 'y' } }
              : { op, type: 'ghost', field: 'a', default: 1 };
      expectIssue(
        withSteps(step),
        `${M0}.steps[0].type`,
        'type "ghost" does not exist in this version',
      );
    },
  );

  it('rename-field.to is a field of the type', () => {
    const ok = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'caption',
      to: 'label',
    });
    expect(parseSpec(ok).ok).toBe(true);
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'caption',
      to: 'tagline',
    });
    expectIssue(
      spec,
      `${M0}.steps[0].to`,
      '"tagline" is not a field of the type "button"',
    );
  });

  it('rename-field.to does not apply to a table column', () => {
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'caption',
      to: 'col',
    });
    expectIssue(spec, `${M0}.steps[0].to`, '"col" is not a field of the type "button"');
  });

  it('map-values: the field exists and is an enum', () => {
    const missing = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'color',
      values: { a: 'primary' },
    });
    expectIssue(
      missing,
      `${M0}.steps[0].field`,
      '"color" is not a field of the type "button"',
    );
    const notEnum = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'label',
      values: { a: 'x' },
    });
    expectIssue(
      notEnum,
      `${M0}.steps[0].field`,
      '"label" must be an enum field of the type',
    );
  });

  it('map-values: the targets are in the field's options', () => {
    const spec = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'style',
      values: { filled: 'primary', plain: 'secondary' },
    });
    expectIssue(spec, `${M0}.steps[0].values.plain`, '"secondary" is not in the options');
    expect(issuesOf(spec).filter((i) => i.path.endsWith('values.filled'))).toEqual([]);
  });

  it('fill-field: the field exists', () => {
    const spec = withSteps({
      op: 'fill-field',
      type: 'button',
      field: 'color',
      default: 'x',
    });
    expectIssue(
      spec,
      `${M0}.steps[0].field`,
      '"color" is not a field of the type "button"',
    );
  });

  it.each([
    ['label', 5, 'must be text'],
    ['size', 'twelve', 'the value must be a number'],
    ['when', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
    ['when', 'today', 'must be a valid date YYYY-MM-DD'],
    ['style', 'secondary', 'must be one of the options'],
    ['rows', 'x', 'does not exist for table'],
  ])(
    'fill-field on %s with %j: the default must suit the type',
    (field, value, message) => {
      const spec = withSteps({ op: 'fill-field', type: 'button', field, default: value });
      expectIssue(spec, `${M0}.steps[0].default`, message);
    },
  );
});

describe('migrations: the old side no longer exists in this version', () => {
  it('rename-type.from cannot be a type from here', () => {
    const spec = withSteps({ op: 'rename-type', from: 'button', to: 'badge' });
    expectIssue(
      spec,
      `${M0}.steps[0].from`,
      'type "button" still exists in this version',
    );
  });

  it('remove-type.type cannot be a type from here', () => {
    const spec = withSteps({ op: 'remove-type', type: 'badge', mode: 'delete' });
    expectIssue(spec, `${M0}.steps[0].type`, 'type "badge" still exists in this version');
  });

  it('rename-field.from cannot be a field of the type', () => {
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'size',
      to: 'label',
    });
    expectIssue(
      spec,
      `${M0}.steps[0].from`,
      'field "size" still exists in the type "button" in this version',
    );
  });

  it('remove-field.field cannot be a field of the type (and the type must exist)', () => {
    const spec = withSteps({ op: 'remove-field', type: 'button', field: 'label' });
    expectIssue(
      spec,
      `${M0}.steps[0].field`,
      'field "label" still exists in the type "button" in this version',
    );
    const ghost = withSteps({ op: 'remove-field', type: 'ghost', field: 'label' });
    expectIssue(
      ghost,
      `${M0}.steps[0].type`,
      'type "ghost" does not exist in this version',
    );
  });

  it('the error points at the right step when there are several', () => {
    const spec = withSteps(
      { op: 'remove-type', type: 'old', mode: 'delete' },
      { op: 'remove-field', type: 'button', field: 'label' },
      { op: 'remove-field', type: 'badge', field: 'text' },
    );
    expect(issuesOf(spec).map((i) => i.path)).toEqual([
      `${M0}.steps[1].field`,
      `${M0}.steps[2].field`,
    ]);
  });
});

/** `base()` with the `rows` table gaining the columns `kind` (enum), `n` (number) and `d` (date). */
function withTable(...steps: Json[]): Json {
  const spec = withSteps(...steps);
  const rows = spec.layers[0].annotationTypes[0].fields[4];
  rows.columns.push(
    { key: 'kind', type: 'enum', options: ['a', 'b'] },
    { key: 'n', type: 'number' },
    { key: 'd', type: 'date' },
  );
  return spec;
}

const S0 = `${M0}.steps[0]`;

/** Malformed keys: each with its own message, in any step that accepts it. */
const MALFORMED: [string, string][] = [
  ['a.b.c', '"a.b.c" has more than one dot; use "field" or "table.column"'],
  ['.col', '".col" has an empty part; use "field" or "table.column"'],
  ['rows.', '"rows." has an empty part; use "field" or "table.column"'],
];

describe('migrations: table.column in rename-field', () => {
  const rename = (from: string, to: string): Json =>
    withTable({ op: 'rename-field', type: 'button', from, to });

  it('accepts a new column (to) and an old column that vanished (from)', () => {
    expect(parseSpec(rename('rows.old', 'rows.col')).ok).toBe(true);
    // the whole table vanished: the column went with it
    expect(parseSpec(rename('gone.old', 'rows.kind')).ok).toBe(true);
    // from a column to a top-level field
    expect(parseSpec(rename('rows.old', 'label')).ok).toBe(true);
    expect(jsonValidator.safeParse(rename('rows.old', 'rows.col')).success).toBe(true);
  });

  it('to: the column must exist in the table', () => {
    expectIssue(
      rename('rows.old', 'rows.nope'),
      `${S0}.to`,
      '"rows.nope" is not a column of the table "rows" of the type "button"',
    );
  });

  it('to: the table must exist', () => {
    expectIssue(
      rename('rows.old', 'ghost.col'),
      `${S0}.to`,
      '"ghost" is not a field of the type "button"',
    );
  });

  it('to: dot in a field that is not a table', () => {
    expectIssue(
      rename('rows.old', 'label.col'),
      `${S0}.to`,
      '"label" is not a table of the type "button"',
    );
  });

  it.each(MALFORMED)('malformed to: %s', (key, message) => {
    expectIssue(rename('rows.old', key), `${S0}.to`, message);
  });

  it('from: the column can no longer exist', () => {
    expectIssue(
      rename('rows.col', 'rows.kind'),
      `${S0}.from`,
      'column "col" still exists in the table "rows" of the type "button" in this version',
    );
  });

  it('from: dot in a field that is not a table', () => {
    expectIssue(
      rename('label.old', 'rows.kind'),
      `${S0}.from`,
      '"label" is not a table of the type "button"',
    );
  });

  it.each(MALFORMED)('malformed from: %s', (key, message) => {
    expectIssue(rename(key, 'rows.kind'), `${S0}.from`, message);
  });
});

describe('migrations: table.column in remove-field', () => {
  const remove = (field: string): Json =>
    withTable({ op: 'remove-field', type: 'button', field });

  it('accepts a column that vanished and a table that vanished', () => {
    expect(parseSpec(remove('rows.old')).ok).toBe(true);
    expect(parseSpec(remove('gone.old')).ok).toBe(true);
    expect(jsonValidator.safeParse(remove('rows.old')).success).toBe(true);
  });

  it('the column can no longer exist', () => {
    expectIssue(
      remove('rows.col'),
      `${S0}.field`,
      'column "col" still exists in the table "rows" of the type "button" in this version',
    );
  });

  it('dot in a field that is not a table', () => {
    expectIssue(
      remove('label.col'),
      `${S0}.field`,
      '"label" is not a table of the type "button"',
    );
  });

  it.each(MALFORMED)('malformed: %s', (key, message) => {
    expectIssue(remove(key), `${S0}.field`, message);
  });

  it('the type still needs to exist', () => {
    const spec = withTable({ op: 'remove-field', type: 'ghost', field: 'rows.old' });
    expectIssue(spec, `${S0}.type`, 'type "ghost" does not exist in this version');
  });
});

describe('migrations: table.column in map-values', () => {
  const map = (field: string, values: Record<string, string> = { x: 'a' }): Json =>
    withTable({ op: 'map-values', type: 'button', field, values });

  it('accepts an enum column with targets in its options', () => {
    expect(parseSpec(map('rows.kind', { x: 'a', y: 'b' })).ok).toBe(true);
    expect(jsonValidator.safeParse(map('rows.kind')).success).toBe(true);
  });

  it('the column must exist in the table', () => {
    expectIssue(
      map('rows.nope'),
      `${S0}.field`,
      '"rows.nope" is not a column of the table "rows" of the type "button"',
    );
  });

  it('the table must exist', () => {
    expectIssue(
      map('ghost.kind'),
      `${S0}.field`,
      '"ghost" is not a field of the type "button"',
    );
  });

  it('dot in a field that is not a table', () => {
    expectIssue(
      map('label.kind'),
      `${S0}.field`,
      '"label" is not a table of the type "button"',
    );
  });

  it.each(MALFORMED)('malformed: %s', (key, message) => {
    expectIssue(map(key), `${S0}.field`, message);
  });

  it('the column must be an enum', () => {
    expectIssue(
      map('rows.col'),
      `${S0}.field`,
      '"rows.col" must be an enum column of the table',
    );
  });

  it('the targets are in the column's options (not in another field's)', () => {
    // "primary" is an option of the field "style", not of the column "rows.kind"
    const spec = map('rows.kind', { x: 'a', y: 'primary' });
    expectIssue(spec, `${S0}.values.y`, '"primary" is not in the options');
    expect(issuesOf(spec).filter((i) => i.path.endsWith('values.x'))).toEqual([]);
  });
});

describe('migrations: table.column in fill-field', () => {
  const fill = (field: string, value: string | number = 1): Json =>
    withTable({ op: 'fill-field', type: 'button', field, default: value });

  it('accepts the default of each column type', () => {
    expect(parseSpec(fill('rows.col', 'x')).ok).toBe(true);
    expect(parseSpec(fill('rows.n', 0)).ok).toBe(true);
    expect(parseSpec(fill('rows.d', '2026-01-31')).ok).toBe(true);
    expect(parseSpec(fill('rows.kind', 'b')).ok).toBe(true);
    expect(jsonValidator.safeParse(fill('rows.n')).success).toBe(true);
  });

  it('the column must exist in the table', () => {
    expectIssue(
      fill('rows.nope'),
      `${S0}.field`,
      '"rows.nope" is not a column of the table "rows" of the type "button"',
    );
  });

  it('the table must exist', () => {
    expectIssue(
      fill('ghost.n'),
      `${S0}.field`,
      '"ghost" is not a field of the type "button"',
    );
  });

  it('dot in a field that is not a table', () => {
    expectIssue(
      fill('label.n'),
      `${S0}.field`,
      '"label" is not a table of the type "button"',
    );
  });

  it.each(MALFORMED)('malformed: %s', (key, message) => {
    expectIssue(fill(key), `${S0}.field`, message);
  });

  it.each([
    ['rows.col', 5, 'must be text'],
    ['rows.n', 'twelve', 'the value must be a number'],
    ['rows.d', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
    ['rows.kind', 'z', 'must be one of the options'],
  ])('the default must suit the column's type: %s with %j', (field, value, message) => {
    expectIssue(fill(field, value), `${S0}.default`, message);
  });
});

describe('migrations: format version', () => {
  it('in formatVersion 3 it is an error, at the migrations path', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.formatVersion = 3;
    expect(issuesOf(spec)).toEqual([
      { path: 'migrations', message: 'only allowed with formatVersion 4' },
    ]);
  });

  it('the JSON Schema and zod agree on the minimal example', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });
});
