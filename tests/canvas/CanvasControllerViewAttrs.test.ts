import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import { selectItems } from '../../src/store/ui';
import { arrowProject } from '../model/arrowFixtures';
import { editorFor, installFakeCanvas } from './harness';

// `data-viewport` e `data-selection-box` no host do canvas (etapa #842): a vista do stage e a caixa
// da seleção primária em pixels de tela, só leitura para os testes e2e.

describe('CanvasController: data-viewport e data-selection-box', () => {
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

  function setup() {
    const editor = editorFor(arrowProject());
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    flush();
    return { ...editor, container, controller };
  }

  const viewportOf = (el: HTMLElement) => {
    const [x, y, scale] = (el.dataset.viewport ?? '').split(' ').map(Number);
    return { x: x!, y: y!, scale: scale! };
  };
  const boxOf = (el: HTMLElement) =>
    (el.dataset.selectionBox ?? '').split(' ').map(Number);

  it('publica a vista e a acompanha em pan e zoom', () => {
    const { container, controller } = setup();
    const first = viewportOf(container);
    expect(first.scale).toBeGreaterThan(0);
    expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(true);
    controller.zoomBy(2);
    flush();
    const zoomed = viewportOf(container);
    expect(zoomed.scale).toBeCloseTo(first.scale * 2, 6);
    expect(container.dataset.viewport).not.toBe(`${first.x} ${first.y} ${first.scale}`);
    controller.destroy();
  });

  it('a caixa de uma marcação do canvas bate com a vista', () => {
    const { container, controller, ui } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'H' }]);
    flush();
    const v = viewportOf(container);
    const [l, t, w, h] = boxOf(container);
    // H: (400,1300,200,100) no canvas
    expect(l).toBeCloseTo(400 * v.scale + v.x, 1);
    expect(t).toBeCloseTo(1300 * v.scale + v.y, 1);
    expect(w).toBeCloseTo(200 * v.scale, 1);
    expect(h).toBeCloseTo(100 * v.scale, 1);
    controller.destroy();
  });

  it('a caixa de uma marcação dentro de um container soma a colocação dele', () => {
    const { container, controller, ui } = setup();
    selectItems(ui, [{ kind: 'marking', id: 'b1' }]);
    flush();
    const v = viewportOf(container);
    const [l, t, w, h] = boxOf(container);
    // b1 no container B (2000,0, escala 2): canvas (2100,100,200,200)
    expect(l).toBeCloseTo(2100 * v.scale + v.x, 1);
    expect(t).toBeCloseTo(100 * v.scale + v.y, 1);
    expect(w).toBeCloseTo(200 * v.scale, 1);
    expect(h).toBeCloseTo(200 * v.scale, 1);
    controller.zoomBy(1.5);
    flush();
    const z = viewportOf(container);
    expect(boxOf(container)[0]).toBeCloseTo(2100 * z.scale + z.x, 1);
    controller.destroy();
  });

  it('a caixa de um container e a de uma flutuante', () => {
    const { container, controller, ui } = setup();
    selectItems(ui, [{ kind: 'image', id: 'B' }]);
    flush();
    let v = viewportOf(container);
    let box = boxOf(container);
    expect(box[0]).toBeCloseTo(2000 * v.scale + v.x, 1);
    expect(box[2]).toBeCloseTo(1000 * v.scale, 1); // 500 px × escala 2
    selectItems(ui, [{ kind: 'marking', id: 'N' }]);
    flush();
    v = viewportOf(container);
    box = boxOf(container);
    expect(box[0]).toBeCloseTo(100 * v.scale + v.x, 1);
    expect(box[3]).toBeCloseTo(100 * v.scale, 1);
    controller.destroy();
  });

  it('some sem seleção e com seta selecionada; seleção múltipla usa a primária', () => {
    const { container, controller, ui } = setup();
    expect(container.dataset.selectionBox).toBeUndefined();
    selectItems(ui, [{ kind: 'marking', id: 'a1' }]);
    flush();
    expect(container.dataset.selectionBox).toBeDefined();
    selectItems(ui, [{ kind: 'arrow', id: 'r1' }]);
    flush();
    expect(container.dataset.selectionBox).toBeUndefined();
    selectItems(ui, [
      { kind: 'marking', id: 'a1' },
      { kind: 'marking', id: 'H' },
    ]);
    flush();
    const v = viewportOf(container);
    expect(boxOf(container)[0]).toBeCloseTo(400 * v.scale + v.x, 1);
    selectItems(ui, []);
    flush();
    expect(container.dataset.selectionBox).toBeUndefined();
    controller.destroy();
  });
});
