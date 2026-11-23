import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, sampleProject } from '../model/fixtures';

// CF6: the drawing mode goes through store actions, one undo entry each; per axis since schema v24 (NV3).

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
  it('setProjectDrawingAxis writes, undoes with one entry and removes with null', () => {
    const { store, actions, project } = setup();
    expect(project().drawingMode).toBeUndefined();
    expect(actions.setProjectDrawingAxis('mode', 'dark').ok).toBe(true);
    expect(project().drawingMode).toEqual({ mode: 'dark' });
    expect(actions.setProjectDrawingAxis('mode', 'light').ok).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project().drawingMode).toEqual({ mode: 'dark' });
    expect(store.undo()).toBe(true);
    expect(project().drawingMode).toBeUndefined();
    expect(store.canUndo.value).toBe(false);
    actions.setProjectDrawingAxis('mode', 'dark');
    actions.setProjectDrawingAxis('mode', null);
    expect(project().drawingMode).toBeUndefined();
  });

  it('setContainerDrawingAxis pins, goes back to following the project with null and undoes', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    expect(actions.setContainerDrawingAxis(id, 'mode', 'dark').ok).toBe(true);
    expect(project().containers[0]?.drawingMode).toEqual({ mode: 'dark' });
    expect(actions.setContainerDrawingAxis(id, 'mode', null).ok).toBe(true);
    expect(project().containers[0]?.drawingMode).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.drawingMode).toEqual({ mode: 'dark' });
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.drawingMode).toBeUndefined();
  });

  it('an invalid mode and a nonexistent container return an error, without changing the project', () => {
    const { actions, project } = setup();
    const before = project();
    expect(actions.setProjectDrawingAxis('mode', 'Dark!').ok).toBe(false);
    expect(actions.setContainerDrawingAxis('nothing', 'mode', 'dark').ok).toBe(false);
    expect(project()).toBe(before);
  });

  it('two axes are two entries; removing one keeps the other; the last removal removes the map', () => {
    const { store, actions, project } = setup();
    expect(actions.setProjectDrawingAxis('theme', 'dark').ok).toBe(true);
    expect(actions.setProjectDrawingAxis('contrast', 'high').ok).toBe(true);
    expect(project().drawingMode).toEqual({ theme: 'dark', contrast: 'high' });
    expect(actions.setProjectDrawingAxis('theme', null).ok).toBe(true);
    expect(project().drawingMode).toEqual({ contrast: 'high' });
    expect(store.undo()).toBe(true);
    expect(project().drawingMode).toEqual({ theme: 'dark', contrast: 'high' });
    const id = project().containers[0]?.id ?? '';
    expect(actions.setContainerDrawingAxis(id, 'contrast', 'normal').ok).toBe(true);
    expect(project().containers[0]?.drawingMode).toEqual({ contrast: 'normal' });
  });
});
