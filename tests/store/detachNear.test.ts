import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createMarking,
  imageCanvasRect,
  right,
  type Project,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { marking } from '../model/fixtures';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from '../model/notesFixtures';

// ME4: o `near` do addComponent (flutuante perto do alvo) e o container destacado, como
// actions do store (uma entrada de desfazer cada).

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

describe('detachMarking (container destacado)', () => {
  it('sem componente: container em branco, uma entrada de desfazer, devolve o id', () => {
    const base = createMarking(componentProject(), {
      id: 'M',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 300, height: 200 },
      name: 'Cartão',
    });
    const { store, actions } = setup(base);
    const result = actions.detachMarking('M');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = current(store);
    expect(p.containers.find((c) => c.id === result.value)).toMatchObject({
      file: null,
      width: 300,
      height: 200,
    });
    expect(p.markings).toHaveLength(1);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).containers).toHaveLength(1);
  });

  it('com componente: leva a marcação e as anotações para o container novo', () => {
    const base = addComponentMarking(
      componentProject(),
      testCatalog(),
      {
        markingId: 'T',
        annotationId: 'AT',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x: 100, y: 100, width: 200, height: 60 },
      },
      approximateMeasurer,
    );
    const { store, actions } = setup(base);
    const result = actions.detachMarking('T');
    if (!result.ok) throw new Error('detachMarking');
    const p = current(store);
    const copy = p.markings.find((m) => m.containerId === result.value);
    expect(copy?.rect).toEqual({ x: 0, y: 0, width: 200, height: 60 });
    expect(p.annotations.filter((a) => a.markingId === copy!.id)).toHaveLength(1);
    expect(undoDepth(store)).toBe(1);
  });

  it('marcação inexistente: erro e nenhuma entrada', () => {
    const { store, actions } = setup(componentProject());
    expect(actions.detachMarking('zz').ok).toBe(false);
    expect(undoDepth(store)).toBe(0);
  });
});
