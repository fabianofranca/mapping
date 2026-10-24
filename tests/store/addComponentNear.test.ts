import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  createMarking,
  imageCanvasRect,
  right,
  type Project,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { testCatalog } from '../model/componentFixtures';
import { marking } from '../model/fixtures';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from '../model/notesFixtures';

// ME4: o `near` do addComponent (flutuante perto do alvo) como action do store (uma entrada
// de desfazer).

function setup(initial: Project, components = testCatalog()) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => components,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  return { store, actions };
}

const current = (store: ProjectStore): Project => store.project.value as Project;
/** Quantas entradas de desfazer existem (desfaz tudo e refaz). */
function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

describe('addComponent com near (tipo flutuante)', () => {
  const project = createMarking(notesProject(), {
    id: 'B',
    containerId: 'I1',
    rect: { x: 100, y: 200, width: 100, height: 50 },
  });

  it('nasce flutuante na margem direita do container, na altura da marcação', () => {
    const { store, actions } = setup(project, notesCatalog());
    const result = actions.addComponent({
      containerId: null,
      parentId: null,
      specId: NOTES_SPEC_ID,
      typeId: 'nota',
      near: { kind: 'marking', id: 'B' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = current(store);
    const container = p.containers[0]!;
    const canvas = imageCanvasRect(container, container.placement);
    const nota = marking(p, result.value);
    expect(nota).toMatchObject({ containerId: null, floating: true });
    expect(nota.rect.x).toBe(right(canvas) + 24);
    expect(nota.rect.y).toBe(Math.round(canvas.y + 200 * container.placement.scale));
    expect(undoDepth(store)).toBe(1);
  });

  it('a segunda nota empilha abaixo da primeira, sem sobrepor', () => {
    const { store, actions } = setup(project, notesCatalog());
    const args = {
      containerId: null,
      parentId: null,
      specId: NOTES_SPEC_ID,
      typeId: 'nota',
      near: { kind: 'container', id: 'I1' },
    } as const;
    const first = actions.addComponent(args);
    const second = actions.addComponent(args);
    if (!first.ok || !second.ok) throw new Error('addComponent');
    const a = marking(current(store), first.value).rect;
    const b = marking(current(store), second.value).rect;
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y + a.height + 24);
  });
});
