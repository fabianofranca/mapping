import { describe, expect, it } from 'vitest';
import { validateProject, type ItemRef, type Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW } from '../model/fixtures';
import { multiProjectAnnotated } from '../model/multiSelectionFixtures';

// Multiple selection (ME2): the joint drag is a gesture with N operations per preview over the base,
// "all or nothing", and one undo entry at the end; deleting and locking the selection are one entry.
// Fixture: see tests/model/multiSelectionFixtures.ts (A, B, C, D, E; G, G2, H and the floating N).

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
  if (!store.project.value) throw new Error('no project');
  return store.project.value;
};
const container = (store: Store, id: string) =>
  project(store).containers.find((c) => c.id === id);
const marking = (store: Store, id: string) =>
  project(store).markings.find((m) => m.id === id);

describe('store: arrow step', () => {
  const items = [img('A'), mark('N'), mark('b1')];

  it('previews add up the offset from the start of the gesture and the final one writes one entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewItemsNudge(items, 1, 0).ok).toBe(true);
    expect(actions.previewItemsNudge(items, 3, 0).ok).toBe(true);
    // b1 moves 3 px of B image (scale 2), N and A move 3 canvas units.
    expect(marking(store, 'b1')?.rect.x).toBe(53);
    expect(marking(store, 'N')?.rect.x).toBe(103);
    expect(container(store, 'A')?.placement.x).toBe(3);
    expect(store.canUndo.value).toBe(false);
    expect(actions.finishItemsNudge(items, 3, 0).ok).toBe(true);
    actions.commitGesture();
    expect(store.revision.value).toBe(1);
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
  });

  it('all or nothing: the step that does not fit stays at the last valid preview', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    // c1 is glued to the edge of C: the whole step is refused.
    expect(actions.previewItemsNudge([mark('N'), mark('c1')], 1, 0)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    expect(marking(store, 'N')?.rect.x).toBe(100);
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });
});

describe('store: joint drag', () => {
  // A (container), N (floating, on the canvas) and b1 (marking of container B, scale 2).
  const items = [img('A'), mark('N'), mark('b1')];

  it('several previews, one invalid in the middle, and one undo entry at the end', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);

    expect(actions.previewItemsMove(items, 40, 20).ok).toBe(true);
    expect(container(store, 'A')?.placement).toEqual({ x: 40, y: 20, scale: 1 });
    expect(actions.previewItemsMove(items, 100, 50).ok).toBe(true);
    expect(marking(store, 'N')?.rect).toMatchObject({ x: 200, y: 1350 });
    expect(marking(store, 'b1')?.rect).toMatchObject({ x: 100, y: 75 });
    // Membership stays frozen during the drag.
    expect(container(store, 'A')?.parentId).toBe('G2');

    // b1 would leave B (500 px): refused, and the whole preview stays at the last valid position.
    expect(actions.previewItemsMove(items, 1500, 0)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(store, 'N')?.rect).toMatchObject({ x: 200, y: 1350 });

    // Nothing entered the history nor the confirmed one, until release.
    expect(store.canUndo.value).toBe(false);
    expect(store.committed.value).toBe(before);
    expect(store.revision.value).toBe(0);

    expect(actions.finishItemsMove(items, 100, 50).ok).toBe(true);
    // The settle redid the membership: A went past the edge of G2 and ended up in G.
    expect(container(store, 'A')?.parentId).toBe('G');
    actions.commitGesture();

    expect(store.revision.value).toBe(1);
    expect(validateProject(project(store))).toEqual([]);
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });

    // One undo brings everything back: containers, canvas marking and the marking of the other container.
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
    // Redo goes back to the result of the whole gesture.
    expect(store.redo()).toBe(true);
    expect(container(store, 'A')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(store, 'b1')?.rect).toMatchObject({ x: 100, y: 75 });
  });

  it('a final that would overlap a fixed container touches it and settles, in one entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const pair = [img('A'), mark('N')];
    actions.beginGesture();
    expect(actions.previewItemsMove(pair, 100, 50).ok).toBe(true);
    // The final one asks for 1500, which would put A over B (which does not move): A touches B (x = 1000).
    expect(actions.finishItemsMove(pair, 1500, 0).ok).toBe(true);
    expect(container(store, 'A')?.placement).toEqual({ x: 1000, y: 0, scale: 1 });
    actions.commitGesture();
    expect(validateProject(project(store))).toEqual([]);
    expect(container(store, 'A')?.placement).toEqual({ x: 1000, y: 0, scale: 1 });
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
  });

  it('the settle of the final one takes the containers out of the marking, in a single entry', () => {
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

  it('locked item: the preview fails, nothing changes and the gesture without a change does not enter the history', () => {
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
    // Only the lock (one entry): the gesture added none.
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });

  it('cancelling goes back to the start without history', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewItemsMove(items, 100, 50);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('a container marking that would leave the container: the preview is refused', () => {
    const { actions } = setup();
    actions.beginGesture();
    expect(actions.previewItemsMove([mark('c1')], 10, 0)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    actions.cancelGesture();
  });
});

describe('store: delete and lock the selection', () => {
  it('removeItems deletes everything in one undo entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const result = actions.removeItems([mark('G'), img('A'), mark('a1'), img('B')]);
    expect(result.ok).toBe(true);
    const after = project(store);
    expect(after.containers.map((c) => c.id)).toEqual(['C', 'D', 'E']);
    // The settle took C out of the marking that left.
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

  it('removeItems with a locked item fails without an entry; nonexistent ones do nothing', () => {
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
    expect(store.undo()).toBe(true); // only the lock
    expect(store.canUndo.value).toBe(false);
  });

  it('setItemsLocked locks and unlocks the selection in one entry each; without a change there is no entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const items = [mark('G'), img('A'), mark('a1')];
    expect(actions.setItemsLocked(items, true).ok).toBe(true);
    expect(marking(store, 'G')?.locked).toBe(true);
    expect(container(store, 'A')?.locked).toBe(true);
    expect(marking(store, 'a1')?.locked).toBe(true);
    expect(marking(store, 'a2')?.locked).toBe(false);
    expect(store.revision.value).toBe(1);
    // Repeating changes nothing: no new entry.
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

  it('wrapItems creates the parent marking, returns the id and is one undo entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const result = actions.wrapItems([mark('a1'), mark('a3')]);
    expect(result).toEqual({ ok: true, value: 'x' });
    expect(marking(store, 'x')?.containerId).toBe('A');
    expect(marking(store, 'a1')?.parentId).toBe('x');
    expect(marking(store, 'a3')?.parentId).toBe('x');
    expect(store.revision.value).toBe(1);
    expect(store.undo()).toBe(true);
    expect(marking(store, 'x')).toBeUndefined();
    expect(project(store).markings).toEqual(before.markings);
    expect(store.canUndo.value).toBe(false);
  });

  it('wrapItems with nothing that fits in fails without an entry', () => {
    const { store, actions } = setup();
    expect(actions.wrapItems([mark('N')])).toEqual({
      ok: false,
      error: 'invalid-parent',
    });
    expect(store.canUndo.value).toBe(false);
  });

  it('the actions respect the gesture lock', () => {
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

describe('store: the drag that touches (R12.10)', () => {
  // B (2000..3000 on the canvas) against C (4000), which does not move: the pointer asks for 1500, 1000 fit.
  it('B alone ends up touching C, in one undo entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    expect(actions.previewItemsMove([img('B')], 800, 0).ok).toBe(true);
    // The pointer went past C: the preview follows the largest offset without overlap.
    expect(actions.previewItemsMove([img('B')], 1500, 0).ok).toBe(true);
    expect(container(store, 'B')?.placement.x).toBe(3000);
    expect(actions.finishItemsMove([img('B')], 1500, 0).ok).toBe(true);
    actions.commitGesture();
    // Equal edges: the right of B (3000 + 1000) is the left of C.
    expect(container(store, 'B')?.placement.x).toBe(3000);
    expect(container(store, 'C')?.placement.x).toBe(4000);
    expect(validateProject(project(store))).toEqual([]);
    expect(store.revision.value).toBe(1);
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(store.canUndo.value).toBe(false);
  });

  it('B in the selection (with A and a marking) touches C, in a single entry', () => {
    const { store, actions } = setup();
    const items = [img('A'), img('B'), mark('N')];
    actions.beginGesture();
    expect(actions.previewItemsMove(items, 1500, 0).ok).toBe(true);
    expect(actions.finishItemsMove(items, 1500, 0).ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'B')?.placement.x).toBe(3000);
    expect(container(store, 'A')?.placement.x).toBe(1000);
    expect(marking(store, 'N')?.rect.x).toBe(1100);
    expect(validateProject(project(store))).toEqual([]);
    expect(store.revision.value).toBe(1);
  });

  it('slides: touches in x and the asked y continues', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    expect(actions.previewItemsMove([img('B')], 1500, 200).ok).toBe(true);
    expect(actions.finishItemsMove([img('B')], 1500, 200).ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'B')?.placement).toMatchObject({ x: 3000, y: 200 });
  });

  it('the drag of the container alone (previewImagePlacement) also touches', () => {
    const { store, actions } = setup();
    const start = container(store, 'B')?.placement;
    if (!start) throw new Error('no B');
    actions.beginGesture();
    expect(actions.previewImagePlacement('B', { ...start, x: 3500 }).ok).toBe(true);
    expect(actions.finishImagePlacement('B').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'B')?.placement.x).toBe(3000);
    expect(store.revision.value).toBe(1);
  });
});
