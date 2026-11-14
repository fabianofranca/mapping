// `formatVersion` 14: `accepts.annotations` on a `ref` field and column (a whole annotation as the target).
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../src/model';
import { sameLayerSpec, type Json } from './sameLayerFixtures';

const issuesOf = (spec: Json) => {
  const r = parseSpec(spec);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const button = (s: Json) => s.layers[0].annotationTypes[0] as Json;

/** `button` gets the `item` field (ref) and the `rows` table with the `target` column (ref). */
function withAccepts(accepts: unknown, formatVersion = 14) {
  return sameLayerSpec(formatVersion, (s) => {
    s.layers[1].groups = [{ id: 'g1', name: 'G1' }];
    button(s).fields = [
      { key: 'item', type: 'ref', accepts },
      {
        key: 'rows',
        type: 'table',
        columns: [{ key: 'target', type: 'ref', accepts }],
      },
    ];
  });
}

const field = 'layers[0].annotationTypes[0].fields[0].accepts';
const column = 'layers[0].annotationTypes[0].fields[1].columns[0].accepts';

describe('accepts.annotations (formatVersion 14)', () => {
  it('a layer clause is valid on a field and a column', () => {
    // pt-BR kept: shared fixture data (sameLayerFixtures: layers `componentes` and `eventos`), outside this phase
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'eventos' }] }))).toEqual([]);
  });

  it('type id, clause with groups and a mix with tags are valid', () => {
    expect(issuesOf(withAccepts({ annotations: ['onClick'] }))).toEqual([]);
    expect(
      issuesOf(withAccepts({ annotations: [{ layer: 'eventos', groups: ['g1'] }] })),
    ).toEqual([]);
    expect(
      issuesOf(withAccepts({ tags: ['x'], free: true, annotations: ['onClick'] })),
    ).toEqual([]);
  });

  it("the type's own layer is valid", () => {
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'componentes' }] }))).toEqual(
      [],
    );
  });

  it('in 13 it is an error, at the path of the field and the column', () => {
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

  it('nonexistent layer, nonexistent group and nonexistent type', () => {
    expect(issuesOf(withAccepts({ annotations: [{ layer: 'nothing' }] }))).toContainEqual(
      {
        path: `${field}.annotations[0].layer`,
        message: 'layer "nothing" does not exist in the specialization',
      },
    );
    expect(
      issuesOf(withAccepts({ annotations: [{ layer: 'eventos', groups: ['zz'] }] })),
    ).toContainEqual({
      path: `${column}.annotations[0].groups[0]`,
      message: 'group "zz" does not exist in the layer "eventos"',
    });
    expect(issuesOf(withAccepts({ annotations: ['nothing'] }))).toContainEqual({
      path: `${field}.annotations[0]`,
      message: 'type "nothing" does not exist in the specialization',
    });
  });

  it('empty annotations is an error', () => {
    expect(issuesOf(withAccepts({ annotations: [] }))).toContainEqual({
      path: `${field}.annotations`,
      message: expect.stringContaining('cannot be empty'),
    });
  });

  it('accepts with only annotations satisfies the "at least one"', () => {
    const messages = issuesOf(withAccepts({ annotations: ['onClick'] })).map(
      (i) => i.message,
    );
    expect(messages.join('|')).not.toContain('needs at least one');
    expect(issuesOf(withAccepts({}))).toContainEqual({
      path: field,
      message: expect.stringContaining('annotations'),
    });
  });
});
