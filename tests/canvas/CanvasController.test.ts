import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import { editorFor, installFakeCanvas } from './harness';

describe('CanvasController', () => {
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
    const editor = editorFor();
    const ensure = vi.fn();
    const display = {
      ...createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ensure,
    };
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    return { ...editor, container, controller, ensure };
  }

  it('monta o stage com as três camadas e pede os bitmaps das imagens', () => {
    const { container, controller, ensure } = setup();
    flush();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(3);
    expect(ensure.mock.calls.map(([file]) => file)).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);
    controller.destroy();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('comandos do editor: enquadrar, centralizar, ponto e imagem sob o dedo', () => {
    const { controller, ui } = setup();
    controller.fitAll();
    const center = controller.viewportCenter();
    expect(center.x).toBeCloseTo(800);
    expect(center.y).toBeCloseTo(400);
    ui.selection.value = { kind: 'image', id: 'I2' };
    controller.focusSelection();
    expect(controller.viewportCenter().x).toBeCloseTo(1350);
    expect(controller.imageIdAt(190, 350)).toBe('I2');
    const p = controller.canvasPointAt(190, 350);
    expect(p.x).toBeCloseTo(1350);
    controller.destroy();
  });

  it('alvo de soltar na área vazia marca o container no próximo quadro', () => {
    const { container, controller } = setup();
    flush();
    controller.setDropTarget({ imageId: null });
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(true);
    controller.setDropTarget(null);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    controller.destroy();
  });

  it('depois de destruído, não escuta mais o ponteiro', () => {
    const { container, controller, ui } = setup();
    controller.destroy();
    container.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    expect(ui.selection.value).toBeNull();
    expect(controller.cancelInteraction()).toBe(false);
  });
});
