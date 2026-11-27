import { describe, expect, it } from 'vitest';
import { addContainer, createMarking, type Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, emptyProject } from '../model/fixtures';

// Decorative marking (stage #2826 DM4): the store action goes through one undo entry.

const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function cardProject(): Project {
  let p = addContainer(emptyProject(), {
    id: 'I1',
    file: 'images/a.png',
    width: 1000,
    height: 1000,
  });
  p = createMarking(p, { id: 'C', containerId: 'I1', rect: r(50, 50, 800, 500) });
  p = createMarking(p, { id: 'S1', containerId: 'I1', rect: r(100, 100, 100, 100) });
  return p;
}

function setup(project: Project = cardProject()) {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(project);
  const current = () => {
    if (!store.project.value) throw new Error('no project');
    return store.project.value;
  };
  const marking = (id: string) => {
    const m = current().markings.find((x) => x.id === id);
    if (!m) throw new Error(id);
    return m;
  };
  return { store, actions, marking };
}

describe('setMarkingDecorative', () => {
  it('toggles in one undo entry and undo restores the children', () => {
    const { store, actions, marking } = setup();
    expect(marking('S1').parentId).toBe('C');
    expect(actions.setMarkingDecorative('C', true).ok).toBe(true);
    expect(marking('C').decorative).toBe(true);
    expect(marking('S1').parentId).toBeNull();
    expect(store.undo()).toBe(true);
    expect(marking('C').decorative).toBe(false);
    expect(marking('S1').parentId).toBe('C');
    expect(store.canUndo.value).toBe(false);
  });

  it('turning it off again takes back what it contains', () => {
    const { actions, marking } = setup();
    actions.setMarkingDecorative('C', true);
    expect(actions.setMarkingDecorative('C', false).ok).toBe(true);
    expect(marking('S1').parentId).toBe('C');
  });

  it('a locked marking reports the lock error, as floating does', () => {
    const { actions, marking } = setup();
    actions.setMarkingLocked('C', true);
    const result = actions.setMarkingDecorative('C', true);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toBe('locked');
    expect(marking('C').decorative).toBe(false);
  });

  it('a floating marking cannot become decorative', () => {
    const { actions } = setup();
    actions.setMarkingFloating('C', true);
    const result = actions.setMarkingDecorative('C', true);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toBe('decorative-floating');
  });
});
