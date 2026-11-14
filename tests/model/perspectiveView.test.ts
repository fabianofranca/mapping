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

// The project as seen from a perspective (v16, decision 3). Geometry of `multiProject` (see
// tests/model/multiSelectionFixtures.ts): roots D and E (containers), G (canvas marking that
// surrounds A, B and C), H (canvas) and N (floating).

function perspective(...items: [string, number, number][]): Perspective {
  return {
    id: 'P',
    name: 'View',
    hiddenLayers: [],
    items: items.map(([root, x, y]) => ({ root, x, y })),
  };
}

/** `arrowBase` with arrows: r1 a1→a3 (same container), r2 a1→b1 (same roots, different containers), r4 a1→H (different roots). */
function withArrows(): Project {
  let p = arrowBase();
  p = withArrow(p, 'r1', 'a1', 'a3', { points: [{ x: 5, y: 6 }] });
  p = withArrow(p, 'r2', 'a1', 'b1', { points: [{ x: 1000, y: 200 }] });
  p = withArrow(p, 'r4', 'a1', 'H', { points: [{ x: 500, y: 1200 }] });
  return p;
}

describe('rootPosition e rootFootprint', () => {
  const p = arrowBase();

  it('container: the placement; canvas marking: the rect; container marking: placement + rect × scale', () => {
    expect(rootPosition(p, 'D')).toEqual({ x: 7000, y: 0 });
    expect(rootPosition(p, 'H')).toEqual({ x: 400, y: 1300 });
    expect(rootPosition(p, 'a1')).toEqual({ x: 100, y: 100 });
    expect(rootPosition(p, 'b1')).toEqual({ x: 2100, y: 100 });
    expect(rootPosition(p, 'zzz')).toBeNull();
  });

  it("the footprint is the root's rectangle on the canvas", () => {
    expect(rootFootprint(p, 'E')).toEqual({ x: 9000, y: 0, width: 1000, height: 1000 });
    expect(rootFootprint(p, 'H')).toEqual({ x: 400, y: 1300, width: 200, height: 100 });
    expect(rootFootprint(p, 'b1')).toEqual({ x: 2100, y: 100, width: 200, height: 200 });
    expect(rootFootprint(p, 'zzz')).toBeNull();
  });
});

describe('perspectiveView', () => {
  const p = multiProjectAnnotated();

  it('the Main one (null) is the project itself', () => {
    expect(perspectiveView(p, null)).toBe(p);
  });

  it('only the roots of items, with their content', () => {
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

  it('an item that does not exist or is not a root is ignored; a repeated root counts the first', () => {
    const view = perspectiveView(
      p,
      perspective(['zzz', 0, 0], ['A', 0, 0], ['D', 7100, 50], ['D', 0, 0]),
    );
    expect(view.containers.map((c) => c.id)).toEqual(['D']);
    expect(view.containers[0]?.placement).toMatchObject({ x: 7100, y: 50 });
  });

  it("container: the root goes to the item's position and its marking does not change", () => {
    const view = perspectiveView(p, perspective(['E', 9500, -20]));
    expect(view.containers.map((c) => [c.id, c.placement.x, c.placement.y])).toEqual([
      ['E', 9500, -20],
    ]);
    expect(view.markings.map((m) => [m.id, m.containerId, m.rect])).toEqual([
      ['e1', 'E', { x: 100, y: 100, width: 200, height: 200 }],
    ]);
  });

  it("canvas marking: takes the group's containers and the canvas markings, not the container ones", () => {
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

  it('canvas marking: the offset is an integer', () => {
    const view = perspectiveView(p, perspective(['H', 410.4, 1300]));
    expect(view.markings[0]?.rect).toEqual({ x: 410, y: 1300, width: 200, height: 100 });
  });

  it('parentId and containerId never change; the rest of the project stays the same', () => {
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

  it('annotations: only those of the markings that remained', () => {
    expect(perspectiveView(p, perspective(['D', 7000, 0])).annotations).toEqual([]);
    expect(perspectiveView(p, perspective(['G', -100, -100])).annotations.length).toBe(4);
  });

  it('memoizes: the same project and the same perspective give the same object', () => {
    const view = perspective(['G', 0, 0]);
    expect(perspectiveView(p, view)).toBe(perspectiveView(p, view));
    expect(perspectiveView(p, { ...view })).not.toBe(perspectiveView(p, view));
    expect(perspectiveView({ ...p }, view)).not.toBe(perspectiveView(p, view));
  });
});

describe('perspectiveView: arrows (decision 7)', () => {
  const p = withArrows();
  const arrows = (view: Project) => new Map(view.arrows.map((a) => [a.id, a]));

  it('only the arrows with both ends in the view', () => {
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

  it('both ends in the same container: the points stay; same root: they move with it', () => {
    const view = perspectiveView(p, perspective(['G', 900, 400]));
    expect(arrows(view).get('r1')?.points).toEqual([{ x: 5, y: 6 }]);
    expect(arrows(view).get('r2')?.points).toEqual([{ x: 2000, y: 700 }]);
  });

  it('different roots: no points (automatic route)', () => {
    const view = perspectiveView(p, perspective(['G', 0, 0], ['H', 0, 0]));
    expect(arrows(view).get('r4')?.points).toEqual([]);
  });

  it('arrowShownIn: the Main one shows all; the perspective, those with both ends', () => {
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

  it('perspectiveRootOf: the root of the container or marking; nonexistent is null', () => {
    expect(perspectiveRootOf(p, 'a1')).toBe('G');
    expect(perspectiveRootOf(p, 'B')).toBe('G');
    expect(perspectiveRootOf(p, 'e1')).toBe('E');
    expect(perspectiveRootOf(p, 'H')).toBe('H');
    expect(perspectiveRootOf(p, 'zzz')).toBeNull();
  });

  it('perspectiveContentCount: root containers and root markings that exist', () => {
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
