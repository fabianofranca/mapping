// Decorative marking (stage #2826 DM1): a child by geometry like any marking, never a parent of a
// marking or of a container. Settle (full, local and Wrap), free placement, invariants, repair and
// the model operations.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  descendantIds,
  moveMarking,
  placementLevel,
  removeMarking,
  repairProject,
  reorderMarking,
  setMarkingFloating,
  setMarkingLocked,
  setMarkingRect,
  validateProject,
  ModelError,
  type Project,
} from '../../src/model';
import { enclosingAmong, settleHierarchy } from '../../src/model/hierarchySettle';
import { emptyProject, marking } from './fixtures';
import { idGen } from './specFixtures';

// The decorative operations are imported by name below so that the tests fail with a clear
// "not a function" before the implementation exists.
import * as model from '../../src/model';

type Rect = { x: number; y: number; width: number; height: number };
const r = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** I1 (1000×1000) with a card C and three samples S1..S3, all inside the card. */
function base(): Project {
  let p = addContainer(emptyProject(), {
    id: 'I1',
    file: 'images/a.png',
    width: 1000,
    height: 1000,
  });
  p = createMarking(p, { id: 'C', containerId: 'I1', rect: r(50, 50, 800, 500) });
  p = createMarking(p, { id: 'S1', containerId: 'I1', rect: r(100, 100, 100, 100) });
  p = createMarking(p, { id: 'S2', containerId: 'I1', rect: r(300, 100, 100, 100) });
  p = createMarking(p, { id: 'S3', containerId: 'I1', rect: r(500, 100, 100, 100) });
  return p;
}

const parentOf = (p: Project, id: string) => marking(p, id).parentId;
const settle = (p: Project) => settleHierarchy(p);

function without(p: Project, ids: readonly string[]): Project {
  const gone = new Set(ids);
  return {
    ...p,
    markings: p.markings.filter((m) => !gone.has(m.id)),
    annotations: p.annotations.filter((a) => !gone.has(a.markingId)),
  };
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
  return null;
}

describe('decorative: the settle', () => {
  it('a decorative frame around three samples is never their parent; its parent is the smallest non-decorative one that contains it', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    expect(marking(p, 'F').decorative).toBe(true);
    expect(parentOf(p, 'F')).toBe('C');
    for (const id of ['S1', 'S2', 'S3']) expect(parentOf(p, id)).toBe('C');
    expect(descendantIds(p, 'F').size).toBe(0);
  });

  it('a decorative canvas marking around a container is not the container’s parent', () => {
    let p = base();
    p = createMarking(p, {
      id: 'W',
      containerId: null,
      rect: r(-100, -100, 1200, 1200),
      decorative: true,
    });
    expect(p.containers[0]?.parentId).toBeNull();
    // A non-decorative canvas marking in its place is the parent.
    const plain = createMarking(base(), {
      id: 'W2',
      containerId: null,
      rect: r(-100, -100, 1200, 1200),
    });
    expect(plain.containers[0]?.parentId).toBe('W2');
  });

  it('a decorative marking takes the container that fully contains it, like any marking', () => {
    let p = base();
    p = createMarking(p, {
      id: 'D',
      containerId: null,
      rect: r(10, 10, 200, 200),
      decorative: true,
    });
    expect(marking(p, 'D').containerId).toBe('I1');
  });

  it('equal rectangles: a non-decorative one may be the decorative one’s parent; two decorative ones never are of each other', () => {
    let p = base();
    // Non-decorative first (outer by rank), decorative with the same rectangle after it.
    p = createMarking(p, { id: 'X', containerId: 'I1', rect: r(120, 300, 200, 100) });
    p = createMarking(p, {
      id: 'D1',
      containerId: 'I1',
      rect: r(120, 300, 200, 100),
      decorative: true,
    });
    p = createMarking(p, {
      id: 'D2',
      containerId: 'I1',
      rect: r(120, 300, 200, 100),
      decorative: true,
    });
    expect(parentOf(p, 'D1')).not.toBe('D2');
    expect(parentOf(p, 'D2')).not.toBe('D1');
    expect(['C', 'X']).toContain(parentOf(p, 'D1'));
    expect(['C', 'X']).toContain(parentOf(p, 'D2'));
    // And never the parent of X.
    expect(parentOf(p, 'X')).toBe('C');
  });

  it('the property: the parents of the non-decorative markings and containers equal those of the project without the decorative ones', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    p = createMarking(p, {
      id: 'G',
      containerId: 'I1',
      rect: r(100, 100, 100, 100),
      decorative: true,
    });
    p = createMarking(p, {
      id: 'W',
      containerId: null,
      rect: r(-100, -100, 1200, 1200),
      decorative: true,
    });
    const stripped = settle(without(p, ['F', 'G', 'W']));
    for (const m of stripped.markings) expect(parentOf(settle(p), m.id)).toBe(m.parentId);
    expect(settle(p).containers.map((c) => c.parentId)).toEqual(
      stripped.containers.map((c) => c.parentId),
    );
  });

  it('the local settle (moving a decorative marking) gives the same as the full one', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    const moved = setMarkingRect(p, 'F', r(90, 90, 300, 300));
    expect(moved.markings).toEqual(settle(moved).markings);
    const resized = setMarkingRect(moved, 'S1', r(100, 100, 400, 400));
    expect(resized.markings).toEqual(settle(resized).markings);
    expect(parentOf(resized, 'F')).toBe('C');
    // Nothing is ever the child of F.
    expect(resized.markings.every((m) => m.parentId !== 'F')).toBe(true);
  });

  it('Wrap (`enclosingAmong`) skips the decorative marking', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    expect(enclosingAmong(p, 'I1', new Set(['F', 'C']), null)).toBe('C');
    expect(enclosingAmong(p, 'I1', new Set(['F']), null)).toBeNull();
  });

  it('free placement: a decorative marking is neither the placement parent nor an obstacle', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(0, 0, 1000, 1000),
      decorative: true,
    });
    const rect = r(900, 600, 50, 50);
    const plain = placementLevel(base(), 'I1', rect);
    const level = placementLevel(p, 'I1', rect);
    // The decorative frame covers the whole container: it is not the parent...
    expect(level.parent?.id).toBe(plain.parent?.id);
    // ...and does not take part in the obstacles of the level.
    const key = (rects: readonly Rect[]) => rects.map((x) => JSON.stringify(x)).sort();
    expect(key(level.obstacles)).toEqual(key(plain.obstacles));
  });
});

describe('decorative: invariants and repair', () => {
  it('a marking whose parent is decorative: parent-decorative, repaired by clearing the parent', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'S1' ? { ...m, parentId: 'F' } : m)),
    };
    const issues = validateProject(broken);
    expect(issues.map((i) => `${i.code}:${i.id}`)).toEqual(['parent-decorative:S1']);
    const result = repairProject(broken, issues, idGen('NEW'));
    expect(result.unrepaired).toEqual([]);
    expect(parentOf(result.project, 'S1')).toBeNull();
    expect(result.repaired.map((x) => `${x.action}:${x.code}:${x.id}`)).toEqual([
      'made-root:parent-decorative:S1',
    ]);
  });

  it('a container whose parent is decorative: container-parent-not-canvas, repaired by clearing the parent', () => {
    let p = base();
    p = createMarking(p, {
      id: 'W',
      containerId: null,
      rect: r(-100, -100, 1200, 1200),
      decorative: true,
    });
    const broken: Project = {
      ...p,
      containers: p.containers.map((c) => ({ ...c, parentId: 'W' })),
    };
    const issues = validateProject(broken);
    expect(issues.map((i) => `${i.code}:${i.id}`)).toEqual([
      'container-parent-not-canvas:I1',
    ]);
    const result = repairProject(broken, issues, idGen('NEW'));
    expect(result.unrepaired).toEqual([]);
    expect(result.project.containers[0]?.parentId).toBeNull();
  });

  it('a marking with both flags: decorative-floating, repaired by turning decorative off', () => {
    const p = base();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'S1'
          ? {
              ...m,
              containerId: null,
              parentId: null,
              pageId: base().pages[0]?.id ?? null,
              floating: true,
              decorative: true,
            }
          : m,
      ),
    };
    const codes = validateProject(broken).map((i) => `${i.code}:${i.id}`);
    expect(codes).toContain('decorative-floating:S1');
    const result = repairProject(broken, validateProject(broken), idGen('NEW'));
    expect(marking(result.project, 'S1').decorative).toBe(false);
    expect(marking(result.project, 'S1').floating).toBe(true);
    expect(
      result.repaired.some((x) => x.code === 'decorative-floating' && x.id === 'S1'),
    ).toBe(true);
  });
});

describe('decorative: operations', () => {
  it('setMarkingDecorative on releases the children to the next parent, off lets it take what it contains', () => {
    let p = base();
    p = createMarking(p, { id: 'F', containerId: 'I1', rect: r(80, 80, 540, 140) });
    for (const id of ['S1', 'S2', 'S3']) expect(parentOf(p, id)).toBe('F');
    p = model.setMarkingDecorative(p, 'F', true);
    expect(marking(p, 'F').decorative).toBe(true);
    for (const id of ['S1', 'S2', 'S3']) expect(parentOf(p, id)).toBe('C');
    expect(parentOf(p, 'F')).toBe('C');
    p = model.setMarkingDecorative(p, 'F', false);
    expect(marking(p, 'F').decorative).toBe(false);
    for (const id of ['S1', 'S2', 'S3']) expect(parentOf(p, id)).toBe('F');
  });

  it('the same value returns the project as it is, even with locked geometry', () => {
    const p = base();
    expect(model.setMarkingDecorative(p, 'C', false)).toBe(p);
    const locked = setMarkingLocked(p, 'C', true);
    expect(model.setMarkingDecorative(locked, 'C', false)).toBe(locked);
  });

  it('it is refused with locked geometry (own lock or an ancestor’s)', () => {
    const p = base();
    const own = setMarkingLocked(p, 'S1', true);
    expect(codeOf(() => model.setMarkingDecorative(own, 'S1', true))).toBe('locked');
    const ancestor = setMarkingLocked(p, 'C', true);
    expect(codeOf(() => model.setMarkingDecorative(ancestor, 'S1', true))).toBe('locked');
  });

  it('decorative-floating in both directions', () => {
    let p = createMarking(base(), {
      id: 'N',
      containerId: null,
      rect: r(1200, 0, 100, 100),
      floating: true,
    });
    expect(codeOf(() => model.setMarkingDecorative(p, 'N', true))).toBe(
      'decorative-floating',
    );
    p = createMarking(p, {
      id: 'D',
      containerId: null,
      rect: r(1200, 300, 100, 100),
      decorative: true,
    });
    expect(codeOf(() => setMarkingFloating(p, 'D', true))).toBe('decorative-floating');
    // Creating with both flags is refused too.
    expect(
      codeOf(() =>
        createMarking(p, {
          id: 'B',
          containerId: null,
          rect: r(1200, 600, 100, 100),
          floating: true,
          decorative: true,
        }),
      ),
    ).toBe('decorative-floating');
  });

  it('createMarking({ decorative: true }) is born first among its siblings; turning the flag on later does not reorder', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    const order = p.markings.filter((m) => m.parentId === 'C').map((m) => m.id);
    expect(order[0]).toBe('F');
    // A plain one made decorative later keeps its place.
    const q = model.setMarkingDecorative(base(), 'S3', true);
    expect(q.markings.map((m) => m.id)).toEqual(base().markings.map((m) => m.id));
    // After that the Order changes it like any marking.
    const moved = reorderMarking(p, 'F', 2);
    expect(moved.markings.filter((m) => m.parentId === 'C')[2]?.id).toBe('F');
  });

  it('one call is one project change (a single object, so the store makes one undo entry)', () => {
    const p = base();
    const next = model.setMarkingDecorative(p, 'C', true);
    expect(next).not.toBe(p);
    expect(next.markings.length).toBe(p.markings.length);
    expect(validateProject(next)).toEqual([]);
  });

  it('moving the parent of a decorative frame moves the frame; deleting the parent deletes it', () => {
    let p = base();
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: r(80, 80, 540, 140),
      decorative: true,
    });
    expect(descendantIds(p, 'C').has('F')).toBe(true);
    const moved = moveMarking(p, 'C', 20, 20);
    expect(marking(moved, 'F').rect.x).toBe(100);
    expect(removeMarking(p, 'C').markings.some((m) => m.id === 'F')).toBe(false);
  });

  it('a decorative marking born first keeps an equal-rectangle parent and the result stays settled', () => {
    let p = addContainer(emptyProject(), {
      id: 'I1',
      file: 'images/a.png',
      width: 1000,
      height: 1000,
    });
    p = createMarking(p, { id: 'K', containerId: 'I1', rect: r(100, 100, 100, 100) });
    p = createMarking(p, { id: 'X', containerId: 'I1', rect: r(50, 50, 300, 300) });
    p = createMarking(p, {
      id: 'D',
      containerId: 'I1',
      rect: r(50, 50, 300, 300),
      decorative: true,
    });
    expect(p.markings[0]?.id).toBe('D');
    expect(parentOf(p, 'D')).toBe('X');
    expect(settle(p)).toBe(p);
  });
});
