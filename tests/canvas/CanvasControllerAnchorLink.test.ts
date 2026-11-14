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

// A ligação da âncora no `CanvasController` (R4, decisão 13): aparece com a ancorada selecionada
// ou sob o mouse, some fora deles, e o pan não refaz as sobreposições (a linha vive em coordenadas
// do canvas: a transformação do palco a leva junto).
describe('CanvasController: ligação da âncora', () => {
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

  it('a ancorada selecionada mostra a ligação; ao trocar a seleção ela some', () => {
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

  it('o mouse sobre a ancorada acende a ligação e sair a apaga', () => {
    const { controller, internals, shown } = setup();
    internals.state.hoverMarking.value = 'M4';
    flush();
    expect(shown()).toHaveLength(1);
    internals.state.hoverMarking.value = null;
    flush();
    expect(shown()).toHaveLength(0);
    controller.destroy();
  });

  it('pan não refaz as sobreposições nem mexe nos pontos da ligação', () => {
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

  it('arrastar a âncora leva a ligação junto (a prévia do gesto)', () => {
    const { controller, ui, actions, shown } = setup();
    ui.selection.value = { kind: 'marking', id: 'M4' };
    flush();
    const before = shown()[0]?.line.points() ?? [];
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M1', 40, 20);
    flush();
    const during = shown()[0]?.line.points() ?? [];
    // A ancorada e a âncora andam o mesmo deslocamento: a linha anda inteira.
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
