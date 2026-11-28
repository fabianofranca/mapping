// `formatVersion` 26 (stage #2918, FG1; decision 2): `except` in a clause of a slot's `accepts`. A
// `{ layer, groups?, except? }` clause covers the types of the layer (or of its groups) minus the
// `except` ids; another item of the same list can still name an excluded type. Valid from 26; before it
// `only allowed with formatVersion 26`; an empty list, a repeated id, a missing type and a type the
// clause does not cover each give their error at `…except[e]`. `allowedChildren` and
// `accepts.annotations` still refuse the key (their clause is strict).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, serializeSpec, type Spec } from '../../src/model';
import { parseComponent } from '../../src/model/components/parseComponent';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { specTypeSlots } from '../../src/model/specSlots';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const component = (name: string): ComponentFile => {
  const parsed = parseComponent(
    JSON.parse(readFileSync(`tests/fixtures/slots/components/${name}.json`, 'utf8')),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.component;
};
const bar = component('bar');

const SLOT = 'layers[0].annotationTypes[0].slots[0]';

/** A specialization whose `bar` has the slot `actions` (a slot of the `bar` fixture component). */
function spec(accepts: unknown[], formatVersion = 26, extra: Json = {}): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'except',
    name: 'Except',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'bar',
            name: 'Bar',
            fields: [],
            slots: [{ id: 'actions', accepts }],
            ...extra,
          },
        ],
      },
      {
        id: 'actions',
        name: 'Actions',
        color: '#445566',
        groups: [
          { id: 'primary', name: 'Primary' },
          { id: 'extra', name: 'Extra' },
        ],
        annotationTypes: [
          { id: 'button', name: 'Button', groups: ['primary'], fields: [] },
          { id: 'icon-button', name: 'Icon button', groups: ['primary'], fields: [] },
          { id: 'scroll', name: 'Scroll', groups: ['extra'], fields: [] },
          { id: 'chip', name: 'Chip', fields: [] },
        ],
      },
      {
        id: 'other',
        name: 'Other',
        color: '#778899',
        annotationTypes: [{ id: 'stray', name: 'Stray', fields: [] }],
      },
    ],
  };
}

const issuesOf = (value: Json) => {
  const result = parseSpec(value);
  return result.ok ? [] : result.issues;
};

function parsed(value: Json): Spec {
  const result = parseSpec(value);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

const acceptedBy = (accepts: unknown[]): string[] | undefined => {
  const slot = specTypeSlots(parsed(spec(accepts)), 'bar', bar).find(
    (s) => s.id === 'actions',
  );
  return slot?.accepts === undefined ? undefined : [...slot.accepts];
};

describe('formatVersion 26: except in a slot clause', () => {
  it('the clause with except is valid and kept in the parsed slot', () => {
    const clause = { layer: 'actions', except: ['scroll'] };
    const result = parseSpec(spec([clause]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.layers[0]?.annotationTypes[0]?.slots?.[0]?.accepts).toEqual([
      clause,
    ]);
    expect(serializeSpec(result.spec)).toContain('"except"');
  });

  it('specTypeSlots gives the types of the layer without the excluded one', () => {
    expect(acceptedBy([{ layer: 'actions', except: ['scroll'] }])).toEqual([
      'button',
      'icon-button',
      'chip',
    ]);
  });

  it('another item of the same list still accepts an excluded type', () => {
    expect(acceptedBy([{ layer: 'actions', except: ['scroll'] }, 'scroll'])).toEqual([
      'button',
      'icon-button',
      'chip',
      'scroll',
    ]);
    expect(
      acceptedBy([
        { layer: 'actions', except: ['scroll'] },
        { layer: 'actions', groups: ['extra'] },
      ]),
    ).toContain('scroll');
  });

  it('with groups, except subtracts only from the types of those groups', () => {
    expect(
      acceptedBy([{ layer: 'actions', groups: ['primary'], except: ['button'] }]),
    ).toEqual(['icon-button']);
    expect(acceptedBy([{ layer: 'actions', groups: ['primary', 'extra'] }])).toEqual([
      'button',
      'icon-button',
      'scroll',
    ]);
  });

  it('a clause without except resolves as before', () => {
    expect(acceptedBy([{ layer: 'actions' }])).toEqual([
      'button',
      'icon-button',
      'scroll',
      'chip',
    ]);
  });

  it('excluding every type of the clause leaves a slot that accepts nothing from it', () => {
    expect(
      acceptedBy([{ layer: 'actions', groups: ['extra'], except: ['scroll'] }, 'stray']),
    ).toEqual(['stray']);
  });

  it('in 25 the key is refused at its exact path, with the version in the text', () => {
    expect(issuesOf(spec([{ layer: 'actions', except: ['scroll'] }], 25))).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except`,
        message: 'only allowed with formatVersion 26',
      }),
    );
  });

  it('in 17 (the first version with slots) the key is refused as well', () => {
    expect(issuesOf(spec([{ layer: 'actions', except: ['scroll'] }], 17))).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except`,
        message: 'only allowed with formatVersion 26',
      }),
    );
  });

  it('in 25 a clause without except is valid as before', () => {
    expect(issuesOf(spec([{ layer: 'actions' }, 'stray'], 25))).toEqual([]);
  });

  it('an empty except is an error at the key', () => {
    expect(issuesOf(spec([{ layer: 'actions', except: [] }]))).toContainEqual(
      expect.objectContaining({ path: `${SLOT}.accepts[0].except` }),
    );
  });

  it('an except that is not a list of text is an error', () => {
    for (const value of ['scroll', 1, null, [1], ['']]) {
      expect(
        issuesOf(spec([{ layer: 'actions', except: value }])).length,
        JSON.stringify(value),
      ).toBeGreaterThan(0);
    }
  });

  it('a repeated id is an error at the repeated item', () => {
    expect(
      issuesOf(spec([{ layer: 'actions', except: ['scroll', 'scroll'] }])),
    ).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except[1]`,
        message: 'id "scroll" repeated',
      }),
    );
  });

  it('a repeated id that is also not covered is reported once at the repeat', () => {
    const found = issuesOf(spec([{ layer: 'actions', except: ['nope', 'nope'] }])).filter(
      (i) => i.path === `${SLOT}.accepts[0].except[1]`,
    );
    expect(found.map((i) => i.message)).toEqual(['id "nope" repeated']);
  });

  it('a type that does not exist is an error at the item', () => {
    const found = issuesOf(spec([{ layer: 'actions', except: ['nope'] }]));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except[0]`,
        message: 'the type "nope" is not covered by this clause',
      }),
    );
  });

  it('a type of another layer is an error at the item', () => {
    expect(issuesOf(spec([{ layer: 'actions', except: ['stray'] }]))).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except[0]`,
        message: 'the type "stray" is not covered by this clause',
      }),
    );
  });

  it('a type outside the groups of the clause is an error at the item', () => {
    const found = issuesOf(
      spec([
        { layer: 'actions', groups: ['primary'], except: ['icon-button', 'scroll'] },
      ]),
    );
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except[1]`,
        message: 'the type "scroll" is not covered by this clause',
      }),
    );
    expect(found.some((i) => i.path === `${SLOT}.accepts[0].except[0]`)).toBe(false);
  });

  it('a type of the layer that has no group is not covered by a clause with groups', () => {
    expect(
      issuesOf(spec([{ layer: 'actions', groups: ['primary'], except: ['chip'] }])),
    ).toContainEqual(
      expect.objectContaining({
        path: `${SLOT}.accepts[0].except[0]`,
        message: 'the type "chip" is not covered by this clause',
      }),
    );
  });

  it('except in allowedChildren is still refused (the clause is strict)', () => {
    const found = issuesOf(
      spec([{ layer: 'actions' }], 26, {
        allowedChildren: [{ layer: 'actions', except: ['scroll'] }],
      }),
    );
    expect(found).toContainEqual(
      expect.objectContaining({
        path: 'layers[0].annotationTypes[0].allowedChildren[0]',
        message: 'unknown property: "except"',
      }),
    );
  });

  it('except in accepts.annotations of a ref field is still refused', () => {
    const found = issuesOf(
      spec([{ layer: 'actions' }], 26, {
        fields: [
          {
            key: 'target',
            type: 'ref',
            accepts: { annotations: [{ layer: 'actions', except: ['scroll'] }] },
          },
        ],
      }),
    );
    expect(found).toContainEqual(
      expect.objectContaining({
        path: 'layers[0].annotationTypes[0].fields[0].accepts.annotations[0]',
        message: 'unknown property: "except"',
      }),
    );
  });

  it('the JSON Schema mirrors the zod: the clause with except passes, a non-list does not', () => {
    expect(
      jsonValidator.safeParse(spec([{ layer: 'actions', except: ['scroll'] }])).success,
    ).toBe(true);
    expect(
      jsonValidator.safeParse(spec([{ layer: 'actions', except: 'scroll' }])).success,
    ).toBe(false);
  });

  it('except is outside the version contract (no difference)', () => {
    const plain = parsed(spec([{ layer: 'actions' }]));
    const excepting = parsed(spec([{ layer: 'actions', except: ['scroll'] }]));
    expect(diffSpecs(plain, excepting)).toEqual([]);
    expect(diffSpecs(excepting, plain)).toEqual([]);
  });
});
