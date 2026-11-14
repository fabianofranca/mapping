import { describe, expect, it } from 'vitest';
import { effectiveDirection } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, sampleProject } from '../model/fixtures';

// Reading direction (schema v20): goes through store actions, one undo entry each.

function setup() {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(sampleProject());
  const project = () => {
    if (!store.project.value) throw new Error('no project');
    return store.project.value;
  };
  return { store, actions, project };
}

describe('reading direction actions', () => {
  it('setProjectDirection writes, undoes with one entry and removes with null', () => {
    const { store, actions, project } = setup();
    expect(project().direction).toBeUndefined();
    expect(actions.setProjectDirection('rtl').ok).toBe(true);
    expect(project().direction).toBe('rtl');
    expect(actions.setProjectDirection('ltr').ok).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project().direction).toBe('rtl');
    expect(store.undo()).toBe(true);
    expect(project().direction).toBeUndefined();
    expect(store.canUndo.value).toBe(false);
    actions.setProjectDirection('rtl');
    actions.setProjectDirection(null);
    expect(project().direction).toBeUndefined();
  });

  it('setContainerDirection pins, goes back to following the project with null and undoes', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    expect(actions.setContainerDirection(id, 'rtl').ok).toBe(true);
    expect(project().containers[0]?.direction).toBe('rtl');
    expect(effectiveDirection(project(), id)).toBe('rtl');
    expect(actions.setContainerDirection(id, null).ok).toBe(true);
    expect(project().containers[0]?.direction).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.direction).toBe('rtl');
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.direction).toBeUndefined();
  });

  it('what changes nothing does not open an undo entry', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    actions.setProjectDirection(null);
    actions.setContainerDirection(id, null);
    expect(store.canUndo.value).toBe(false);
  });

  it('a nonexistent container returns an error, without changing the project', () => {
    const { actions, project } = setup();
    const before = project();
    expect(actions.setContainerDirection('nothing', 'rtl').ok).toBe(false);
    expect(project()).toBe(before);
  });
});
