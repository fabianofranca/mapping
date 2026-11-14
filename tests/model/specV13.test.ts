// `formatVersion` 13: a camada do próprio dono vale em `allowedChildren` (vínculo na mesma camada).
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

describe('formatVersion 13: camada do próprio dono', () => {
  it('a versão atual é 15 e 13 está na lista', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(13);
  });

  it('cláusula da própria camada vale na 13', () => {
    expect(issuesOf(sameLayerSpec(13))).toEqual([]);
  });

  it('id de tipo da mesma camada, inclusive o próprio tipo, vale na 13', () => {
    expect(issuesOf(sameLayerSpec(13, clause('onClick')))).toEqual([]);
    expect(issuesOf(sameLayerSpec(13, clause('request')))).toEqual([]);
  });

  it('camada inexistente e tipo inexistente continuam erro na 13', () => {
    expect(issuesOf(sameLayerSpec(13, clause({ layer: 'nada' })))).toContainEqual(
      expect.objectContaining({
        path: `${at}.layer`,
        message: 'layer "nada" does not exist in the specialization',
      }),
    );
    expect(issuesOf(sameLayerSpec(13, clause('nada')))).toContainEqual(
      expect.objectContaining({
        path: at,
        message: 'type "nada" does not exist in the specialization',
      }),
    );
  });

  it('na 12 a cláusula da própria camada segue recusada, com o texto de sempre', () => {
    expect(issuesOf(sameLayerSpec(12, clause({ layer: 'eventos' })))).toContainEqual(
      expect.objectContaining({
        path: `${at}.layer`,
        message: `layer "eventos" is the type's own layer; children must be in another layer`,
      }),
    );
  });

  it('na 12 o id da mesma camada segue recusado, com o texto de sempre', () => {
    expect(issuesOf(sameLayerSpec(12, clause('request')))).toContainEqual(
      expect.objectContaining({
        path: at,
        message: 'type "request" is in the same layer; children must be in another layer',
      }),
    );
  });

  it('o conjunto resolvido da própria camada inclui o próprio dono', () => {
    const r = parseSpec(sameLayerSpec(13));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(childTypeIds(r.spec, 'request')).toEqual(['onClick', 'request', 'navigate']);
    expect(isChildTypeAllowed(r.spec, 'request', 'request')).toBe(true);
    expect(isChildTypeAllowed(r.spec, 'navigate', 'request')).toBe(false);
  });
});
