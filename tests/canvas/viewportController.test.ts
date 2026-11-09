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
  it('na primeira medida com tamanho, enquadra as imagens (uma vez só)', () => {
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

  it('measure() sem mudança de tamanho não reescreve o sinal `size`', () => {
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

  it('sem tamanho, não enquadra; canvas vazio enquadra a área padrão', () => {
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

  // Etapa 7 (7.2), regressão G3: fechar a janela de baixo e clicar em Enquadrar tudo
  // usava a altura antiga (o ResizeObserver ainda não tinha disparado).
  it('enquadrar tudo mede o container antes (sem esperar o ResizeObserver)', () => {
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

  it('enquadrar tudo inclui as marcações do canvas', () => {
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

  it('centraliza num retângulo e converte tela ↔ canvas', () => {
    const view = new ViewportController(container(380, 700), () => null);
    view.measure();
    view.centerOn({ x: 1000, y: 1000, width: 100, height: 100 });
    const center = view.center();
    expect(center.x).toBeCloseTo(1050);
    expect(center.y).toBeCloseTo(1050);
    expect(view.screenPoint({ clientX: 30, clientY: 40 })).toEqual({ x: 30, y: 40 });
  });

  it('zoom no ponto mantém o ponto parado; pinça escala pela distância', () => {
    const view = new ViewportController(container(380, 700), () => null);
    const before = view.toCanvas({ x: 100, y: 200 });
    view.zoomAt({ x: 100, y: 200 }, 2);
    expect(view.scale).toBe(2);
    expect(view.toCanvas({ x: 100, y: 200 })).toEqual(before);
    view.pinch({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(view.scale).toBeCloseTo(1);
  });

  // PC2: a faixa "Área de chegada" tem um rótulo em cima dela; Enquadrar tudo deixa o espaço dele.
  it('com marcas de chegada, enquadrar tudo deixa folga extra para o rótulo da faixa', () => {
    const root = canvasProject().containers[0]!.id;
    const marked: Project = {
      ...canvasProject(),
      arrivals: [{ root, from: 'V', fromName: 'Frente' }],
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
});
