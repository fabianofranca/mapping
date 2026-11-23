// `formatVersion` 17 (stage #1080, SL3; decisions 8 and 9): `slots` on the type (`id`, `name`,
// `description`, `accepts`, `max`) and `code.<platform>.slots` (and in each `variants` case). The keys
// are outside the version contract (`diffSpecs` ignores them). What depends on the component (the slot
// exists) and on the signature sheet belongs to the package (`library.ts`, tests in `librarySlots.test.ts`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_FORMAT_VERSION, SPEC_FORMAT_VERSIONS, parseSpec } from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const TYPE = 'layers[0].annotationTypes[0]';
const ONLY_V17 = 'only allowed with formatVersion 17';

/** A specialization with a `bar` (two slots declared) and the types it accepts, in two layers. */
function v17(edit?: (spec: Json) => void, formatVersion = 17): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'slots',
    name: 'Slots',
    version: 1,
    platforms: [{ id: 'compose', name: 'Compose', language: 'kotlin' }],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        groups: [{ id: 'buttons', name: 'Buttons' }],
        annotationTypes: [
          {
            id: 'bar',
            name: 'Bar',
            fields: [{ key: 'title', type: 'string' }],
            slots: [
              { id: 'navigationIcon', name: 'Navigation', accepts: ['icon'], max: 1 },
              {
                id: 'actions',
                description: 'Trailing actions',
                accepts: ['icon', { layer: 'content', groups: ['texts'] }],
              },
            ],
            code: {
              compose: {
                symbol: 'x.Bar',
                slots: { navigationIcon: 'navigation', actions: 'actions' },
                variants: {
                  field: 'kind',
                  cases: {
                    small: { symbol: 'x.SmallBar', slots: { actions: 'trailing' } },
                  },
                },
              },
            },
          },
          {
            id: 'icon',
            name: 'Icon',
            groups: ['buttons'],
            fields: [{ key: 'kind', type: 'enum', options: ['small', 'large'] }],
          },
        ],
      },
      {
        id: 'content',
        name: 'Content',
        color: '#445566',
        groups: [{ id: 'texts', name: 'Texts' }],
        annotationTypes: [
          { id: 'text', name: 'Text', groups: ['texts'], fields: [] },
          { id: 'image', name: 'Image', fields: [] },
        ],
      },
    ],
  };
  // `variants.field` must be an enum field of the type: `bar` borrows the `kind` field.
  (spec.layers[0].annotationTypes[0].fields as Json[]).push({
    key: 'kind',
    type: 'enum',
    options: ['small', 'large'],
  });
  edit?.(spec);
  return spec;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

describe('formatVersion 17: version and shape', () => {
  it('17 is accepted (and so is 16); the current version is 23', () => {
    expect(SPEC_FORMAT_VERSION).toBe(23);
    expect(SPEC_FORMAT_VERSIONS).toContain(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(17);
  });

  it('the v17 specialization with slots, accepts, max and code.slots is valid and is read', () => {
    expect(issuesOf(v17())).toEqual([]);
    const result = parseSpec(v17());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bar = result.spec.layers[0]?.annotationTypes[0];
    expect(bar?.slots).toEqual([
      { id: 'navigationIcon', name: 'Navigation', accepts: ['icon'], max: 1 },
      {
        id: 'actions',
        description: 'Trailing actions',
        accepts: ['icon', { layer: 'content', groups: ['texts'] }],
      },
    ]);
    expect(bar?.code?.compose?.slots).toEqual({
      navigationIcon: 'navigation',
      actions: 'actions',
    });
    expect(bar?.code?.compose?.variants?.cases.small?.slots).toEqual({
      actions: 'trailing',
    });
  });

  it('the JSON Schema accepts the v17 with slots', () => {
    expect(jsonValidator.safeParse(v17()).success).toBe(true);
  });
});

describe('formatVersion 17: before it, the keys are errors at the exact path', () => {
  it('slots on the type and code.slots (also in a variants case) in a v16', () => {
    const issues = issuesOf(v17(undefined, 16));
    for (const path of [
      `${TYPE}.slots`,
      `${TYPE}.code.compose.slots`,
      `${TYPE}.code.compose.variants.cases.small.slots`,
    ]) {
      expect(issues, path).toContainEqual({ path, message: ONLY_V17 });
    }
  });

  it('a v16 without the keys stays valid', () => {
    const spec = v17((s) => {
      const bar = s.layers[0].annotationTypes[0];
      delete bar.slots;
      delete bar.code.compose.slots;
      delete bar.code.compose.variants.cases.small.slots;
    }, 16);
    expect(issuesOf(spec)).toEqual([]);
  });
});

describe('formatVersion 17: validation of `slots` on the type', () => {
  it('an accepts with a type that does not exist is an error at the item', () => {
    const issues = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].slots[0].accepts = ['nope'])),
    );
    expect(issues).toEqual([
      {
        path: `${TYPE}.slots[0].accepts[0]`,
        message: 'type "nope" does not exist in the specialization',
      },
    ]);
  });

  it('an accepts clause with a layer or a group that does not exist is an error', () => {
    const layer = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].slots[1].accepts = [{ layer: 'zz' }])),
    );
    expect(layer).toEqual([
      {
        path: `${TYPE}.slots[1].accepts[0].layer`,
        message: expect.stringContaining('zz'),
      },
    ]);
    const group = issuesOf(
      v17(
        (s) =>
          (s.layers[0].annotationTypes[0].slots[1].accepts = [
            { layer: 'content', groups: ['nope'] },
          ]),
      ),
    );
    expect(group).toEqual([
      {
        path: `${TYPE}.slots[1].accepts[0].groups[0]`,
        message: 'group "nope" does not exist in the layer "content"',
      },
    ]);
  });

  it('a type of the own layer is accepted (like allowedChildren from v13)', () => {
    expect(
      issuesOf(
        v17((s) => (s.layers[0].annotationTypes[0].slots[0].accepts = ['icon', 'bar'])),
      ),
    ).toEqual([]);
  });

  it('max below 1, fractional or not a number is an error', () => {
    for (const max of [0, -1, 1.5, '2']) {
      const issues = issuesOf(
        v17((s) => (s.layers[0].annotationTypes[0].slots[0].max = max)),
      );
      expect(
        issues.map((i) => i.path),
        String(max),
      ).toContain(`${TYPE}.slots[0].max`);
    }
  });

  it('an empty accepts or a repeated slot id is an error', () => {
    const empty = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].slots[0].accepts = [])),
    );
    expect(empty.map((i) => i.path)).toContain(`${TYPE}.slots[0].accepts`);
    const repeated = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].slots[1].id = 'navigationIcon')),
    );
    expect(repeated).toContainEqual({
      path: `${TYPE}.slots[1].id`,
      message: 'id "navigationIcon" repeated',
    });
  });

  it('the slot id uses the component slot id pattern (camelCase allowed)', () => {
    expect(
      issuesOf(
        v17((s) => (s.layers[0].annotationTypes[0].slots[0].id = 'floatingActionButton')),
      ),
    ).toEqual([]);
    const bad = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].slots[0].id = '1bad')),
    );
    expect(bad.map((i) => i.path)).toContain(`${TYPE}.slots[0].id`);
  });

  it('an unknown key in a slot entry is an error', () => {
    const issues = issuesOf(v17((s) => (s.layers[0].annotationTypes[0].slots[0].zz = 1)));
    expect(issues.map((i) => i.path)).toContain(`${TYPE}.slots[0]`);
  });
});

describe('formatVersion 17: validation of code.slots', () => {
  it('a value that is not a non-empty text is an error', () => {
    const issues = issuesOf(
      v17((s) => (s.layers[0].annotationTypes[0].code.compose.slots.actions = '')),
    );
    expect(issues.map((i) => i.path)).toContain(`${TYPE}.code.compose.slots.actions`);
  });
});

describe('formatVersion 17: outside the version contract', () => {
  it('diffSpecs ignores slots and code.slots (adding, changing or removing)', () => {
    const before = parseSpec(
      v17((s) => {
        const bar = s.layers[0].annotationTypes[0];
        delete bar.slots;
        delete bar.code.compose.slots;
      }),
    );
    const after = parseSpec(v17());
    const changed = parseSpec(
      v17((s) => {
        const bar = s.layers[0].annotationTypes[0];
        bar.slots[0].accepts = ['image'];
        bar.slots[0].max = 3;
        bar.code.compose.slots.actions = 'other';
      }),
    );
    if (!before.ok || !after.ok || !changed.ok) throw new Error('invalid specialization');
    expect(diffSpecs(before.spec, after.spec)).toEqual([]);
    expect(diffSpecs(after.spec, before.spec)).toEqual([]);
    expect(diffSpecs(after.spec, changed.spec)).toEqual([]);
  });
});
