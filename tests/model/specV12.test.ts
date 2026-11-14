// `formatVersion` 12: role migration steps of the link (`rename-role`, `remove-role` and
// `set-role`; stage #557). Level 1 (a single file) in `parseSpec` and level 2 (against the previous
// version) in `validateLibrary`. The contract (`diffSpecs`) is in specVersions.test.ts.
// pt-BR kept: shared fixture data (specV11Fixtures: layer `eventos`, asserted in messages), outside this phase
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, type Spec } from '../../src/model';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';
import { issuesOf, v11Json, type Json } from './specV11Fixtures';

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const M0 = 'migrations[0]';
const ONLY_V12 = 'only allowed with formatVersion 12';
const ROLES = [
  { id: 'primary', name: 'Primary' },
  { id: 'secondary', name: 'Secondary' },
];

const owner = (spec: Json) => spec.layers[0].annotationTypes[0] as Json;

/**
 * Test v11 at the requested `formatVersion`, package version 2, with a migration 1 → 2 with the
 * given steps. The owner `button` has the roles `primary` and `secondary` (from 11 onward); `image`
 * and `text` have no roles.
 */
function withSteps(steps: Json[], formatVersion = 12, edit?: (spec: Json) => void): Json {
  return v11Json((spec) => {
    spec.version = 2;
    if (formatVersion >= 11) owner(spec).childRoles = ROLES.map((r) => ({ ...r }));
    spec.migrations = [{ from: 1, to: 2, steps }];
    edit?.(spec);
  }, formatVersion);
}

const rename = (over: Json = {}): Json => ({
  op: 'rename-role',
  type: 'button',
  from: 'old',
  to: 'primary',
  ...over,
});
const remove = (over: Json = {}): Json => ({
  op: 'remove-role',
  type: 'button',
  role: 'gone',
  mode: 'clear',
  ...over,
});
const setRole = (over: Json = {}): Json => ({
  op: 'set-role',
  type: 'button',
  role: 'primary',
  ...over,
});

function errorsAt(spec: Json): Map<string, string[]> {
  const byPath = new Map<string, string[]>();
  for (const issue of issuesOf(spec)) {
    byPath.set(issue.path, [...(byPath.get(issue.path) ?? []), issue.message]);
  }
  return byPath;
}

function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual({ path, message });
}

describe('formatVersion 12: accepted role steps', () => {
  it('the three steps in formatVersion 12, in zod and in the JSON Schema', () => {
    const spec = withSteps([
      rename(),
      remove(),
      remove({ role: 'other', mode: 'unlink' }),
      setRole(),
      setRole({ role: 'secondary', childType: 'onClick' }),
    ]);
    const result = parseSpec(spec);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const steps = (result.ok ? result.spec : ({} as Spec)).migrations?.[0]?.steps;
    expect(steps?.[0]).toEqual({
      op: 'rename-role',
      type: 'button',
      from: 'old',
      to: 'primary',
    });
    expect(steps?.[4]).toEqual({
      op: 'set-role',
      type: 'button',
      role: 'secondary',
      childType: 'onClick',
    });
  });

  it('remove-role is valid on a type that no longer has childRoles', () => {
    expect(issuesOf(withSteps([remove({ type: 'image', role: 'primary' })]))).toEqual([]);
  });

  it('a childType that does not exist is not an error (level 1 only checks the format)', () => {
    expect(issuesOf(withSteps([setRole({ childType: 'does-not-exist' })]))).toEqual([]);
  });

  it('a v11 without a role step is still valid, with and without migrations', () => {
    expect(issuesOf(withSteps([], 11, (s) => delete s.migrations))).toEqual([]);
    const v11 = withSteps([{ op: 'remove-field', type: 'button', field: 'legacy' }], 11);
    expect(issuesOf(v11)).toEqual([]);
  });
});

describe('formatVersion 12: role steps before 12', () => {
  it.each([4, 5, 6, 7, 8, 9, 10, 11])(
    'the three steps give an error on op with formatVersion %i',
    (formatVersion) => {
      const spec = withSteps([rename(), remove(), setRole()], formatVersion);
      const issues = issuesOf(spec);
      for (let i = 0; i < 3; i++) {
        expect(issues, `step ${i}`).toContainEqual({
          path: `${M0}.steps[${i}].op`,
          message: ONLY_V12,
        });
      }
    },
  );

  it('the old step in the same list does not give that error', () => {
    const spec = withSteps(
      [{ op: 'remove-field', type: 'button', field: 'legacy' }, remove()],
      11,
    );
    const paths = issuesOf(spec).map((i) => i.path);
    expect(paths).toContain(`${M0}.steps[1].op`);
    expect(paths).not.toContain(`${M0}.steps[0].op`);
  });
});

describe('formatVersion 12: rename-role', () => {
  it('type that does not exist in this version', () => {
    expectIssue(
      withSteps([rename({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'type "zzz" does not exist in this version',
    );
  });

  it('type without childRoles', () => {
    expectIssue(
      withSteps([rename({ type: 'image' })]),
      `${M0}.steps[0].type`,
      'the type "image" has no roles (childRoles) in this version',
    );
  });

  it('to must be a role of the type', () => {
    expectIssue(
      withSteps([rename({ to: 'nothing' })]),
      `${M0}.steps[0].to`,
      '"nothing" is not a role of the type "button"',
    );
  });

  it('from cannot be a role of the type', () => {
    expectIssue(
      withSteps([rename({ from: 'secondary' })]),
      `${M0}.steps[0].from`,
      'role "secondary" still exists in the type "button" in this version',
    );
  });

  it('missing, empty or extra keys', () => {
    const spec = withSteps([{ op: 'rename-role', type: 'button', to: '' }]);
    const paths = issuesOf(spec).map((i) => i.path);
    expect(paths).toContain(`${M0}.steps[0].from`);
    expect(paths).toContain(`${M0}.steps[0].to`);
    expectIssue(
      withSteps([rename({ extra: 1 })]),
      `${M0}.steps[0]`,
      'Unrecognized key: "extra"',
    );
    expect(jsonValidator.safeParse(withSteps([rename({ extra: 1 })])).success).toBe(
      false,
    );
  });
});

describe('formatVersion 12: remove-role', () => {
  it('type that does not exist in this version', () => {
    expectIssue(
      withSteps([remove({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'type "zzz" does not exist in this version',
    );
  });

  it('role cannot be a role of the type', () => {
    expectIssue(
      withSteps([remove({ role: 'primary' })]),
      `${M0}.steps[0].role`,
      'role "primary" still exists in the type "button" in this version',
    );
  });

  it('invalid or missing mode', () => {
    const bad = withSteps([remove({ mode: 'drop' })]);
    expectIssue(bad, `${M0}.steps[0].mode`, 'use "clear" or "unlink"');
    expect(jsonValidator.safeParse(bad).success).toBe(false);
    const missing = withSteps([{ op: 'remove-role', type: 'button', role: 'gone' }]);
    expect(issuesOf(missing).map((i) => i.path)).toContain(`${M0}.steps[0].mode`);
    expect(jsonValidator.safeParse(missing).success).toBe(false);
  });

  it('both modes are valid', () => {
    for (const mode of ['clear', 'unlink']) {
      expect(issuesOf(withSteps([remove({ mode })])), mode).toEqual([]);
    }
  });

  it('extra key', () => {
    const spec = withSteps([remove({ extra: 1 })]);
    expectIssue(spec, `${M0}.steps[0]`, 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('formatVersion 12: set-role', () => {
  it('type that does not exist in this version', () => {
    expectIssue(
      withSteps([setRole({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'type "zzz" does not exist in this version',
    );
  });

  it('type without childRoles', () => {
    expectIssue(
      withSteps([setRole({ type: 'text' })]),
      `${M0}.steps[0].type`,
      'the type "text" has no roles (childRoles) in this version',
    );
  });

  it('role must be a role of the type', () => {
    expectIssue(
      withSteps([setRole({ role: 'nothing' })]),
      `${M0}.steps[0].role`,
      '"nothing" is not a role of the type "button"',
    );
  });

  it('empty childType is a format error; missing is accepted', () => {
    expect(
      issuesOf(withSteps([setRole({ childType: '' })])).map((i) => i.path),
    ).toContain(`${M0}.steps[0].childType`);
    expect(issuesOf(withSteps([setRole()]))).toEqual([]);
  });

  it('extra key and missing role', () => {
    expectIssue(
      withSteps([setRole({ extra: 1 })]),
      `${M0}.steps[0]`,
      'Unrecognized key: "extra"',
    );
    const missing = withSteps([{ op: 'set-role', type: 'button' }]);
    expect(issuesOf(missing).map((i) => i.path)).toContain(`${M0}.steps[0].role`);
    expect(jsonValidator.safeParse(missing).success).toBe(false);
  });
});

describe('formatVersion 12: errors on the right step and invalid op', () => {
  it('with several steps, each error points at its own', () => {
    const spec = withSteps([
      rename(),
      setRole({ role: 'nothing' }),
      remove({ role: 'primary' }),
      remove({ type: 'zzz' }),
    ]);
    const byPath = errorsAt(spec);
    expect([...byPath.keys()].sort()).toEqual([
      `${M0}.steps[1].role`,
      `${M0}.steps[2].role`,
      `${M0}.steps[3].type`,
    ]);
  });

  it('invalid op lists the nine steps', () => {
    const spec = withSteps([{ op: 'drop-role', type: 'button' }]);
    expectIssue(
      spec,
      `${M0}.steps[0].op`,
      'invalid "op"; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" or "set-role"',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('formatVersion 12: JSON schema', () => {
  it('declares version 12 and the three steps', () => {
    const schema = jsonSchema as Json;
    expect(schema.properties.formatVersion.enum).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    const ops = (schema.$defs.migrationStep.oneOf as Json[]).map(
      (s) => s.properties.op.const as string,
    );
    expect(ops).toEqual([
      'rename-type',
      'remove-type',
      'rename-field',
      'remove-field',
      'map-values',
      'fill-field',
      'rename-role',
      'remove-role',
      'set-role',
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// Level 2: the step cites what did not exist in the previous version (warning)
// ---------------------------------------------------------------------------------------

describe('formatVersion 12: level 2 (roles that did not exist in the previous version)', () => {
  const SPEC_FILE = 'lib.spec.json';

  /** The v1 (formatVersion 11): `button` with the roles `old` and `primary`. */
  function previous(edit?: (spec: Json) => void): Spec {
    const json = v11Json((spec) => {
      owner(spec).childRoles = [
        { id: 'old', name: 'Old' },
        { id: 'primary', name: 'Primary' },
      ];
      edit?.(spec);
    });
    const result = parseSpec(json);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.spec;
  }

  function report(spec: Json, before: Spec) {
    return validateLibrary({
      files: [{ path: SPEC_FILE, text: JSON.stringify(spec) }],
      specPath: SPEC_FILE,
      previous: before,
    });
  }

  const brief = (issue: LibraryIssue): [string, string, string] => [
    issue.severity,
    issue.path,
    issue.message,
  ];

  it('rename-role.from and remove-role.role that were not roles of the type become a warning', () => {
    const spec = withSteps([
      rename(),
      rename({ from: 'ghost', to: 'secondary' }),
      remove({ role: 'ghost2' }),
      remove({ role: 'old', mode: 'unlink' }),
      setRole(),
    ]);
    const result = report(spec, previous());
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${M0}.steps[1].from`,
        'the role "ghost" of the type "button" did not exist in version 1',
      ],
      [
        'warning',
        `${M0}.steps[2].role`,
        'the role "ghost2" of the type "button" did not exist in version 1',
      ],
    ]);
  });

  it('with a rename-type of the owner in between, the role is read on the old type', () => {
    const before = previous();
    const spec = withSteps(
      [
        { op: 'rename-type', from: 'button', to: 'btn' },
        rename({ type: 'btn' }),
        rename({ type: 'btn', from: 'nope', to: 'secondary' }),
        remove({ type: 'btn', role: 'old' }),
      ],
      12,
      (s) => {
        owner(s).id = 'btn';
      },
    );
    const result = report(spec, before);
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${M0}.steps[2].from`,
        'the role "nope" of the type "btn" did not exist in version 1',
      ],
    ]);
  });

  it('a type that did not exist in the previous version warns about the type, not the role', () => {
    const spec = withSteps(
      [rename({ type: 'newbie', from: 'x', to: 'primary' }), remove({ role: 'old' })],
      12,
      (s) => {
        s.layers[0].annotationTypes.push({
          id: 'newbie',
          name: 'Newbie',
          fields: [],
          allowedChildren: [{ layer: 'eventos' }],
          childRoles: [{ id: 'primary', name: 'Primary' }],
        });
      },
    );
    const result = report(spec, previous());
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      ['warning', `${M0}.steps[0].type`, 'the type "newbie" did not exist in version 1'],
    ]);
  });

  it('a role break without a step is a contract error; with the step, nothing', () => {
    const before = previous();
    const without = withSteps([setRole({ role: 'secondary' })], 12, (s) => {
      owner(s).childRoles = [{ id: 'secondary', name: 'Secondary' }];
    });
    const missing = report(without, before);
    expect(missing.errors.map((e) => e.path)).toEqual([
      'layers[0].annotationTypes[0].childRoles[0]',
      'layers[0].annotationTypes[0].childRoles[1]',
    ]);
    expect(missing.errors[0]?.message).toContain('"rename-role" or "remove-role"');
    expect(missing.errors[0]?.message).toContain('formatVersion 12');

    const covered = withSteps(
      [
        rename({ from: 'old', to: 'secondary' }),
        remove({ role: 'primary', mode: 'unlink' }),
      ],
      12,
      (s) => {
        owner(s).childRoles = [{ id: 'secondary', name: 'Secondary' }];
      },
    );
    const ok = report(covered, before);
    expect(ok.issues.map(brief)).toEqual([]);
  });
});
