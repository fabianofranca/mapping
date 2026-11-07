import { describe, expect, it } from 'vitest';
import {
  FLOATING_GAP,
  IMAGE_GAP,
  floatingSpotNear,
  nearestFreeSpot,
  placementNear,
  rectsOverlap,
  type Rect,
} from '../../src/model';
import { arrowBase } from './arrowFixtures';

// Os núcleos de "lugar livre" extraídos de `placementNear` e `placeFloatingNear` (v16): recebem
// os obstáculos e servem também à chegada das perspectivas.

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('nearestFreeSpot', () => {
  it('sem obstáculo, ou com o lugar pedido livre, é o lugar pedido', () => {
    expect(nearestFreeSpot([], 50, 50, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
    expect(nearestFreeSpot([rect(500, 500, 10, 10)], 50, 50, { x: 7, y: 9 })).toEqual({
      x: 7,
      y: 9,
    });
  });

  it('ocupado: o encaixe livre mais próximo, junto à borda de um obstáculo com o vão', () => {
    const obstacle = rect(0, 0, 100, 100);
    const spot = nearestFreeSpot([obstacle], 50, 50, { x: 10, y: 10 });
    expect(rectsOverlap({ ...spot, width: 50, height: 50 }, obstacle)).toBe(false);
    // Vão de IMAGE_GAP: acima do obstáculo (10, -100) ou à esquerda (-100, 10), a mesma distância.
    expect(spot).toEqual({ x: 10, y: -(IMAGE_GAP + 50) });
  });

  it('o vão é o informado', () => {
    const spot = nearestFreeSpot([rect(0, 0, 100, 100)], 50, 50, { x: 10, y: 10 }, 10);
    expect(spot).toEqual({ x: 10, y: -60 });
  });

  it('cercado: vai para a direita de todos', () => {
    const ring = [rect(0, 0, 100, 100), rect(120, 0, 100, 100), rect(0, 120, 220, 100)];
    const spot = nearestFreeSpot(ring, 150, 150, { x: 60, y: 60 });
    for (const o of ring) {
      expect(rectsOverlap({ ...spot, width: 150, height: 150 }, o)).toBe(false);
    }
  });

  it('é o mesmo resultado de placementNear', () => {
    const p = arrowBase();
    const size = { width: 800, height: 600 };
    const obstacles = p.containers.map((c) => ({
      x: c.placement.x,
      y: c.placement.y,
      width: c.width * c.placement.scale,
      height: c.height * c.placement.scale,
    }));
    for (const center of [
      { x: 500, y: 500 },
      { x: 2500, y: 400 },
      { x: 4600, y: 100 },
      { x: -300, y: 1800 },
    ]) {
      const wanted = { x: center.x - 400, y: center.y - 300 };
      expect(placementNear(p, size, 1, center)).toEqual({
        ...nearestFreeSpot(obstacles, 800, 600, wanted),
        scale: 1,
      });
    }
  });
});

describe('floatingSpotNear', () => {
  const size = { width: 20, height: 10 };
  const anchor = rect(0, 0, 100, 100);

  it('à direita do alvo, no topo, com o vão', () => {
    expect(floatingSpotNear([], anchor, anchor, size)).toEqual({
      x: 100 + FLOATING_GAP,
      y: 0,
      ...size,
    });
  });

  it('empilha para baixo sem sobrepor os obstáculos', () => {
    const first = floatingSpotNear([], anchor, anchor, size);
    const second = floatingSpotNear([first], anchor, anchor, size);
    expect(second).toEqual({ ...first, y: first.y + first.height + FLOATING_GAP });
  });

  it('começa na altura de `start` (a marcação dentro do container)', () => {
    const start = rect(10, 40, 30, 30);
    expect(floatingSpotNear([], anchor, start, size).y).toBe(40);
  });
});
