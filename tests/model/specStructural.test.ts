// `formatVersion` 15 (etapa #747, CF8): `structural: true` no tipo de anotação.
import { describe, expect, it } from 'vitest';
import { emptyProject } from './fixtures';
import {
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  isStructuralMarking,
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
        annotationTypes: [{ id: 'group', name: 'Grupo', fields: [], ...type }],
      },
    ],
  };
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues;
};

describe('formatVersion 15: structural', () => {
  it('na 15 aceita structural: true e false', () => {
    expect(issuesOf(spec({ structural: true }))).toEqual([]);
    expect(issuesOf(spec({ structural: false }))).toEqual([]);
  });

  it('structural não booleano falha', () => {
    const paths = issuesOf(spec({ structural: 'sim' })).map((i) => i.path);
    expect(paths).toContain('layers[0].annotationTypes[0].structural');
  });

  it('structural junto com component falha no caminho do tipo', () => {
    const found = issuesOf(spec({ structural: true, component: 'components/a.json' }));
    expect(found.map((i) => i.path)).toContain('layers[0].annotationTypes[0].structural');
  });

  it('na formatVersion 14 falha com a mensagem de versão', () => {
    const found = issuesOf(spec({ structural: true }, 14));
    expect(found).toContainEqual(
      expect.objectContaining({
        path: 'layers[0].annotationTypes[0].structural',
        message: 'só é permitido com formatVersion 15',
      }),
    );
  });
});

function withInstance(structural: boolean): Project {
  const parsed = parseSpec(
    spec({ structural, fields: [{ key: 'note', type: 'string' }] }),
  );
  if (!parsed.ok) throw new Error('spec inválida');
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

describe('marcação de tipo estrutural', () => {
  it('structuralMarkingIds lista só as marcações de tipo estrutural', () => {
    expect([...structuralMarkingIds(withInstance(true))]).toEqual(['M1']);
    expect(structuralMarkingIds(withInstance(false)).size).toBe(0);
    expect(isStructuralMarking(withInstance(true), 'M1')).toBe(true);
    expect(isStructuralMarking(withInstance(false), 'M1')).toBe(false);
  });

  it('não entra em pendência por falta de componente', () => {
    expect(projectIssues(withInstance(true)).size).toBe(0);
  });
});
