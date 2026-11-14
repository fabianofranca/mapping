import { describe, expect, it } from 'vitest';
import { validateProject, type Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW } from '../model/fixtures';
import { arrowBase, arrowProject } from '../model/arrowFixtures';

// Arrows in the store (ME4): each action is an undo entry; the route and the head also have
// a gesture preview, and a gesture is a single entry. Fixture: tests/model/arrowFixtures.ts.

function setup(project: Project = arrowProject()) {
  let clock = 0;
  let next = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  const actions = createProjectActions(store, { newId: () => `id${++next}` });
  store.load(project);
  return { store, actions };
}

type Store = ReturnType<typeof createProjectStore>;

const project = (store: Store): Project => {
  if (!store.project.value) throw new Error('no project');
  return store.project.value;
};
const arrow = (store: Store, id: string) =>
  project(store).arrows.find((a) => a.id === id);

describe('store: arrow actions', () => {
  it('addArrow returns the id, creates the arrow with the default route and enters the undo', () => {
    const { store, actions } = setup(arrowBase());
    const result = actions.addArrow('a1', 'b1');
    expect(result).toEqual({ ok: true, value: 'id1' });
    expect(arrow(store, 'id1')).toMatchObject({
      from: 'a1',
      to: 'b1',
      style: 'curve',
      points: [],
      fromSide: null,
      locked: false,
    });
    expect(store.revision.value).toBe(1);
    expect(store.undo()).toBe(true);
    expect(project(store).arrows).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(arrow(store, 'id1')).toBeDefined();
  });

  it('addArrow accepts style, name and sides', () => {
    const { store, actions } = setup(arrowBase());
    actions.addArrow('a1', 'b1', {
      style: 'straight',
      name: 'opens',
      fromSide: 'top',
      toSide: 'left',
    });
    expect(arrow(store, 'id1')).toMatchObject({
      style: 'straight',
      name: 'opens',
      fromSide: 'top',
      toSide: 'left',
    });
  });

  it('refusals return the error code and do not enter the history', () => {
    const { store, actions } = setup();
    expect(actions.addArrow('a1', 'a1')).toEqual({ ok: false, error: 'arrow-self' });
    expect(actions.addArrow('r1', 'a1')).toEqual({ ok: false, error: 'arrow-endpoint' });
    expect(actions.addArrow('a1', 'zz')).toEqual({ ok: false, error: 'not-found' });
    expect(actions.setArrowEndpoint('r1', 'to', 'a1', null)).toEqual({
      ok: false,
      error: 'arrow-self',
    });
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
  });

  it('each action is an undo entry', () => {
    const { store, actions } = setup();
    expect(actions.setArrowStyle('r1', 'elbow').ok).toBe(true);
    expect(actions.setArrowName('r1', 'opens').ok).toBe(true);
    expect(actions.setArrowRoute('r1', [{ x: 500, y: 100 }]).ok).toBe(true);
    expect(actions.setArrowEndpoint('r1', 'to', 'a2', 'top').ok).toBe(true);
    expect(actions.setArrowLocked('r1', true).ok).toBe(true);
    expect(store.revision.value).toBe(5);
    expect(arrow(store, 'r1')).toMatchObject({
      style: 'elbow',
      name: 'opens',
      to: 'a2',
      toSide: 'top',
      locked: true,
      points: [{ x: 500, y: 100 }],
    });
    for (let i = 0; i < 5; i++) expect(store.undo()).toBe(true);
    expect(arrow(store, 'r1')).toMatchObject({
      style: 'curve',
      name: null,
      to: 'a3',
      toSide: null,
      locked: false,
      points: [],
    });
    expect(store.canUndo.value).toBe(false);
  });

  it('an action that changes nothing does not create an entry', () => {
    const { store, actions } = setup();
    expect(actions.setArrowStyle('r1', 'curve').ok).toBe(true);
    expect(actions.setArrowRoute('r1', []).ok).toBe(true);
    expect(actions.setArrowLocked('r1', false).ok).toBe(true);
    expect(actions.setArrowEndpoint('r1', 'to', 'a3', null).ok).toBe(true);
    expect(store.revision.value).toBe(0);
    expect(store.canUndo.value).toBe(false);
  });

  it('the locked arrow refuses route, head and style, but accepts the name', () => {
    const { actions } = setup();
    actions.setArrowLocked('r1', true);
    expect(actions.setArrowRoute('r1', [{ x: 1, y: 1 }])).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(actions.setArrowStyle('r1', 'elbow')).toEqual({ ok: false, error: 'locked' });
    expect(actions.setArrowEndpoint('r1', 'to', 'a2', null)).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(actions.removeArrow('r1')).toEqual({ ok: false, error: 'locked' });
    expect(actions.setArrowName('r1', 'ok').ok).toBe(true);
  });

  it('removeArrow deletes the arrow and its annotations in a single entry', () => {
    const { store, actions } = setup();
    expect(actions.removeArrow('r1').ok).toBe(true);
    expect(project(store).arrows).toEqual([]);
    expect(project(store).annotations).toEqual([]);
    expect(store.undo()).toBe(true);
    expect(arrow(store, 'r1')).toBeDefined();
    expect(project(store).annotations.map((a) => a.id)).toEqual(['ra1', 'ra2']);
  });

  it('deleting the marking takes the arrow along, and undo returns everything in a single entry', () => {
    const { store, actions } = setup();
    expect(actions.removeMarking('a1').ok).toBe(true);
    expect(project(store).arrows).toEqual([]);
    expect(validateProject(project(store))).toEqual([]);
    expect(store.undo()).toBe(true);
    expect(arrow(store, 'r1')).toBeDefined();
    expect(project(store).annotations.map((a) => a.id)).toEqual(['ra1', 'ra2']);
  });

  it('removeItems and setItemsLocked reach the arrows', () => {
    const { store, actions } = setup();
    expect(actions.setItemsLocked([{ kind: 'arrow', id: 'r1' }], true).ok).toBe(true);
    expect(arrow(store, 'r1')?.locked).toBe(true);
    expect(actions.removeItems([{ kind: 'arrow', id: 'r1' }])).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(actions.setItemsLocked([{ kind: 'arrow', id: 'r1' }], false).ok).toBe(true);
    expect(actions.removeItems([{ kind: 'arrow', id: 'r1' }]).ok).toBe(true);
    expect(project(store).arrows).toEqual([]);
  });
});

describe('store: route and head gesture', () => {
  it('several route previews are one undo entry at the end', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);
    for (let x = 100; x <= 500; x += 100) {
      expect(actions.previewArrowRoute('r1', [{ x, y: 50 }]).ok).toBe(true);
    }
    expect(arrow(store, 'r1')?.points).toEqual([{ x: 500, y: 50 }]);
    // Nothing entered the history nor the committed one until release.
    expect(store.canUndo.value).toBe(false);
    expect(store.committed.value).toBe(before);
    expect(store.revision.value).toBe(0);
    actions.commitGesture();
    expect(store.revision.value).toBe(1);
    expect(arrow(store, 'r1')?.points).toEqual([{ x: 500, y: 50 }]);
    expect(store.undo()).toBe(true);
    expect(arrow(store, 'r1')?.points).toEqual([]);
    expect(store.canUndo.value).toBe(false);
  });

  it('canceling the gesture goes back to the project from the start', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewArrowRoute('r1', [{ x: 10, y: 10 }]);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('dragging the head: previews up to other markings, an invalid one in the middle, and one entry', () => {
    const { store, actions } = setup();
    actions.setArrowRoute('r1', [{ x: 500, y: 100 }]);
    const revision = store.revision.value;
    actions.beginGesture();
    expect(actions.previewArrowEndpoint('r1', 'to', 'a2', null).ok).toBe(true);
    expect(arrow(store, 'r1')?.to).toBe('a2');
    // Releasing over the other end is refused; the preview stays on the last valid one.
    expect(actions.previewArrowEndpoint('r1', 'to', 'a1', null)).toEqual({
      ok: false,
      error: 'arrow-self',
    });
    expect(arrow(store, 'r1')?.to).toBe('a2');
    // Up to another container: the route stops being its own and is deleted.
    expect(actions.previewArrowEndpoint('r1', 'to', 'b1', 'left').ok).toBe(true);
    expect(arrow(store, 'r1')).toMatchObject({ to: 'b1', toSide: 'left', points: [] });
    actions.commitGesture();
    expect(store.revision.value).toBe(revision + 1);
    expect(store.undo()).toBe(true);
    expect(arrow(store, 'r1')).toMatchObject({
      to: 'a3',
      toSide: null,
      points: [{ x: 500, y: 100 }],
    });
  });

  it('without a change, the gesture does not create an entry', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    actions.previewArrowRoute('r1', []);
    actions.commitGesture();
    expect(store.revision.value).toBe(0);
    expect(store.canUndo.value).toBe(false);
  });
});
