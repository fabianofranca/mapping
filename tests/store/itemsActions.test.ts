import { describe, expect, it } from 'vitest';
import { validateProject, type ItemRef, type Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW } from '../model/fixtures';
import { multiProjectAnnotated } from '../model/multiSelectionFixtures';

// Seleção múltipla (ME2): o arrasto conjunto é um gesto com N operações por prévia sobre a base,
// "tudo ou nada", e uma entrada de desfazer no fim; excluir e trancar a seleção são uma entrada.
// Fixture: ver tests/model/multiSelectionFixtures.ts (A, B, C, D, E; G, G2, H e a flutuante N).

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

function setup() {
  let clock = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  const actions = createProjectActions(store, { newId: () => 'x' });
  store.load(multiProjectAnnotated());
  return { store, actions };
}

type Store = ReturnType<typeof createProjectStore>;

const project = (store: Store): Project => {
  if (!store.project.value) throw new Error('sem projeto');
  return store.project.value;
};
const container = (store: Store, id: string) =>
  project(store).containers.find((c) => c.id === id);
const marking = (store: Store, id: string) =>
  project(store).markings.find((m) => m.id === id);

describe('store: arrasto conjunto', () => {
  // A (container), N (flutuante, no canvas) e b1 (marcação do container B, escala 2).
  const items = [img('A'), mark('N'), mark('b1')];

  it('várias prévias, uma inválida no meio, e uma entrada de desfazer no fim', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);

    expect(actions.previewItemsMove(items, 40, 20).ok).toBe(true);
    expect(container(store, 'A')?.placement).toEqual({ x: 40, y: 20, scale: 1 });
    expect(actions.previewItemsMove(items, 100, 50).ok).toBe(true);
    expect(marking(store, 'N')?.rect).toMatchObject({ x: 200, y: 1350 });
    expect(marking(store, 'b1')?.rect).toMatchObject({ x: 100, y: 75 });
    // O pertencimento fica congelado durante o arrasto.
    expect(container(store, 'A')?.parentId).toBe('G2');

    // b1 sairia de B (500 px): recusada, e a prévia inteira fica na última posição válida.
    expect(actions.previewItemsMove(items, 1500, 0)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(store, 'N')?.rect).toMatchObject({ x: 200, y: 1350 });

    // Nada entrou no histórico nem no confirmado, até soltar.
    expect(store.canUndo.value).toBe(false);
    expect(store.committed.value).toBe(before);
    expect(store.revision.value).toBe(0);

    expect(actions.finishItemsMove(items, 100, 50).ok).toBe(true);
    // O assentar refez o pertencimento: A passou da borda de G2 e ficou em G.
    expect(container(store, 'A')?.parentId).toBe('G');
    actions.commitGesture();

    expect(store.revision.value).toBe(1);
    expect(validateProject(project(store))).toEqual([]);
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });

    // Um undo volta tudo: containers, marcação do canvas e marcação do outro container.
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
    // Refazer volta ao resultado do gesto inteiro.
    expect(store.redo()).toBe(true);
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(store, 'b1')?.rect).toMatchObject({ x: 100, y: 75 });
  });

  it('um deslocamento inválido na final não falha o gesto: vale a última prévia válida, assentada', () => {
    const { store, actions } = setup();
    const before = project(store);
    const pair = [img('A'), mark('N')];
    actions.beginGesture();
    expect(actions.previewItemsMove(pair, 100, 50).ok).toBe(true);
    // A final pede um deslocamento que põe A sobre B, que não se move (o canvas não deveria): a
    // operação falha, mas o gesto cai na última prévia válida, assentada, e o commit grava essa.
    expect(actions.finishItemsMove(pair, 1500, 0)).toEqual({
      ok: false,
      error: 'image-overlap',
    });
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(container(store, 'A')?.parentId).toBe('G');
    actions.commitGesture();
    expect(validateProject(project(store))).toEqual([]);
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
  });

  it('o assentar da final tira os containers de dentro da marcação, numa entrada só', () => {
    const { store, actions } = setup();
    const before = project(store);
    const two = [img('A'), img('B')];
    actions.beginGesture();
    expect(actions.previewItemsMove(two, 0, 1500).ok).toBe(true);
    expect(actions.previewItemsMove(two, 0, 3000).ok).toBe(true);
    expect(container(store, 'A')?.parentId).toBe('G2');
    expect(actions.finishItemsMove(two, 0, 3000).ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'A')?.parentId).toBeNull();
    expect(container(store, 'B')?.parentId).toBeNull();
    expect(container(store, 'C')?.parentId).toBe('G');
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(store.canUndo.value).toBe(false);
  });

  it('item travado: a prévia falha, nada muda e o gesto sem mudança não entra no histórico', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('N', true);
    const locked = project(store);
    actions.beginGesture();
    expect(actions.previewItemsMove(items, 10, 10)).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(project(store)).toBe(locked);
    actions.commitGesture();
    expect(project(store)).toBe(locked);
    // Só a trava (uma entrada): o gesto não acrescentou nenhuma.
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('cancelar volta ao início sem histórico', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewItemsMove(items, 100, 50);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('marcação de container que sairia do container: a prévia é recusada', () => {
    const { actions } = setup();
    actions.beginGesture();
    expect(actions.previewItemsMove([mark('c1')], 10, 0)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    actions.cancelGesture();
  });
});

describe('store: excluir e trancar a seleção', () => {
  it('removeItems exclui tudo numa entrada de desfazer', () => {
    const { store, actions } = setup();
    const before = project(store);
    const result = actions.removeItems([mark('G'), img('A'), mark('a1'), img('B')]);
    expect(result.ok).toBe(true);
    const after = project(store);
    expect(after.containers.map((c) => c.id)).toEqual(['C', 'D', 'E']);
    // O assentar tirou C da marcação que saiu.
    expect(after.containers.map((c) => c.parentId)).toEqual([null, null, null]);
    expect(after.markings.map((m) => m.id)).toEqual(['c1', 'e1', 'N', 'H']);
    expect(validateProject(after)).toEqual([]);
    expect(store.revision.value).toBe(1);

    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(project(store).markings).toBe(before.markings);
    expect(project(store).annotations).toBe(before.annotations);
    expect(store.canUndo.value).toBe(false);
  });

  it('removeItems com um item trancado falha sem entrada; inexistentes não fazem nada', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('a1', true);
    const locked = project(store);
    expect(actions.removeItems([mark('H'), mark('a1')])).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(project(store)).toBe(locked);
    expect(actions.removeItems([mark('nada')]).ok).toBe(true);
    expect(project(store)).toBe(locked);
    expect(store.undo()).toBe(true); // só a trava
    expect(store.canUndo.value).toBe(false);
  });

  it('setItemsLocked tranca e destranca a seleção numa entrada cada; sem mudança não há entrada', () => {
    const { store, actions } = setup();
    const before = project(store);
    const items = [mark('G'), img('A'), mark('a1')];
    expect(actions.setItemsLocked(items, true).ok).toBe(true);
    expect(marking(store, 'G')?.locked).toBe(true);
    expect(container(store, 'A')?.locked).toBe(true);
    expect(marking(store, 'a1')?.locked).toBe(true);
    expect(marking(store, 'a2')?.locked).toBe(false);
    expect(store.revision.value).toBe(1);
    // Repetir não muda nada: sem nova entrada.
    expect(actions.setItemsLocked(items, true).ok).toBe(true);
    expect(store.revision.value).toBe(1);

    expect(actions.setItemsLocked(items, false).ok).toBe(true);
    expect(store.revision.value).toBe(2);
    expect(store.undo()).toBe(true);
    expect(marking(store, 'G')?.locked).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(project(store).containers).toBe(before.containers);
    expect(store.canUndo.value).toBe(false);
  });

  it('as actions respeitam o bloqueio de gesto', () => {
    const { store, actions } = setup();
    store.beginGesture();
    expect(actions.removeItems([mark('H')])).toEqual({
      ok: false,
      error: 'gesture-active',
    });
    expect(actions.setItemsLocked([mark('H')], true)).toEqual({
      ok: false,
      error: 'gesture-active',
    });
    store.cancelGesture();
  });
});
