import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { InteractionState } from '../../src/canvas/frame';
import { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { createMarking, setMarkingAnchor } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { canvasProject, editorFor, installFakeCanvas } from './harness';

// The anchor link in `CanvasController` (R4, decision 13): appears with the anchored one selected
// or under the mouse, disappears outside them, and the pan does not rebuild the overlays (the line lives in coordinates
// of the canvas: the stage transform carries it along).
describe('CanvasController: anchor link', () => {
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
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.clearAllMocks());

  function setup() {
    let project = createMarking(canvasProject(), {
      id: 'M4',
      containerId: 'I1',
      rect: { x: 800, y: 100, width: 100, height: 100 },
    });
    project = setMarkingAnchor(project, 'M4', { to: 'M1' });
    const editor = editorFor(project);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const controller = new CanvasController({ container, display, ...editor });
    const internals = controller as unknown as {
      state: InteractionState;
      overlay: OverlayRenderer;
    };
    flush();
    const shown = () =>
      internals.overlay.anchorLinkNodes().filter((node) => node.line.visible());
    return { ...editor, controller, internals, shown };
  }

  it('the selected anchored one shows the link; when the selection changes it disappears', () => {
    const { controller, ui, shown } = setup();
    expect(shown()).toHaveLength(0);
    ui.selection.value = { kind: 'marking', id: 'M4' };
    flush();
    expect(shown()).toHaveLength(1);
    ui.selection.value = { kind: 'marking', id: 'M2' };
    flush();
    expect(shown()).toHaveLength(0);
    controller.destroy();
  });

  it('the mouse over the anchored one lights up the link and leaving it turns it off', () => {
    const { controller, internals, shown } = setup();
    internals.state.hoverMarking.value = 'M4';
    flush();
    expect(shown()).toHaveLength(1);
    internals.state.hoverMarking.value = null;
    flush();
    expect(shown()).toHaveLength(0);
    controller.destroy();
  });

  it('pan does not rebuild the overlays nor move the link points', () => {
    const { controller, ui, view, shown } = setup();
    ui.selection.value = { kind: 'marking', id: 'M4' };
    flush();
    const points = shown()[0]?.line.points();
    const render = vi.spyOn(OverlayRenderer.prototype, 'render');
    view.viewport.value = { x: -120, y: -80, scale: view.viewport.value.scale };
    flush();
    expect(render).not.toHaveBeenCalled();
    expect(shown()[0]?.line.points()).toEqual(points);
    controller.destroy();
  });

  it('dragging the anchor carries the link along (the gesture preview)', () => {
    const { controller, ui, actions, shown } = setup();
    ui.selection.value = { kind: 'marking', id: 'M4' };
    flush();
    const before = shown()[0]?.line.points() ?? [];
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M1', 40, 20);
    flush();
    const during = shown()[0]?.line.points() ?? [];
    // The anchored one and the anchor move by the same offset: the line moves as a whole.
    expect(during).toEqual([
      (before[0] ?? 0) + 40,
      (before[1] ?? 0) + 20,
      (before[2] ?? 0) + 40,
      (before[3] ?? 0) + 20,
    ]);
    actions.commitGesture();
    controller.destroy();
  });
});
