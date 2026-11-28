// The settle with a stored structure (stage #3087 MS1, decisions 3 and 4): an observation marking's parent is the
// smallest observation marking that contains it; a materialized marking keeps its stored parent, and only an
// invalid one becomes `null` (the rect stays); a materialized child lives in its parent's space.
import { describe, expect, it } from 'vitest';
import { enclosingAmong, settleHierarchy } from '../../src/model';
import {
  find,
  materialize,
  parents,
  r,
  raw,
  structureProject,
} from '../support/structureFixtures';

describe('an observation marking', () => {
  it('has as parent the smallest observation marking that contains it, never a materialized one', () => {
    const p = structureProject(
      [
        raw('A', r(0, 0, 600, 500)),
        raw('card', r(20, 20, 300, 200), { parentId: 'A' }),
        raw('bare', r(30, 30, 40, 20)),
      ],
      ['card'],
    );
    const settled = settleHierarchy(p);
    expect(parents(settled)).toEqual({ A: null, card: 'A', bare: 'A' });
  });

  it('a project with no materialized marking settles as before: the smallest marking', () => {
    const p = structureProject([
      raw('A', r(0, 0, 600, 500)),
      raw('B', r(20, 20, 300, 200)),
      raw('C', r(30, 30, 40, 20)),
    ]);
    expect(parents(settleHierarchy(p))).toEqual({ A: null, B: 'A', C: 'B' });
  });

  it('a container is never inside a materialized canvas marking', () => {
    const p = structureProject(
      [raw('wide', r(-100, -100, 2000, 1500), { container: null })],
      ['wide'],
    );
    expect(settleHierarchy(p).containers[0]?.parentId).toBeNull();
    const observation = structureProject([
      raw('wide', r(-100, -100, 2000, 1500), { container: null }),
    ]);
    expect(settleHierarchy(observation).containers[0]?.parentId).toBe('wide');
  });

  it("`enclosingAmong` (Wrap's parent) skips a materialized marking", () => {
    const p = structureProject(
      [
        raw('A', r(0, 0, 600, 500)),
        raw('card', r(20, 20, 300, 200), { parentId: 'A' }),
        raw('bare', r(30, 30, 40, 20), { parentId: 'A' }),
      ],
      ['card'],
    );
    expect(enclosingAmong(p, 'I1', new Set(['A', 'card']), null)).toBe('A');
    expect(enclosingAmong(p, 'I1', new Set(['card']), null)).toBeNull();
  });
});

describe('a materialized marking', () => {
  const boxed = (rect = r(20, 20, 200, 100), parentId: string | null = 'A') =>
    structureProject([raw('A', r(0, 0, 500, 400)), raw('card', rect, { parentId })], ['card']);

  it('keeps its stored parent while its rect is inside the parent', () => {
    expect(find(settleHierarchy(boxed()), 'card').parentId).toBe('A');
  });

  it('keeps its stored parent while its rect crosses the parent edge', () => {
    const settled = settleHierarchy(boxed(r(450, 20, 200, 100)));
    expect(find(settled, 'card').parentId).toBe('A');
    expect(find(settled, 'card').rect).toEqual(r(450, 20, 200, 100));
  });

  it('keeps its stored parent while its rect leaves the parent', () => {
    const settled = settleHierarchy(boxed(r(700, 500, 100, 100)));
    expect(find(settled, 'card').parentId).toBe('A');
  });

  it('a stored materialized parent is kept, and so is the grandchild', () => {
    const p = structureProject(
      [
        raw('panel', r(0, 0, 400, 300)),
        raw('tile', r(500, 500, 80, 40), { parentId: 'panel', slot: 'left' }),
        raw('deep', r(900, 700, 20, 20), { parentId: 'tile' }),
      ],
      ['panel', 'tile', 'deep'],
    );
    const settled = settleHierarchy(p);
    expect(parents(settled)).toEqual({ panel: null, tile: 'panel', deep: 'tile' });
    expect(find(settled, 'tile').slot).toBe('left');
  });

  it('a loose materialized marking stays loose even inside an observation marking', () => {
    const p = structureProject(
      [raw('A', r(0, 0, 500, 400)), raw('card', r(20, 20, 200, 100))],
      ['card'],
    );
    expect(find(settleHierarchy(p), 'card').parentId).toBeNull();
  });

  describe('an invalid stored parent becomes null and the rect stays', () => {
    const rect = r(20, 20, 200, 100);
    const invalid = (extra: Parameters<typeof raw>[2], parentId: string) =>
      structureProject(
        [raw('A', r(0, 0, 500, 400), extra), raw('card', rect, { parentId })],
        ['card'],
      );

    it.each([
      ['a missing parent', () => invalid({}, 'ghost')],
      ['a decorative parent', () => invalid({ decorative: true }, 'A')],
      [
        'a floating parent',
        () =>
          structureProject(
            [
              raw('A', r(0, 0, 500, 400), { floating: true, container: null }),
              raw('card', rect, { parentId: 'A', container: null }),
            ],
            ['card'],
          ),
      ],
      [
        'a parent in another container',
        () =>
          structureProject(
            [
              raw('A', r(0, 0, 500, 400)),
              raw('card', rect, { parentId: 'A', container: null }),
            ],
            ['card'],
          ),
      ],
      [
        'a parent of another page',
        () =>
          structureProject(
            [
              raw('A', r(0, 0, 500, 400), { container: null, pageId: 'PG2' }),
              raw('card', rect, { parentId: 'A', container: null }),
            ],
            ['card'],
          ),
      ],
    ])('%s', (_name, build) => {
      const settled = settleHierarchy(build());
      expect(find(settled, 'card').parentId).toBeNull();
      expect(find(settled, 'card').rect).toEqual(rect);
    });

    it('a cycle', () => {
      const p = structureProject(
        [
          raw('one', r(0, 0, 100, 100), { parentId: 'two' }),
          raw('two', r(200, 0, 100, 100), { parentId: 'one' }),
        ],
        ['one', 'two'],
      );
      const settled = settleHierarchy(p);
      expect(parents(settled)).toEqual({ one: null, two: null });
      expect(find(settled, 'two').rect).toEqual(r(200, 0, 100, 100));
    });

    it('its own id', () => {
      const p = structureProject(
        [raw('one', r(0, 0, 100, 100), { parentId: 'one' })],
        ['one'],
      );
      expect(find(settleHierarchy(p), 'one').parentId).toBeNull();
    });
  });

  it('a parent that no longer contains it keeps it when it only loses the nature: the relation is stored', () => {
    const p = structureProject(
      [raw('A', r(0, 0, 100, 100)), raw('card', r(300, 300, 50, 50), { parentId: 'A' })],
      ['card'],
    );
    expect(find(settleHierarchy(p), 'card').parentId).toBe('A');
  });
});

describe('the space of a materialized child', () => {
  /** `A` is an observation marking of the container, taken out of it by the geometry. */
  const leaving = () =>
    structureProject(
      [
        raw('A', r(950, 100, 200, 100)),
        raw('card', r(100, 100, 80, 40), { parentId: 'A' }),
        raw('deep', r(110, 110, 20, 20), { parentId: 'card' }),
      ],
      ['card', 'deep'],
    );

  it('lives in its parent space and travels with it when the parent changes space', () => {
    const settled = settleHierarchy(leaving());
    expect(find(settled, 'A').containerId).toBeNull();
    expect(find(settled, 'card').containerId).toBeNull();
    expect(find(settled, 'deep').containerId).toBeNull();
    expect(find(settled, 'card').pageId).toBe('PG1');
    // The footprint on the canvas is the same (container I1 sits at the origin, scale 1).
    expect(find(settled, 'card').rect).toEqual(r(100, 100, 80, 40));
    expect(parents(settled)).toEqual({ A: null, card: 'A', deep: 'card' });
  });

  it('a loose materialized marking takes its space by the geometry', () => {
    const p = structureProject(
      [raw('card', r(100, 100, 80, 40), { container: null })],
      ['card'],
    );
    expect(find(settleHierarchy(p), 'card').containerId).toBe('I1');
  });

  it('a child stays in its parent space whatever its rect', () => {
    const p = structureProject(
      [raw('A', r(0, 0, 500, 400)), raw('card', r(900, 700, 200, 100), { parentId: 'A' })],
      ['card'],
    );
    const settled = settleHierarchy(p);
    expect(find(settled, 'card').containerId).toBe('I1');
    expect(find(settled, 'card').rect).toEqual(r(900, 700, 200, 100));
  });

  it('the settle is idempotent', () => {
    const once = settleHierarchy(leaving());
    expect(settleHierarchy(once)).toBe(once);
  });
});

describe('nature changes', () => {
  it('a marking that loses the annotation takes its parent by geometry again', () => {
    const p = structureProject(
      [raw('A', r(0, 0, 500, 400)), raw('card', r(700, 500, 100, 100), { parentId: 'A' })],
      ['card'],
    );
    const settled = settleHierarchy(p);
    expect(find(settled, 'card').parentId).toBe('A');
    const observation = settleHierarchy(structureProject(settled.markings));
    expect(find(observation, 'card').parentId).toBeNull();
  });

  it('a marking that gains the annotation keeps the parent it had', () => {
    const p = settleHierarchy(
      structureProject([raw('A', r(0, 0, 500, 400)), raw('bare', r(20, 20, 40, 20))]),
    );
    expect(find(p, 'bare').parentId).toBe('A');
    const typed = settleHierarchy(materialize(p, 'bare'));
    expect(find(typed, 'bare').parentId).toBe('A');
  });
});
