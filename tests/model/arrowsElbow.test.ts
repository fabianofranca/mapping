import { describe, expect, it } from 'vitest';
import {
  arrowRoute,
  createArrow,
  createMarking,
  ELBOW_STUB,
  setArrowRoute,
  type ArrowPoint,
  type ArrowSide,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// O roteador do canto (estilo `elbow`, ME4): trechos só horizontais e verticais, saída e chegada
// perpendiculares aos lados, os pontos de passagem como segmentos do meio. As marcações ficam no
// canvas (sem container), então os pontos de passagem também são unidades do canvas.

const r = (x: number, y: number, width = 100, height = 100): Rect => ({
  x,
  y,
  width,
  height,
});

function scene(
  from: Rect,
  to: Rect,
  extra: {
    fromSide?: ArrowSide;
    toSide?: ArrowSide;
    points?: readonly ArrowPoint[];
  } = {},
): Project {
  let p: Project = emptyProject();
  p = createMarking(p, { id: 'A', containerId: null, rect: from });
  p = createMarking(p, { id: 'B', containerId: null, rect: to });
  p = createArrow(p, {
    id: 'r',
    from: 'A',
    to: 'B',
    style: 'elbow',
    fromSide: extra.fromSide ?? null,
    toSide: extra.toSide ?? null,
  });
  return extra.points ? setArrowRoute(p, 'r', extra.points) : p;
}

function route(p: Project) {
  const arrow = p.arrows[0];
  if (!arrow) throw new Error('seta');
  const result = arrowRoute(p, arrow);
  if (!result) throw new Error('rota');
  return result;
}

/** Todos os trechos são horizontais ou verticais. */
function orthogonal(points: readonly ArrowPoint[]): boolean {
  return points.every((pt, i) => {
    const prev = points[i - 1];
    return !prev || prev.x === pt.x || prev.y === pt.y;
  });
}

/** A direção (versor) do trecho `i`, ou `null` se ele tem comprimento zero. */
function direction(points: readonly ArrowPoint[], i: number): ArrowPoint | null {
  const a = points[i] as ArrowPoint;
  const b = points[i + 1] as ArrowPoint;
  if (a.x === b.x && a.y === b.y) return null;
  return { x: Math.sign(b.x - a.x) + 0, y: Math.sign(b.y - a.y) + 0 };
}

const NORMALS: Record<ArrowSide, ArrowPoint> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Sai no sentido do lado de origem e chega no sentido contrário ao lado de destino. */
function leavesAndArrivesPerpendicular(p: Project): void {
  const { points, fromSide, toSide } = route(p);
  expect(orthogonal(points)).toBe(true);
  expect(direction(points, 0)).toEqual(NORMALS[fromSide]);
  const last = direction(points, points.length - 2);
  expect(last).toEqual({
    x: 0 - NORMALS[toSide].x,
    y: 0 - NORMALS[toSide].y,
  });
}

describe('elbow: rota padrão', () => {
  it('lados automáticos horizontais: um Z com a pista no meio', () => {
    const p = scene(r(0, 0), r(400, 300));
    const { points, lanes, fromSide, toSide } = route(p);
    expect([fromSide, toSide]).toEqual(['right', 'left']);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 350 },
      { x: 400, y: 350 },
    ]);
    expect(lanes).toEqual([{ axis: 'x', value: 250 }]);
    leavesAndArrivesPerpendicular(p);
  });

  it('lados automáticos verticais: o mesmo Z transposto', () => {
    const p = scene(r(0, 0), r(300, 400));
    const { points, lanes, fromSide, toSide } = route(p);
    expect([fromSide, toSide]).toEqual(['bottom', 'top']);
    expect(points).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 250 },
      { x: 350, y: 250 },
      { x: 350, y: 400 },
    ]);
    expect(lanes).toEqual([{ axis: 'y', value: 250 }]);
    leavesAndArrivesPerpendicular(p);
  });

  it('para a esquerda e para cima também saem e chegam do lado certo', () => {
    leavesAndArrivesPerpendicular(scene(r(400, 300), r(0, 0)));
    leavesAndArrivesPerpendicular(scene(r(300, 400), r(0, 0)));
  });

  it('lados diferentes (L): uma dobra só, sem pistas', () => {
    // Sai pela direita de A e chega pelo topo de B.
    const p = scene(r(0, 0), r(300, 300), { fromSide: 'right', toSide: 'top' });
    const { points, lanes } = route(p);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 350, y: 50 },
      { x: 350, y: 300 },
    ]);
    expect(lanes).toEqual([]);
    leavesAndArrivesPerpendicular(p);
  });

  it('o L não cabe (a ponta de chegada está do lado errado): quatro trechos', () => {
    // Sai pela direita de A, mas B está à esquerda e chega pelo topo, com A abaixo de B.
    const p = scene(r(300, 400), r(0, 0), { fromSide: 'right', toSide: 'top' });
    const { points, lanes } = route(p);
    expect(lanes).toHaveLength(2);
    expect(points).toHaveLength(5);
    leavesAndArrivesPerpendicular(p);
    // A primeira dobra respeita o trecho mínimo de saída.
    expect((points[1] as ArrowPoint).x - (points[0] as ArrowPoint).x).toBe(ELBOW_STUB);
  });

  it('os dois do mesmo lado (C): a pista passa depois das duas marcações', () => {
    const p = scene(r(0, 0), r(0, 300), { fromSide: 'right', toSide: 'right' });
    const { points, lanes } = route(p);
    expect(lanes).toEqual([{ axis: 'x', value: 100 + ELBOW_STUB }]);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 100 + ELBOW_STUB, y: 50 },
      { x: 100 + ELBOW_STUB, y: 350 },
      { x: 100, y: 350 },
    ]);
    leavesAndArrivesPerpendicular(p);
    const left = scene(r(0, 0), r(40, 300), { fromSide: 'left', toSide: 'left' });
    expect(route(left).lanes).toEqual([{ axis: 'x', value: -ELBOW_STUB }]);
    leavesAndArrivesPerpendicular(left);
  });

  it('marcações coladas, de frente uma para a outra: cinco trechos com o mínimo nas pontas', () => {
    // Sem espaço para o Z (menos que duas vezes o trecho mínimo entre elas).
    const p = scene(r(0, 0), r(110, 200), { fromSide: 'right', toSide: 'left' });
    const { points, lanes } = route(p);
    expect(lanes.map((l) => l.axis)).toEqual(['x', 'y', 'x']);
    expect(points).toHaveLength(6);
    leavesAndArrivesPerpendicular(p);
  });

  it('sempre ortogonal, saindo e chegando do lado certo, em todas as combinações de lados', () => {
    const sides: ArrowSide[] = ['top', 'right', 'bottom', 'left'];
    const targets = [r(400, 300), r(-400, 300), r(30, -300), r(110, 20), r(-30, 150)];
    for (const to of targets) {
      for (const fromSide of sides) {
        for (const toSide of sides) {
          leavesAndArrivesPerpendicular(scene(r(0, 0), to, { fromSide, toSide }));
        }
      }
    }
  });
});

describe('elbow: pontos de passagem são segmentos do meio', () => {
  it('uma pista dada: o segmento vertical vai para o x do ponto (o y é ignorado)', () => {
    const p = scene(r(0, 0), r(400, 300), { points: [{ x: 180, y: 9999 }] });
    const { points, lanes } = route(p);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 350 },
      { x: 400, y: 350 },
    ]);
    expect(lanes).toEqual([{ axis: 'x', value: 180 }]);
  });

  it('no eixo vertical a pista fixa o y', () => {
    const p = scene(r(0, 0), r(300, 400), { points: [{ x: 9999, y: 180 }] });
    expect(route(p).points).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 180 },
      { x: 350, y: 180 },
      { x: 350, y: 400 },
    ]);
  });

  it('mover uma marcação estica só o primeiro ou o último segmento', () => {
    const lane = [{ x: 180, y: 200 }];
    const before = route(scene(r(0, 0), r(400, 300), { points: lane })).points;
    // A sobe e B desce: a pista do meio fica no x = 180, só as pontas esticam.
    const after = route(scene(r(0, -60), r(400, 340), { points: lane })).points;
    expect(after).toHaveLength(before.length);
    expect(after[1]).toEqual({ x: 180, y: -10 });
    expect(after[2]).toEqual({ x: 180, y: 390 });
    expect((after[1] as ArrowPoint).x).toBe((before[1] as ArrowPoint).x);
    expect((after[2] as ArrowPoint).x).toBe((before[2] as ArrowPoint).x);
    expect(orthogonal(after)).toBe(true);
    // Movida na direção do trecho, a primeira perna encolhe: a pista continua onde estava.
    const closer = route(scene(r(40, 0), r(400, 300), { points: lane })).points;
    expect(closer[0]).toEqual({ x: 140, y: 50 });
    expect(closer[1]).toEqual({ x: 180, y: 50 });
  });

  it('três pistas (cinco trechos), alternando vertical, horizontal, vertical', () => {
    const p = scene(r(0, 0), r(400, 300), {
      points: [
        { x: 120, y: 0 },
        { x: 0, y: 200 },
        { x: 330, y: 0 },
      ],
    });
    expect(route(p).points).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 120, y: 200 },
      { x: 330, y: 200 },
      { x: 330, y: 350 },
      { x: 400, y: 350 },
    ]);
  });

  it('lados perpendiculares: duas pistas (horizontal e vertical)', () => {
    const p = scene(r(0, 0), r(300, 300), {
      fromSide: 'right',
      toSide: 'top',
      points: [
        { x: 200, y: 0 },
        { x: 0, y: 150 },
      ],
    });
    expect(route(p).points).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 350, y: 150 },
      { x: 350, y: 300 },
    ]);
  });

  it('pontos que não casam com os lados (quantidade errada) são ignorados: rota padrão', () => {
    const base = route(scene(r(0, 0), r(400, 300))).points;
    const twoLanes = scene(r(0, 0), r(400, 300), {
      points: [
        { x: 120, y: 0 },
        { x: 0, y: 200 },
      ],
    });
    expect(route(twoLanes).points).toEqual(base);
  });

  it('o lado automático não depende dos pontos', () => {
    // O ponto longe abaixo não vira o lado de saída para baixo, como faria na reta.
    const p = scene(r(0, 0), r(400, 300), { points: [{ x: 180, y: 5000 }] });
    expect(route(p)).toMatchObject({ fromSide: 'right', toSide: 'left' });
  });

  it('reta e curva continuam com a polilinha de antes e sem pistas', () => {
    const p = scene(r(0, 0), r(400, 300));
    const straight = {
      ...p,
      arrows: p.arrows.map((a) => ({ ...a, style: 'straight' as const })),
    };
    expect(route(straight)).toEqual({
      points: [
        { x: 100, y: 50 },
        { x: 400, y: 350 },
      ],
      fromSide: 'right',
      toSide: 'left',
      lanes: [],
    });
  });
});
