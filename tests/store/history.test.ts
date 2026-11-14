import { effect } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  moveContainer,
  moveMarking,
  renameLayer,
  renameProject,
  validateProject,
} from '../../src/model';
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
  if (!store.project.value) throw new Error('no project');
  return store.project.value;
};

describe('store: actions and history', () => {
  it('without an open project, the actions fail', () => {
    const store = createProjectStore();
    expect(store.apply((p) => p)).toEqual({ ok: false, error: 'no-project' });
    expect(store.undo()).toBe(false);
  });

  it('applies, undoes and redoes', () => {
    const { store, actions } = setup();
    const original = project(store);
    expect(store.canUndo.value).toBe(false);

    expect(actions.renameLayer('L1', 'Painting')).toEqual({ ok: true, value: undefined });
    expect(project(store).layers[0]?.name).toBe('Painting');
    expect(project(store).project.updatedAt).not.toBe(original.project.updatedAt);
    expect(store.canUndo.value).toBe(true);
    expect(store.revision.value).toBe(1);

    expect(store.undo()).toBe(true);
    // pt-BR kept: shared fixture data (the sampleProject layer name 'Lataria') asserted by tests/mcp and tests/components
    expect(project(store).layers[0]?.name).toBe('Lataria');
    expect(store.canRedo.value).toBe(true);

    expect(store.redo()).toBe(true);
    expect(project(store).layers[0]?.name).toBe('Painting');
    expect(store.canRedo.value).toBe(false);
  });

  it('a new change clears the redo', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.undo();
    actions.renameLayer('L1', 'B');
    expect(store.canRedo.value).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it('a model error changes neither the project nor the history', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.removeLayer('L9')).toEqual({ ok: false, error: 'not-found' });
    expect(
      actions.setMarkingRect('M3', { x: 1300, y: 1250, width: 5, height: 50 }),
    ).toEqual({ ok: false, error: 'rect-too-small' });
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('an operation that changes nothing does not enter the history', () => {
    const { store } = setup();
    store.apply((p) => p);
    expect(store.canUndo.value).toBe(false);
  });

  it('actions that create items return the generated id', () => {
    const { store, actions } = setup();
    const layer = actions.addLayer('Tires', '#000000');
    expect(layer).toEqual({ ok: true, value: 'id1' });
    const m = actions.createMarking('I1', { x: 1700, y: 1700, width: 100, height: 100 });
    expect(m).toEqual({ ok: true, value: 'id2' });
    const a = actions.addAnnotation('id2', 'id1', null, [{ key: 'k', value: 'v' }]);
    expect(a).toEqual({ ok: true, value: 'id3' });
    expect(project(store).markings.find((x) => x.id === 'id2')?.parentId).toBe('M1');
  });

  it('limits the history to 100 entries', () => {
    const { store } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      store.apply((p) => renameLayer(p, 'L1', `n${i}`));
    }
    let undos = 0;
    while (store.undo()) undos++;
    expect(undos).toBe(HISTORY_LIMIT);
    expect(project(store).layers[0]?.name).toBe('n19');
  });

  it('referencedImageFiles gathers the images of the project and of the whole history', () => {
    const store = createProjectStore({ now: () => NOW });
    let seq = 0;
    const actions = createProjectActions(store, { newId: () => `id${++seq}` });
    store.load(emptyProject());
    expect(actions.addContainer({ file: 'images/a.jpg', width: 10, height: 10 }).ok).toBe(
      true,
    );
    expect(actions.addContainer({ file: 'images/b.jpg', width: 10, height: 10 }).ok).toBe(
      true,
    );
    const containerId = (file: string) =>
      project(store).containers.find((i) => i.file === file)?.id ?? '';
    actions.removeContainer(containerId('images/a.jpg'));
    expect(project(store).containers.map((i) => i.file)).toEqual(['images/b.jpg']);
    // a.jpg left the project, but undo would still restore it.
    expect([...store.referencedImageFiles()].sort()).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);

    // Undo everything: a.jpg and b.jpg stay only in the "redo".
    while (store.undo());
    expect(project(store).containers).toEqual([]);
    expect([...store.referencedImageFiles()].sort()).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);

    // A new change discards the "redo": nothing references the images anymore.
    store.apply((p) => renameLayer(p, 'L1', 'new'));
    expect(store.referencedImageFiles().size).toBe(0);
  });

  it('read-only mode blocks changes', () => {
    const store = createProjectStore();
    store.load(emptyProject(), { readOnly: true });
    expect(store.apply((p) => renameLayer(p, 'L1', 'x'))).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(store.beginGesture()).toEqual({ ok: false, error: 'read-only' });
  });

  it('loading another project resets the history', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.load(emptyProject());
    expect(store.canUndo.value).toBe(false);
    store.close();
    expect(store.project.value).toBeNull();
  });
});

describe('store: gestures', () => {
  it('a gesture generates a single history entry', () => {
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

  it('an invalid preview keeps the last valid position', () => {
    const { store } = setup();
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    const result = store.updateGesture((p) => moveContainer(p, 'I2', 500, 0));
    expect(result).toEqual({ ok: false, error: 'image-overlap' });
    expect(project(store).containers[1]?.placement.x).toBe(1200);
    store.commitGesture();
    expect(project(store).containers[1]?.placement.x).toBe(1200);
  });

  it('cancelling goes back to the start without history', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    store.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('a gesture without a change does not enter the history', () => {
    const { store } = setup();
    store.beginGesture();
    store.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });

  it('gesture actions: move image with previews, overlap and one entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const start = before.containers[1]?.placement;
    if (!start) throw new Error('no I2');
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { ...start, y: 900 }).ok).toBe(true);
    // On top of I1 (0..1000 × 0..750): touches it (x = 1000) and slides in the asked y.
    expect(actions.previewImagePlacement('I2', { ...start, x: 100, y: 100 }).ok).toBe(
      true,
    );
    expect(project(store).containers[1]?.placement).toEqual({
      ...start,
      x: 1000,
      y: 100,
    });
    actions.commitGesture();
    expect(project(store).containers[1]?.placement).toEqual({
      ...start,
      x: 1000,
      y: 100,
    });
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(store.undo()).toBe(false);
  });

  it('gesture actions: resize and cancel', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewImagePlacement('I1', { x: 0, y: 0, scale: 0.1 });
    expect(project(store).containers[0]?.placement.scale).toBe(0.1);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('during the gesture, other actions and undo stay blocked', () => {
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
  it('gesture actions: move the marking with its children, without trapping, and settle on release in one entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const rectOf = (id: string) => project(store).markings.find((m) => m.id === id)?.rect;
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M1', 40.4, -10);
    actions.previewMarkingMove('M1', 100.4, -50.6);
    expect(rectOf('M1')).toMatchObject({ x: 1100, y: 949 });
    expect(rectOf('M3')).toMatchObject({ x: 1400, y: 1199 });
    expect(actions.finishMarkingMove('M1', 100, -51).ok).toBe(true);
    actions.commitGesture();
    expect(rectOf('M1')).toMatchObject({ x: 1100, y: 949 });

    // Nothing traps the marking: it leaves the container (the `rect` goes past 4000 wide) and the
    // settle takes it to the canvas, where it is a marking without a parent.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M3', 10_000, 0).ok).toBe(true);
    expect(rectOf('M3')).toMatchObject({ x: 11_400 });
    expect(actions.finishMarkingMove('M3', 10_000, 0).ok).toBe(true);
    actions.commitGesture();
    const m3 = project(store).markings.find((m) => m.id === 'M3');
    expect(m3).toMatchObject({ containerId: null, parentId: null });
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
  });

  it('gesture actions: an invalid marking resize stays at the last valid preview', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    const ok = { x: 1000, y: 1000, width: 900, height: 900 };
    expect(actions.previewMarkingRect('M1', ok).ok).toBe(true);
    // Outside the container: refused, the last valid one stays.
    const bad = { x: 3900, y: 1000, width: 500, height: 100 };
    expect(actions.previewMarkingRect('M1', bad)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    expect(actions.finishMarkingRect('M1', ok).ok).toBe(true);
    actions.commitGesture();
    expect(project(store).markings.find((m) => m.id === 'M1')?.rect).toEqual(ok);
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });
});

// Spatial markings stage (ME1): previews do not settle and the final operation, within the same
// gesture, decides space and parent; undo brings everything back at once.
describe('store: gestures with settle (ME1)', () => {
  // sampleProject: I1 (4000×3000, scale 0.25: 1000×750 on the canvas) at (0, 0); I2 (1000×1000,
  // scale 1) to the right, at (1050, 0). M1 › M2 › M3 in I1; M4 in I2.
  const find = (store: ReturnType<typeof createProjectStore>, id: string) =>
    project(store).markings.find((m) => m.id === id);
  const container = (store: ReturnType<typeof createProjectStore>, id: string) =>
    project(store).containers.find((c) => c.id === id);

  it('moving a marking from A to B takes its children, converts the rect and undoes everything at once', () => {
    const { store, actions } = setup();
    const before = project(store);
    // M2 (1200,1200,400×200 in I1) is at (300, 300) on the canvas; taken to (1500, 400) it falls
    // entirely in I2: 1200 canvas units = 4800 pixels of I1; 100 = 400.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M2', 2400, 200).ok).toBe(true);
    // During the gesture the membership is frozen.
    expect(find(store, 'M2')).toMatchObject({ containerId: 'I1', parentId: 'M1' });
    expect(find(store, 'M3')).toMatchObject({ containerId: 'I1', parentId: 'M2' });
    expect(actions.previewMarkingMove('M2', 4800, 400).ok).toBe(true);
    expect(actions.finishMarkingMove('M2', 4800, 400).ok).toBe(true);
    // The confirmed one only changes on commit.
    expect(store.committed.value).toBe(before);
    actions.commitGesture();

    expect(find(store, 'M2')).toMatchObject({
      containerId: 'I2',
      parentId: null,
      rect: { x: 450, y: 400, width: 100, height: 50 },
    });
    // M3 went along (descendant) and is still a child of M2, now in pixels of I2.
    expect(find(store, 'M3')).toMatchObject({ containerId: 'I2', parentId: 'M2' });
    expect(validateProject(project(store))).toEqual([]);

    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
    // Redo goes back to the result of the whole gesture.
    expect(store.redo()).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I2');
  });

  it('the resize preview does not settle; releasing removes from the parent what stopped fitting', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);
    // M1 shrinks to the top left tip: M2 (1200..1600) stops fitting.
    const smaller = { x: 1000, y: 1000, width: 300, height: 300 };
    expect(actions.previewMarkingRect('M1', smaller).ok).toBe(true);
    expect(find(store, 'M2')?.parentId).toBe('M1'); // frozen in the preview
    expect(actions.finishMarkingRect('M1', smaller).ok).toBe(true);
    actions.commitGesture();
    expect(find(store, 'M1')?.rect).toEqual(smaller);
    expect(find(store, 'M2')?.parentId).toBeNull();
    expect(find(store, 'M3')?.parentId).toBe('M2');
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
  });

  it('moving a container out of and into a canvas marking, one entry each', () => {
    const { store, actions } = setup();
    // Canvas marking around only I1 (0..1000 × 0..750); I2 (from 1050) stays outside.
    const created = actions.createMarking(null, {
      x: -50,
      y: -50,
      width: 1100,
      height: 850,
    });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value : '';
    expect(container(store, 'I1')?.parentId).toBe(id);
    expect(container(store, 'I2')?.parentId).toBeNull();
    const afterCreate = project(store);

    // I1 goes far away: frozen during the gesture, released on release.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I1', { x: 4000, y: 0, scale: 0.25 }).ok).toBe(
      true,
    );
    expect(container(store, 'I1')?.parentId).toBe(id);
    expect(actions.finishImagePlacement('I1').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I1')?.parentId).toBeNull();

    // And it comes back: it becomes a member again.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I1', { x: 0, y: 0, scale: 0.25 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('I1').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I1')?.parentId).toBe(id);

    expect(store.undo()).toBe(true);
    expect(container(store, 'I1')?.parentId).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(afterCreate.containers);
  });

  it('the final of moving the container uses the last valid position', () => {
    const { store, actions } = setup();
    const start = container(store, 'I2')?.placement;
    if (!start) throw new Error('no I2');
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { ...start, y: 900 }).ok).toBe(true);
    // On top of I1: the preview touches it (x = 1000, y = 100); the final settles that position.
    expect(actions.previewImagePlacement('I2', { ...start, x: 100, y: 100 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('I2').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I2')?.placement).toEqual({ ...start, x: 1000, y: 100 });
  });

  it('the final operation never fails: if it fails, it settles the last valid preview', () => {
    const { store, actions } = setup();
    expect(actions.beginGesture().ok).toBe(true);
    const smaller = { x: 1000, y: 1000, width: 300, height: 300 };
    expect(actions.previewMarkingRect('M1', smaller).ok).toBe(true);
    // A rectangle outside the container would make the final fail...
    const bad = { x: 3900, y: 1000, width: 500, height: 100 };
    expect(actions.finishMarkingRect('M1', bad)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    // ...but the recorded preview is already settled (M2 left the parent that shrank).
    actions.commitGesture();
    expect(find(store, 'M1')?.rect).toEqual(smaller);
    expect(find(store, 'M2')?.parentId).toBeNull();
    expect(validateProject(project(store))).toEqual([]);
  });

  it('without a real change, the gesture does not enter the history', () => {
    const { store, actions } = setup();
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M2', 40, 40);
    // The final goes back to the starting point.
    expect(actions.finishMarkingMove('M2', 0, 0).ok).toBe(true);
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });

  it('actions outside a gesture settle (moving and resizing are geometry)', () => {
    const { store, actions } = setup();
    expect(actions.moveMarking('M2', 4800, 400).ok).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I2');
    expect(store.undo()).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I1');
    // Shrinking the parent over the child is accepted and the child leaves the membership.
    expect(
      actions.setMarkingRect('M1', { x: 1000, y: 1000, width: 100, height: 100 }).ok,
    ).toBe(true);
    expect(find(store, 'M2')?.parentId).toBeNull();
  });

  it('setMarkingFloating: the floating one goes to the canvas and undo brings it back', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.setMarkingFloating('M4', true).ok).toBe(true);
    expect(find(store, 'M4')).toMatchObject({
      floating: true,
      containerId: null,
      parentId: null,
    });
    expect(actions.setMarkingFloating('M4', false).ok).toBe(true);
    // Turning it off brings it back to the container that contains it whole (M4 is over I2).
    expect(find(store, 'M4')).toMatchObject({ floating: false, containerId: 'I2' });
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
  });

  it('a locked floating marking does not become plain nor the reverse', () => {
    const { actions } = setup();
    expect(actions.setMarkingLocked('M4', true).ok).toBe(true);
    expect(actions.setMarkingFloating('M4', true)).toEqual({
      ok: false,
      error: 'locked',
    });
  });
});

describe('store: confirmed project (committed)', () => {
  const committed = (store: ReturnType<typeof createProjectStore>) => {
    if (!store.committed.value) throw new Error('no project');
    return store.committed.value;
  };

  it('outside a gesture it is the same object as project', () => {
    const { store, actions } = setup();
    expect(store.committed.value).toBe(store.project.value);
    actions.renameLayer('L1', 'A');
    expect(store.committed.value).toBe(store.project.value);
    store.close();
    expect(store.committed.value).toBeNull();
  });

  it('during the gesture it stays on the starting project, even with the previews', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    expect(committed(store)).toBe(before);
    for (let dx = 10; dx <= 100; dx += 10) {
      store.updateGesture((p) => moveMarking(p, 'M1', dx, 0));
      expect(committed(store)).toBe(before);
    }
    expect(project(store)).not.toBe(before);
    expect(committed(store).markings[0]?.rect.x).toBe(1000);
  });

  it('commitGesture goes at once to the final project', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    const seen: unknown[] = [];
    const dispose = effect(() => {
      seen.push(store.committed.value);
    });
    store.commitGesture();
    dispose();
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings[0]?.rect.x).toBe(1100);
    // Initial value + the final one: no intermediate value.
    expect(seen).toEqual([before, project(store)]);
  });

  it('a gesture without a change keeps the same project', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.commitGesture();
    expect(committed(store)).toBe(before);
    expect(project(store)).toBe(before);
  });

  it('cancelGesture goes back to the starting project', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    store.cancelGesture();
    expect(committed(store)).toBe(before);
    expect(project(store)).toBe(before);
  });

  it('undo and redo update the confirmed project', () => {
    const { store, actions } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    store.commitGesture();
    const after = project(store);

    expect(store.undo()).toBe(true);
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings).toBe(before.markings);

    expect(store.redo()).toBe(true);
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings).toBe(after.markings);

    actions.renameLayer('L1', 'X');
    expect(committed(store).layers[0]?.name).toBe('X');
  });

  it('loading or closing during a gesture clears the confirmed project', () => {
    const { store } = setup();
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    const next = emptyProject();
    store.load(next);
    expect(committed(store)).toBe(next);
    store.beginGesture();
    store.close();
    expect(store.committed.value).toBeNull();
  });
});

describe('store: proposal review (stage 4)', () => {
  function linked() {
    const calls: string[] = [];
    const link = {
      tag: 'P1',
      undo: () => void calls.push('undo'),
      redo: () => void calls.push('redo'),
    };
    return { calls, link };
  }

  it('during the review the project is read-only: apply, gestures and undo are refused', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Before');
    store.setReviewing('P1');

    expect(store.reviewing.value).toBe(true);
    expect(actions.renameLayer('L1', 'After')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(store.beginGesture()).toEqual({ ok: false, error: 'reviewing' });
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(project(store).layers[0]?.name).toBe('Before');

    store.setReviewing(null);
    expect(actions.renameLayer('L1', 'After')).toEqual({ ok: true, value: undefined });
    expect(store.undo()).toBe(true);
  });

  it('an entry with an effect (applying the accepted ones) goes through the lock and undoes and redoes the effect together', () => {
    const { store } = setup();
    const { calls, link } = linked();
    store.setReviewing('P1');
    const original = project(store);

    const result = store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(project(store).layers[0]?.name).toBe('Applied');
    expect(store.canUndo.value).toBe(true);

    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    expect(project(store).layers[0]?.name).toBe(original.layers[0]?.name);
    expect(store.canRedo.value).toBe(true);

    expect(store.redo()).toBe(true);
    expect(calls).toEqual(['undo', 'redo']);
    expect(project(store).layers[0]?.name).toBe('Applied');
  });

  it('in the review you can only undo entries of the review itself, not the earlier ones', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'From before');
    store.setReviewing('P1');
    const { calls, link } = linked();
    store.apply((p) => renameLayer(p, 'L2', 'From the review'), { link });

    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    // The previous entry is from a normal edit: it waits until after the review.
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    store.setReviewing(null);
    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
  });

  it('in the review of P2, an entry linked to P1 neither undoes nor redoes; in that of P1, it does', () => {
    const { store } = setup();
    const { calls, link } = linked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado por P1'), { link });
    const withP1 = project(store);

    store.setReviewing('P2');
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(calls).toEqual([]);
    expect(project(store)).toBe(withP1);

    store.setReviewing('P1');
    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    expect(store.canRedo.value).toBe(true);

    store.setReviewing('P2');
    expect(store.canRedo.value).toBe(false);
    expect(store.redo()).toBe(false);
    expect(calls).toEqual(['undo']);

    store.setReviewing('P1');
    expect(store.redo()).toBe(true);
    expect(calls).toEqual(['undo', 'redo']);
  });

  it('the read-only project (new schema) keeps refusing even for the review entries', () => {
    const store = createProjectStore();
    store.load(sampleProject(), { readOnly: true });
    const { link } = linked();
    expect(store.apply((p) => p, { link })).toEqual({ ok: false, error: 'read-only' });
  });

  it('discardRedoOf discards the "redo" that has the proposal effect, and only it', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Normal');
    store.undo();
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(true);

    const { link } = linked();
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });
    store.undo();
    expect(store.canRedo.value).toBe(true);
    store.discardRedoOf('other');
    expect(store.canRedo.value).toBe(true);
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(false);
  });

  it('detachLinks removes the proposal link from the undo and the redo, keeping the entries (phase 9.2)', () => {
    const { store, actions } = setup();
    const { calls, link } = linked();
    const other = {
      tag: 'P2',
      undo: () => void calls.push('undo-P2'),
      redo: () => void calls.push('redo-P2'),
    };
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });
    actions.renameLayer('L2', 'Normal');
    store.apply((p) => renameProject(p, 'Other'), { link: other });
    store.undo();
    expect(calls).toEqual(['undo-P2']);
    expect(store.canRedo.value).toBe(true);

    store.detachLinks('P1');

    // The project undo and redo keep working, without calling the removed link.
    store.undo();
    store.undo();
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Applied');
    expect(store.canUndo.value).toBe(false);
    store.redo();
    store.redo();
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Applied');
    // The link of another proposal (P2) stays linked.
    store.redo();
    expect(calls).toEqual(['undo-P2', 'redo-P2']);
    // `discardRedoOf` no longer sees the removed proposal.
    store.undo();
    store.undo();
    store.undo();
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(true);
  });

  it('detachLinks without entries of that proposal does not touch the history', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Before');
    store.undo();
    store.detachLinks('P1');
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(true);
  });

  it('closing the project turns the review off; loading another (external reload) does not', () => {
    const { store } = setup();
    store.setReviewing('P1');
    store.load(sampleProject());
    expect(store.reviewing.value).toBe(true);
    store.close();
    expect(store.reviewing.value).toBe(false);
  });
});

describe('store: asynchronous history link (undo waits for the proposal write)', () => {
  function deferred() {
    let resolve: (r: { ok: true } | { ok: false; error: string }) => void = () => {};
    const promise = new Promise<{ ok: true } | { ok: false; error: string }>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  function asyncLinked() {
    const pending: ReturnType<typeof deferred>[] = [];
    const next = () => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    };
    return { pending, link: { tag: 'P1', undo: next, redo: next } };
  }

  it('with the undo pending, canUndo/canRedo are false and undo/redo refuse; resolved, they come back', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });

    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);

    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.canRedo.value).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
    pending[1]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.canUndo.value).toBe(true);
  });

  it('a write failure on undo: the step is reverted (project and stacks) and the error stays in sight', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });
    const applied = project(store);

    expect(store.undo()).toBe(true);
    pending[0]?.resolve({ ok: false, error: 'write-failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Applied');
    expect(project(store).layers).toEqual(applied.layers);
    expect(store.canUndo.value).toBe(true);
    expect(store.canRedo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('write-failed');
  });

  it('commit, undo and redo write the signals in a batch: an effect that reads the four runs once', () => {
    const { store } = setup();
    let runs = 0;
    const stop = effect(() => {
      void store.project.value;
      void store.revision.value;
      void store.canUndo.value;
      void store.canRedo.value;
      runs++;
    });
    try {
      for (const step of [
        () => store.apply((p) => renameLayer(p, 'L1', 'One')),
        () => store.undo(),
        () => store.redo(),
      ]) {
        const before = runs;
        step();
        expect(runs - before).toBe(1);
      }
    } finally {
      stop();
    }
  });

  it('a synchronous failure (exception) on undo: the step is reverted and linkFailure is set', () => {
    const { store } = setup();
    const boom = () => {
      throw new Error('sync');
    };
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), {
      link: { tag: 'P1', undo: boom, redo: boom },
    });

    expect(store.undo()).toBe(true);
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Applied');
    expect(store.canUndo.value).toBe(true);
    expect(store.canRedo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('failed');
  });

  it('a synchronous failure (exception) on redo: the step is reverted and linkFailure is set', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    const boom = () => {
      throw new Error('sync');
    };
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), {
      link: { ...link, redo: boom },
    });
    store.undo();
    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.redo()).toBe(true);
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Applied');
    expect(store.canRedo.value).toBe(true);
    expect(store.linkFailure.value?.error).toBe('failed');
  });

  it('a write failure on redo: the step is reverted and the error stays in sight', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Applied'), { link });
    store.undo();
    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.redo()).toBe(true);
    pending[1]?.resolve({ ok: false, error: 'write-failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Applied');
    expect(store.canRedo.value).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('write-failed');
  });
});

describe('store: drag without effect', () => {
  it('a container drag that changes nothing does not create an undo entry', () => {
    const { store, actions } = setup();
    const items = [{ kind: 'image' as const, id: 'I1' }];
    store.beginGesture();
    actions.previewItemsMove(items, 0, 0);
    actions.finishItemsMove(items, 0, 0);
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
  });

  it('moving the container without a valid preview (same placement) does not create an entry', () => {
    const { store, actions } = setup();
    store.beginGesture();
    actions.finishImagePlacement('I1');
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
  });

  it('moving the marking without an effect does not create an entry', () => {
    const { store, actions } = setup();
    store.beginGesture();
    actions.finishMarkingMove('M1', 0, 0);
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
  });
});
