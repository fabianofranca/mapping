import { describe, expect, it } from 'vitest';
import { EMPTY_CANVAS_RECT, FIT_PADDING, fitRect } from '../../src/canvas/viewport';
import { ViewportController } from '../../src/canvas/viewportController';
import { ARRIVAL_FIT_EXTRA } from '../../src/canvas/arrivals';
import { createMarking, type Project } from '../../src/model';
import { canvasProject } from './harness';

function container(width: number, height: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  return el;
}

const SIZE = { width: 380, height: 700 };

describe('ViewportController', () => {
  it('on the first measure with a size, it frames the images (only once)', () => {
    let content: Project | null = canvasProject();
    const view = new ViewportController(container(380, 700), () => content);
    const stop = view.observe();
    expect(view.size.value).toEqual(SIZE);
    const fitted = fitRect({ x: 0, y: 0, width: 1600, height: 800 }, SIZE);
    expect(view.viewport.value).toEqual(fitted);

    content = null;
    view.panBy(10, 0);
    view.measure();
    expect(view.viewport.value.x).toBe(fitted.x + 10);
    stop();
  });

  it('measure() without a size change does not rewrite the `size` signal', () => {
    const view = new ViewportController(container(380, 700), () => canvasProject());
    view.measure();
    const writes: unknown[] = [];
    const stop = view.size.subscribe((size) => writes.push(size));
    writes.length = 0;
    view.measure();
    view.measure();
    stop();
    expect(writes).toEqual([]);
    expect(view.size.value).toEqual(SIZE);
  });

  it('without a size, it does not frame; empty canvas frames the default area', () => {
    const el = container(0, 0);
    const view = new ViewportController(el, () => null);
    view.measure();
    view.fitAll();
    expect(view.viewport.value).toEqual({ x: 0, y: 0, scale: 1 });
    Object.defineProperty(el, 'clientWidth', { value: 380 });
    Object.defineProperty(el, 'clientHeight', { value: 700 });
    view.measure();
    expect(view.viewport.value).toEqual(fitRect(EMPTY_CANVAS_RECT, SIZE));
  });

  // Stage 7 (7.2), regression G3: closing the bottom window and clicking Fit all
  // used the old height (the ResizeObserver had not fired yet).
  it('fit all measures the container first (without waiting for the ResizeObserver)', () => {
    const el = container(380, 300);
    const view = new ViewportController(el, () => canvasProject());
    view.measure();
    Object.defineProperty(el, 'clientHeight', { value: 700 });
    view.fitAll();
    expect(view.size.value).toEqual(SIZE);
    expect(view.viewport.value).toEqual(
      fitRect({ x: 0, y: 0, width: 1600, height: 800 }, SIZE),
    );
  });

  it('fit all includes the canvas markings', () => {
    const base = canvasProject();
    const content = createMarking(base, {
      id: 'C1',
      containerId: null,
      rect: { x: 1700, y: -400, width: 400, height: 300 },
    });
    const view = new ViewportController(container(380, 700), () => content);
    view.measure();
    expect(view.viewport.value).toEqual(
      fitRect({ x: 0, y: -400, width: 2100, height: 1200 }, SIZE),
    );
  });

  it('centers on a rectangle and converts screen ↔ canvas', () => {
    const view = new ViewportController(container(380, 700), () => null);
    view.measure();
    view.centerOn({ x: 1000, y: 1000, width: 100, height: 100 });
    const center = view.center();
    expect(center.x).toBeCloseTo(1050);
    expect(center.y).toBeCloseTo(1050);
    expect(view.screenPoint({ clientX: 30, clientY: 40 })).toEqual({ x: 30, y: 40 });
  });

  it('zoom at a point keeps the point still; pinch scales by the distance', () => {
    const view = new ViewportController(container(380, 700), () => null);
    const before = view.toCanvas({ x: 100, y: 200 });
    view.zoomAt({ x: 100, y: 200 }, 2);
    expect(view.scale).toBe(2);
    expect(view.toCanvas({ x: 100, y: 200 })).toEqual(before);
    view.pinch({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(view.scale).toBeCloseTo(1);
  });

  // PC2: the "Arrival area" strip has a label above it; Fit all leaves room for it.
  it('with arrival marks, fit all leaves extra room for the strip label', () => {
    const root = canvasProject().containers[0]!.id;
    const marked: Project = {
      ...canvasProject(),
      arrivals: [{ root, from: 'V', fromName: 'Front' }],
    };
    const view = new ViewportController(container(380, 700), () => marked);
    view.measure();
    expect(view.viewport.value).toEqual(
      fitRect(
        { x: 0, y: 0, width: 1600, height: 800 },
        SIZE,
        FIT_PADDING + ARRIVAL_FIT_EXTRA,
      ),
    );
  });

  // #1337: opening or closing a tool window changes the canvas width; the center stays.
  describe('container size change', () => {
    function resize(el: HTMLElement, width: number, height: number): void {
      Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
    }

    it('after the first framing, keeps the center and the scale', () => {
      const el = container(800, 600);
      const view = new ViewportController(el, () => canvasProject());
      view.measure();
      view.zoomAt({ x: 100, y: 100 }, 2);
      const center = view.center();
      const scale = view.scale;
      resize(el, 536, 480);
      view.measure();
      expect(view.size.value).toEqual({ width: 536, height: 480 });
      expect(view.scale).toBe(scale);
      expect(view.center().x).toBeCloseTo(center.x, 6);
      expect(view.center().y).toBeCloseTo(center.y, 6);
    });

    it('going to 0 and back compares with the last non-zero size', () => {
      const el = container(800, 600);
      const view = new ViewportController(el, () => canvasProject());
      view.measure();
      const center = view.center();
      const scale = view.scale;
      resize(el, 0, 0);
      view.measure();
      expect(view.viewport.value.scale).toBe(scale);
      resize(el, 536, 600);
      view.measure();
      expect(view.scale).toBe(scale);
      expect(view.center().x).toBeCloseTo(center.x, 6);
      expect(view.center().y).toBeCloseTo(center.y, 6);
    });

    it('before the first framing, only the usual fitAll', () => {
      const el = container(0, 0);
      const view = new ViewportController(el, () => canvasProject());
      view.measure();
      resize(el, 536, 480);
      view.measure();
      expect(view.viewport.value).toEqual(
        fitRect({ x: 0, y: 0, width: 1600, height: 800 }, { width: 536, height: 480 }),
      );
    });

    it('fitAll after a change frames as before', () => {
      const el = container(800, 600);
      const view = new ViewportController(el, () => canvasProject());
      view.measure();
      resize(el, 536, 480);
      view.fitAll();
      expect(view.viewport.value).toEqual(
        fitRect({ x: 0, y: 0, width: 1600, height: 800 }, { width: 536, height: 480 }),
      );
    });
  });
});
