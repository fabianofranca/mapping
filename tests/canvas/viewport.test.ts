import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasToScreen,
  centerOn,
  fitRect,
  panBy,
  pinch,
  screenToCanvas,
  wheelZoomFactor,
  zoomAt,
} from '../../src/canvas/viewport';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('viewport', () => {
  const v = { x: 100, y: 50, scale: 2 };

  it('converte tela ↔ canvas', () => {
    const p = { x: 10, y: 20 };
    expect(canvasToScreen(v, p)).toEqual({ x: 120, y: 90 });
    close(screenToCanvas(v, canvasToScreen(v, p)), p);
  });

  it('zoom mantém fixo o ponto sob o cursor', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToCanvas(v, anchor);
    const zoomed = zoomAt(v, anchor, 1.5);
    expect(zoomed.scale).toBeCloseTo(3);
    close(screenToCanvas(zoomed, anchor), before);
  });

  it('zoom respeita os limites', () => {
    expect(zoomAt(v, { x: 0, y: 0 }, 1e6).scale).toBe(MAX_ZOOM);
    expect(zoomAt(v, { x: 0, y: 0 }, 1e-9).scale).toBe(MIN_ZOOM);
  });

  it('pan desloca sem mudar a escala', () => {
    expect(panBy(v, 5, -5)).toEqual({ x: 105, y: 45, scale: 2 });
  });

  it('enquadra e centraliza o retângulo', () => {
    const fitted = fitRect(
      { x: 0, y: 0, width: 2000, height: 1000 },
      { width: 400, height: 800 },
      0,
    );
    expect(fitted.scale).toBeCloseTo(0.2);
    close(canvasToScreen(fitted, { x: 1000, y: 500 }), { x: 200, y: 400 });
    // Com margem, o retângulo cabe dentro dela.
    const padded = fitRect(
      { x: 0, y: 0, width: 2000, height: 1000 },
      { width: 400, height: 800 },
      20,
    );
    expect(canvasToScreen(padded, { x: 0, y: 0 }).x).toBeCloseTo(20);
  });

  it('pinça: afastar os dedos aproxima em volta do ponto médio', () => {
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 100 };
    const a1 = { x: 50, y: 100 };
    const b1 = { x: 250, y: 100 };
    const mid = { x: 150, y: 100 };
    const before = screenToCanvas(v, mid);
    const next = pinch(v, a0, b0, a1, b1);
    expect(next.scale).toBeCloseTo(4);
    close(screenToCanvas(next, mid), before);
  });

  it('pinça: mover os dois dedos juntos faz pan', () => {
    const next = pinch(
      v,
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(next).toEqual({ x: 105, y: 55, scale: 2 });
  });

  it('roda: para cima aproxima, para baixo afasta', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelZoomFactor(3, 1, false)).toBeCloseTo(wheelZoomFactor(48, 0, false));
  });
});

describe('centralizar', () => {
  const size = { width: 400, height: 800 };

  it('mantém o zoom quando o retângulo cabe bem', () => {
    const v = centerOn(
      { x: 0, y: 0, scale: 1 },
      { x: 100, y: 100, width: 200, height: 200 },
      size,
    );
    expect(v).toEqual({ x: 0, y: 200, scale: 1 });
  });

  it('ajusta o zoom para retângulos grandes ou pequenos demais', () => {
    const big = centerOn(
      { x: 0, y: 0, scale: 1 },
      { x: 0, y: 0, width: 800, height: 100 },
      size,
    );
    expect(big.scale).toBeCloseTo(0.25);
    const small = centerOn(
      { x: 0, y: 0, scale: 1 },
      { x: 0, y: 0, width: 10, height: 10 },
      size,
    );
    expect(small.scale).toBeCloseTo(20);
    expect(small.x).toBeCloseTo(200 - 5 * 20);
  });
});
