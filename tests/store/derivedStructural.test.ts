// Structural type (CF8): the marking counts as "with a drawing" only for the outline and the name.
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
        annotationTypes: [{ id: 'group', name: 'Group', structural, fields: [] }],
      },
    ],
  });
  if (!parsed.ok) throw new Error('invalid spec');
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

describe('derived: marking of a structural type', () => {
  it('counts as a marking with a drawing (outline only with mouse or selection; no name)', () => {
    expect([...derivedOf(project(true)).drawnMarkings.value]).toEqual(['M1']);
  });

  it('a plain type without a component does not count', () => {
    expect(derivedOf(project(false)).drawnMarkings.value.size).toBe(0);
  });

  it('does not become an issue nor fade the marking without an annotation', () => {
    const d = derivedOf(project(true));
    expect(d.issues.value.size).toBe(0);
  });
});
