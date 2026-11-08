import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { FIT_PADDING, MAX_ZOOM } from '../../src/canvas/viewport';
import { createMarking } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { selectItems, setViewMode } from '../../src/store/ui';
import { canvasProject, editorFor, installFakeCanvas } from './harness';

// Enquadrar seleção (etapa Enquadrar seleção, EQ2): `fitSelection()` dá zoom e centra a vista
// na caixa de todos os itens selecionados, só mexendo na vista.

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

  /** Caixa de tela de um retângulo do canvas na vista atual. */
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

  it('enquadra uma marcação dentro de um container, centrada e com a folga do Enquadrar tudo', () => {
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
    // A largura é o limite: a caixa ocupa a tela menos a folga dos dois lados.
    expect(box.width).toBeCloseTo(WIDTH - 2 * FIT_PADDING);
    controller.destroy();
  });

  it('soma a colocação do container: uma marcação do segundo container', () => {
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

  it('com seleção múltipla em containers diferentes, enquadra a caixa de todos', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M3' },
    ]);
    controller.fitSelection();
    flush();
    // M2 vai de x 200 a 300; M3 de 1150 a 1350; y de 50 a 300.
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

  it('uma marcação de 8 px (o mínimo) não passa do zoom máximo', () => {
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

  it('não muda a seleção, o projeto nem o desfazer', () => {
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

  it('sem seleção, não mexe na vista', () => {
    const { controller, view } = setup();
    const before = view.viewport.value;
    controller.fitSelection();
    flush();
    expect(view.viewport.value).toEqual(before);
    controller.destroy();
  });

  it('no modo Visualizar, não mexe na vista', () => {
    const { controller, ui, view } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    setViewMode(ui, true);
    const before = view.viewport.value;
    controller.fitSelection();
    flush();
    expect(view.viewport.value).toEqual(before);
    controller.destroy();
  });

  it('com a marcação trancada selecionada, funciona igual', () => {
    const { controller, ui, actions, view } = setup();
    actions.setMarkingLocked('M2', true);
    selectItems(ui, [{ kind: 'marking', id: 'M2' }]);
    controller.fitSelection();
    flush();
    expect(view.viewport.value.scale).toBeCloseTo((WIDTH - 2 * FIT_PADDING) / 100);
    controller.destroy();
  });
});
