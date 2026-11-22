import { describe, expect, it } from 'vitest';
import {
  arrowShownIn,
  perspectiveContentCount,
  perspectiveRootOf,
  perspectiveView,
  rootFootprint,
  rootPosition,
  addAnnotation,
  type Arrow,
  type Marking,
  type Perspective,
  type Project,
} from '../../src/model';
import { arrowBase, withArrow } from './arrowFixtures';
import { mk, multiProjectAnnotated, rect } from './multiSelectionFixtures';
import { buildScaleProject } from './scaleProject';

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

describe('rootPosition and rootFootprint', () => {
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
    expect(arrowShownIn(p, only, 'nonexistent')).toBe(false);
  });
});

describe('root of an item and count', () => {
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

describe('perspectiveView: the same view as the plain filter by root (decision 4)', () => {
  /**
   * The reference: today's semantics written as a plain filter by `perspectiveRootOf`. The first item of each
   * root that is a root wins; a container, marking or arrow stays when its root (the `from` and `to` roots of an arrow) is
   * shifted; an annotation stays when its target stays.
   */
  function reference(p: Project, view: Perspective): Project {
    const shifts = new Map<string, { x: number; y: number }>();
    for (const item of view.items) {
      if (shifts.has(item.root) || perspectiveRootOf(p, item.root) !== item.root)
        continue;
      const at = rootPosition(p, item.root)!;
      const whole = p.markings.some((m) => m.id === item.root);
      const dx = item.x - at.x;
      const dy = item.y - at.y;
      shifts.set(
        item.root,
        whole && !p.containers.some((c) => c.id === item.root)
          ? { x: Math.round(dx) || 0, y: Math.round(dy) || 0 }
          : { x: dx, y: dy },
      );
    }
    const shiftOf = (id: string) => shifts.get(perspectiveRootOf(p, id) ?? '');
    const still = (d: { x: number; y: number }) => d.x === 0 && d.y === 0;
    const containers = p.containers
      .filter((c) => shiftOf(c.id))
      .map((c) => {
        const d = shiftOf(c.id)!;
        return still(d)
          ? c
          : {
              ...c,
              placement: {
                ...c.placement,
                x: c.placement.x + d.x,
                y: c.placement.y + d.y,
              },
            };
      });
    const markings = p.markings
      .filter((m) => shiftOf(m.id))
      .map((m): Marking => {
        const d = shiftOf(m.id)!;
        return still(d) || m.containerId !== null
          ? m
          : { ...m, rect: { ...m.rect, x: m.rect.x + d.x, y: m.rect.y + d.y } };
      });
    const arrows = p.arrows
      .filter((a) => shiftOf(a.from) && shiftOf(a.to))
      .map((a): Arrow => {
        const d = shiftOf(a.from)!;
        const from = p.markings.find((m) => m.id === a.from)!;
        const to = p.markings.find((m) => m.id === a.to)!;
        if (a.points.length === 0) return a;
        if (from.containerId !== null && from.containerId === to.containerId) return a;
        if (perspectiveRootOf(p, from.id) !== perspectiveRootOf(p, to.id))
          return { ...a, points: [] };
        if (still(d)) return a;
        return { ...a, points: a.points.map((pt) => ({ x: pt.x + d.x, y: pt.y + d.y })) };
      });
    const kept = new Set([...markings, ...arrows].map((x) => x.id));
    const annotations = p.annotations.filter((a) => kept.has(a.markingId));
    return { ...p, containers, markings, arrows, annotations };
  }

  /** Same content as the reference, and the items that do not move are the project's own objects. */
  function expectSameView(p: Project, view: Perspective) {
    const actual = perspectiveView(p, view);
    const expected = reference(p, view);
    expect(actual).toEqual(expected);
    expect(actual.containers.map((c) => c.id)).toEqual(
      expected.containers.map((c) => c.id),
    );
    expect(actual.annotations.length).toBe(expected.annotations.length);
    actual.annotations.forEach((a, i) => expect(a).toBe(expected.annotations[i]));
    // What does not move is the project's own object (identity kept), not a copy.
    const sameAs = <T extends object>(
      got: readonly T[],
      original: readonly T[],
      want: readonly T[],
    ) =>
      got.forEach((item, i) => {
        if (original.includes(want[i]!)) expect(item).toBe(want[i]);
      });
    sameAs(actual.containers, p.containers, expected.containers);
    sameAs(actual.markings, p.markings, expected.markings);
    sameAs(actual.arrows, p.arrows, expected.arrows);
  }

  it('the scale fixture (250 markings), with both perspectives', () => {
    const p = buildScaleProject({ markings: 250 });
    expect(p.perspectives).toHaveLength(2);
    for (const view of p.perspectives) {
      expect(perspectiveView(p, view).markings.length).toBeGreaterThan(0);
      expectSameView(p, view);
    }
  });

  /** Arrows r1 (inside A), r2 (A to B), r4 (a1 to H) and r5 (N to H, floating to canvas), annotated, plus orphans. */
  function handMade(): Project {
    let p = withArrows();
    p = withArrow(p, 'r5', 'N', 'H', { points: [{ x: 10, y: 10 }] });
    for (const [id, markingId] of [
      ['ar1', 'r1'],
      ['ar2', 'r2'],
      ['ar4', 'r4'],
      ['ar5', 'r5'],
      ['aH', 'H'],
      ['aN', 'N'],
    ] as const) {
      p = addAnnotation(p, { id, markingId, layerId: 'L1' });
    }
    // A repeated marking id (invalid project): it takes the root of that id.
    return {
      ...p,
      markings: [...p.markings, mk('a1', 'B', rect(5, 5, 20, 20))],
      // An annotation whose target does not exist (invalid project).
      annotations: [
        ...p.annotations,
        { ...p.annotations[0]!, id: 'lost', markingId: 'nowhere' },
      ],
    };
  }

  it.each([
    ['an arrow that stays and one that leaves', [['G', -100, -100]]],
    [
      'both ends of the arrow between roots',
      [
        ['G', 3, 7],
        ['H', 400, 1300],
      ],
    ],
    [
      'a repeated item and an item that is not a root',
      [
        ['G', 1, 1],
        ['G', 9, 9],
        ['a1', 0, 0],
        ['zzz', 0, 0],
      ],
    ],
    [
      'containers and markings with no shift',
      [
        ['A', 0, 0],
        ['B', 2000, 0],
        ['H', 400, 1300],
        ['N', 100, 1300],
      ],
    ],
    ['nothing', []],
  ] as [string, [string, number, number][]][])(
    'hand-made project: %s',
    (_name, items) => {
      expectSameView(handMade(), perspective(...items));
    },
  );
});
