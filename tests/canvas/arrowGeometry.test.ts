import { describe, expect, it } from 'vitest';
import {
  ARROW_HANDLE_HIT_RADIUS,
  ARROW_MID_HANDLE_MIN,
  arrowHandleAt,
  arrowHandles,
  arrowShape,
  arrowsAt,
  curvePath,
  distanceToPath,
  distanceToSegment,
  flatPoints,
  headDirection,
  headPoints,
  isOnLinkHandle,
  linkHandlePoint,
  nearestSide,
  pathMidpoint,
  thinPath,
  trimPathEnd,
  visibleArrowShapes,
} from '../../src/canvas/arrowGeometry';
import { setArrowRoute, setArrowStyle, type Project } from '../../src/model';
import { arrowProject, withArrow } from '../model/arrowFixtures';

// r1: a1 (100,100,300,300) → a3 (600,600,200,200), as duas no container A (escala 1, em 0,0).
// Lado automático: saída pela direita de a1 (400,250) e chegada pela esquerda de a3 (600,700).
const NONE = new Map();

function shapeOf(p: Project, id = 'r1') {
  const arrow = p.arrows.find((a) => a.id === id);
  if (!arrow) throw new Error('seta');
  const shape = arrowShape(p, arrow);
  if (!shape) throw new Error('forma');
  return shape;
}

describe('distâncias', () => {
  it('ponto ao segmento: perpendicular, ponta e segmento degenerado', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('ponto ao traço: o menor dos segmentos', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(distanceToPath({ x: 12, y: 5 }, path)).toBe(2);
    expect(distanceToPath({ x: 5, y: -1 }, path)).toBe(1);
    expect(distanceToPath({ x: 1, y: 1 }, [])).toBe(Infinity);
  });
});

describe('traço', () => {
  it('reta e canto: os pontos da rota; as âncoras são o meio dos lados', () => {
    const p = setArrowStyle(arrowProject(), 'r1', 'straight');
    const shape = shapeOf(p);
    expect(shape.path).toEqual([
      { x: 400, y: 250 },
      { x: 600, y: 700 },
    ]);
    expect(shape.mids).toEqual([{ x: 500, y: 475 }]);
    expect(shape.bounds).toEqual({ x: 400, y: 250, width: 200, height: 450 });
    const elbow = shapeOf(setArrowStyle(arrowProject(), 'r1', 'elbow'));
    expect(elbow.path).toEqual(shape.path);
  });

  it('curva: sai perpendicular ao lado, passa pelos pontos e termina na âncora', () => {
    const shape = shapeOf(arrowProject());
    expect(shape.arrow.style).toBe('curve');
    const { path } = shape;
    expect(path[0]).toEqual({ x: 400, y: 250 });
    expect(path[path.length - 1]).toEqual({ x: 600, y: 700 });
    // Saída pela direita (+x) e chegada pela esquerda: as duas tangentes são horizontais.
    expect(path[1]?.x).toBeGreaterThan(400);
    expect(Math.abs((path[1]?.y ?? 0) - 250)).toBeLessThan(10);
    expect(headDirection(path).x).toBeGreaterThan(0.95);
    // O meio da curva é o do Bézier: (500, 475), simétrico em torno do centro da corda.
    expect(shape.mids[0]?.x).toBeCloseTo(500);
    expect(shape.mids[0]?.y).toBeCloseTo(475);
    expect(shape.label.x).toBeCloseTo(500, 0);
    expect(shape.label.y).toBeCloseTo(475, 0);
  });

  it('curva com pontos de passagem: passa por eles', () => {
    const p = setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]);
    const shape = shapeOf(p);
    expect(shape.route.points[1]).toEqual({ x: 700, y: 300 });
    expect(shape.path.some((pt) => pt.x === 700 && pt.y === 300)).toBe(true);
    expect(shape.mids).toHaveLength(2);
    const ends = curvePath(shape.route.points, 'right', 'left');
    expect(ends.mids).toHaveLength(2);
  });

  it('meio do traço pelo comprimento', () => {
    expect(pathMidpoint([])).toEqual({ x: 0, y: 0 });
    expect(
      pathMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
      ]),
    ).toEqual({ x: 10, y: 10 });
  });

  it('ponta: direção do último trecho e triângulo com a ponta no destino', () => {
    expect(
      headDirection([
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toEqual({ x: 0, y: 1 });
    const pts = headPoints({ x: 10, y: 10 }, { x: 1, y: 0 }, 10);
    expect(pts.slice(0, 2)).toEqual([10, 10]);
    expect(pts[2]).toBe(0);
    expect(pts[4]).toBe(0);
    expect(pts[3]).toBe(-(pts[5] as number) + 20);
    expect(
      flatPoints([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it('afina o traço: pontos a menos de `spacing` do anterior saem; as pontas ficam', () => {
    const path = [0, 1, 2, 3, 10, 11, 20].map((x) => ({ x, y: 0 }));
    expect(thinPath(path, 5).map((p) => p.x)).toEqual([0, 10, 20]);
    expect(thinPath(path, 0).map((p) => p.x)).toEqual([0, 1, 2, 3, 10, 11, 20]);
    expect(thinPath([{ x: 1, y: 1 }], 5)).toEqual([{ x: 1, y: 1 }]);
    expect(thinPath([], 5)).toEqual([]);
  });

  it('tira o fim do traço pelo comprimento da ponta', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(trimPathEnd(path, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
    ]);
    expect(trimPathEnd(path, 12)).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]);
    expect(trimPathEnd(path, 100)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('formas do projeto', () => {
  it('a forma de uma seta é guardada enquanto a seta e as pontas são as mesmas', () => {
    const p = arrowProject();
    const first = shapeOf(p);
    expect(shapeOf(p)).toBe(first);
    // Outra versão do projeto, a mesma seta e as mesmas marcações e containers: mesma forma.
    expect(shapeOf({ ...p })).toBe(first);
    // Mudar a seta (estilo) refaz a forma.
    expect(shapeOf(setArrowStyle(p, 'r1', 'straight'))).not.toBe(first);
  });

  it('seta de ponta inexistente não tem forma', () => {
    const p = arrowProject();
    const broken = { ...p, markings: p.markings.filter((m) => m.id !== 'a3') };
    expect(arrowShape(broken, p.arrows[0] as never)).toBeNull();
  });

  it('só as setas com as duas pontas à vista; o mesmo array enquanto nada muda', () => {
    const p = arrowProject();
    const all = visibleArrowShapes(p, NONE);
    expect(all.map((s) => s.arrow.id)).toEqual(['r1']);
    expect(visibleArrowShapes(p, NONE)).toBe(all);
    expect(visibleArrowShapes(p, new Map([['a3', 'hidden' as const]]))).toEqual([]);
    expect(visibleArrowShapes(p, new Map([['a1', 'dim' as const]]))).toHaveLength(1);
    expect(visibleArrowShapes(null, NONE)).toEqual([]);
    const base = visibleArrowShapes(p, NONE);
    // Uma edição que não mexe nas setas devolve o mesmo array (a camada não se refaz).
    const renamed = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'a2' ? { ...m, name: 'x' } : m)),
    };
    expect(visibleArrowShapes(renamed, new Map())).toBe(base);
  });

  it('a ordem do projeto é a de desenho', () => {
    const p = withArrow(arrowProject(), 'r2', 'a3', 'b2');
    expect(visibleArrowShapes(p, NONE).map((s) => s.arrow.id)).toEqual(['r1', 'r2']);
  });
});

describe('toque', () => {
  const straight = () => setArrowStyle(arrowProject(), 'r1', 'straight');

  it('pega a seta a até 7 px de tela do traço e não além', () => {
    const shapes = visibleArrowShapes(straight(), NONE);
    // A reta de (400,250) a (600,700): passa por (500,475).
    expect(arrowsAt(shapes, { x: 500, y: 475 }, 1)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 505, y: 475 }, 1)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 520, y: 475 }, 1)).toHaveLength(0);
    // Com zoom 4, o mesmo deslocamento em unidades do canvas já é longe; em px de tela, perto.
    expect(arrowsAt(shapes, { x: 501, y: 475 }, 4)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 506, y: 475 }, 4)).toHaveLength(0);
    expect(arrowsAt(shapes, { x: 0, y: 0 }, 1)).toHaveLength(0);
  });

  it('a mais perto primeiro; no empate, a de cima', () => {
    const p = withArrow(straight(), 'r2', 'a1', 'a3', { style: 'straight' });
    const shapes = visibleArrowShapes(p, NONE);
    expect(arrowsAt(shapes, { x: 500, y: 475 }, 1).map((s) => s.arrow.id)).toEqual([
      'r2',
      'r1',
    ]);
    const q = withArrow(straight(), 'r3', 'a1', 'b2', { style: 'straight' });
    // r3 passa a uma distância diferente do mesmo ponto: o de menor distância vem antes.
    const near = arrowsAt(visibleArrowShapes(q, NONE), { x: 500, y: 475 }, 1);
    expect(near.map((s) => s.arrow.id)).toContain('r1');
  });
});

describe('alças', () => {
  it('pontas, pontos de passagem e meios dos trechos, nessa ordem', () => {
    const p = setArrowStyle(
      setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]),
      'r1',
      'straight',
    );
    const handles = arrowHandles(shapeOf(p), 1);
    expect(handles.map((h) => h.kind)).toEqual(['end', 'end', 'point', 'mid', 'mid']);
    expect(handles[0]).toMatchObject({ end: 'from', at: { x: 400, y: 250 } });
    // Com o ponto de passagem acima de a3, a seta chega pelo lado de cima: (700, 600).
    expect(handles[1]).toMatchObject({ end: 'to', at: { x: 700, y: 600 } });
    expect(handles[2]).toMatchObject({ index: 0, at: { x: 700, y: 300 } });
    // O meio do primeiro trecho entra na posição 0; o do segundo, na 1.
    expect(handles[3]).toMatchObject({ index: 0, at: { x: 550, y: 275 } });
    expect(handles[4]).toMatchObject({ index: 1, at: { x: 700, y: 450 } });
  });

  it('o meio de um trecho curto na tela não ganha alça', () => {
    const shape = shapeOf(setArrowStyle(arrowProject(), 'r1', 'straight'));
    const length = Math.hypot(200, 450);
    expect(arrowHandles(shape, (ARROW_MID_HANDLE_MIN - 1) / length)).toHaveLength(2);
    expect(arrowHandles(shape, ARROW_MID_HANDLE_MIN / length)).toHaveLength(3);
  });

  it('acha a alça sob o ponto: ponta antes de ponto, antes de meio', () => {
    const p = setArrowStyle(
      setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]),
      'r1',
      'straight',
    );
    const shape = shapeOf(p);
    expect(arrowHandleAt(shape, { x: 403, y: 252 }, 1)).toMatchObject({
      kind: 'end',
      end: 'from',
    });
    expect(arrowHandleAt(shape, { x: 700, y: 303 }, 1)).toMatchObject({
      kind: 'point',
      index: 0,
    });
    expect(arrowHandleAt(shape, { x: 550, y: 275 }, 1)).toMatchObject({
      kind: 'mid',
      index: 0,
    });
    expect(arrowHandleAt(shape, { x: 500, y: 100 }, 1)).toBeNull();
    // O raio é em px de tela: com zoom 2 o alcance em unidades do canvas é a metade.
    const reach = ARROW_HANDLE_HIT_RADIUS;
    expect(arrowHandleAt(shape, { x: 700 + reach / 2 - 1, y: 300 }, 2)).not.toBeNull();
    expect(arrowHandleAt(shape, { x: 700 + reach / 2 + 1, y: 300 }, 2)).toBeNull();
  });

  it('alça de ligação: fora da borda direita, no meio do lado', () => {
    const rect = { x: 100, y: 100, width: 300, height: 300 };
    expect(linkHandlePoint(rect, 1)).toEqual({ x: 414, y: 250 });
    expect(linkHandlePoint(rect, 2)).toEqual({ x: 407, y: 250 });
    expect(isOnLinkHandle(rect, { x: 410, y: 255 }, 1)).toBe(true);
    expect(isOnLinkHandle(rect, { x: 380, y: 250 }, 1)).toBe(false);
  });

  it('lado mais perto do ponteiro, de dentro e de fora', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    expect(nearestSide(rect, { x: 50, y: -20 })).toBe('top');
    expect(nearestSide(rect, { x: 140, y: 25 })).toBe('right');
    expect(nearestSide(rect, { x: 50, y: 80 })).toBe('bottom');
    expect(nearestSide(rect, { x: -30, y: 25 })).toBe('left');
    // Dentro: o lado de borda mais perto.
    expect(nearestSide(rect, { x: 90, y: 25 })).toBe('right');
    expect(nearestSide(rect, { x: 50, y: 5 })).toBe('top');
  });
});
