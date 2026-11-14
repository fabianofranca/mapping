import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, sampleProject } from '../model/fixtures';

// CF6: the drawing mode goes through store actions, one undo entry each.

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

describe('drawing mode actions', () => {
  it('setProjectDrawingMode writes, undoes with one entry and removes with null', () => {
    const { store, actions, project } = setup();
    expect(project().drawingMode).toBeUndefined();
    expect(actions.setProjectDrawingMode('dark').ok).toBe(true);
    expect(project().drawingMode).toBe('dark');
    expect(actions.setProjectDrawingMode('light').ok).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project().drawingMode).toBe('dark');
    expect(store.undo()).toBe(true);
    expect(project().drawingMode).toBeUndefined();
    expect(store.canUndo.value).toBe(false);
    actions.setProjectDrawingMode('dark');
    actions.setProjectDrawingMode(null);
    expect(project().drawingMode).toBeUndefined();
  });

  it('setContainerDrawingMode pins, goes back to following the project with null and undoes', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    expect(actions.setContainerDrawingMode(id, 'dark').ok).toBe(true);
    expect(project().containers[0]?.drawingMode).toBe('dark');
    expect(actions.setContainerDrawingMode(id, null).ok).toBe(true);
    expect(project().containers[0]?.drawingMode).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.drawingMode).toBe('dark');
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.drawingMode).toBeUndefined();
  });

  it('an invalid mode and a nonexistent container return an error, without changing the project', () => {
    const { actions, project } = setup();
    const before = project();
    expect(actions.setProjectDrawingMode('Dark!').ok).toBe(false);
    expect(actions.setContainerDrawingMode('nothing', 'dark').ok).toBe(false);
    expect(project()).toBe(before);
  });
});
