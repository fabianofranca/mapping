// `formatVersion` 19 (stage #2164, CF1): the `copy-field` migration step
// (`{ type, from, to, when? }`). Level 1 (a single file) in `parseSpec`, level 2 (against the
// previous version) in `validateLibrary`, and the version contract (`missingMigrations`: the step
// covers no break, decision 11). The run of the step is in libraryMigrations.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
  type Spec,
} from '../../src/model';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';
import { missingMigrations } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const N = 19;
const M0 = 'migrations[0]';
const S0 = `${M0}.steps[0]`;
const ONLY = `only allowed with formatVersion ${N}`;

/** The Chip of the Toranja library: `avatarIcon` is the new optional field that splits `leadingIcon`. */
function chip(withLeading = true): Json {
  return {
    id: 'chip',
    name: 'Chip',
    fields: [
      { key: 'variant', type: 'enum', options: ['default', 'avatar', 'input'] },
      ...(withLeading ? [{ key: 'leadingIcon', type: 'string' }] : []),
      { key: 'avatarIcon', type: 'string' },
      { key: 'size', type: 'number' },
      {
        key: 'rows',
        type: 'table',
        columns: [
          { key: 'a', type: 'string' },
          { key: 'b', type: 'string' },
          { key: 'n', type: 'number' },
        ],
      },
      {
        key: 'other',
        type: 'table',
        columns: [{ key: 'a', type: 'string' }],
      },
    ],
  };
}

/** Version 2 of the package, with a migration 1 → 2 holding `steps`. */
function withSteps(steps: Json[], formatVersion = N, edit?: (spec: Json) => void): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'lib',
    name: 'Lib',
    version: 2,
    layers: [{ id: 'ui', name: 'UI', color: '#112233', annotationTypes: [chip()] }],
    migrations: [{ from: 1, to: 2, steps }],
  };
  edit?.(spec);
  return spec;
}

const copy = (over: Json = {}): Json => ({
  op: 'copy-field',
  type: 'chip',
  from: 'leadingIcon',
  to: 'avatarIcon',
  ...over,
});

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual({ path, message });
}

describe('formatVersion 19: the version number', () => {
  it('is the current version and an accepted one', () => {
    expect(SPEC_FORMAT_VERSION).toBe(N);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(N);
  });
});

describe('copy-field: accepted shapes', () => {
  it('the Chip case, with a list, a number and a column, in zod and in the JSON Schema', () => {
    const spec = withSteps([
      copy({ when: { variant: 'avatar' } }),
      copy({ when: { variant: ['avatar', 'input'], size: 3 } }),
      copy({ when: { size: [1, 2] } }),
      copy(),
      copy({ from: 'rows.a', to: 'rows.b' }),
      copy({ from: 'rows.a', to: 'rows.b', when: { variant: 'input' } }),
    ]);
    const result = parseSpec(spec);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const steps = (result.ok ? result.spec : ({} as Spec)).migrations?.[0]?.steps;
    expect(steps?.[0]).toEqual({
      op: 'copy-field',
      type: 'chip',
      from: 'leadingIcon',
      to: 'avatarIcon',
      when: { variant: 'avatar' },
    });
    expect(steps?.[3]).toEqual({
      op: 'copy-field',
      type: 'chip',
      from: 'leadingIcon',
      to: 'avatarIcon',
    });
  });

  it('from may not exist in this version (copy, then remove)', () => {
    const spec = withSteps(
      [
        copy({ when: { variant: 'avatar' } }),
        { op: 'remove-field', type: 'chip', field: 'leadingIcon' },
      ],
      N,
      (s) => {
        s.layers[0].annotationTypes[0] = chip(false);
      },
    );
    expect(issuesOf(spec)).toEqual([]);
  });

  it('from a column that no longer exists, in a table that still does', () => {
    expect(issuesOf(withSteps([copy({ from: 'rows.old', to: 'rows.b' })]))).toEqual([]);
  });
});

describe('copy-field: the version gate', () => {
  it.each([4, 5, 8, 12, 17, 18])(
    'is the error "only allowed with formatVersion 19" at op with formatVersion %i',
    (formatVersion) => {
      expectIssue(withSteps([copy()], formatVersion), `${S0}.op`, ONLY);
    },
  );

  it('an old step in the same list does not give that error', () => {
    const spec = withSteps(
      [{ op: 'remove-field', type: 'chip', field: 'legacy' }, copy()],
      18,
    );
    const paths = issuesOf(spec).map((i) => i.path);
    expect(paths).toContain(`${M0}.steps[1].op`);
    expect(paths).not.toContain(`${M0}.steps[0].op`);
  });

  it('a spec without the step stays valid in an earlier version', () => {
    expect(
      issuesOf(withSteps([{ op: 'remove-field', type: 'chip', field: 'legacy' }], 18)),
    ).toEqual([]);
  });
});

describe('copy-field: level 1 (one file)', () => {
  it('the "op" error lists the ten steps', () => {
    expectIssue(
      withSteps([{ op: 'zz' }]),
      `${S0}.op`,
      'invalid "op"; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role", "set-role" or "copy-field"',
    );
  });

  it('type that does not exist in this version', () => {
    expectIssue(
      withSteps([copy({ type: 'zzz' })]),
      `${S0}.type`,
      'type "zzz" does not exist in this version',
    );
  });

  it('to must exist in the type in this version', () => {
    expectIssue(
      withSteps([copy({ to: 'nothing' })]),
      `${S0}.to`,
      '"nothing" is not a field of the type "chip"',
    );
    expectIssue(
      withSteps([copy({ from: 'rows.a', to: 'rows.zz' })]),
      `${S0}.to`,
      '"rows.zz" is not a column of the table "rows" of the type "chip"',
    );
  });

  it('from and to cannot be the same', () => {
    expectIssue(
      withSteps([copy({ from: 'avatarIcon', to: 'avatarIcon' })]),
      `${S0}.to`,
      '"from" and "to" cannot be the same field',
    );
  });

  it('both are fields, or both are columns of the same table', () => {
    const mixed =
      '"from" and "to" must both be fields, or both columns of the same table';
    expectIssue(
      withSteps([copy({ from: 'leadingIcon', to: 'rows.a' })]),
      `${S0}.to`,
      mixed,
    );
    expectIssue(
      withSteps([copy({ from: 'rows.a', to: 'avatarIcon' })]),
      `${S0}.to`,
      mixed,
    );
    expectIssue(withSteps([copy({ from: 'rows.a', to: 'other.a' })]), `${S0}.to`, mixed);
  });

  it('a table field on either side', () => {
    const table = 'a "table" field cannot be copied; use a column ("table.column")';
    expectIssue(withSteps([copy({ to: 'rows' })]), `${S0}.to`, table);
    expectIssue(withSteps([copy({ from: 'rows' })]), `${S0}.from`, table);
  });

  it('when: a key that is not a field of the type, also a table.column', () => {
    expectIssue(
      withSteps([copy({ when: { nope: 'x' } })]),
      `${S0}.when.nope`,
      '"nope" is not a field of the type "chip"',
    );
    expect(
      issuesOf(withSteps([copy({ when: { 'rows.a': 'x' } })])).map((i) => i.path),
    ).toContain(`${S0}.when.rows.a`);
  });

  it('when: a table field cannot be tested', () => {
    expectIssue(
      withSteps([copy({ when: { rows: 'x' } })]),
      `${S0}.when.rows`,
      'a "table" or "ref" field cannot be tested in "when"',
    );
  });

  it('when: in an enum each value is one of the options', () => {
    expectIssue(
      withSteps([copy({ when: { variant: 'zz' } })]),
      `${S0}.when.variant`,
      '"zz" is not in the options',
    );
    expectIssue(
      withSteps([copy({ when: { variant: ['avatar', 'zz'] } })]),
      `${S0}.when.variant[1]`,
      '"zz" is not in the options',
    );
  });

  it('when: shape (empty, wrong value, empty list)', () => {
    expectIssue(withSteps([copy({ when: {} })]), `${S0}.when`, 'cannot be empty');
    const bad = 'must be text, a number or a non-empty list of them';
    expectIssue(
      withSteps([copy({ when: { variant: true } })]),
      `${S0}.when.variant`,
      bad,
    );
    expectIssue(withSteps([copy({ when: { variant: [] } })]), `${S0}.when.variant`, bad);
    expectIssue(
      withSteps([copy({ when: { variant: [true] } })]),
      `${S0}.when.variant`,
      bad,
    );
    expect(
      jsonValidator.safeParse(withSteps([copy({ when: { variant: [] } })])).success,
    ).toBe(false);
    expect(jsonValidator.safeParse(withSteps([copy({ when: {} })])).success).toBe(false);
  });

  it('missing, empty or extra keys', () => {
    const paths = issuesOf(withSteps([{ op: 'copy-field', type: 'chip', to: '' }])).map(
      (i) => i.path,
    );
    expect(paths).toContain(`${S0}.from`);
    expect(paths).toContain(`${S0}.to`);
    expectIssue(withSteps([copy({ extra: 1 })]), S0, 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(withSteps([copy({ extra: 1 })])).success).toBe(false);
  });
});

describe('copy-field: the version contract (decision 11)', () => {
  const parsed = (json: Json): Spec => {
    const result = parseSpec(json);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.spec;
  };

  /** Version 1: `chip` with `leadingIcon` and without `avatarIcon`. */
  const previous = (): Spec =>
    parsed(
      withSteps([], N, (s) => {
        s.version = 1;
        delete s.migrations;
        const type = s.layers[0].annotationTypes[0];
        type.fields = type.fields.filter((f: Json) => f.key !== 'avatarIcon');
      }),
    );

  it('an additive update that only copies needs no migration (and no step is missing)', () => {
    const next = parsed(withSteps([copy({ when: { variant: 'avatar' } })]));
    expect(missingMigrations(previous(), next)).toEqual([]);
  });

  it('a copy-field covers no break: removing the field still asks for a step', () => {
    const next = parsed(
      withSteps([copy({ when: { variant: 'avatar' } })], N, (s) => {
        const type = s.layers[0].annotationTypes[0];
        type.fields = type.fields.filter((f: Json) => f.key !== 'leadingIcon');
      }),
    );
    const missing = missingMigrations(previous(), next);
    expect(missing.map((c) => c.code)).toEqual(['removed-field']);
  });
});

describe('copy-field: level 2 (what did not exist in the previous version)', () => {
  const SPEC_FILE = 'lib.spec.json';
  const brief = (issue: LibraryIssue): [string, string, string] => [
    issue.severity,
    issue.path,
    issue.message,
  ];

  /** Version 1 (formatVersion 18): `chip` with `leadingIcon` and `rows.a`. */
  function previous(): Spec {
    const result = parseSpec(
      withSteps([], 18, (s) => {
        s.version = 1;
        delete s.migrations;
        const type = s.layers[0].annotationTypes[0];
        type.fields = type.fields.filter((f: Json) => f.key !== 'avatarIcon');
      }),
    );
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.spec;
  }

  function report(spec: Json) {
    return validateLibrary({
      files: [{ path: SPEC_FILE, text: JSON.stringify(spec) }],
      specPath: SPEC_FILE,
      previous: previous(),
    });
  }

  it('a from that was a field in the previous version gives no warning', () => {
    const result = report(
      withSteps([
        copy(),
        copy({ from: 'rows.a', to: 'rows.b', when: { variant: 'input' } }),
      ]),
    );
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([]);
  });

  it('a from that was not a field (or a column) of the type becomes a warning', () => {
    const result = report(
      withSteps([copy({ from: 'ghost' }), copy({ from: 'rows.ghost', to: 'rows.b' })]),
    );
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${S0}.from`,
        'the field "ghost" of the type "chip" did not exist in version 1',
      ],
      [
        'warning',
        `${M0}.steps[1].from`,
        'the field "rows.ghost" of the type "chip" did not exist in version 1',
      ],
    ]);
  });

  it('with a rename-type before, the field is read on the old type', () => {
    const result = report(
      withSteps(
        [
          { op: 'rename-type', from: 'chip', to: 'pill' },
          copy({ type: 'pill' }),
          copy({ type: 'pill', from: 'ghost' }),
        ],
        N,
        (s) => {
          s.layers[0].annotationTypes[0].id = 'pill';
        },
      ),
    );
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${M0}.steps[2].from`,
        'the field "ghost" of the type "pill" did not exist in version 1',
      ],
    ]);
  });

  it('a type that did not exist in the previous version warns about the type', () => {
    const result = report(
      withSteps([copy({ type: 'newbie' })], N, (s) => {
        s.layers[0].annotationTypes.push({ ...chip(), id: 'newbie', name: 'Newbie' });
      }),
    );
    expect(result.warnings.map(brief)).toEqual([
      ['warning', `${S0}.type`, 'the type "newbie" did not exist in version 1'],
    ]);
  });
});
