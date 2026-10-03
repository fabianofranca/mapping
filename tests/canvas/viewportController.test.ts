import { describe, expect, it } from 'vitest';
import { EMPTY_CANVAS_RECT, fitRect } from '../../src/canvas/viewport';
import { ViewportController } from '../../src/canvas/viewportController';
import type { ProjectImage } from '../../src/model';
import { canvasProject } from './harness';

function container(width: number, height: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  return el;
}

const SIZE = { width: 380, height: 700 };

describe('ViewportController', () => {
  it('na primeira medida com tamanho, enquadra as imagens (uma vez só)', () => {
    let images: readonly ProjectImage[] = canvasProject().images;
    const view = new ViewportController(container(380, 700), () => images);
    const stop = view.observe();
    expect(view.size.value).toEqual(SIZE);
    const fitted = fitRect({ x: 0, y: 0, width: 1600, height: 800 }, SIZE);
    expect(view.viewport.value).toEqual(fitted);

    images = [];
    view.panBy(10, 0);
    view.measure();
    expect(view.viewport.value.x).toBe(fitted.x + 10);
    stop();
  });

  it('sem tamanho, não enquadra; canvas vazio enquadra a área padrão', () => {
    const el = container(0, 0);
    const view = new ViewportController(el, () => []);
    view.measure();
    view.fitAll();
    expect(view.viewport.value).toEqual({ x: 0, y: 0, scale: 1 });
    Object.defineProperty(el, 'clientWidth', { value: 380 });
    Object.defineProperty(el, 'clientHeight', { value: 700 });
    view.measure();
    expect(view.viewport.value).toEqual(fitRect(EMPTY_CANVAS_RECT, SIZE));
  });

  it('centraliza num retângulo e converte tela ↔ canvas', () => {
    const view = new ViewportController(container(380, 700), () => []);
    view.measure();
    view.centerOn({ x: 1000, y: 1000, width: 100, height: 100 });
    const center = view.center();
    expect(center.x).toBeCloseTo(1050);
    expect(center.y).toBeCloseTo(1050);
    expect(view.screenPoint({ clientX: 30, clientY: 40 })).toEqual({ x: 30, y: 40 });
  });

  it('zoom no ponto mantém o ponto parado; pinça escala pela distância', () => {
    const view = new ViewportController(container(380, 700), () => []);
    const before = view.toCanvas({ x: 100, y: 200 });
    view.zoomAt({ x: 100, y: 200 }, 2);
    expect(view.scale).toBe(2);
    expect(view.toCanvas({ x: 100, y: 200 })).toEqual(before);
    view.pinch({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(view.scale).toBeCloseTo(1);
  });
});
