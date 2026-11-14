// `canAnchorTo` (R4, decision 13): whoever the Anchor section list offers is what `setMarkingAnchor`
// would accept, without trying and catching the error.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  anchorCandidates,
  canAnchorTo,
  createMarking,
  projectIndex,
  setMarkingAnchor,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

function scene(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = addContainer(p, { id: 'I2', file: 'b.png', width: 1000, height: 800 });
  const at = (id: string, containerId: string | null, x: number) =>
    createMarking(p, { id, containerId, rect: { x, y: 10, width: 50, height: 50 } });
  p = at('A', 'I1', 10);
  p = at('B', 'I1', 100);
  p = at('C', 'I1', 200);
  p = at('D', 'I2', 10);
  return createMarking(p, {
    id: 'F',
    containerId: null,
    rect: { x: -3000, y: -3000, width: 50, height: 50 },
  });
}

describe('canAnchorTo', () => {
  it('accepts the other markings of the same space', () => {
    const p = scene();
    expect(canAnchorTo(p, 'A', 'B')).toBe(true);
    expect(canAnchorTo(p, 'A', 'C')).toBe(true);
  });

  it('rejects the marking itself, the nonexistent one and one from another space', () => {
    const p = scene();
    expect(canAnchorTo(p, 'A', 'A')).toBe(false);
    expect(canAnchorTo(p, 'A', 'nope')).toBe(false);
    expect(canAnchorTo(p, 'A', 'D')).toBe(false);
    expect(canAnchorTo(p, 'A', 'F')).toBe(false);
  });

  it('rejects whoever would close a cycle (the one that already depends on it, directly or transitively)', () => {
    let p = scene();
    p = setMarkingAnchor(p, 'B', { to: 'A' });
    p = setMarkingAnchor(p, 'C', { to: 'B' });
    expect(canAnchorTo(p, 'A', 'B')).toBe(false);
    expect(canAnchorTo(p, 'A', 'C')).toBe(false);
    expect(canAnchorTo(p, 'B', 'C')).toBe(false);
    expect(canAnchorTo(p, 'C', 'A')).toBe(true);
  });
});

describe('canAnchorTo: descendants and followers of descendants (finding 2 of CL2)', () => {
  /** P (large) contains C; D is anchored to C; E is loose. */
  function nested(): Project {
    let p = scene();
    p = createMarking(p, {
      id: 'P',
      containerId: 'I1',
      rect: { x: 400, y: 400, width: 300, height: 300 },
    });
    p = createMarking(p, {
      id: 'Cc',
      containerId: 'I1',
      rect: { x: 420, y: 420, width: 50, height: 50 },
    });
    p = createMarking(p, {
      id: 'Dd',
      containerId: 'I1',
      rect: { x: 800, y: 420, width: 50, height: 50 },
    });
    return setMarkingAnchor(p, 'Dd', { to: 'Cc' });
  }

  it('rejects a descendant of P and the follower (direct or indirect) of a descendant', () => {
    const p = nested();
    expect(projectIndex(p).markings.get('Cc')?.parentId).toBe('P');
    expect(canAnchorTo(p, 'P', 'Cc')).toBe(false);
    expect(canAnchorTo(p, 'P', 'Dd')).toBe(false);
    expect(() => setMarkingAnchor(p, 'P', { to: 'Cc' })).toThrow();
    expect(() => setMarkingAnchor(p, 'P', { to: 'Dd' })).toThrow();
  });

  it('keeps accepting whoever does not move together with P', () => {
    const p = nested();
    expect(canAnchorTo(p, 'P', 'A')).toBe(true);
    expect(canAnchorTo(p, 'Cc', 'P')).toBe(true);
  });
});

describe('anchorCandidates (finding 7 of CL2)', () => {
  /** Large M0 containing the other n-1 (the worst case of `withAnchoredFollowers`). */
  function crowded(n: number): Project {
    let p = addContainer(emptyProject(), {
      id: 'I1',
      file: 'a.png',
      width: 100000,
      height: 100000,
    });
    p = createMarking(p, {
      id: 'M0',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 99000, height: 99000 },
    });
    for (let i = 1; i < n; i++) {
      p = createMarking(p, {
        id: `M${i}`,
        containerId: 'I1',
        rect: { x: (i % 100) * 60, y: Math.floor(i / 100) * 60, width: 50, height: 50 },
      });
    }
    return p;
  }

  it('returns the same as canAnchorTo item by item, in the space order', () => {
    const p = setMarkingAnchor(scene(), 'B', { to: 'A' });
    for (const id of ['A', 'B', 'C']) {
      const space = p.markings.filter((m) => m.containerId === 'I1');
      expect(anchorCandidates(p, id, space).map((m) => m.id)).toEqual(
        space.filter((m) => canAnchorTo(p, id, m.id)).map((m) => m.id),
      );
    }
    expect(anchorCandidates(p, 'nope', p.markings)).toEqual([]);
  });

  it('the cost grows linearly: 4n markings cost less than 6× n (the owner of all the others)', () => {
    const time = (n: number): number => {
      const p = crowded(n);
      const space = p.markings.filter((m) => m.containerId === 'I1');
      const start = performance.now();
      anchorCandidates(p, 'M0', space);
      return performance.now() - start;
    };
    // The minimum of a few runs is the cost without scheduler noise: one slow sample on a loaded
    // runner made the ratio flaky, while the 6× limit stays the same.
    const best = (n: number): number =>
      Math.min(...Array.from({ length: 5 }, () => time(n)));
    time(100); // warm-up
    const small = Math.max(best(300), 0.05);
    expect(best(1200) / small).toBeLessThan(6);
  });
});
