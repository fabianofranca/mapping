// EX6 da etapa "expressões que calculam no formato 4" (#897): no pull-to-refresh o arco e a seta do
// indicador de arrasto saem na orientação canônica (o arco no 3 horas, a seta ao lado do centro), e
// o ângulo vem de `rotation` por expressão com os números do Compose (`ArrowValues(1)`,
// `drawArrow`), em vez de coordenadas já giradas dentro do `d`. O desenho de antes (cenas gravadas
// em tests/fixtures/material3-ex6-v1.json) fica o mesmo a ≤ 0,5 px por nó.
import { describe, expect, it } from 'vitest';
import { walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode } from '../../src/model/components/scene';
import { text, typeOf } from '../support/material3Library';
import {
  draw,
  drawnPathPoints,
  missingNodes,
  oldScenes,
  pathPoints,
  type Drawing,
} from '../support/material3Ex6Fixture';

const pull = (mode: 'light' | 'dark' = 'light'): Drawing =>
  draw('pull-to-refresh', { isRefreshing: 'false', width: 'fill', height: 'fill' }, mode);
const refreshing = (mode: 'light' | 'dark' = 'light'): Drawing =>
  draw('pull-to-refresh', { isRefreshing: 'true', width: 'fill', height: 'fill' }, mode);

const visiblePaths = (d: Drawing): PathNode[] =>
  [...walk(d.root)].filter(
    (n: SceneNode): n is PathNode => n.visible && n.type === 'path',
  );
const pathNamed = (d: Drawing, name: string): PathNode => {
  const found = visiblePaths(d).filter((n) => n.name === name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};

// ---------------------------------------------------------------------------------------------
// O que o Compose calcula em `ArrowValues(progress = 1)` (PullToRefresh.kt 690 a 708) e em `drawArrow`
// (710 a 732), refeito aqui de forma independente do componente
// ---------------------------------------------------------------------------------------------

const MAX_PROGRESS_ARC = 0.8;
const STROKE_WIDTH = 2.5;
const ARC_RADIUS = 5.5;
const ARROW_WIDTH = 10;
const ARROW_HEIGHT = 5;

function arrowValues(progress: number) {
  const adjustedPercent = (Math.max(Math.min(1, progress) - 0.4, 0) * 5) / 3;
  const overshoot = Math.abs(progress) - 1;
  const linearTension = Math.min(Math.max(overshoot, 0), 2);
  const tension = linearTension - linearTension ** 2 / 4;
  const endTrim = adjustedPercent * MAX_PROGRESS_ARC;
  const rotation = (-0.25 + 0.4 * adjustedPercent + tension) * 0.5;
  return {
    rotation,
    startAngle: rotation * 360,
    endAngle: (rotation + endTrim) * 360,
    scale: Math.min(1, adjustedPercent),
  };
}

const rotate = (
  x: number,
  y: number,
  degrees: number,
  cx = 12,
  cy = 12,
): [number, number] => {
  const rad = (degrees * Math.PI) / 180;
  return [
    cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad),
    cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad),
  ];
};

/** Os pontos do arco e da seta do Compose, no quadro de 24 com o centro em (12, 12). */
function composeGeometry() {
  const v = arrowValues(1);
  const radius = ARC_RADIUS + STROKE_WIDTH / 2;
  // o arco: drawArc(startAngle, sweep = endAngle - startAngle) dentro de rotate(values.rotation)
  const arcPoint = (angle: number): [number, number] =>
    rotate(
      12 + radius * Math.cos((angle * Math.PI) / 180),
      12 + radius * Math.sin((angle * Math.PI) / 180),
      v.rotation,
    );
  // a seta: moveTo(0,0), lineTo(w/2, h), lineTo(w, 0), levada para (radius + cx - inset, cy - strokeWidth)
  const inset = (ARROW_WIDTH * v.scale) / 2;
  const dx = radius + 12 - inset;
  const dy = 12 - STROKE_WIDTH;
  const arrow = [
    [0, 0],
    [(ARROW_WIDTH * v.scale) / 2, ARROW_HEIGHT * v.scale],
    [ARROW_WIDTH * v.scale, 0],
  ].map(([x, y]) => rotate(x! + dx, y! + dy, v.endAngle - STROKE_WIDTH + v.rotation));
  return {
    v,
    arcStart: arcPoint(v.startAngle),
    arcEnd: arcPoint(v.endAngle),
    arrow,
  };
}

const near = (a: readonly number[], b: readonly number[], eps = 0.01) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe('EX6 pull-to-refresh — o arco e a seta do arrasto giram por rotation', () => {
  it('ArrowValues(1) do Compose: 0,075 de rotação, arco de 27° a 315° (288°) e seta cheia', () => {
    const { v } = composeGeometry();
    expect(v.rotation).toBeCloseTo(0.075, 10);
    expect(v.startAngle).toBeCloseTo(27, 10);
    expect(v.endAngle).toBeCloseTo(315, 10);
    expect(v.scale).toBe(1);
  });

  it('o arco tem rotation = startAngle + rotation do Compose (27,075°) e o d na orientação canônica', () => {
    for (const mode of ['light', 'dark'] as const) {
      const arc = pathNamed(pull(mode), 'anel');
      expect(arc.rotation, 'arco').toBeCloseTo(27.075, 6);
      // canônico: o arco parte do 3 horas (18,75 = 12 + 6,75) e varre 288° até o ponto de 288°
      const points = pathPoints(arc.d)!;
      expect(points).toHaveLength(2);
      expect(near([points[0]!.x, points[0]!.y], [18.75, 12])).toBe(true);
      const end = [
        12 + 6.75 * Math.cos((288 * Math.PI) / 180),
        12 + 6.75 * Math.sin((288 * Math.PI) / 180),
      ];
      expect(near([points[1]!.x, points[1]!.y], end)).toBe(true);
      expect(points[1]!.flags).toBe('11');
    }
  });

  it('a seta tem rotation = endAngle − strokeWidth + rotation do Compose (312,575°) e o d na orientação canônica', () => {
    for (const mode of ['light', 'dark'] as const) {
      const arrow = pathNamed(pull(mode), 'seta');
      expect(arrow.rotation, 'seta').toBeCloseTo(312.575, 6);
      // canônica: canto esquerdo a 1,75 do centro e 2,5 acima dele, ponta 5 à direita e 5 abaixo
      const points = pathPoints(arrow.d)!;
      expect(points.map((p) => [p.x, p.y])).toEqual([
        [13.75, 9.5],
        [18.75, 14.5],
        [23.75, 9.5],
      ]);
    }
  });

  it('já giradas, as pontas do arco e os três pontos da seta caem onde o drawCircularIndicator e o drawArrow do Compose os põem', () => {
    const geometry = composeGeometry();
    const d = pull();
    const arc = drawnPathPoints(pathNamed(d, 'anel'))!;
    expect(near([arc[0]!.x, arc[0]!.y], geometry.arcStart)).toBe(true);
    expect(near([arc[1]!.x, arc[1]!.y], geometry.arcEnd)).toBe(true);
    const arrow = drawnPathPoints(pathNamed(d, 'seta'))!;
    geometry.arrow.forEach((p, i) => {
      expect(near([arrow[i]!.x, arrow[i]!.y], p), `ponto ${i}`).toBe(true);
    });
  });

  it('o estado "atualizando" não leva rotation: o spinner é o arco do 12 horas e já está na posição', () => {
    const d = refreshing();
    expect(pathNamed(d, 'anel').rotation ?? 0).toBe(0);
    expect(visiblePaths(d).map((p) => p.name)).toEqual(['anel']);
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: as cenas de antes, a ≤ 0,5 px por nó (os pontos dos path já com a rotation aplicada)
// ---------------------------------------------------------------------------------------------

describe('EX6 pull-to-refresh — regressão contra as cenas de antes', () => {
  it('os dois exemplos (atualizando e em repouso), claro e escuro, ficam iguais a ≤ 0,5 px', () => {
    const scenes = oldScenes('pull-to-refresh-');
    expect(scenes).toHaveLength(4);
    for (const s of scenes)
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
  });

  it('o arco e a seta de antes (coordenadas giradas) são achados, ponto a ponto, no desenho girado', () => {
    const scenes = oldScenes('pull-to-refresh-').filter(
      (s) => s.values['isRefreshing'] === 'false',
    );
    expect(scenes).toHaveLength(2);
    for (const s of scenes) {
      const paths = s.nodes.filter((n) => n.t === 'path');
      expect(paths.map((p) => p.n)).toEqual(['anel', 'seta']);
      const d = draw(s.id, s.values, s.mode);
      for (const old of paths) {
        const before = pathPoints(old.d!)!;
        const now = drawnPathPoints(pathNamed(d, old.n))!;
        expect(now, `${s.key} ${old.n}`).toHaveLength(before.length);
        before.forEach((p, i) =>
          expect(near([now[i]!.x, now[i]!.y], [p.x, p.y], 0.5)).toBe(true),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas
// ---------------------------------------------------------------------------------------------

/** Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. */
function offenders(): string[] {
  const numberFields = new Set(
    typeOf('pull-to-refresh')
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const count = Object.keys(cases).length;
      if (count > 12) found.push(`${path}: $switch de ${count} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text('components/pull-to-refresh.json')), 'pull-to-refresh');
  return found;
}

describe('EX6 pull-to-refresh — sem tabelas enumeradas', () => {
  it('não há $switch com mais de 12 casos nem $eq sobre campo number', () => {
    expect(offenders()).toEqual([]);
  });
});
