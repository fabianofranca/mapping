import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import { arrowShape } from '../../src/canvas/arrowGeometry';
import { showArrows } from '../../src/store/settings';
import { moveContainer } from '../../src/model';
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
  it('data-selection acompanha a seleção primária e some sem seleção', () => {
    const { container, controller, ui } = setup();
    expect(container.dataset.selection).toBeUndefined();
    selectItems(ui, [{ kind: 'marking', id: 'a1' }]);
    flush();
    expect(container.dataset.selection).toBe('marking a1');
    selectItems(ui, [{ kind: 'image', id: 'B' }]);
    flush();
    expect(container.dataset.selection).toBe('image B');
    selectItems(ui, [{ kind: 'arrow', id: 'r1' }]);
    flush();
    expect(container.dataset.selection).toBe('arrow r1');
    selectItems(ui, []);
    flush();
    expect(container.dataset.selection).toBeUndefined();
    controller.destroy();
  });

  const handlesOf = (el: HTMLElement) =>
    new Map(
      (el.dataset.arrowHandles ?? '')
        .split(';')
        .filter(Boolean)
        .map((entry) => {
          const [name, x, y] = entry.split(' ');
          return [name!, { x: Number(x), y: Number(y) }] as const;
        }),
    );

  it('data-arrow-handles: só com a seta selecionada, center no meio e acompanha o zoom', () => {
    const { container, controller, ui, store } = setup();
    expect(container.dataset.arrowHandles).toBeUndefined();
    selectItems(ui, [{ kind: 'arrow', id: 'r1' }]);
    flush();
    const shape = arrowShape(store.project.peek()!, store.project.peek()!.arrows[0]!)!;
    let v = viewportOf(container);
    let handles = handlesOf(container);
    expect([...handles.keys()].slice(0, 3)).toEqual(['center', 'from', 'to']);
    expect(handles.get('center')!.x).toBeCloseTo(shape.label.x * v.scale + v.x, 1);
    expect(handles.get('center')!.y).toBeCloseTo(shape.label.y * v.scale + v.y, 1);
    expect(container.dataset.selectionBox).toBeUndefined();
    controller.zoomBy(2);
    flush();
    v = viewportOf(container);
    handles = handlesOf(container);
    expect(handles.get('center')!.x).toBeCloseTo(shape.label.x * v.scale + v.x, 1);
    selectItems(ui, [{ kind: 'marking', id: 'a1' }]);
    flush();
    expect(container.dataset.arrowHandles).toBeUndefined();
    controller.destroy();
  });

  it('data-arrow-handles some com Mostrar setas desligado', () => {
    const { container, controller, ui } = setup();
    selectItems(ui, [{ kind: 'arrow', id: 'r1' }]);
    flush();
    expect(container.dataset.arrowHandles).toBeDefined();
    showArrows.value = false;
    flush();
    expect(container.dataset.arrowHandles).toBeUndefined();
    showArrows.value = true;
    flush();
    expect(container.dataset.arrowHandles).toBeDefined();
    controller.destroy();
  });

  it('data-container-boxes traz as colocações e não muda com zoom nem pan', () => {
    const { container, controller } = setup();
    const text = container.dataset.containerBoxes ?? '';
    const b = text.split(';').find((e) => e.startsWith('B '));
    expect(b).toBe('B 2000 0 1000 1000 2');
    controller.zoomBy(2);
    flush();
    controller.zoomTo(0.2);
    flush();
    expect(container.dataset.containerBoxes).toBe(text);
    controller.destroy();
  });

  it('data-container-boxes se refaz ao redimensionar um container', () => {
    const { container, controller, store } = setup();
    const before = container.dataset.containerBoxes;
    store.apply((p) => moveContainer(p, 'B', 3000, 0));
    flush();
    expect(container.dataset.containerBoxes).not.toBe(before);
    expect(container.dataset.containerBoxes).toContain('B 3000 0 1000 1000 2');
    const moved = container.dataset.containerBoxes;
    store.apply((p) => ({
      ...p,
      containers: p.containers.map((c) => (c.id === 'B' ? { ...c, width: 250 } : c)),
    }));
    flush();
    expect(container.dataset.containerBoxes).not.toBe(moved);
    expect(container.dataset.containerBoxes).toContain('B 3000 0 500 1000 2');
    controller.destroy();
  });
});
