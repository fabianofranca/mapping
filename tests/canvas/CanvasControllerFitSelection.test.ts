import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { FIT_PADDING, MAX_ZOOM } from '../../src/canvas/viewport';
import { createMarking } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { selectItems, setViewMode } from '../../src/store/ui';
import { canvasProject, editorFor, installFakeCanvas } from './harness';

// Fit selection (Fit selection stage, EQ2): `fitSelection()` zooms and centers the view
// on the box of all selected items, only touching the view.

const WIDTH = 380;
const HEIGHT = 700;

describe('CanvasController: fitSelection', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(project = canvasProject(), width = WIDTH) {
    const editor = editorFor(project);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: width });
    Object.defineProperty(container, 'clientHeight', { value: HEIGHT });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    flush();
    return { ...editor, container, controller };
  }

  /** Screen box of a canvas rectangle in the current view. */
  function screenBox(
    view: { x: number; y: number; scale: number },
    rect: { x: number; y: number; width: number; height: number },
  ) {
    return {
      x: rect.x * view.scale + view.x,
      y: rect.y * view.scale + view.y,
      width: rect.width * view.scale,
      height: rect.height * view.scale,
    };
  }

  it('fits a marking inside a container, centered and with the Fit all margin', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    controller.fitSelection();
    flush();
    const box = screenBox(view.viewport.value, {
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    });
    expect(box.x + box.width / 2).toBeCloseTo(WIDTH / 2);
    expect(box.y + box.height / 2).toBeCloseTo(HEIGHT / 2);
    // The width is the limit: the box takes the screen minus the margin on both sides.
    expect(box.width).toBeCloseTo(WIDTH - 2 * FIT_PADDING);
    controller.destroy();
  });

  it('adds the container placement: a marking of the second container', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'M3' }]);
    controller.fitSelection();
    flush();
    const box = screenBox(view.viewport.value, {
      x: 1150,
      y: 50,
      width: 200,
      height: 200,
    });
    expect(box.x + box.width / 2).toBeCloseTo(WIDTH / 2);
    expect(box.y + box.height / 2).toBeCloseTo(HEIGHT / 2);
    controller.destroy();
  });

  it('with multiple selection in different containers, fits the box of all', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M3' },
    ]);
    controller.fitSelection();
    flush();
    // M2 goes from x 200 to 300; M3 from 1150 to 1350; y from 50 to 300.
    const box = screenBox(view.viewport.value, {
      x: 200,
      y: 50,
      width: 1150,
      height: 250,
    });
    expect(box.x + box.width / 2).toBeCloseTo(WIDTH / 2);
    expect(box.y + box.height / 2).toBeCloseTo(HEIGHT / 2);
    expect(box.x).toBeGreaterThanOrEqual(FIT_PADDING - 1e-6);
    expect(box.x + box.width).toBeLessThanOrEqual(WIDTH - FIT_PADDING + 1e-6);
    controller.destroy();
  });

  it('an 8 px marking (the minimum) does not exceed the maximum zoom', () => {
    const project = createMarking(canvasProject(), {
      id: 'M9',
      containerId: 'I1',
      rect: { x: 400, y: 400, width: 8, height: 8 },
    });
    const { controller, ui, view } = setup(project, 1000);
    selectItems(ui, [{ kind: 'marking', id: 'M9' }]);
    controller.fitSelection();
    flush();
    expect(view.viewport.value.scale).toBe(MAX_ZOOM);
    controller.destroy();
  });

  it('does not change the selection, the project nor the undo', () => {
    const { controller, ui, store } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    const before = store.project.peek();
    controller.fitSelection();
    flush();
    expect(store.project.peek()).toBe(before);
    expect(store.canUndo.peek()).toBe(false);
    expect(ui.selection.peek()).toEqual({ kind: 'marking', id: 'M2' });
    controller.destroy();
  });

  it('without selection, does not touch the view', () => {
    const { controller, view } = setup();
    const before = view.viewport.value;
    controller.fitSelection();
    flush();
    expect(view.viewport.value).toEqual(before);
    controller.destroy();
  });

  it('in View mode, does not touch the view', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    setViewMode(ui, true);
    const before = view.viewport.value;
    controller.fitSelection();
    flush();
    expect(view.viewport.value).toEqual(before);
    controller.destroy();
  });

  it('with the locked marking selected, it works the same', () => {
    const { controller, ui, actions, view } = setup();
    actions.setMarkingLocked('M2', true);
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    controller.fitSelection();
    flush();
    expect(view.viewport.value.scale).toBeCloseTo((WIDTH - 2 * FIT_PADDING) / 100);
    controller.destroy();
  });
});
