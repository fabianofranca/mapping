import { describe, expect, it } from 'vitest';
import {
  addLayer,
  createMarking,
  moveContainer,
  moveItems,
  moveMarking,
  patchProject,
  perspectiveView,
  projectIndex,
  reconcilePerspective,
  reconcilePerspectives,
  removeContainer,
  removeLayer,
  removeMarking,
  rootFootprint,
  setMarkingRect,
  settleHierarchy,
  type Arrival,
  type Change,
  type Perspective,
  type Project,
} from '../../src/model';
import { multiProject } from './multiSelectionFixtures';

// Reconciliation of the perspectives with the project (v16, decision 4). Geometry of `multiProject`
// (see tests/model/multiSelectionFixtures.ts): roots D and E (containers), G (canvas marking
// that surrounds A, B and C; G2 inside it), H and N (floating).

function persp(
  items: [string, number, number][],
  hiddenLayers: string[] = [],
  id = 'P',
): Perspective {
  return {
    id,
    name: `Vista ${id}`,
    hiddenLayers,
    items: items.map(([root, x, y]) => ({ root, x, y })),
  };
}

const withPerspectives = (p: Project, ...list: Perspective[]): Project => ({
  ...p,
  perspectives: list,
});

const itemsOf = (p: Project, id = 'P') =>
  (p.perspectives.find((x) => x.id === id)?.items ?? []).map(
    (i) => [i.root, i.x, i.y] as const,
  );

/** Where the root appears in the perspective's view, in canvas units. */
function shown(p: Project, id: string, perspectiveId = 'P') {
  const found = p.perspectives.find((x) => x.id === perspectiveId) as Perspective;
  return rootFootprint(perspectiveView(p, found), id);
}

describe('reconciliation: root that leaves the project', () => {
  it('a raiz apagada sai da perspectiva', () => {
    const p = withPerspectives(
      multiProject(),
      persp([
        ['D', 7000, 0],
        ['H', 400, 1300],
        ['N', 100, 1300],
      ]),
    );
    const next = removeMarking(removeContainer(p, 'D'), 'H');
    expect(itemsOf(next)).toEqual([['N', 100, 1300]]);
  });

  it('the arrival mark of the deleted root goes away', () => {
    const arrival: Arrival = { root: 'H', from: 'P', fromName: 'Vista P' };
    const p = { ...multiProject(), arrivals: [arrival] };
    expect(removeMarking(p, 'H').arrivals).toEqual([]);
  });

  it('os filhos que viram raiz entram onde estavam na tela', () => {
    // G (which surrounds A, B and C) leaves: A, B and C are left with no parent. G appears shifted by (1000, 500).
    const p = withPerspectives(
      multiProject(),
      persp([
        ['G', 900, 400],
        ['D', 7000, 0],
      ]),
    );
    const before = {
      A: shown(p, 'A'),
      B: shown(p, 'B'),
      C: shown(p, 'C'),
    };
    const next = removeMarking(p, 'G');
    expect(itemsOf(next)).toEqual([
      ['A', 1000, 500],
      ['B', 3000, 500],
      ['C', 5000, 500],
      ['D', 7000, 0],
    ]);
    expect(shown(next, 'A')).toEqual(before.A);
    expect(shown(next, 'B')).toEqual(before.B);
    expect(shown(next, 'C')).toEqual(before.C);
  });
});

describe('reconciliation: root that stops being a root', () => {
  const wrapD = { x: 6900, y: -50, width: 1200, height: 1100 };

  it('the new root (which now contains the old one) takes its place without moving anything on screen', () => {
    const p = withPerspectives(multiProject(), persp([['D', 7300, 20]]));
    const before = shown(p, 'D');
    const next = createMarking(p, { id: 'W', containerId: null, rect: wrapD });
    expect(projectIndex(next).rootOf.get('D')).toBe('W');
    expect(itemsOf(next)).toEqual([['W', 7200, -30]]);
    expect(shown(next, 'D')).toEqual(before);
  });

  it('the position of a root that is a marking is an integer', () => {
    const base = multiProject();
    const fractional: Project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'D' ? { ...c, placement: { ...c.placement, x: 7000.5, y: 0.25 } } : c,
      ),
    };
    const p = withPerspectives(fractional, persp([['D', 7300, 20]]));
    const next = createMarking(p, { id: 'W', containerId: null, rect: wrapD });
    const item = next.perspectives[0]?.items[0];
    expect(item?.root).toBe('W');
    expect(Number.isInteger(item?.x)).toBe(true);
    expect(Number.isInteger(item?.y)).toBe(true);
  });

  it('if the new root is already in the perspective, the old one just leaves', () => {
    const small = { x: 6900, y: -50, width: 100, height: 100 };
    let p = createMarking(multiProject(), { id: 'W', containerId: null, rect: small });
    p = withPerspectives(
      p,
      persp([
        ['D', 7300, 20],
        ['W', 5, 6],
      ]),
    );
    const next = setMarkingRect(p, 'W', wrapD);
    expect(projectIndex(next).rootOf.get('D')).toBe('W');
    expect(itemsOf(next)).toEqual([['W', 5, 6]]);
  });
});

describe('reconciliation: item that becomes a root', () => {
  it('enters where it was on screen, not where it ended up in the Main one', () => {
    const p = withPerspectives(multiProject(), persp([['G', 900, 400]]));
    const before = shown(p, 'B');
    // B leaves G in the Main one; in the perspective it stays where it was seen.
    const next = moveContainer(p, 'B', 2000, 3000);
    expect(projectIndex(next).rootOf.get('B')).toBe('B');
    expect(itemsOf(next)).toEqual([
      ['G', 900, 400],
      ['B', 3000, 500],
    ]);
    expect(shown(next, 'B')).toEqual(before);
  });

  it('only enters the perspective that had the earlier root', () => {
    const p = withPerspectives(
      multiProject(),
      persp([['G', 900, 400]], [], 'P'),
      persp([['D', 7000, 0]], [], 'Q'),
    );
    const next = moveContainer(p, 'B', 2000, 3000);
    expect(itemsOf(next, 'Q')).toEqual([['D', 7000, 0]]);
  });
});

describe('reconciliation: arrival mark', () => {
  const arrival: Arrival = { root: 'H', from: 'P', fromName: 'Vista P' };
  const withMark = (): Project => ({ ...multiProject(), arrivals: [arrival] });

  it('mover a raiz na Principal tira a marca', () => {
    expect(moveMarking(withMark(), 'H', 10, 0).arrivals).toEqual([]);
    expect(moveItems(withMark(), [{ kind: 'marking', id: 'H' }], 0, 20).arrivals).toEqual(
      [],
    );
  });

  it('touching another root or resizing without changing the corner keeps the mark', () => {
    const p = withMark();
    expect(moveMarking(p, 'N', 10, 0).arrivals).toEqual([arrival]);
    expect(
      setMarkingRect(p, 'H', { x: 400, y: 1300, width: 300, height: 150 }).arrivals,
    ).toEqual([arrival]);
  });

  it('an arrival that is repeated, of a nonexistent root or of a non-root goes away', () => {
    const p = {
      ...multiProject(),
      arrivals: [
        arrival,
        { ...arrival, from: 'Q' },
        { root: 'zzz', from: 'P', fromName: 'x' },
        { root: 'a1', from: 'P', fromName: 'x' },
      ],
    };
    expect(reconcilePerspectives(p, p).arrivals).toEqual([arrival]);
  });
});

describe('reconciliation: hidden layers', () => {
  it('deleting the layer removes the id from hiddenLayers of every perspective', () => {
    let p = addLayer(multiProject(), { id: 'L2', name: 'Two', color: '#1E88E5' });
    p = withPerspectives(
      p,
      persp([['D', 7000, 0]], ['L1', 'L2'], 'P'),
      persp([['E', 9000, 0]], ['L2'], 'Q'),
    );
    const next = removeLayer(p, 'L2');
    expect(next.perspectives.map((x) => x.hiddenLayers)).toEqual([['L1'], []]);
  });
});

describe('reconciliation: idempotence and cleanup', () => {
  it('with no perspective or arrival returns the same object', () => {
    const before = multiProject();
    const after = moveMarking(before, 'H', 10, 0);
    expect(reconcilePerspectives(before, after)).toBe(after);
  });

  it('nothing to change returns the same object, with perspectives', () => {
    const p = withPerspectives(
      multiProject(),
      persp([
        ['D', 7000, 0],
        ['G', 0, 0],
      ]),
    );
    expect(reconcilePerspectives(p, p)).toBe(p);
    const moved = moveMarking(p, 'N', 10, 0);
    expect(reconcilePerspectives(p, moved)).toBe(moved);
    expect(settleHierarchy(moved)).toBe(moved);
  });

  it('the gesture preview (settle: false) does not reconcile', () => {
    const p = withPerspectives(multiProject(), persp([['H', 400, 1300]]));
    const preview = removeMarking(p, 'H', { settle: false });
    expect(itemsOf(preview)).toEqual([['H', 400, 1300]]);
    expect(itemsOf(settleHierarchy(preview, { before: p }))).toEqual([]);
  });

  it('reconcilePerspective without a real before only cleans up: nonexistent root, repeated, invalid layer', () => {
    const p = multiProject();
    const dirty = persp(
      [
        ['D', 1, 2],
        ['zzz', 0, 0],
        ['D', 9, 9],
        ['H', 400.4, 1300],
      ],
      ['L1', 'fantasma'],
    );
    const clean = reconcilePerspective(p, p, dirty);
    expect(clean.items.map((i) => [i.root, i.x, i.y])).toEqual([
      ['D', 1, 2],
      ['H', 400, 1300],
    ]);
    expect(clean.hiddenLayers).toEqual(['L1']);
    expect(reconcilePerspective(p, p, clean)).toBe(clean);
  });

  it('an item that is not a root gives way to its root, without moving anything on screen', () => {
    const p = multiProject();
    // B is inside G: showing B at (3000, 500) is showing G at (900, 400).
    const clean = reconcilePerspective(p, p, persp([['B', 3000, 500]]));
    expect(clean.items).toEqual([{ root: 'G', x: 900, y: 400 }]);
  });
});

describe('reconciliation: applying a proposal', () => {
  it('the root removed by the proposal leaves the perspective and the arrivals', () => {
    const base: Project = {
      ...withPerspectives(
        multiProject(),
        persp([
          ['H', 400, 1300],
          ['D', 7000, 0],
        ]),
      ),
      arrivals: [{ root: 'H', from: 'P', fromName: 'Vista P' }],
    };
    const removeH: Change = {
      id: 'x1',
      kind: 'remove',
      entity: 'marking',
      entityId: 'H',
      imageId: null,
      markingId: 'H',
      field: null,
      from: JSON.parse(JSON.stringify(base.markings.find((m) => m.id === 'H'))),
      to: null,
    };
    const { project, problems } = patchProject(base, [removeH]);
    expect(problems).toEqual([]);
    expect(itemsOf(project)).toEqual([['D', 7000, 0]]);
    expect(project.arrivals).toEqual([]);
  });
});
