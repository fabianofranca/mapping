import { describe, expect, it } from 'vitest';
import {
  arrowShownIn,
  perspectiveContentCount,
  perspectiveRootOf,
  perspectiveView,
  rootFootprint,
  rootPosition,
  type Perspective,
  type Project,
} from '../../src/model';
import { arrowBase, withArrow } from './arrowFixtures';
import { multiProjectAnnotated } from './multiSelectionFixtures';

// O projeto à vista de uma perspectiva (v16, decisão 3). Geometria do `multiProject` (ver
// tests/model/multiSelectionFixtures.ts): raízes D e E (containers), G (marcação do canvas que
// cerca A, B e C), H (do canvas) e N (flutuante).

function perspective(...items: [string, number, number][]): Perspective {
  return {
    id: 'P',
    name: 'Vista',
    hiddenLayers: [],
    items: items.map(([root, x, y]) => ({ root, x, y })),
  };
}

/** `arrowBase` com setas: r1 a1→a3 (mesmo container), r2 a1→b1 (raízes iguais, containers diferentes), r4 a1→H (raízes diferentes). */
function withArrows(): Project {
  let p = arrowBase();
  p = withArrow(p, 'r1', 'a1', 'a3', { points: [{ x: 5, y: 6 }] });
  p = withArrow(p, 'r2', 'a1', 'b1', { points: [{ x: 1000, y: 200 }] });
  p = withArrow(p, 'r4', 'a1', 'H', { points: [{ x: 500, y: 1200 }] });
  return p;
}

describe('rootPosition e rootFootprint', () => {
  const p = arrowBase();

  it('container: o placement; marcação do canvas: o rect; marcação de container: placement + rect × escala', () => {
    expect(rootPosition(p, 'D')).toEqual({ x: 7000, y: 0 });
    expect(rootPosition(p, 'H')).toEqual({ x: 400, y: 1300 });
    expect(rootPosition(p, 'a1')).toEqual({ x: 100, y: 100 });
    expect(rootPosition(p, 'b1')).toEqual({ x: 2100, y: 100 });
    expect(rootPosition(p, 'zzz')).toBeNull();
  });

  it('a pegada é o retângulo da raiz no canvas', () => {
    expect(rootFootprint(p, 'E')).toEqual({ x: 9000, y: 0, width: 1000, height: 1000 });
    expect(rootFootprint(p, 'H')).toEqual({ x: 400, y: 1300, width: 200, height: 100 });
    expect(rootFootprint(p, 'b1')).toEqual({ x: 2100, y: 100, width: 200, height: 200 });
    expect(rootFootprint(p, 'zzz')).toBeNull();
  });
});

describe('perspectiveView', () => {
  const p = multiProjectAnnotated();

  it('a Principal (null) é o próprio projeto', () => {
    expect(perspectiveView(p, null)).toBe(p);
  });

  it('só as raízes de items, com o conteúdo junto', () => {
    const view = perspectiveView(p, perspective(['D', 7000, 0], ['G', -100, -100]));
    expect(view.containers.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(view.markings.map((m) => m.id)).toEqual([
      'G',
      'G2',
      'a1',
      'a2',
      'a3',
      'b1',
      'c1',
    ]);
  });

  it('item que não existe ou que não é raiz é ignorado; raiz repetida vale a primeira', () => {
    const view = perspectiveView(
      p,
      perspective(['zzz', 0, 0], ['A', 0, 0], ['D', 7100, 50], ['D', 0, 0]),
    );
    expect(view.containers.map((c) => c.id)).toEqual(['D']);
    expect(view.containers[0]?.placement).toMatchObject({ x: 7100, y: 50 });
  });

  it('container: a raiz vai para a posição do item e a marcação dele não muda', () => {
    const view = perspectiveView(p, perspective(['E', 9500, -20]));
    expect(view.containers.map((c) => [c.id, c.placement.x, c.placement.y])).toEqual([
      ['E', 9500, -20],
    ]);
    expect(view.markings.map((m) => [m.id, m.containerId, m.rect])).toEqual([
      ['e1', 'E', { x: 100, y: 100, width: 200, height: 200 }],
    ]);
  });

  it('marcação do canvas: leva os containers do grupo e as marcações do canvas, não as de container', () => {
    const view = perspectiveView(p, perspective(['G', 900, 400]));
    const byId = new Map(view.markings.map((m) => [m.id, m]));
    // d = (900 - (-100), 400 - (-100)) = (1000, 500)
    expect(byId.get('G')?.rect).toEqual({ x: 900, y: 400, width: 5300, height: 1200 });
    expect(byId.get('G2')?.rect).toEqual({ x: 950, y: 450, width: 1100, height: 1100 });
    expect(byId.get('a1')?.rect).toEqual({ x: 100, y: 100, width: 300, height: 300 });
    expect(view.containers.map((c) => [c.id, c.placement.x, c.placement.y])).toEqual([
      ['A', 1000, 500],
      ['B', 3000, 500],
      ['C', 5000, 500],
    ]);
  });

  it('marcação do canvas: o deslocamento é inteiro', () => {
    const view = perspectiveView(p, perspective(['H', 410.4, 1300]));
    expect(view.markings[0]?.rect).toEqual({ x: 410, y: 1300, width: 200, height: 100 });
  });

  it('parentId e containerId nunca mudam; o resto do projeto fica igual', () => {
    const view = perspectiveView(p, perspective(['G', 0, 0]));
    for (const m of view.markings) {
      const original = p.markings.find((x) => x.id === m.id);
      expect([m.parentId, m.containerId, m.floating]).toEqual([
        original?.parentId,
        original?.containerId,
        original?.floating,
      ]);
    }
    expect(view.layers).toBe(p.layers);
    expect(view.perspectives).toBe(p.perspectives);
    expect(view.arrivals).toBe(p.arrivals);
    expect(view.specializations).toBe(p.specializations);
  });

  it('anotações: só as das marcações que ficaram', () => {
    expect(perspectiveView(p, perspective(['D', 7000, 0])).annotations).toEqual([]);
    expect(perspectiveView(p, perspective(['G', -100, -100])).annotations.length).toBe(4);
  });

  it('memoiza: o mesmo projeto e a mesma perspectiva dão o mesmo objeto', () => {
    const view = perspective(['G', 0, 0]);
    expect(perspectiveView(p, view)).toBe(perspectiveView(p, view));
    expect(perspectiveView(p, { ...view })).not.toBe(perspectiveView(p, view));
    expect(perspectiveView({ ...p }, view)).not.toBe(perspectiveView(p, view));
  });
});

describe('perspectiveView: setas (decisão 7)', () => {
  const p = withArrows();
  const arrows = (view: Project) => new Map(view.arrows.map((a) => [a.id, a]));

  it('só as setas com as duas pontas na vista', () => {
    expect(
      perspectiveView(p, perspective(['G', -100, -100])).arrows.map((a) => a.id),
    ).toEqual(['r1', 'r2']);
    expect(
      perspectiveView(p, perspective(['G', -100, -100], ['H', 400, 1300])).arrows.map(
        (a) => a.id,
      ),
    ).toEqual(['r1', 'r2', 'r4']);
    expect(perspectiveView(p, perspective(['D', 0, 0])).arrows).toEqual([]);
  });

  it('as duas pontas no mesmo container: os pontos ficam; mesma raiz: andam com ela', () => {
    const view = perspectiveView(p, perspective(['G', 900, 400]));
    expect(arrows(view).get('r1')?.points).toEqual([{ x: 5, y: 6 }]);
    expect(arrows(view).get('r2')?.points).toEqual([{ x: 2000, y: 700 }]);
  });

  it('raízes diferentes: sem pontos (rota automática)', () => {
    const view = perspectiveView(p, perspective(['G', 0, 0], ['H', 0, 0]));
    expect(arrows(view).get('r4')?.points).toEqual([]);
  });

  it('arrowShownIn: a Principal mostra todas; a perspectiva, as que têm as duas pontas', () => {
    const only = perspective(['G', 0, 0]);
    expect(arrowShownIn(p, null, 'r4')).toBe(true);
    expect(arrowShownIn(p, only, 'r1')).toBe(true);
    expect(arrowShownIn(p, only, 'r4')).toBe(false);
    expect(arrowShownIn(p, perspective(['G', 0, 0], ['H', 0, 0]), 'r4')).toBe(true);
    expect(arrowShownIn(p, only, 'inexistente')).toBe(false);
  });
});

describe('raiz de um item e contagem', () => {
  const p = multiProjectAnnotated();

  it('perspectiveRootOf: a raiz do container ou da marcação; inexistente é null', () => {
    expect(perspectiveRootOf(p, 'a1')).toBe('G');
    expect(perspectiveRootOf(p, 'B')).toBe('G');
    expect(perspectiveRootOf(p, 'e1')).toBe('E');
    expect(perspectiveRootOf(p, 'H')).toBe('H');
    expect(perspectiveRootOf(p, 'zzz')).toBeNull();
  });

  it('perspectiveContentCount: containers-raiz e marcações-raiz que existem', () => {
    const view = perspective(
      ['D', 0, 0],
      ['E', 0, 0],
      ['G', 0, 0],
      ['H', 0, 0],
      ['x', 0, 0],
    );
    expect(perspectiveContentCount(p, view)).toEqual({ containers: 2, markings: 2 });
    expect(perspectiveContentCount(p, perspective())).toEqual({
      containers: 0,
      markings: 0,
    });
  });
});
