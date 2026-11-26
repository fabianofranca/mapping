// `formatVersion` 24 (stage #2829, LG5; decision 9): the `add-field` migration step, and the
// per-version checks of `migrations` (each step is checked against the types at its own `to`,
// rebuilt backwards from the current file). `add-field` declares that a field enters, or comes
// back; the earlier `remove-field` of a field that returns is valid at last (#2828).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec } from '../../src/model';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

/** The current version of the package (the file's types) is this one. */
const VERSION = 12;

/**
 * A package at `version` 12 with `icon` (label, tint, style enum, rows table), `badge` (text) and
 * the migrations that each test sets. `formatVersion` 24 unless the test says otherwise.
 */
function spec(
  migrations: Json[] | undefined,
  edit?: (spec: Json) => void,
  formatVersion = 24,
): Json {
  const result: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'lib',
    name: 'Lib',
    version: VERSION,
    layers: [
      {
        id: 'c',
        name: 'Components',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'icon',
            name: 'Icon',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'tint', type: 'string' },
              { key: 'style', type: 'enum', options: ['filled', 'outline'] },
              {
                key: 'rows',
                type: 'table',
                columns: [{ key: 'cell', type: 'string' }],
              },
            ],
          },
          { id: 'badge', name: 'Badge', fields: [{ key: 'text', type: 'string' }] },
        ],
      },
    ],
  };
  if (migrations !== undefined) result.migrations = migrations;
  edit?.(result);
  return result;
}

const removeTint = { op: 'remove-field', type: 'icon', field: 'tint' };
const addTint = { op: 'add-field', type: 'icon', field: 'tint' };

function issuesOf(value: Json): { path: string; message: string }[] {
  const result = parseSpec(value);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

const step = (path: string) => `migrations[${path}]`;

describe('add-field: the step and its version', () => {
  it('is valid in 24 and is kept in the parsed migration', () => {
    const value = spec([
      { from: 11, to: 12, steps: [addTint] },
      { from: 10, to: 11, steps: [removeTint] },
    ]);
    const result = parseSpec(value);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    if (!result.ok) return;
    expect(result.spec.migrations?.[0]?.steps[0]).toEqual(addTint);
    expect(jsonValidator.safeParse(value).success).toBe(true);
  });

  it('in 23 it is refused at the op, with the version in the text', () => {
    const value = spec([{ from: 11, to: 12, steps: [addTint] }], undefined, 23);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].op`,
      message: 'only allowed with formatVersion 24',
    });
  });

  it('in 23 the gate is the only issue of the step (no second error on the field)', () => {
    const value = spec([{ from: 11, to: 12, steps: [addTint] }], undefined, 23);
    expect(issuesOf(value).filter((i) => i.path.startsWith(step('0')))).toHaveLength(1);
  });

  it('an extra key is refused (the step is strict), in the schema too', () => {
    const value = spec([
      { from: 11, to: 12, steps: [{ ...addTint, default: 'x' }] },
      { from: 10, to: 11, steps: [removeTint] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0]`,
      message: 'Unrecognized key: "default"',
    });
    expect(jsonValidator.safeParse(value).success).toBe(false);
  });

  it('type and field are required', () => {
    for (const key of ['type', 'field']) {
      const bad: Json = { ...addTint };
      delete bad[key];
      const paths = issuesOf(spec([{ from: 11, to: 12, steps: [bad] }])).map(
        (i) => i.path,
      );
      expect(paths, key).toContain(`${step('0')}.steps[0].${key}`);
      expect(
        jsonValidator.safeParse(spec([{ from: 11, to: 12, steps: [bad] }])).success,
      ).toBe(false);
    }
  });

  it('the invalid-op message lists "add-field"', () => {
    const value = spec([{ from: 11, to: 12, steps: [{ op: 'nope', type: 'icon' }] }]);
    const issue = issuesOf(value).find((i) => i.path === `${step('0')}.steps[0].op`);
    expect(issue?.message).toContain('"add-field"');
    expect(issue?.message).toContain('"copy-field"');
  });

  it('add-field of a field that does not exist at its to: notFieldOfType', () => {
    const value = spec([
      { from: 11, to: 12, steps: [{ op: 'add-field', type: 'icon', field: 'ghost' }] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: '"ghost" is not a field of the type "icon"',
    });
  });

  it('add-field of a type that does not exist in the version: typeNotInVersion', () => {
    const value = spec([
      { from: 11, to: 12, steps: [{ op: 'add-field', type: 'nope', field: 'tint' }] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].type`,
      message: 'type "nope" does not exist in this version',
    });
  });

  it('add-field of a table column: table.column', () => {
    const value = spec([
      {
        from: 11,
        to: 12,
        steps: [{ op: 'add-field', type: 'icon', field: 'rows.cell' }],
      },
    ]);
    expect(issuesOf(value)).toEqual([]);
    const missing = spec([
      {
        from: 11,
        to: 12,
        steps: [{ op: 'add-field', type: 'icon', field: 'rows.nope' }],
      },
    ]);
    expect(issuesOf(missing)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: '"rows.nope" is not a column of the table "rows" of the type "icon"',
    });
  });
});

describe('per-version checks: a field that is removed and comes back (#2828)', () => {
  it('remove-field (10→11) then add-field (11→12) is valid', () => {
    const value = spec([
      { from: 10, to: 11, steps: [removeTint] },
      { from: 11, to: 12, steps: [addTint] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('the same chain without the add-field is still fieldStillExists', () => {
    const value = spec([
      { from: 10, to: 11, steps: [removeTint] },
      { from: 11, to: 12, steps: [{ op: 'remove-field', type: 'badge', field: 'old' }] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: 'field "tint" still exists in the type "icon" in this version',
    });
  });

  it('the order of the migrations in the file does not matter', () => {
    const value = spec([
      { from: 11, to: 12, steps: [addTint] },
      { from: 10, to: 11, steps: [removeTint] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('both steps in the same migration: the remove-field is read as cleared and re-added', () => {
    const value = spec([{ from: 11, to: 12, steps: [removeTint, addTint] }]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('the remove-field alone, in a migration that ends with the field in the file, is refused', () => {
    const value = spec([{ from: 11, to: 12, steps: [removeTint] }]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: 'field "tint" still exists in the type "icon" in this version',
    });
  });

  it('an add-field BEFORE the remove-field of the same field does not excuse it', () => {
    const value = spec([{ from: 11, to: 12, steps: [addTint, removeTint] }]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[1].field`,
      message: 'field "tint" still exists in the type "icon" in this version',
    });
  });

  it('a field removed and added back twice in a long chain', () => {
    const value = spec([
      { from: 8, to: 9, steps: [removeTint] },
      { from: 9, to: 10, steps: [addTint] },
      { from: 10, to: 11, steps: [removeTint] },
      { from: 11, to: 12, steps: [addTint] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('a removed column that comes back as table.column', () => {
    const remove = { op: 'remove-field', type: 'icon', field: 'rows.cell' };
    const add = { op: 'add-field', type: 'icon', field: 'rows.cell' };
    const value = spec([
      { from: 10, to: 11, steps: [remove] },
      { from: 11, to: 12, steps: [add] },
    ]);
    expect(issuesOf(value)).toEqual([]);
    const withoutAdd = spec([
      { from: 10, to: 11, steps: [remove] },
      { from: 11, to: 12, steps: [{ op: 'remove-field', type: 'badge', field: 'old' }] },
    ]);
    expect(issuesOf(withoutAdd)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message:
        'column "cell" still exists in the table "rows" of the type "icon" in this version',
    });
  });
});

describe('per-version checks: renames, placeholders and the chain', () => {
  it('rename-field to a name that is removed and re-added later is valid', () => {
    // The field `b` exists at 4 only: 1→2 renames a→b, 2→3 removes b, 3→4 adds b again.
    const value = spec(
      [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-field', type: 'icon', from: 'a', to: 'b' }],
        },
        { from: 2, to: 3, steps: [{ op: 'remove-field', type: 'icon', field: 'b' }] },
        { from: 3, to: 4, steps: [{ op: 'add-field', type: 'icon', field: 'b' }] },
      ],
      (s) => {
        s.version = 4;
        s.layers[0].annotationTypes[0].fields.push({ key: 'b', type: 'string' });
      },
    );
    expect(issuesOf(value)).toEqual([]);
  });

  it('a rename is undone going back: the chain of two renames is valid', () => {
    // 1→2 a→b, 2→3 b→c; the file has `c`. Before, the first step asked for `b` in the file.
    const value = spec(
      [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-field', type: 'icon', from: 'a', to: 'b' }],
        },
        {
          from: 2,
          to: 3,
          steps: [{ op: 'rename-field', type: 'icon', from: 'b', to: 'c' }],
        },
      ],
      (s) => {
        s.version = 3;
        s.layers[0].annotationTypes[0].fields.push({ key: 'c', type: 'string' });
      },
    );
    expect(issuesOf(value)).toEqual([]);
  });

  it('a rename to a name that the next migration renames away is refused at its version', () => {
    // 1→2 renames a→c, but at 2 the field is called b (2→3 renames b→c): `c` is not at 2.
    const value = spec(
      [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-field', type: 'icon', from: 'a', to: 'c' }],
        },
        {
          from: 2,
          to: 3,
          steps: [{ op: 'rename-field', type: 'icon', from: 'b', to: 'c' }],
        },
      ],
      (s) => {
        s.version = 3;
        s.layers[0].annotationTypes[0].fields.push({ key: 'c', type: 'string' });
      },
    );
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].to`,
      message: '"c" is not a field of the type "icon"',
    });
  });

  it('rename-type is undone going back: a field step of the old type name', () => {
    // 1→2 removes a field of `chip`; 2→3 renames chip→badge. At 2 the type is still `chip`.
    const value = spec(
      [
        { from: 1, to: 2, steps: [{ op: 'remove-field', type: 'chip', field: 'color' }] },
        { from: 2, to: 3, steps: [{ op: 'rename-type', from: 'chip', to: 'badge' }] },
      ],
      (s) => {
        s.version = 3;
      },
    );
    expect(issuesOf(value)).toEqual([]);
  });

  it('a map-values on a field that a later step removes: the existence is accepted', () => {
    const value = spec(
      [
        {
          from: 10,
          to: 11,
          steps: [
            { op: 'map-values', type: 'icon', field: 'mode', values: { a: 'whatever' } },
          ],
        },
        {
          from: 11,
          to: 12,
          steps: [{ op: 'remove-field', type: 'icon', field: 'mode' }],
        },
      ],
      (s) => {
        s.version = 12;
      },
    );
    expect(issuesOf(value)).toEqual([]);
  });

  it('a fill-field on a field that a later step removes: the default is not checked', () => {
    const value = spec([
      {
        from: 10,
        to: 11,
        steps: [{ op: 'fill-field', type: 'icon', field: 'size', default: 3 }],
      },
      { from: 11, to: 12, steps: [{ op: 'remove-field', type: 'icon', field: 'size' }] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('a step on a column of a table that a later step removes is accepted', () => {
    const value = spec([
      {
        from: 10,
        to: 11,
        steps: [{ op: 'rename-field', type: 'icon', from: 'grid.a', to: 'grid.b' }],
      },
      { from: 11, to: 12, steps: [{ op: 'remove-field', type: 'icon', field: 'grid' }] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('a step on a field of a type that a later step removes is accepted', () => {
    const value = spec([
      { from: 10, to: 11, steps: [{ op: 'remove-field', type: 'old', field: 'x' }] },
      { from: 11, to: 12, steps: [{ op: 'remove-type', type: 'old', mode: 'delete' }] },
    ]);
    expect(issuesOf(value)).toEqual([]);
  });

  it('the value checks stay on a field that exists at its version', () => {
    // `style` exists at 11 and 12; its options are checked at 11 as before.
    const value = spec([
      {
        from: 10,
        to: 11,
        steps: [
          { op: 'map-values', type: 'icon', field: 'style', values: { a: 'nope' } },
        ],
      },
      { from: 11, to: 12, steps: [{ op: 'remove-field', type: 'badge', field: 'old' }] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].values.a`,
      message: '"nope" is not in the options',
    });
  });

  it('a broken chain is checked against the current types, as before', () => {
    // 11→12 is missing: 10→11 cannot be placed in the chain, so `tint` (in the file) is still there.
    const value = spec([{ from: 10, to: 11, steps: [removeTint] }]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: 'field "tint" still exists in the type "icon" in this version',
    });
  });

  it('a chain that stops before the current version is checked against the current types', () => {
    const value = spec([
      { from: 9, to: 10, steps: [removeTint] },
      { from: 10, to: 11, steps: [addTint] },
    ]);
    expect(issuesOf(value)).toContainEqual({
      path: `${step('0')}.steps[0].field`,
      message: 'field "tint" still exists in the type "icon" in this version',
    });
  });

  it('a chain that skips (1→3 and 2→3) rebuilds each start from the same end', () => {
    const value = spec(
      [
        { from: 1, to: 3, steps: [{ op: 'remove-field', type: 'icon', field: 'gone' }] },
        { from: 2, to: 3, steps: [{ op: 'remove-field', type: 'icon', field: 'gone' }] },
      ],
      (s) => {
        s.version = 3;
      },
    );
    expect(issuesOf(value)).toEqual([]);
  });
});
