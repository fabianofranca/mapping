import { describe, expect, it } from 'vitest';
import { moveImage, moveMarking, renameLayer } from '../../src/model';
import { HISTORY_LIMIT, createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';

function setup() {
  let clock = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  let seq = 0;
  const actions = createProjectActions(store, { newId: () => `id${++seq}` });
  store.load(sampleProject());
  return { store, actions };
}

const project = (store: ReturnType<typeof createProjectStore>) => {
  if (!store.project.value) throw new Error('sem projeto');
  return store.project.value;
};

describe('store: actions e histórico', () => {
  it('sem projeto aberto, as actions falham', () => {
    const store = createProjectStore();
    expect(store.apply((p) => p)).toEqual({ ok: false, error: 'no-project' });
    expect(store.undo()).toBe(false);
  });

  it('aplica, desfaz e refaz', () => {
    const { store, actions } = setup();
    const original = project(store);
    expect(store.canUndo.value).toBe(false);

    expect(actions.renameLayer('L1', 'Pintura')).toEqual({ ok: true, value: undefined });
    expect(project(store).layers[0]?.name).toBe('Pintura');
    expect(project(store).project.updatedAt).not.toBe(original.project.updatedAt);
    expect(store.canUndo.value).toBe(true);
    expect(store.revision.value).toBe(1);

    expect(store.undo()).toBe(true);
    expect(project(store).layers[0]?.name).toBe('Lataria');
    expect(store.canRedo.value).toBe(true);

    expect(store.redo()).toBe(true);
    expect(project(store).layers[0]?.name).toBe('Pintura');
    expect(store.canRedo.value).toBe(false);
  });

  it('uma nova alteração limpa o refazer', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.undo();
    actions.renameLayer('L1', 'B');
    expect(store.canRedo.value).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it('erro do modelo não altera o projeto nem o histórico', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.removeLayer('L9')).toEqual({ ok: false, error: 'not-found' });
    expect(actions.moveMarking('M3', 999, 0)).toEqual({
      ok: false,
      error: 'rect-outside-parent',
    });
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('operação que não muda nada não entra no histórico', () => {
    const { store } = setup();
    store.apply((p) => p);
    expect(store.canUndo.value).toBe(false);
  });

  it('actions que criam itens devolvem o id gerado', () => {
    const { store, actions } = setup();
    const layer = actions.addLayer('Pneus', '#000000');
    expect(layer).toEqual({ ok: true, value: 'id1' });
    const m = actions.createMarking('I1', { x: 1700, y: 1700, width: 100, height: 100 });
    expect(m).toEqual({ ok: true, value: 'id2' });
    const a = actions.addAnnotation('id2', 'id1', null, [{ key: 'k', value: 'v' }]);
    expect(a).toEqual({ ok: true, value: 'id3' });
    expect(project(store).markings.find((x) => x.id === 'id2')?.parentId).toBe('M1');
  });

  it('limita o histórico a 100 entradas', () => {
    const { store } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      store.apply((p) => renameLayer(p, 'L1', `n${i}`));
    }
    let undos = 0;
    while (store.undo()) undos++;
    expect(undos).toBe(HISTORY_LIMIT);
    expect(project(store).layers[0]?.name).toBe('n19');
  });

  it('modo somente leitura bloqueia alterações', () => {
    const store = createProjectStore();
    store.load(emptyProject(), { readOnly: true });
    expect(store.apply((p) => renameLayer(p, 'L1', 'x'))).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(store.beginGesture()).toEqual({ ok: false, error: 'read-only' });
  });

  it('carregar outro projeto zera o histórico', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.load(emptyProject());
    expect(store.canUndo.value).toBe(false);
    store.close();
    expect(store.project.value).toBeNull();
  });
});

describe('store: gestos', () => {
  it('um gesto gera uma única entrada no histórico', () => {
    const { store } = setup();
    const before = project(store);
    expect(store.beginGesture().ok).toBe(true);
    for (let dx = 10; dx <= 100; dx += 10) {
      expect(store.updateGesture((p) => moveMarking(p, 'M1', dx, 0)).ok).toBe(true);
    }
    expect(project(store).markings[0]?.rect.x).toBe(1100);
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
    store.commitGesture();

    expect(store.revision.value).toBe(1);
    expect(project(store).markings[0]?.rect.x).toBe(1100);
    expect(project(store).markings[1]?.rect.x).toBe(1300);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.undo()).toBe(false);
  });

  it('prévia inválida mantém a última posição válida', () => {
    const { store } = setup();
    store.beginGesture();
    store.updateGesture((p) => moveImage(p, 'I2', 1200, 0));
    const result = store.updateGesture((p) => moveImage(p, 'I2', 500, 0));
    expect(result).toEqual({ ok: false, error: 'image-overlap' });
    expect(project(store).images[1]?.placement.x).toBe(1200);
    store.commitGesture();
    expect(project(store).images[1]?.placement.x).toBe(1200);
  });

  it('cancelar volta ao início sem histórico', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveImage(p, 'I2', 1200, 0));
    store.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('gesto sem mudança não entra no histórico', () => {
    const { store } = setup();
    store.beginGesture();
    store.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });

  it('actions de gesto: mover imagem com prévias, sobreposição e uma entrada', () => {
    const { store, actions } = setup();
    const before = project(store);
    const start = before.images[1]?.placement;
    if (!start) throw new Error('sem I2');
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { ...start, y: 900 }).ok).toBe(true);
    // Em cima da I1 (0..1000 × 0..750): recusada, fica na última válida.
    expect(actions.previewImagePlacement('I2', { ...start, x: 100, y: 100 })).toEqual({
      ok: false,
      error: 'image-overlap',
    });
    expect(project(store).images[1]?.placement).toEqual({ ...start, y: 900 });
    actions.commitGesture();
    expect(project(store).images[1]?.placement).toEqual({ ...start, y: 900 });
    expect(store.undo()).toBe(true);
    expect(project(store).images).toBe(before.images);
    expect(store.undo()).toBe(false);
  });

  it('actions de gesto: redimensionar e cancelar', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewImagePlacement('I1', { x: 0, y: 0, scale: 0.1 });
    expect(project(store).images[0]?.placement.scale).toBe(0.1);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('durante o gesto, outras actions e undo ficam bloqueados', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.beginGesture();
    expect(store.gestureActive.value).toBe(true);
    expect(actions.renameLayer('L1', 'B')).toEqual({
      ok: false,
      error: 'gesture-active',
    });
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.beginGesture()).toEqual({ ok: false, error: 'gesture-active' });
    store.cancelGesture();
    expect(store.undo()).toBe(true);
  });
});
