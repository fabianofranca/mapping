// `formatVersion` 25 (stage #2826, DM2; decision 6): `decorative: true` on the annotation type, the
// type whose instance is a decorative marking (a child like any marking, never a parent). Valid from
// 25; before it `only allowed with formatVersion 25`; an error together with `floating: true`,
// `structural: true` and on an arrow-only type; a decorative type without a component is valid.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
  serializeSpec,
} from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const TYPE = 'layers[0].annotationTypes[0]';

/** A specialization with one type, `frame`, edited by `edit`. */
function spec(formatVersion: number, type: Json = {}): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'decorative',
    name: 'Decorative',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'Interface',
        color: '#6750A4',
        annotationTypes: [{ id: 'frame', name: 'Frame', fields: [], ...type }],
      },
    ],
  };
}

const issuesOf = (value: Json) => {
  const result = parseSpec(value);
  return result.ok ? [] : result.issues;
};

describe('formatVersion 25: decorative on the type', () => {
  it('25 is in the list and is no longer the current version', () => {
    expect(SPEC_FORMAT_VERSION).toBe(26);
    expect(SPEC_FORMAT_VERSIONS).toContain(25);
  });

  it('decorative: true is valid in 25 and is kept in the parsed type', () => {
    const result = parseSpec(spec(25, { decorative: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.layers[0]?.annotationTypes[0]).toMatchObject({
      id: 'frame',
      decorative: true,
    });
    expect(serializeSpec(result.spec)).toContain('"decorative": true');
  });

  it('decorative: false is the same as no key, in 25', () => {
    expect(issuesOf(spec(25, { decorative: false }))).toEqual([]);
    expect(issuesOf(spec(25))).toEqual([]);
  });

  it('a decorative type without a component is valid (a bare outlined marking)', () => {
    expect(issuesOf(spec(25, { decorative: true }))).toEqual([]);
  });

  it('a decorative type with a component is valid', () => {
    expect(
      issuesOf(spec(25, { decorative: true, component: 'components/frame.json' })),
    ).toEqual([]);
  });

  it('in 24 the key is refused at its exact path, with the version in the text', () => {
    expect(issuesOf(spec(24, { decorative: true }))).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'only allowed with formatVersion 25',
      }),
    );
  });

  it('in 24 even decorative: false is refused (the key is what the version gates)', () => {
    expect(issuesOf(spec(24, { decorative: false }))).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'only allowed with formatVersion 25',
      }),
    );
  });

  it('in an old version (7) the key is refused as well', () => {
    expect(issuesOf(spec(7, { decorative: true }))).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'only allowed with formatVersion 25',
      }),
    );
  });

  it('together with floating: true it is an error at the decorative path', () => {
    const found = issuesOf(spec(25, { decorative: true, floating: true }));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'a decorative type cannot also be floating',
      }),
    );
  });

  it('decorative: true with floating: false is valid', () => {
    expect(issuesOf(spec(25, { decorative: true, floating: false }))).toEqual([]);
  });

  it('together with structural: true it is an error at the decorative path', () => {
    const found = issuesOf(spec(25, { decorative: true, structural: true }));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'a decorative type cannot also be structural',
      }),
    );
  });

  it('on an arrow-only type it is an error at the decorative path', () => {
    const found = issuesOf(spec(25, { decorative: true, appliesTo: ['arrow'] }));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.decorative`,
        message: 'an arrow-only type cannot have decorative',
      }),
    );
  });

  it('on a type that applies to marking and arrow it is valid', () => {
    expect(
      issuesOf(spec(25, { decorative: true, appliesTo: ['marking', 'arrow'] })),
    ).toEqual([]);
  });

  it('a value that is not a boolean is refused at its path', () => {
    for (const value of ['yes', 1, null, {}]) {
      const issues = issuesOf(spec(25, { decorative: value }));
      expect(
        issues.some((issue) => issue.path === `${TYPE}.decorative`),
        JSON.stringify(value),
      ).toBe(true);
    }
  });

  it('without the key, 25 and 24 are valid as before', () => {
    expect(issuesOf(spec(25))).toEqual([]);
    expect(issuesOf(spec(24))).toEqual([]);
  });

  it('the JSON Schema mirrors the zod: decorative true passes, a non-boolean does not', () => {
    expect(jsonValidator.safeParse(spec(25, { decorative: true })).success).toBe(true);
    expect(jsonValidator.safeParse(spec(25, { decorative: 'yes' })).success).toBe(false);
  });

  it('adding or removing decorative is additive in the version contract (no difference)', () => {
    const plain = parseSpec(spec(25));
    const marked = parseSpec(spec(25, { decorative: true }));
    expect(plain.ok && marked.ok).toBe(true);
    if (!plain.ok || !marked.ok) return;
    expect(diffSpecs(plain.spec, marked.spec)).toEqual([]);
    expect(diffSpecs(marked.spec, plain.spec)).toEqual([]);
  });
});
