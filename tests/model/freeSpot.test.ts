import { describe, expect, it } from 'vitest';
import {
  FLOATING_GAP,
  IMAGE_GAP,
  PLACEMENT_GAP,
  floatingSpotNear,
  isFreeRect,
  nearestFreeSpot,
  nearestFreeSpotIn,
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

describe('nearestFreeSpotIn (colocação em espaço livre, #1087)', () => {
  const area = rect(0, 0, 400, 300);

  it('o vão é o PLACEMENT_GAP (8)', () => {
    expect(PLACEMENT_GAP).toBe(8);
  });

  it('o lugar pedido livre e dentro da área é o lugar pedido', () => {
    expect(nearestFreeSpotIn([], 100, 40, { x: 150, y: 130 }, area)).toEqual({
      x: 150,
      y: 130,
    });
    expect(
      nearestFreeSpotIn([rect(300, 0, 50, 50)], 100, 40, { x: 150, y: 130 }, area),
    ).toEqual({ x: 150, y: 130 });
  });

  it('ocupado: o encaixe mais perto junto à borda do obstáculo, com o vão', () => {
    const wall = rect(100, 100, 200, 100);
    const spot = nearestFreeSpotIn([wall], 100, 40, { x: 150, y: 130 }, area);
    expect(spot).not.toBeNull();
    const placed = { ...spot!, width: 100, height: 40 };
    expect(rectsOverlap(placed, wall)).toBe(false);
    // Abaixo (y = 200 + 8, a 78 do pedido) empata com acima (y = 100 − 8 − 40 = 52): vence o primeiro candidato.
    expect(spot).toEqual({ x: 150, y: 208 });
  });

  it('as bordas da área são candidatas, sem vão', () => {
    // O obstáculo ocupa a largura toda e deixa só uma faixa de 40 colada à borda de baixo.
    const spot = nearestFreeSpotIn(
      [rect(0, 0, 400, 260)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(spot).toEqual({ x: 150, y: 260 });
    // Com folga, o encaixe com o vão (250 + 8) é mais perto do pedido que a borda da área (260).
    const tight = nearestFreeSpotIn(
      [rect(0, 0, 400, 250)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(tight).toEqual({ x: 150, y: 258 });
  });

  it('nunca devolve um lugar fora da área', () => {
    const spot = nearestFreeSpotIn(
      [rect(150, 100, 100, 100)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(spot).not.toBeNull();
    const placed = { ...spot!, width: 100, height: 40 };
    expect(placed.x).toBeGreaterThanOrEqual(area.x);
    expect(placed.y).toBeGreaterThanOrEqual(area.y);
    expect(placed.x + placed.width).toBeLessThanOrEqual(area.x + area.width);
    expect(placed.y + placed.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it('sem candidato na área: null (sem o "à direita de todos")', () => {
    expect(
      nearestFreeSpotIn([rect(0, 0, 400, 300)], 100, 40, { x: 150, y: 100 }, area),
    ).toBeNull();
    // A peça maior que a área também não cabe.
    expect(nearestFreeSpotIn([], 500, 40, { x: 0, y: 0 }, area)).toBeNull();
  });

  it('sem área: sempre há lugar (à direita de todos se preciso) e as coordenadas são inteiras', () => {
    const ring = [rect(0, 0, 100, 100), rect(120, 0, 100, 100), rect(0, 120, 220, 100)];
    const spot = nearestFreeSpotIn(ring, 150, 150, { x: 60, y: 60 }, null);
    expect(spot).not.toBeNull();
    for (const o of ring) {
      expect(rectsOverlap({ ...spot!, width: 150, height: 150 }, o)).toBe(false);
    }
    const fractional = nearestFreeSpotIn(
      [rect(0.4, 0.4, 100.3, 100.3)],
      50,
      50,
      { x: 10, y: 10 },
      null,
    );
    expect(Number.isInteger(fractional!.x) && Number.isInteger(fractional!.y)).toBe(true);
    expect(
      rectsOverlap(
        { ...fractional!, width: 50, height: 50 },
        rect(0.4, 0.4, 100.3, 100.3),
      ),
    ).toBe(false);
  });

  it('o nearestFreeSpot sem área não muda: o mesmo resultado de antes', () => {
    expect(nearestFreeSpot([rect(0, 0, 100, 100)], 50, 50, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: -(IMAGE_GAP + 50),
    });
  });
});

describe('isFreeRect', () => {
  it('encostar não é sobrepor; fora da área não é livre', () => {
    const area = rect(0, 0, 100, 100);
    expect(isFreeRect(rect(50, 0, 50, 50), [rect(0, 0, 50, 50)], area)).toBe(true);
    expect(isFreeRect(rect(49, 0, 50, 50), [rect(0, 0, 50, 50)], area)).toBe(false);
    expect(isFreeRect(rect(80, 0, 50, 50), [], area)).toBe(false);
    expect(isFreeRect(rect(80, 0, 50, 50), [], null)).toBe(true);
  });
});
