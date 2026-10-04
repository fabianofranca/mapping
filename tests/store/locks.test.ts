import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { markingLockStates } from '../../src/model';
import { sampleProject } from '../model/fixtures';

function setup(readOnly = false) {
  const store = createProjectStore();
  const actions = createProjectActions(store);
  store.load(sampleProject(), { readOnly });
  const ui = createEditorUi();
  return { store, actions, ui, derived: createEditorDerived(store, ui) };
}

const current = (store: ReturnType<typeof createProjectStore>) => {
  const p = store.project.value;
  if (!p) throw new Error('sem projeto');
  return p;
};

describe('store: trava', () => {
  it('trancar e destrancar entram no desfazer', () => {
    const { store, actions } = setup();
    expect(actions.setMarkingLocked('M1', true).ok).toBe(true);
    expect(actions.setImageLocked('I2', true).ok).toBe(true);
    expect(store.revision.value).toBe(2);
    expect(actions.setMarkingLocked('M1', false).ok).toBe(true);
    expect(current(store).markings[0]?.locked).toBe(false);

    expect(store.undo()).toBe(true); // volta a trava de M1
    expect(current(store).markings[0]?.locked).toBe(true);
    expect(store.undo()).toBe(true); // desfaz a trava de I2
    expect(current(store).images[1]?.locked).toBe(false);
    expect(store.undo()).toBe(true); // desfaz a trava de M1
    expect(current(store).markings[0]?.locked).toBe(false);
    expect(store.redo()).toBe(true);
    expect(current(store).markings[0]?.locked).toBe(true);
  });

  it('"trancar todas as marcações da imagem" é uma entrada só no histórico', () => {
    const { store, actions } = setup();
    expect(actions.setImageMarkingsLocked('I1', true).ok).toBe(true);
    expect(store.revision.value).toBe(1);
    expect(
      current(store)
        .markings.filter((m) => m.locked)
        .map((m) => m.id),
    ).toEqual(['M1', 'M2', 'M3']);
    expect(store.undo()).toBe(true);
    expect(current(store).markings.some((m) => m.locked)).toBe(false);
    expect(store.canUndo.value).toBe(false);
  });

  it('repetir o estado atual não cria entrada no histórico', () => {
    const { store, actions } = setup();
    expect(actions.setMarkingLocked('M1', false).ok).toBe(true);
    expect(actions.setImageMarkingsLocked('I1', false).ok).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('as ações que mexem na geometria ou excluem voltam com erro "locked", sem alterar nada', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('M2', true);
    actions.setImageLocked('I2', true);
    const before = current(store);
    expect(actions.moveMarking('M2', 5, 0)).toEqual({ ok: false, error: 'locked' });
    expect(actions.adjustMarkingRect('M2', 'width', 300)).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(actions.removeMarking('M2')).toEqual({ ok: false, error: 'locked' });
    expect(actions.removeMarking('M1')).toEqual({ ok: false, error: 'locked' });
    expect(actions.removeImage('I2')).toEqual({ ok: false, error: 'locked' });
    expect(current(store)).toBe(before);
  });

  it('um gesto sobre item trancado não gera prévia nem entrada de desfazer', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('M1', true);
    const revision = store.revision.value;
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M1', 20, 0)).toEqual({
      ok: false,
      error: 'locked',
    });
    actions.commitGesture();
    expect(store.revision.value).toBe(revision);
    expect(current(store).markings[0]?.rect.x).toBe(1000);
  });

  it('em projeto somente leitura, trancar falha', () => {
    const { actions } = setup(true);
    expect(actions.setMarkingLocked('M1', true)).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(actions.setImageMarkingsLocked('I1', true).ok).toBe(false);
  });
});

describe('estado derivado: markingLocks', () => {
  it('começa vazio e acompanha as trancas, próprias ou herdadas do pai', () => {
    const { derived, actions } = setup();
    expect(derived.markingLocks.value.size).toBe(0);
    actions.setMarkingLocked('M2', true);
    expect(Object.fromEntries(derived.markingLocks.value)).toEqual({
      M2: 'self',
      M3: 'inherited',
    });
    actions.setMarkingLocked('M3', true);
    expect(derived.markingLocks.value.get('M3')).toBe('self');
    actions.setMarkingLocked('M2', false);
    expect(Object.fromEntries(derived.markingLocks.value)).toEqual({ M3: 'self' });
  });

  it('não depende da prévia de um gesto', () => {
    const { derived, actions, store } = setup();
    actions.setMarkingLocked('M4', true);
    const before = derived.markingLocks.value;
    actions.beginGesture();
    actions.previewMarkingMove('M1', 10, 0);
    expect(derived.markingLocks.value).toBe(before);
    actions.cancelGesture();
    expect(store.gestureActive.value).toBe(false);
  });

  it('sem projeto, é vazio', () => {
    const store = createProjectStore();
    const derived = createEditorDerived(store, createEditorUi());
    expect(derived.markingLocks.value.size).toBe(0);
  });

  it('markingLockStates: o pai trancado marca todos os descendentes como herdados', () => {
    const { actions, store } = setup();
    actions.setMarkingLocked('M1', true);
    expect(Object.fromEntries(markingLockStates(current(store)))).toEqual({
      M1: 'self',
      M2: 'inherited',
      M3: 'inherited',
    });
  });
});
