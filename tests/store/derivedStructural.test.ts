// Tipo estrutural (CF8): a marcação conta como "com desenho" só para o contorno e o nome.
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import { emptyProject } from '../model/fixtures';

function project(structural: boolean): Project {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 15,
    id: 's',
    name: 'S',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 'group', name: 'Grupo', structural, fields: [] }],
      },
    ],
  });
  if (!parsed.ok) throw new Error('spec inválida');
  const applied = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => 'LS1',
    packageSpecName: 's.spec.json',
  });
  const marked = createMarking(applied, {
    id: 'M1',
    containerId: null,
    rect: { x: 0, y: 0, width: 400, height: 200 },
  });
  return addTypedAnnotation(marked, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'LS1',
    type: { specId: 's', typeId: 'group' },
  });
}

function derivedOf(p: Project) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  store.load(p);
  const sources = { catalog: signal<ComponentCatalog>(new Map()), fontsEpoch: signal(0) };
  return createEditorDerived(store, createEditorUi(), undefined, sources);
}

describe('derivado: marcação de tipo estrutural', () => {
  it('conta como marcação com desenho (contorno só com mouse ou seleção; sem nome)', () => {
    expect([...derivedOf(project(true)).drawnMarkings.value]).toEqual(['M1']);
  });

  it('tipo comum sem componente não conta', () => {
    expect(derivedOf(project(false)).drawnMarkings.value.size).toBe(0);
  });

  it('não vira pendência nem esmaece a marcação sem anotação', () => {
    const d = derivedOf(project(true));
    expect(d.issues.value.size).toBe(0);
  });
});
