// `formatVersion` 13: the owner's own layer is valid in `allowedChildren` (a link in the same layer).
// pt-BR kept: shared fixture data (sameLayerFixtures: layer `eventos`, asserted in messages), outside this phase
import { describe, expect, it } from 'vitest';
import {
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  childTypeIds,
  isChildTypeAllowed,
  parseSpec,
} from '../../src/model';
import { sameLayerSpec, type Json } from './sameLayerFixtures';

const issuesOf = (spec: Json) => {
  const r = parseSpec(spec);
  return r.ok ? [] : r.issues;
};
const request = (s: Json) => s.layers[1].annotationTypes[1] as Json;
const clause = (c: unknown) => (s: Json) => (request(s).allowedChildren = [c]);
const at = 'layers[1].annotationTypes[1].allowedChildren[0]';

describe("formatVersion 13: the owner's own layer", () => {
  it('the current version is 16 and 13 is in the list', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(13);
  });

  it('a clause for the own layer is valid in 13', () => {
    expect(issuesOf(sameLayerSpec(13))).toEqual([]);
  });

  it('a type id of the same layer, including the type itself, is valid in 13', () => {
    expect(issuesOf(sameLayerSpec(13, clause('onClick')))).toEqual([]);
    expect(issuesOf(sameLayerSpec(13, clause('request')))).toEqual([]);
  });

  it('nonexistent layer and nonexistent type are still an error in 13', () => {
    expect(issuesOf(sameLayerSpec(13, clause({ layer: 'nothing' })))).toContainEqual(
      expect.objectContaining({
        path: `${at}.layer`,
        message: 'layer "nothing" does not exist in the specialization',
      }),
    );
    expect(issuesOf(sameLayerSpec(13, clause('nothing')))).toContainEqual(
      expect.objectContaining({
        path: at,
        message: 'type "nothing" does not exist in the specialization',
      }),
    );
  });

  it('in 12 the clause for the own layer is still refused, with the usual text', () => {
    expect(issuesOf(sameLayerSpec(12, clause({ layer: 'eventos' })))).toContainEqual(
      expect.objectContaining({
        path: `${at}.layer`,
        message: `layer "eventos" is the type's own layer; children must be in another layer`,
      }),
    );
  });

  it('in 12 the id of the same layer is still refused, with the usual text', () => {
    expect(issuesOf(sameLayerSpec(12, clause('request')))).toContainEqual(
      expect.objectContaining({
        path: at,
        message: 'type "request" is in the same layer; children must be in another layer',
      }),
    );
  });

  it('the resolved set of the own layer includes the owner itself', () => {
    const r = parseSpec(sameLayerSpec(13));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(childTypeIds(r.spec, 'request')).toEqual(['onClick', 'request', 'navigate']);
    expect(isChildTypeAllowed(r.spec, 'request', 'request')).toBe(true);
    expect(isChildTypeAllowed(r.spec, 'navigate', 'request')).toBe(false);
  });
});
