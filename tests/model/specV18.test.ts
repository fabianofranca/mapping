// `formatVersion` 18 (stage #1126, A1; decisions 1-6 of #1081): `accessibility` at the root
// (`touchTarget`) and on the type (`role`, `label`, `touchTarget`, `parts`). The keys are outside the
// version contract (`diffSpecs` ignores them). The audit that reads them is `accessibility.ts`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCESSIBILITY_ROLES,
  INTERACTIVE_ROLES,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
} from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const BUTTON = 'layers[0].annotationTypes[0]';
const BAR = 'layers[0].annotationTypes[1]';
const ONLY_V18 = 'only allowed with formatVersion 18';

/** A specialization with a button (role, label, touch target) and a bar (no role, three parts). */
function v18(edit?: (spec: Json) => void, formatVersion = 18): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'a11y',
    name: 'A11y',
    version: 1,
    accessibility: { touchTarget: { width: 44, height: 44, mode: 'visual' } },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'icon', type: 'string' },
              { key: 'kind', type: 'enum', options: ['filled', 'text'] },
              { key: 'size', type: 'number' },
            ],
            accessibility: {
              role: 'button',
              label: { fields: ['label', 'kind'], required: true },
              touchTarget: { width: 48, height: 48, mode: 'expanded' },
            },
          },
          {
            id: 'bar',
            name: 'Bar',
            fields: [
              { key: 'title', type: 'string' },
              { key: 'back', type: 'string' },
              { key: 'count', type: 'number' },
              {
                key: 'actions',
                type: 'table',
                columns: [
                  { key: 'name', type: 'string' },
                  { key: 'tone', type: 'enum', options: ['a', 'b'] },
                  { key: 'weight', type: 'number' },
                ],
              },
            ],
            accessibility: {
              parts: [
                { id: 'back', name: 'Back', when: 'back', label: { fields: ['back'] } },
                { id: 'title', when: 'title', role: 'heading' },
                {
                  id: 'action',
                  name: 'Action',
                  when: 'actions',
                  label: { fields: ['actions.name', 'actions.tone'], required: true },
                },
                { id: 'toned', when: 'actions.tone', role: 'menuitem' },
              ],
            },
          },
        ],
      },
    ],
  };
  edit?.(spec);
  return spec;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const button = (s: Json): Json => s.layers[0].annotationTypes[0];
const bar = (s: Json): Json => s.layers[0].annotationTypes[1];

describe('formatVersion 18: version and shape', () => {
  it('18 is accepted (and so is 17); the current version is 21', () => {
    expect(SPEC_FORMAT_VERSION).toBe(21);
    expect(SPEC_FORMAT_VERSIONS).toContain(17);
    expect(SPEC_FORMAT_VERSIONS).toContain(18);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(21);
  });

  it('the role lists are the contract of the phase', () => {
    expect(ACCESSIBILITY_ROLES).toHaveLength(17);
    expect(ACCESSIBILITY_ROLES).toContain('none');
    expect(INTERACTIVE_ROLES).toHaveLength(11);
    expect(INTERACTIVE_ROLES).not.toContain('image');
  });

  it('a v18 with root touchTarget, a type with role+label, a bar without role and parts is valid and read', () => {
    expect(issuesOf(v18())).toEqual([]);
    const result = parseSpec(v18());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.accessibility).toEqual({
      touchTarget: { width: 44, height: 44, mode: 'visual' },
    });
    const [b, parts] = result.spec.layers[0]?.annotationTypes ?? [];
    expect(b?.accessibility?.role).toBe('button');
    expect(b?.accessibility?.label).toEqual({
      fields: ['label', 'kind'],
      required: true,
    });
    expect(parts?.accessibility?.role).toBeUndefined();
    expect(parts?.accessibility?.parts).toHaveLength(4);
  });

  it('a type whose touchTarget is false (audit off) is valid', () => {
    expect(issuesOf(v18((s) => (button(s).accessibility.touchTarget = false)))).toEqual(
      [],
    );
  });

  it('an interactive role without label (a slider) is valid', () => {
    expect(
      issuesOf(
        v18((s) => {
          button(s).accessibility = { role: 'slider' };
        }),
      ),
    ).toEqual([]);
  });

  it('a table part with when "<table>" and label fields "<table>.<column>" is valid', () => {
    expect(
      issuesOf(
        v18((s) => {
          bar(s).accessibility.parts = [
            { id: 'row', when: 'actions', label: { fields: ['actions.name'] } },
          ];
        }),
      ),
    ).toEqual([]);
  });

  it('the JSON Schema accepts the v18', () => {
    expect(jsonValidator.safeParse(v18()).success).toBe(true);
  });
});

describe('formatVersion 18: before it, the keys are errors at the exact path', () => {
  it('accessibility at the root and on the type in a v17', () => {
    const issues = issuesOf(v18(undefined, 17));
    expect(issues).toContainEqual({ path: 'accessibility', message: ONLY_V18 });
    expect(issues).toContainEqual({ path: `${BUTTON}.accessibility`, message: ONLY_V18 });
    expect(issues).toContainEqual({ path: `${BAR}.accessibility`, message: ONLY_V18 });
  });

  it('a v17 without the keys stays valid', () => {
    const spec = v18((s) => {
      delete s.accessibility;
      delete button(s).accessibility;
      delete bar(s).accessibility;
    }, 17);
    expect(issuesOf(spec)).toEqual([]);
  });
});

describe('formatVersion 18: shape errors', () => {
  it('touchTarget with width or height not above 0, or a wrong mode', () => {
    for (const bad of [0, -1, '2']) {
      const issues = issuesOf(v18((s) => (s.accessibility.touchTarget.width = bad)));
      expect(
        issues.map((i) => i.path),
        String(bad),
      ).toContain('accessibility.touchTarget.width');
    }
    const mode = issuesOf(v18((s) => (s.accessibility.touchTarget.mode = 'big')));
    expect(mode.map((i) => i.path)).toContain('accessibility.touchTarget.mode');
  });

  it('an unknown key in accessibility, in a part or in a label is an error', () => {
    expect(issuesOf(v18((s) => (s.accessibility.zz = 1))).map((i) => i.path)).toContain(
      'accessibility',
    );
    expect(
      issuesOf(v18((s) => (bar(s).accessibility.parts[0].zz = 1))).map((i) => i.path),
    ).toContain(`${BAR}.accessibility.parts[0]`);
    expect(
      issuesOf(v18((s) => (button(s).accessibility.label.zz = 1))).map((i) => i.path),
    ).toContain(`${BUTTON}.accessibility.label`);
  });

  it('a label with no fields is an error', () => {
    const issues = issuesOf(v18((s) => (button(s).accessibility.label.fields = [])));
    expect(issues.map((i) => i.path)).toContain(`${BUTTON}.accessibility.label.fields`);
  });
});

describe('formatVersion 18: role and touch target', () => {
  it('a role outside the list is an error at accessibility.role with the list', () => {
    const issues = issuesOf(v18((s) => (button(s).accessibility.role = 'x')));
    expect(issues).toEqual([
      {
        path: `${BUTTON}.accessibility.role`,
        message: `role "x" is invalid; use ${ACCESSIBILITY_ROLES.join(', ')}`,
      },
    ]);
  });

  it('a part role outside the list is an error at parts[n].role', () => {
    const issues = issuesOf(v18((s) => (bar(s).accessibility.parts[1].role = 'nope')));
    expect(issues.map((i) => i.path)).toEqual([`${BAR}.accessibility.parts[1].role`]);
  });

  it('touchTarget without an interactive role is an error at accessibility.touchTarget', () => {
    for (const role of [undefined, 'image', 'none']) {
      const issues = issuesOf(
        v18((s) => {
          const a = bar(s).accessibility;
          a.touchTarget = { width: 10, height: 10 };
          if (role !== undefined) a.role = role;
        }),
      );
      expect(issues, String(role)).toEqual([
        {
          path: `${BAR}.accessibility.touchTarget`,
          message: 'touchTarget: only valid with an interactive role',
        },
      ]);
    }
  });

  it('touchTarget false without an interactive role is an error too', () => {
    const issues = issuesOf(
      v18((s) => {
        bar(s).accessibility.touchTarget = false;
      }),
    );
    expect(issues.map((i) => i.path)).toEqual([`${BAR}.accessibility.touchTarget`]);
  });

  it('a part has no touch target: the key is an error at parts[n].touchTarget', () => {
    const issues = issuesOf(
      v18((s) => (bar(s).accessibility.parts[0].touchTarget = { width: 1, height: 1 })),
    );
    expect(issues).toEqual([
      {
        path: `${BAR}.accessibility.parts[0].touchTarget`,
        message: 'a part has no touch target',
      },
    ]);
  });
});

describe('formatVersion 18: label fields', () => {
  it('a field that does not exist is an error at label.fields[i]', () => {
    const issues = issuesOf(
      v18((s) => (button(s).accessibility.label.fields = ['label', 'zz'])),
    );
    expect(issues).toEqual([
      {
        path: `${BUTTON}.accessibility.label.fields[1]`,
        message: 'label: field does not exist: zz',
      },
    ]);
  });

  it('a field that is not string or enum is an error', () => {
    const issues = issuesOf(
      v18((s) => (button(s).accessibility.label.fields = ['size'])),
    );
    expect(issues).toEqual([
      {
        path: `${BUTTON}.accessibility.label.fields[0]`,
        message: 'label: field size must be string or enum',
      },
    ]);
  });

  it('a field part label follows the same rules', () => {
    const missing = issuesOf(
      v18((s) => (bar(s).accessibility.parts[0].label.fields = ['zz'])),
    );
    expect(missing).toEqual([
      {
        path: `${BAR}.accessibility.parts[0].label.fields[0]`,
        message: 'label: field does not exist: zz',
      },
    ]);
    const number = issuesOf(
      v18((s) => (bar(s).accessibility.parts[0].label.fields = ['count'])),
    );
    expect(number.map((i) => i.message)).toEqual([
      'label: field count must be string or enum',
    ]);
  });

  it('a table part: the fields of another table, a missing column and a non-text column', () => {
    const fieldOfBar = issuesOf(
      v18((s) => (bar(s).accessibility.parts[2].label.fields = ['title'])),
    );
    expect(fieldOfBar).toEqual([
      {
        path: `${BAR}.accessibility.parts[2].label.fields[0]`,
        message: 'label: title belongs to another table; use columns of actions',
      },
    ]);
    const otherTable = issuesOf(
      v18((s) => (bar(s).accessibility.parts[2].label.fields = ['other.name'])),
    );
    expect(otherTable.map((i) => i.message)).toEqual([
      'label: other.name belongs to another table; use columns of actions',
    ]);
    const missing = issuesOf(
      v18((s) => (bar(s).accessibility.parts[2].label.fields = ['actions.zz'])),
    );
    expect(missing.map((i) => i.message)).toEqual([
      'label: field does not exist: actions.zz',
    ]);
    const twoDots = issuesOf(
      v18((s) => (bar(s).accessibility.parts[2].label.fields = ['actions.name.extra'])),
    );
    expect(twoDots.map((i) => i.message)).toEqual([
      'label: field does not exist: actions.name.extra',
    ]);
    const weight = issuesOf(
      v18((s) => (bar(s).accessibility.parts[2].label.fields = ['actions.weight'])),
    );
    expect(weight.map((i) => i.message)).toEqual([
      'label: field actions.weight must be string or enum',
    ]);
  });
});

describe('formatVersion 18: parts', () => {
  it('a when that is neither a field nor a table is an error at parts[n].when', () => {
    const issues = issuesOf(v18((s) => (bar(s).accessibility.parts[1].when = 'zz')));
    expect(issues).toEqual([
      {
        path: `${BAR}.accessibility.parts[1].when`,
        message: 'when: "zz" is neither a field nor a table of the type',
      },
    ]);
  });

  it('"<field>.<column>" of something that is not a table is neither', () => {
    const issues = issuesOf(v18((s) => (bar(s).accessibility.parts[1].when = 'title.x')));
    expect(issues.map((i) => i.path)).toEqual([`${BAR}.accessibility.parts[1].when`]);
  });

  it('a column that does not exist is an error at parts[n].when', () => {
    const issues = issuesOf(
      v18((s) => (bar(s).accessibility.parts[3].when = 'actions.zz')),
    );
    expect(issues).toEqual([
      {
        path: `${BAR}.accessibility.parts[3].when`,
        message: 'when: the table actions has no column zz',
      },
    ]);
  });

  it('a repeated part id is an error at parts[n].id', () => {
    const issues = issuesOf(v18((s) => (bar(s).accessibility.parts[1].id = 'back')));
    expect(issues).toEqual([
      { path: `${BAR}.accessibility.parts[1].id`, message: 'id "back" repeated' },
    ]);
  });

  it('a type with role "none" still validates its parts', () => {
    const issues = issuesOf(
      v18((s) => {
        bar(s).accessibility.role = 'none';
        bar(s).accessibility.parts[1].when = 'zz';
      }),
    );
    expect(issues.map((i) => i.path)).toEqual([`${BAR}.accessibility.parts[1].when`]);
  });
});

describe('formatVersion 18: the JSON Schema mirrors the cases', () => {
  const schemaOk = (raw: Json) => jsonValidator.safeParse(raw).success;

  it('rejects the shapes the model rejects', () => {
    expect(schemaOk(v18((s) => (s.accessibility.touchTarget.width = 0)))).toBe(false);
    expect(schemaOk(v18((s) => (s.accessibility.touchTarget.mode = 'big')))).toBe(false);
    expect(schemaOk(v18((s) => (s.accessibility.zz = 1)))).toBe(false);
    expect(schemaOk(v18((s) => (button(s).accessibility.role = 'x')))).toBe(false);
    expect(schemaOk(v18((s) => (button(s).accessibility.label.fields = [])))).toBe(false);
    expect(schemaOk(v18((s) => (bar(s).accessibility.parts[0].zz = 1)))).toBe(false);
    expect(schemaOk(v18((s) => (bar(s).accessibility.parts[0].role = 'nope')))).toBe(
      false,
    );
  });

  it('accepts touchTarget false on the type and a part without name', () => {
    expect(schemaOk(v18((s) => (button(s).accessibility.touchTarget = false)))).toBe(
      true,
    );
    expect(schemaOk(v18((s) => delete bar(s).accessibility.parts[0].name))).toBe(true);
  });

  it('every role of the list is accepted and the version 18 is in the enum', () => {
    for (const role of ACCESSIBILITY_ROLES) {
      expect(schemaOk(v18((s) => (button(s).accessibility = { role }))), role).toBe(true);
    }
    expect(schemaOk(v18(undefined, 17))).toBe(true);
  });
});

describe('formatVersion 18: outside the version contract', () => {
  it('diffSpecs ignores accessibility (adding, changing or removing)', () => {
    const before = parseSpec(
      v18((s) => {
        delete s.accessibility;
        delete button(s).accessibility;
        delete bar(s).accessibility;
      }),
    );
    const after = parseSpec(v18());
    const changed = parseSpec(
      v18((s) => {
        s.accessibility.touchTarget = { width: 24, height: 24 };
        button(s).accessibility.role = 'link';
        bar(s).accessibility.parts.pop();
      }),
    );
    if (!before.ok || !after.ok || !changed.ok) throw new Error('invalid specialization');
    expect(diffSpecs(before.spec, after.spec)).toEqual([]);
    expect(diffSpecs(after.spec, before.spec)).toEqual([]);
    expect(diffSpecs(after.spec, changed.spec)).toEqual([]);
  });
});
