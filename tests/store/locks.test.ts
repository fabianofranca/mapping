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
  if (!p) throw new Error('no project');
  return p;
};

describe('store: lock', () => {
  it('locking and unlocking go into the undo', () => {
    const { store, actions } = setup();
    expect(actions.setMarkingLocked('M1', true).ok).toBe(true);
    expect(actions.setImageLocked('I2', true).ok).toBe(true);
    expect(store.revision.value).toBe(2);
    expect(actions.setMarkingLocked('M1', false).ok).toBe(true);
    expect(current(store).markings[0]?.locked).toBe(false);

    expect(store.undo()).toBe(true); // brings back the M1 lock
    expect(current(store).markings[0]?.locked).toBe(true);
    expect(store.undo()).toBe(true); // undoes the I2 lock
    expect(current(store).containers[1]?.locked).toBe(false);
    expect(store.undo()).toBe(true); // undoes the M1 lock
    expect(current(store).markings[0]?.locked).toBe(false);
    expect(store.redo()).toBe(true);
    expect(current(store).markings[0]?.locked).toBe(true);
  });

  it('"lock all the markings of the image" is a single history entry', () => {
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

  it('repeating the current state does not create a history entry', () => {
    const { store, actions } = setup();
    expect(actions.setMarkingLocked('M1', false).ok).toBe(true);
    expect(actions.setImageMarkingsLocked('I1', false).ok).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('the actions that touch the geometry or delete come back with a "locked" error, changing nothing', () => {
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
    expect(actions.removeContainer('I2')).toEqual({ ok: false, error: 'locked' });
    expect(current(store)).toBe(before);
  });

  it('a locked descendant does not block the parent: moving takes the child along and deleting takes it away, with one undo each', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('M3', true);
    const rect = (id: string) => current(store).markings.find((m) => m.id === id)?.rect;
    const before = rect('M3');
    expect(actions.moveMarking('M1', 10, 5).ok).toBe(true);
    expect(rect('M3')).toEqual({
      ...before,
      x: (before?.x ?? 0) + 10,
      y: (before?.y ?? 0) + 5,
    });
    expect(store.undo()).toBe(true);
    expect(rect('M3')).toEqual(before);

    expect(actions.removeMarking('M1').ok).toBe(true);
    expect(current(store).markings.map((m) => m.id)).toEqual(['M4']);
    expect(store.undo()).toBe(true);
    expect(current(store).markings.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(current(store).markings.find((m) => m.id === 'M3')?.locked).toBe(true);
  });

  it('a gesture of moving the parent takes the locked descendant along and becomes a single entry', () => {
    const { store, actions } = setup();
    actions.setMarkingLocked('M3', true);
    const revision = store.revision.value;
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M1', 20, 0).ok).toBe(true);
    actions.commitGesture();
    expect(store.revision.value).toBe(revision + 1);
    expect(current(store).markings.find((m) => m.id === 'M3')?.rect.x).toBe(1320);
  });

  it('a gesture over a locked item generates neither a preview nor an undo entry', () => {
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

  it('a gesture of moving a container inside a locked canvas marking does not become an entry', () => {
    const { store, actions } = setup();
    // Canvas marking around I1 and I2 (image I2 starts at 1050).
    const created = actions.createMarking(null, {
      x: -50,
      y: -50,
      width: 2200,
      height: 1100,
    });
    if (!created.ok) throw new Error('createMarking');
    expect(actions.setMarkingLocked(created.value, true).ok).toBe(true);
    const revision = store.revision.value;
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { x: 1100, y: 0, scale: 1 })).toEqual({
      ok: false,
      error: 'locked',
    });
    // The final one never fails, but it does not change anything either (the preview is the starting one).
    actions.finishImagePlacement('I2');
    actions.commitGesture();
    expect(store.revision.value).toBe(revision);
    expect(current(store).containers.find((i) => i.id === 'I2')?.placement.x).toBe(1050);
  });

  it('in a read-only project, locking fails', () => {
    const { actions } = setup(true);
    expect(actions.setMarkingLocked('M1', true)).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(actions.setImageMarkingsLocked('I1', true).ok).toBe(false);
  });
});

describe('derived state: markingLocks', () => {
  it('starts empty and follows the locks, own or inherited from the parent', () => {
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

  it('does not depend on a gesture preview', () => {
    const { derived, actions, store } = setup();
    actions.setMarkingLocked('M4', true);
    const before = derived.markingLocks.value;
    actions.beginGesture();
    actions.previewMarkingMove('M1', 10, 0);
    expect(derived.markingLocks.value).toBe(before);
    actions.cancelGesture();
    expect(store.gestureActive.value).toBe(false);
  });

  it('a locked canvas marking counts as a lock (hasLocks) and the inheritance reaches the descendants', () => {
    const { derived, actions } = setup();
    expect(derived.hasLocks.value).toBe(false);
    const outer = actions.createMarking(null, {
      x: -3000,
      y: -3000,
      width: 500,
      height: 500,
    });
    if (!outer.ok) throw new Error('createMarking');
    const inner = actions.createMarking(null, {
      x: -2900,
      y: -2900,
      width: 100,
      height: 100,
    });
    if (!inner.ok) throw new Error('createMarking');
    actions.setMarkingLocked(outer.value, true);
    expect(derived.hasLocks.value).toBe(true);
    expect(Object.fromEntries(derived.markingLocks.value)).toEqual({
      [outer.value]: 'self',
      [inner.value]: 'inherited',
    });
  });

  it('without a project, it is empty', () => {
    const store = createProjectStore();
    const derived = createEditorDerived(store, createEditorUi());
    expect(derived.markingLocks.value.size).toBe(0);
  });

  it('markingLockStates: the locked parent marks all the descendants as inherited', () => {
    const { actions, store } = setup();
    actions.setMarkingLocked('M1', true);
    expect(Object.fromEntries(markingLockStates(current(store)))).toEqual({
      M1: 'self',
      M2: 'inherited',
      M3: 'inherited',
    });
  });
});
