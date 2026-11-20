import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  setContainerDensity,
  setContainerPlacement,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { marking } from '../model/fixtures';

// Stage #2210: through the store actions, a component that the geometry moves to another space keeps
// its size in units (the store passes `minSizeOf`), in one undo entry per gesture.

const catalog = testCatalog();
const TEXT_AT: Rect = { x: 5000, y: 100, width: 100, height: 40 };

/** I1 (1000 × 800 at the canvas origin, scale 1) with density 2, and a `text` component of the test library on the canvas. */
function setup() {
  let p: Project = setContainerDensity(componentProject(), 'I1', 2);
  p = setContainerPlacement(p, 'I1', { x: 0, y: 0, scale: 1 });
  p = addComponentMarking(
    p,
    catalog,
    {
      markingId: 'T',
      annotationId: 'AT',
      containerId: null,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: TEXT_AT,
    },
    approximateMeasurer,
  );
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(p);
  return { store, actions };
}

const current = (store: ProjectStore): Project => store.project.value as Project;

function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

describe('a component keeps its units through the store actions', () => {
  it('the move gesture from the canvas into a density 2 container doubles the rect, in one entry', () => {
    const { store, actions } = setup();
    expect(actions.beginGesture().ok).toBe(true);
    // Canvas (100, 100): fully inside I1.
    actions.previewMarkingMove('T', -4900, 0);
    // The preview does not anticipate the conversion: the box still has its old size.
    expect(marking(current(store), 'T').rect).toMatchObject({ width: 100, height: 40 });
    expect(actions.finishMarkingMove('T', -4900, 0).ok).toBe(true);
    actions.commitGesture();
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: 'I1',
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: null,
      rect: TEXT_AT,
    });
  });

  it('moveMarking (the keyboard path) does the same', () => {
    const { store, actions } = setup();
    expect(actions.moveMarking('T', -4900, 0).ok).toBe(true);
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: 'I1',
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    expect(undoDepth(store)).toBe(1);
  });

  it('Floating on halves the component on the canvas and Floating off doubles it back', () => {
    const { store, actions } = setup();
    expect(actions.moveMarking('T', -4900, 0).ok).toBe(true);
    expect(actions.setMarkingFloating('T', true).ok).toBe(true);
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: null,
      floating: true,
      rect: { x: 100, y: 100, width: 100, height: 40 },
    });
    expect(actions.setMarkingFloating('T', false).ok).toBe(true);
    expect(marking(current(store), 'T')).toMatchObject({
      containerId: 'I1',
      floating: false,
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    // Undo restores each step.
    store.undo();
    expect(marking(current(store), 'T').rect).toEqual({
      x: 100,
      y: 100,
      width: 100,
      height: 40,
    });
  });
});
