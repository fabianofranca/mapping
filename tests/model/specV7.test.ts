// `formatVersion` 7: `floating` no tipo (etapa Marcações espaciais, ME3).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
} from '../../src/model/spec';

function spec(formatVersion: number, floating?: unknown): unknown {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 't',
            name: 'T',
            fields: [],
            ...(floating === undefined ? {} : { floating }),
          },
        ],
      },
    ],
  };
}

describe('formatVersion 7: floating no tipo', () => {
  it('a versão atual é a 7 e as anteriores continuam aceitas', () => {
    expect(SPEC_FORMAT_VERSION).toBe(7);
    expect(SPEC_FORMAT_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of [1, 2, 3, 4, 5, 6, 7]) expect(parseSpec(spec(v)).ok).toBe(true);
  });

  it('aceita floating booleano na 7 e o devolve no tipo', () => {
    const result = parseSpec(spec(7, true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.layers[0]?.annotationTypes[0]?.floating).toBe(true);
    const off = parseSpec(spec(7, false));
    expect(off.ok && off.spec.layers[0]?.annotationTypes[0]?.floating).toBe(false);
  });

  it('floating numa versão anterior é o erro "só é permitido com formatVersion 7", no caminho exato', () => {
    for (const v of [1, 4, 6]) {
      const result = parseSpec(spec(v, true));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issues).toContainEqual({
        path: 'layers[0].annotationTypes[0].floating',
        message: 'só é permitido com formatVersion 7',
      });
    }
  });

  it('floating que não é booleano é recusado', () => {
    expect(parseSpec(spec(7, 'sim')).ok).toBe(false);
  });
});
