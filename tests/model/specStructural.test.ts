// `formatVersion` 15 (stage #747, CF8): `structural: true` on the annotation type.
import { describe, expect, it } from 'vitest';
import { emptyProject } from './fixtures';
import {
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  projectIssues,
  structuralMarkingIds,
  type Project,
} from '../../src/model';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function spec(type: Json, formatVersion = 15): Json {
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
        annotationTypes: [{ id: 'group', name: 'Group', fields: [], ...type }],
      },
    ],
  };
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues;
};

describe('formatVersion 15: structural', () => {
  it('in 15 accepts structural: true and false', () => {
    expect(issuesOf(spec({ structural: true }))).toEqual([]);
    expect(issuesOf(spec({ structural: false }))).toEqual([]);
  });

  it('non-boolean structural fails', () => {
    const paths = issuesOf(spec({ structural: 'yes' })).map((i) => i.path);
    expect(paths).toContain('layers[0].annotationTypes[0].structural');
  });

  it("structural together with component fails at the type's path", () => {
    const found = issuesOf(spec({ structural: true, component: 'components/a.json' }));
    expect(found.map((i) => i.path)).toContain('layers[0].annotationTypes[0].structural');
  });

  it('in formatVersion 14 it fails with the version message', () => {
    const found = issuesOf(spec({ structural: true }, 14));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: 'layers[0].annotationTypes[0].structural',
        message: 'only allowed with formatVersion 15',
      }),
    );
  });
});

function withInstance(structural: boolean): Project {
  const parsed = parseSpec(
    spec({ structural, fields: [{ key: 'note', type: 'string' }] }),
  );
  if (!parsed.ok) throw new Error('invalid spec');
  const applied = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => 'LS1',
    packageSpecName: 's.spec.json',
  });
  const marked = createMarking(applied, {
    id: 'M1',
    containerId: null,
    rect: { x: 0, y: 0, width: 100, height: 50 },
  });
  return addTypedAnnotation(marked, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'LS1',
    type: { specId: 's', typeId: 'group' },
  });
}

describe('marking of a structural type', () => {
  it('structuralMarkingIds lists only the markings of a structural type', () => {
    expect([...structuralMarkingIds(withInstance(true))]).toEqual(['M1']);
    expect(structuralMarkingIds(withInstance(false)).size).toBe(0);
  });

  it('does not become pending for lack of a component', () => {
    expect(projectIssues(withInstance(true)).size).toBe(0);
  });
});
