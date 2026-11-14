// `formatVersion` 14: `accepts.annotations` em campo e coluna `ref` (anotação inteira como alvo).
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../src/model';
import { sameLayerSpec, type Json } from './sameLayerFixtures';

const issuesOf = (spec: Json) => {
  const r = parseSpec(spec);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const button = (s: Json) => s.layers[0].annotationTypes[0] as Json;

/** `button` ganha o campo `item` (ref) e a tabela `rows` com a coluna `alvo` (ref). */
function withAccepts(accepts: unknown, formatVersion = 14) {
  return sameLayerSpec(formatVersion, (s) => {
    s.layers[1].groups = [{ id: 'g1', name: 'G1' }];
    button(s).fields = [
      { key: 'item', type: 'ref', accepts },
      {
        key: 'rows',
        type: 'table',
        columns: [{ key: 'alvo', type: 'ref', accepts }],
      },
    ];
  });
}

const field = 'layers[0].annotationTypes[0].fields[0].accepts';
const column = 'layers[0].annotationTypes[0].fields[1].columns[0].accepts';

describe('accepts.annotations (formatVersion 14)', () => {
  it('cláusula de camada vale em campo e coluna', () => {
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'eventos' }] }))).toEqual([]);
  });

  it('id de tipo, cláusula com groups e mistura com tags valem', () => {
    expect(issuesOf(withAccepts({ annotations: ['onClick'] }))).toEqual([]);
    expect(
      issuesOf(withAccepts({ annotations: [{ layer: 'eventos', groups: ['g1'] }] })),
    ).toEqual([]);
    expect(
      issuesOf(withAccepts({ tags: ['x'], free: true, annotations: ['onClick'] })),
    ).toEqual([]);
  });

  it('a camada do próprio tipo vale', () => {
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'componentes' }] }))).toEqual(
      [],
    );
  });

  it('na 13 é erro, no caminho do campo e da coluna', () => {
    const issues = issuesOf(withAccepts({ annotations: ['onClick'] }, 13));
    expect(issues).toContainEqual({
      path: `${field}.annotations`,
      message: 'only allowed with formatVersion 14',
    });
    expect(issues).toContainEqual({
      path: `${column}.annotations`,
      message: 'only allowed with formatVersion 14',
    });
  });

  it('camada inexistente, grupo inexistente e tipo inexistente', () => {
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'nada' }] }))).toContainEqual({
      path: `${field}.annotations[0].layer`,
      message: 'layer "nada" does not exist in the specialization',
    });
    expect(
      issuesOf(withAccepts({ annotations: [{ layer: 'eventos', groups: ['zz'] }] })),
    ).toContainEqual({
      path: `${column}.annotations[0].groups[0]`,
      message: 'group "zz" does not exist in the layer "eventos"',
    });
    expect(issuesOf(withAccepts({ annotations: ['nada'] }))).toContainEqual({
      path: `${field}.annotations[0]`,
      message: 'type "nada" does not exist in the specialization',
    });
  });

  it('annotations vazio é erro', () => {
    expect(issuesOf(withAccepts({ annotations: [] }))).toContainEqual({
      path: `${field}.annotations`,
      message: expect.stringContaining('cannot be empty'),
    });
  });

  it('accepts só com annotations satisfaz o "pelo menos um"', () => {
    const messages = issuesOf(withAccepts({ annotations: ['onClick'] })).map(
      (i) => i.message,
    );
    expect(messages.join('|')).not.toContain('precisa de pelo menos');
    expect(issuesOf(withAccepts({}))).toContainEqual({
      path: field,
      message: expect.stringContaining('annotations'),
    });
  });
});
