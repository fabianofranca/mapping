import { beforeEach, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createMarking,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions, clampToMinSize } from '../../src/store/project';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { marking } from '../model/fixtures';

const catalog = testCatalog();

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

function setup(initial: Project = componentProject()) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  return { store, actions };
}

/** Quantas entradas de desfazer existem (desfaz tudo e refaz). */
function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

const current = (store: ProjectStore): Project => store.project.value as Project;

describe('actions do container', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('addBackgroundContainer cria a imagem sem arquivo, numa entrada, e o desfazer a tira', () => {
    const { store, actions } = ctx;
    const before = current(store);
    const result = actions.addBackgroundContainer({
      name: 'Tela',
      width: 360,
      height: 640,
      background: '#FFFFFF',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const image = current(store).containers.find((i) => i.id === result.value);
    expect(image).toMatchObject({
      file: null,
      background: '#FFFFFF',
      width: 360,
      height: 640,
      name: 'Tela',
    });
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).containers).toEqual(before.containers);
  });

  it('addBackgroundContainer recusa medida ou cor inválida sem mexer em nada', () => {
    const { store, actions } = ctx;
    const before = current(store);
    expect(
      actions.addBackgroundContainer({ name: null, width: 0, height: 640, background: '#FFFFFF' })
        .ok,
    ).toBe(false);
    expect(
      actions.addBackgroundContainer({ name: null, width: 100, height: 100, background: 'branco' })
        .ok,
    ).toBe(false);
    expect(current(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('setBackgroundContainer muda cor e tamanho numa entrada; só vale paro container', () => {
    const { store, actions } = ctx;
    const created = actions.addBackgroundContainer({
      name: null,
      width: 360,
      height: 640,
      background: '#FFFFFF',
    });
    if (!created.ok) throw new Error('addBackgroundContainer');
    const id = created.value;
    expect(actions.setBackgroundContainer(id, { background: '#000000', width: 400 }).ok).toBe(
      true,
    );
    expect(current(store).containers.find((i) => i.id === id)).toMatchObject({
      background: '#000000',
      width: 400,
    });
    expect(undoDepth(store)).toBe(2);
    store.undo();
    expect(current(store).containers.find((i) => i.id === id)).toMatchObject({
      background: '#FFFFFF',
      width: 360,
    });

    const before = current(store);
    const photo = actions.setBackgroundContainer('I1', { background: '#000000' });
    expect(photo).toEqual({ ok: false, error: 'container-has-file' });
    expect(current(store)).toBe(before);
  });
});

describe('addComponent', () => {
  it('cria a marcação e a anotação numa entrada de desfazer', () => {
    const { store, actions } = setup();
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      center: { x: 500, y: 400 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = current(store);
    const created = marking(p, result.value);
    expect(created.rect.width).toBeGreaterThan(0);
    const annotation = p.annotations.find((a) => a.markingId === result.value);
    expect(annotation?.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    // A anotação tem id próprio, diferente do da marcação.
    expect(annotation?.id).not.toBe(result.value);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).markings.some((m) => m.id === result.value)).toBe(false);
    expect(current(store).annotations.some((a) => a.markingId === result.value)).toBe(
      false,
    );
  });

  it('dentro de um container, a nova entra como filha', () => {
    const initial = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    const { store, actions } = setup(initial);
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: 'C',
      specId: SPEC_ID,
      typeId: 'text',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(marking(current(store), result.value).parentId).toBe('C');
  });

  it('recusa tipo sem componente ou imagem inexistente, sem mudar nada', () => {
    const { store, actions } = setup();
    const before = current(store);
    expect(
      actions.addComponent({
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'plain',
      }),
    ).toEqual({ ok: false, error: 'unknown-type' });
    expect(
      actions.addComponent({
        containerId: 'nada',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      }).ok,
    ).toBe(false);
    expect(current(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('sem catálogo (padrão) nada é criado', () => {
    const store = createProjectStore();
    const actions = createProjectActions(store);
    store.load(componentProject());
    expect(
      actions.addComponent({
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      }).ok,
    ).toBe(false);
  });
});

describe('reorderMarking', () => {
  function threeSiblings() {
    let p = componentProject();
    ['A', 'B', 'C'].forEach((id, i) => {
      p = createMarking(p, { id, containerId: 'I1', rect: box(i * 100, 0, 50, 50) });
    });
    return setup(p);
  }
  const order = (store: ProjectStore) => current(store).markings.map((m) => m.id);

  it('move entre as irmãs numa entrada e desfaz', () => {
    const { store, actions } = threeSiblings();
    expect(actions.reorderMarking('A', 2).ok).toBe(true);
    expect(order(store)).toEqual(['B', 'C', 'A']);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(order(store)).toEqual(['A', 'B', 'C']);
  });

  it('mesma posição não cria entrada; índice fora recusa', () => {
    const { store, actions } = threeSiblings();
    expect(actions.reorderMarking('B', 1).ok).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(actions.reorderMarking('B', 3)).toEqual({ ok: false, error: 'invalid-index' });
    expect(order(store)).toEqual(['A', 'B', 'C']);
  });

  it('a trava da geometria não impede reordenar', () => {
    const { store, actions } = threeSiblings();
    actions.setMarkingLocked('A', true);
    expect(actions.reorderMarking('A', 2).ok).toBe(true);
    expect(order(store)).toEqual(['B', 'C', 'A']);
  });
});

describe('arrange', () => {
  function rowWithKids() {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    p = add(p, 'T1', 'text', box(250, 150, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(120, 110, 100, 40), 'C');
    return setup(p);
  }

  it('arruma as filhas numa entrada de desfazer e devolve os avisos', () => {
    const { store, actions } = rowWithKids();
    const before = current(store);
    const result = actions.arrange('C');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
    expect(current(store)).not.toBe(before);
    expect(marking(current(store), 'T1').rect).not.toEqual(marking(before, 'T1').rect);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(current(store).markings).toEqual(before.markings);
  });

  it('já arrumado: não cria entrada nova', () => {
    const { store, actions } = rowWithKids();
    actions.arrange('C');
    const arranged = current(store);
    expect(actions.arrange('C').ok).toBe(true);
    expect(current(store)).toBe(arranged);
    // Uma só entrada: a do primeiro arrumar.
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('recusa o que não é container com filhas, e a geometria trancada', () => {
    const { store, actions } = rowWithKids();
    const before = current(store);
    expect(actions.arrange('T1')).toEqual({ ok: false, error: 'not-arrangeable' });
    actions.setMarkingLocked('T1', true);
    const locked = current(store);
    expect(actions.arrange('C')).toEqual({ ok: false, error: 'locked' });
    expect(current(store)).toBe(locked);
    expect(before).not.toBe(locked);
  });
});

describe('tamanho mínimo do componente', () => {
  // `text` tem minSize 60 x 24.
  function withText() {
    return setup(add(componentProject(), 'T', 'text', box(100, 100, 100, 40)));
  }

  it('setMarkingRect e adjustMarkingRect respeitam o mínimo', () => {
    const { store, actions } = withText();
    expect(actions.setMarkingRect('T', box(100, 100, 50, 40))).toEqual({
      ok: false,
      error: 'rect-too-small',
    });
    expect(actions.setMarkingRect('T', box(100, 100, 61, 24)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 61, 24));
    const depth = undoDepth(store);
    actions.adjustMarkingRect('T', 'width', 10);
    // O ajuste fino é limitado pelas regras: nunca abaixo do mínimo.
    expect(marking(current(store), 'T').rect.width).toBeGreaterThanOrEqual(60);
    expect(undoDepth(store)).toBeGreaterThanOrEqual(depth);
  });

  it('marcação comum não tem mínimo', () => {
    const { store, actions } = setup(
      createMarking(componentProject(), {
        id: 'P',
        containerId: 'I1',
        rect: box(0, 0, 50, 50),
      }),
    );
    expect(actions.setMarkingRect('P', box(0, 0, 10, 10)).ok).toBe(true);
    expect(marking(current(store), 'P').rect).toEqual(box(0, 0, 10, 10));
  });

  it('a prévia do gesto prende ao mínimo, mantendo a borda oposta à alça', () => {
    const { store, actions } = withText();
    expect(actions.beginGesture().ok).toBe(true);
    // Alça da direita: o lado esquerdo fica.
    expect(actions.previewMarkingRect('T', box(100, 100, 20, 40)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 60, 40));
    // Alça da esquerda: o lado direito (x + width = 200) fica.
    expect(actions.previewMarkingRect('T', box(180, 100, 20, 40)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(140, 100, 60, 40));
    // Alça de baixo e de cima.
    expect(actions.previewMarkingRect('T', box(100, 100, 100, 5)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 100, 100, 24));
    expect(actions.previewMarkingRect('T', box(100, 135, 100, 5)).ok).toBe(true);
    expect(marking(current(store), 'T').rect).toEqual(box(100, 116, 100, 24));
    actions.commitGesture();
    expect(undoDepth(store)).toBe(1);
  });
});

describe('clampToMinSize', () => {
  const base = box(100, 100, 100, 40);
  const min = { width: 60, height: 24 };

  it('o que já cabe não muda', () => {
    expect(clampToMinSize(box(90, 100, 120, 40), base, min)).toEqual(
      box(90, 100, 120, 40),
    );
  });

  it('eixo que o gesto não mexeu fica, mesmo abaixo do mínimo', () => {
    const tiny = box(100, 100, 50, 10);
    expect(clampToMinSize(tiny, tiny, min)).toEqual(tiny);
  });

  it('sem borda conhecida, ancora em x e y', () => {
    expect(clampToMinSize(box(120, 110, 10, 10), base, min)).toEqual(
      box(120, 110, 60, 24),
    );
  });
});
