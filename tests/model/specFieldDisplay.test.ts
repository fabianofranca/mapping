// `formatVersion` 26 (stage #2918, FG2; decisions 3 to 6): `fieldGroups` on the type, `group` and
// `visibleWhen` on a top-level field. Valid from 26; before it `only allowed with formatVersion 26`
// at the exact path of each key; each error of decisions 3, 4 and 5 at its exact path and text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec } from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

const jsonValidator = z.fromJSONSchema(
  JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as never,
);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TYPE = 'layers[0].annotationTypes[0]';

const baseFields = (): Json[] => [
  { key: 'variant', type: 'enum', options: ['plain', 'htmlTagged'], default: 'plain' },
  { key: 'part1Effect', type: 'enum', options: ['none', 'link'] },
  { key: 'part1Text', type: 'string', group: 'part1' },
  {
    key: 'part1Link',
    type: 'string',
    group: 'part1',
    visibleWhen: { part1Effect: ['link'] },
  },
  { key: 'count', type: 'number' },
  { key: 'when', type: 'date' },
  { key: 'rows', type: 'table', columns: [{ key: 'a', type: 'string' }] },
  { key: 'owner', type: 'ref', accepts: { free: true } },
];

const baseGroups = (): Json[] => [
  { id: 'part1', name: 'Piece 1', visibleWhen: { variant: 'htmlTagged' } },
];

/** A type with the stage's example: a group with a condition and a field with its own. */
function spec(
  type: Json = {},
  formatVersion = 26,
  fields: Json[] = baseFields(),
  fieldGroups: Json[] | null = baseGroups(),
): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'display',
    name: 'Display',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'label',
            name: 'Label',
            fields,
            ...(fieldGroups === null ? {} : { fieldGroups }),
            ...type,
          },
        ],
      },
    ],
  };
}

/** The `path: message` of each error. */
function errorsOf(value: Json): string[] {
  const result = parseSpec(value);
  return result.ok ? [] : result.errors;
}

/** The group `part1` with `fields` as the only fields (no other key to trip over). */
function withFields(fields: Json[], fieldGroups?: Json[], formatVersion = 26): Json {
  return spec({}, formatVersion, fields, fieldGroups ?? baseGroups());
}

describe('formatVersion 26: field groups and visibleWhen', () => {
  it('the stage example is valid at 26 and kept in the parsed spec', () => {
    const result = parseSpec(spec());
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const type = result.spec.layers[0]?.annotationTypes[0];
    expect(type?.fieldGroups).toEqual(baseGroups());
    expect(type?.fields.find((f) => f.key === 'part1Link')).toMatchObject({
      group: 'part1',
      visibleWhen: { part1Effect: ['link'] },
    });
  });

  it('a group with only a name is valid (no condition)', () => {
    const fields = [{ key: 'a', type: 'string', group: 'g' }];
    expect(errorsOf(withFields(fields, [{ id: 'g', name: 'G' }]))).toEqual([]);
  });

  it('a scalar value, a list and several keys are valid', () => {
    const fields = [
      { key: 'a', type: 'enum', options: ['x', 'y'] },
      { key: 'n', type: 'number' },
      { key: 's', type: 'string' },
      {
        key: 'b',
        type: 'string',
        visibleWhen: { a: 'x', n: [1, 2], s: ['p', 'q'] },
      },
    ];
    expect(errorsOf(withFields(fields, []))).toEqual([]);
  });

  describe('below 26 each key is refused at its exact path', () => {
    it('fieldGroups, group and visibleWhen at 25', () => {
      const errors = errorsOf(spec({}, 25));
      expect(errors).toContain(`${TYPE}.fieldGroups: only allowed with formatVersion 26`);
      expect(errors).toContain(
        `${TYPE}.fields[2].group: only allowed with formatVersion 26`,
      );
      expect(errors).toContain(
        `${TYPE}.fields[3].visibleWhen: only allowed with formatVersion 26`,
      );
      expect(errors.some((e) => e.includes('field group'))).toBe(false);
    });

    it('a type that uses none of them is valid at 25 and at 1', () => {
      const plain = [{ key: 'a', type: 'string' }];
      expect(errorsOf(spec({}, 25, plain, null))).toEqual([]);
      expect(errorsOf(spec({}, 3, plain, null))).toEqual([]);
    });
  });

  describe('decision 3: groups', () => {
    it('a field whose group is not declared', () => {
      const fields = [{ key: 'a', type: 'string', group: 'nope' }];
      expect(errorsOf(withFields(fields, [{ id: 'g', name: 'G' }]))).toContain(
        `${TYPE}.fields[0].group: the field group "nope" is not declared in fieldGroups`,
      );
    });

    it('a field with a group in a type that declares none', () => {
      const fields = [{ key: 'a', type: 'string', group: 'g' }];
      expect(errorsOf(spec({}, 26, fields, null))).toContain(
        `${TYPE}.fields[0].group: the field group "g" is not declared in fieldGroups`,
      );
    });

    it('a declared group with no field', () => {
      const fields = [{ key: 'a', type: 'string' }];
      expect(errorsOf(withFields(fields, [{ id: 'empty', name: 'Empty' }]))).toContain(
        `${TYPE}.fieldGroups[0].id: the field group "empty" has no field`,
      );
    });

    it('a repeated group id', () => {
      const fields = [{ key: 'a', type: 'string', group: 'g' }];
      const groups = [
        { id: 'g', name: 'G' },
        { id: 'g', name: 'Again' },
      ];
      expect(errorsOf(withFields(fields, groups))).toContain(
        `${TYPE}.fieldGroups[1].id: id "g" repeated`,
      );
    });

    it('an invalid group id and a missing name', () => {
      const fields = [{ key: 'a', type: 'string', group: 'G x' }];
      const errors = errorsOf(withFields(fields, [{ id: 'G x', name: '' }]));
      expect(errors.some((e) => e.startsWith(`${TYPE}.fieldGroups[0].id: `))).toBe(true);
      expect(errors.some((e) => e.startsWith(`${TYPE}.fieldGroups[0].name: `))).toBe(
        true,
      );
    });

    it('group and visibleWhen on a table column', () => {
      const fields = [
        { key: 'g1', type: 'string', group: 'g' },
        {
          key: 'rows',
          type: 'table',
          columns: [
            { key: 'a', type: 'string', group: 'g' },
            { key: 'b', type: 'string', visibleWhen: { g1: 'x' } },
          ],
        },
      ];
      const errors = errorsOf(withFields(fields, [{ id: 'g', name: 'G' }]));
      expect(errors).toContain(
        `${TYPE}.fields[1].columns[0].group: only valid on a field, not on a table column`,
      );
      expect(errors).toContain(
        `${TYPE}.fields[1].columns[1].visibleWhen: only valid on a field, not on a table column`,
      );
    });
  });

  describe('decision 4: visibleWhen', () => {
    const cite = (visibleWhen: unknown, extra: Json[] = []): string[] =>
      errorsOf(
        withFields(
          [
            { key: 'mode', type: 'enum', options: ['a', 'b'] },
            { key: 'name', type: 'string' },
            { key: 'count', type: 'number' },
            { key: 'when', type: 'date' },
            { key: 'rows', type: 'table', columns: [{ key: 'c', type: 'string' }] },
            { key: 'owner', type: 'ref', accepts: { free: true } },
            { key: 'target', type: 'string', visibleWhen },
            ...extra,
          ],
          [],
        ),
      );
    const AT = `${TYPE}.fields[6].visibleWhen`;

    it('an unknown field', () => {
      expect(cite({ ghost: 'a' })).toContain(
        `${AT}.ghost: the field "ghost" does not exist in the type`,
      );
    });

    it('the field itself', () => {
      expect(cite({ target: 'a' })).toContain(
        `${AT}.target: a field's visibleWhen cannot cite the field itself`,
      );
    });

    it.each(['when', 'rows', 'owner'])('a %s field is refused by its type', (key) => {
      const type = { when: 'date', rows: 'table', owner: 'ref' }[key];
      expect(cite({ [key]: 'x' })).toContain(
        `${AT}.${key}: visibleWhen only cites enum, string or number fields: "${key}" is ${type}`,
      );
    });

    it('a value outside the options, not text and not a number', () => {
      expect(cite({ mode: 'zzz' })).toContain(`${AT}.mode: "zzz" is not in the options`);
      expect(cite({ name: 3 })).toContain(`${AT}.name: must be text`);
      expect(cite({ count: 'x' })).toContain(`${AT}.count: the value must be a number`);
    });

    it('each value of a list is checked at its index', () => {
      const errors = cite({ mode: ['a', 'zzz'] });
      expect(errors).toContain(`${AT}.mode[1]: "zzz" is not in the options`);
      expect(errors.some((e) => e.startsWith(`${AT}.mode[0]`))).toBe(false);
    });

    it('an empty object and an empty list', () => {
      expect(cite({})).toContain(`${AT}: cannot be empty`);
      expect(cite({ mode: [] })).toContain(`${AT}.mode: cannot be empty`);
    });

    it('a group condition cannot cite a field of the group', () => {
      const fields = [
        { key: 'mode', type: 'enum', options: ['a', 'b'] },
        { key: 'inside', type: 'string', group: 'g' },
      ];
      const groups = [{ id: 'g', name: 'G', visibleWhen: { inside: 'x' } }];
      expect(errorsOf(withFields(fields, groups))).toContain(
        `${TYPE}.fieldGroups[0].visibleWhen.inside: a group's visibleWhen cannot cite a field of the group: inside`,
      );
    });

    it('a group condition cites an unknown field and a wrong type', () => {
      const fields = [
        { key: 'when', type: 'date' },
        { key: 'inside', type: 'string', group: 'g' },
      ];
      const groups = [
        { id: 'g', name: 'G', visibleWhen: { ghost: 'x', when: '2026-01-01' } },
      ];
      const errors = errorsOf(withFields(fields, groups));
      expect(errors).toContain(
        `${TYPE}.fieldGroups[0].visibleWhen.ghost: the field "ghost" does not exist in the type`,
      );
      expect(errors).toContain(
        `${TYPE}.fieldGroups[0].visibleWhen.when: visibleWhen only cites enum, string or number fields: "when" is date`,
      );
    });

    it('an empty group condition', () => {
      const fields = [{ key: 'inside', type: 'string', group: 'g' }];
      expect(
        errorsOf(withFields(fields, [{ id: 'g', name: 'G', visibleWhen: {} }])),
      ).toContain(`${TYPE}.fieldGroups[0].visibleWhen: cannot be empty`);
    });

    it('a field in a group may cite another field of the same group', () => {
      const fields = [
        { key: 'a', type: 'string', group: 'g' },
        { key: 'b', type: 'string', group: 'g', visibleWhen: { a: 'x' } },
      ];
      expect(errorsOf(withFields(fields, [{ id: 'g', name: 'G' }]))).toEqual([]);
    });
  });

  describe('decision 5: required and hidden', () => {
    it('required with a condition on the field', () => {
      const fields = [
        { key: 'mode', type: 'enum', options: ['a'] },
        { key: 'b', type: 'string', required: true, visibleWhen: { mode: 'a' } },
      ];
      expect(errorsOf(withFields(fields, []))).toContain(
        `${TYPE}.fields[1].required: a required field cannot be hidden: remove required or visibleWhen`,
      );
    });

    it('required in a group with a condition', () => {
      const fields = [
        { key: 'mode', type: 'enum', options: ['a'] },
        { key: 'b', type: 'string', required: true, group: 'g' },
      ];
      const groups = [{ id: 'g', name: 'G', visibleWhen: { mode: 'a' } }];
      expect(errorsOf(withFields(fields, groups))).toContain(
        `${TYPE}.fields[1].required: a required field cannot be hidden: remove required or visibleWhen`,
      );
    });

    it('required in a group with no condition is valid', () => {
      const fields = [{ key: 'b', type: 'string', required: true, group: 'g' }];
      expect(errorsOf(withFields(fields, [{ id: 'g', name: 'G' }]))).toEqual([]);
    });
  });

  it('docs/spec.schema.json accepts the stage example and refuses a stray key', () => {
    expect(jsonValidator.safeParse(spec()).success).toBe(true);
    const stray = spec();
    stray.layers[0].annotationTypes[0].fieldGroups[0].zz = 1;
    expect(jsonValidator.safeParse(stray).success).toBe(false);
    const empty = spec();
    empty.layers[0].annotationTypes[0].fieldGroups[0].visibleWhen = {};
    expect(jsonValidator.safeParse(empty).success).toBe(false);
  });

  describe('decision 6: outside the version contract', () => {
    it('adding the keys is no difference for diffSpecs', () => {
      const before = parseSpec(spec({}, 26, baseFields().map(strip), null));
      const after = parseSpec(spec());
      expect(before.ok && after.ok).toBe(true);
      if (!before.ok || !after.ok) return;
      expect(diffSpecs(before.spec, after.spec)).toEqual([]);
    });
  });
});

/** The field without `group` and `visibleWhen`. */
function strip(field: Json): Json {
  const rest = { ...field };
  delete rest.group;
  delete rest.visibleWhen;
  return rest;
}
