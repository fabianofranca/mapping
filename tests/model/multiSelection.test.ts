import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addTypedAnnotation,
  canDeleteItems,
  canMoveItems,
  containerDeletionImpact,
  createMarking,
  itemsDeletionImpact,
  limitItemsMove,
  markingDeletionImpact,
  moveItems,
  movingItems,
  removeContainer,
  removeItems,
  removeMarking,
  selectionWithContents,
  setFieldValue,
  setImageLocked,
  setItemsLocked,
  setMarkingLocked,
  settleHierarchy,
  slideToTouch,
  touchDelta,
  type ItemRef,
  type Rect,
} from '../../src/model';
import { rng, type Rand } from './proposalFuzzSupport';
import { expectValid, image, marking } from './fixtures';
import {
  container,
  mk,
  multiProject,
  multiProjectAnnotated,
  rect,
} from './multiSelectionFixtures';
// pt-BR kept: shared fixture data asserted by tests/mcp and tests/model: the layer name 'componentes' and the field key 'dado' of cadastroProject
import { cadastroProject, layerOf } from './specFixtures';

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

/** Runs the operation and returns the rule error code (or `null` if it passed). */
function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const ids = (items: readonly ItemRef[]) => items.map((i) => `${i.kind}:${i.id}`);

describe('movingItems: who receives its own displacement', () => {
  const p = multiProject();

  it('drops nonexistent and repeated items, in item order', () => {
    const items = [
      mark('G'),
      mark('G'),
      mark('nonexistent'),
      img('nonexistent'),
      img('C'),
      img('C'),
      mark('N'),
    ];
    expect(ids(movingItems(p, items))).toEqual(['marking:G', 'image:C', 'marking:N']);
    expect(movingItems(p, [])).toEqual([]);
  });

  it('drops the marking of a selected container: the container carries it', () => {
    expect(ids(movingItems(p, [mark('a1'), img('A'), mark('b1')]))).toEqual([
      'image:A',
      'marking:b1',
    ]);
  });

  it('drops the container marking that has a selected ancestor', () => {
    // a2 › a1: moving a1 inside the container carries a2.
    expect(ids(movingItems(p, [mark('a2'), mark('a1')]))).toEqual(['marking:a1']);
    expect(ids(movingItems(p, [mark('a2')]))).toEqual(['marking:a2']);
    // a3 is not a descendant of a1: it stays.
    expect(ids(movingItems(p, [mark('a1'), mark('a3'), mark('a2')]))).toEqual([
      'marking:a1',
      'marking:a3',
    ]);
  });

  it('on the canvas nothing is dropped by ancestor: moving a marking carries nothing', () => {
    // G2 is inside G; the containers A, B and C are inside them; N is floating.
    const items = [mark('G'), mark('G2'), img('A'), img('B'), mark('N'), mark('H')];
    expect(ids(movingItems(p, items))).toEqual(ids(items));
  });
});

describe('canMoveItems', () => {
  it('false with nothing to move; true with free items', () => {
    const p = multiProject();
    expect(canMoveItems(p, [])).toBe(false);
    expect(canMoveItems(p, [mark('nonexistent'), img('nonexistent')])).toBe(false);
    expect(canMoveItems(p, [img('A'), mark('G'), mark('b1')])).toBe(true);
  });

  it('the locked geometry of an item that moves blocks the set', () => {
    const p = setMarkingLocked(multiProject(), 'N', true);
    expect(canMoveItems(p, [img('A'), mark('N')])).toBe(false);
    expect(canMoveItems(p, [img('A')])).toBe(true);
    const q = setImageLocked(multiProject(), 'A', true);
    expect(canMoveItems(q, [img('A'), img('D')])).toBe(false);
    expect(canMoveItems(q, [img('D')])).toBe(true);
  });

  it('a dropped item does not count: the locked marking goes with the container or the parent', () => {
    const p = setMarkingLocked(setMarkingLocked(multiProject(), 'a1', true), 'a2', true);
    expect(canMoveItems(p, [mark('a1')])).toBe(false);
    expect(canMoveItems(p, [mark('a2')])).toBe(false); // inherited from a1
    expect(canMoveItems(p, [img('A'), mark('a1')])).toBe(true);
    expect(canMoveItems(p, [mark('a1'), mark('a2'), img('D')])).toBe(false);
  });

  it('the lock of a canvas marking goes down to the containers inside it', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    expect(canMoveItems(p, [img('B')])).toBe(false); // parent G
    expect(canMoveItems(p, [img('A')])).toBe(false); // parent G2, and G is an ancestor of G2
    expect(canMoveItems(p, [img('D')])).toBe(true); // outside G
    expect(canMoveItems(p, [mark('N')])).toBe(true); // floating: it is a member of nothing
  });
});

describe('moveItems: each item in its own space', () => {
  it('container, canvas marking and marking of another container, keeping the positions', () => {
    const p = multiProject();
    const q = expectValid(moveItems(p, [img('A'), mark('N'), mark('b1')], 100, 50));
    expect(image(q, 'A').placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(q, 'N').rect).toEqual(rect(200, 1350, 200, 100));
    // B has scale 2: 100 canvas units are 50 of its pixels; 50 are 25.
    expect(marking(q, 'b1').rect).toEqual(rect(100, 75, 100, 100));
    // On screen, b1 moved exactly dx, dy: (2000 + 50·2, 50·2) → (2000 + 100·2, 75·2).
    expect(2000 + 100 * 2 - (2000 + 50 * 2)).toBe(100);
    expect(75 * 2 - 50 * 2).toBe(50);
    // The markings of A go with it (relative coordinates): nothing changes in them.
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
    expect(marking(q, 'a3')).toBe(marking(p, 'a3'));
    // What was not in the selection does not move.
    expect(image(q, 'B').placement).toBe(image(p, 'B').placement);
    expect(marking(q, 'G').rect).toBe(marking(p, 'G').rect);
    // Settling redid the membership: A left G2 (it exceeds 1050) and stayed in G.
    expect(image(q, 'A').parentId).toBe('G');
  });

  it('a container marking receives the displacement divided by the scale and rounded', () => {
    const p = multiProject();
    // E has scale 0.5: 10 canvas units are 20 of its pixels.
    expect(marking(moveItems(p, [mark('e1')], 10, -5), 'e1').rect).toEqual(
      rect(120, 90, 200, 200),
    );
    // Decimal: 10.3 / 0.5 = 20.6 → 21.
    expect(marking(moveItems(p, [mark('e1')], 10.3, 0), 'e1').rect.x).toBe(121);
    // B has scale 2: 6 / 2 = 3.
    expect(marking(moveItems(p, [mark('b1')], 6, 6), 'b1').rect).toEqual(
      rect(53, 53, 100, 100),
    );
  });

  it('a canvas marking rounds the displacement, floating ones included', () => {
    const p = multiProject();
    const q = moveItems(p, [mark('H'), mark('N')], 10.4, -20.6);
    expect(marking(q, 'H').rect).toEqual(rect(410, 1279, 200, 100));
    expect(marking(q, 'N').rect).toEqual(rect(110, 1279, 200, 100));
    expect(marking(q, 'N').floating).toBe(true);
  });

  it('the container marking carries its descendants, locked ones included', () => {
    const p = setMarkingLocked(multiProject(), 'a2', true);
    const q = moveItems(p, [mark('a1')], 20, 10);
    expect(marking(q, 'a1').rect).toEqual(rect(120, 110, 300, 300));
    expect(marking(q, 'a2').rect).toEqual(rect(170, 160, 100, 100));
    expect(marking(q, 'a3')).toBe(marking(p, 'a3'));
    // With the parent and the child selected, the child receives no separate displacement.
    expect(moveItems(p, [mark('a2'), mark('a1')], 20, 10)).toEqual(q);
  });

  it('the marking of a selected container receives no separate displacement', () => {
    const p = multiProject();
    const q = moveItems(p, [img('A'), mark('a1')], 100, 0);
    expect(image(q, 'A').placement.x).toBe(100);
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
    expect(marking(q, 'a2')).toBe(marking(p, 'a2'));
  });

  it('a lone container moves by the exact displacement, decimals included', () => {
    const p = multiProject();
    const q = moveItems(p, [img('A')], 10.4, 0.25);
    expect(image(q, 'A').placement).toEqual({ x: 10.4, y: 0.25, scale: 1 });
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
  });

  it('with a canvas marking along, the canvas displacement is rounded once for everyone', () => {
    const p = multiProject();
    const q = moveItems(p, [mark('G'), img('A'), img('B'), img('C')], 37.6, -12.3);
    expect(marking(q, 'G').rect).toEqual(rect(-62, -112, 5300, 1200));
    expect(image(q, 'A').placement).toEqual({ x: 38, y: -12, scale: 1 });
    expect(image(q, 'B').placement).toEqual({ x: 2038, y: -12, scale: 2 });
    expect(image(q, 'C').placement).toEqual({ x: 4038, y: -12, scale: 1 });
  });

  it('moving the containers and the canvas marking that contains them keeps all three as members', () => {
    // X is stuck to the bottom and right edges of Y (a canvas marking with the same
    // rectangle as the container would belong to it): any extra fraction in the container
    // displacement would take it out.
    const base = settleHierarchy({
      ...multiProject(),
      containers: [container('X', 1000, 1000, { x: 100, y: 100, scale: 1 })],
      markings: [mk('Y', null, rect(99, 99, 1001, 1001))],
    });
    expect(image(base, 'X').parentId).toBe('Y');
    const q = expectValid(moveItems(base, [img('X'), mark('Y')], 10.4, 20.6));
    expect(image(q, 'X').placement).toEqual({ x: 110, y: 121, scale: 1 });
    expect(marking(q, 'Y').rect).toEqual(rect(109, 120, 1001, 1001));
    expect(image(q, 'X').parentId).toBe('Y');

    // In the large project: G, A, B and C move together and the three stay in G or G2.
    const p = multiProject();
    const r = expectValid(
      moveItems(p, [mark('G'), img('A'), img('B'), img('C')], 123.7, 45.2),
    );
    expect(image(r, 'B').parentId).toBe('G');
    expect(image(r, 'C').parentId).toBe('G');
    expect(['G', 'G2']).toContain(image(r, 'A').parentId);
  });

  it('moving only two containers out of the marking takes them out of it', () => {
    const p = multiProject();
    expect(image(p, 'B').parentId).toBe('G');
    const q = expectValid(moveItems(p, [img('A'), img('B')], 0, 3000));
    expect(image(q, 'A').parentId).toBeNull();
    expect(image(q, 'B').parentId).toBeNull();
    expect(image(q, 'C').parentId).toBe('G');
  });

  it('moving the canvas marking alone does not carry the containers inside it (observer)', () => {
    const p = multiProject();
    const q = expectValid(moveItems(p, [mark('G')], 3000, 0));
    expect(marking(q, 'G').rect).toEqual(rect(2900, -100, 5300, 1200));
    for (const c of p.containers) expect(image(q, c.id).placement).toEqual(c.placement);
    expect(marking(q, 'G2').rect).toEqual(marking(p, 'G2').rect);
    // Settling re-evaluates: A and B were left behind, C is still inside and D entered.
    expect(image(q, 'A').parentId).toBe('G2');
    expect(image(q, 'B').parentId).toBeNull();
    expect(image(q, 'C').parentId).toBe('G');
    expect(image(q, 'D').parentId).toBe('G');
  });

  it('a canvas marking that ends up entirely inside a container becomes its own', () => {
    const p = multiProject();
    // H (400,1300) goes up to (400,300): inside A.
    const inA = expectValid(moveItems(p, [mark('H')], 0, -1000));
    expect(marking(inA, 'H')).toMatchObject({
      containerId: 'A',
      rect: rect(400, 300, 200, 100),
    });
    // Into B (scale 2): (2400,200) on the canvas is (200,100) in its pixels, 100×50.
    const inB = expectValid(moveItems(p, [mark('H')], 2000, -1100));
    expect(marking(inB, 'H')).toMatchObject({
      containerId: 'B',
      rect: rect(200, 100, 100, 50),
    });
    // The floating one never changes space.
    const note = moveItems(p, [mark('N')], 0, -1000);
    expect(marking(note, 'N')).toMatchObject({ containerId: null, floating: true });
  });

  it('settle: false is the preview: the membership stays frozen', () => {
    const p = multiProject();
    const preview = moveItems(p, [img('A'), img('B')], 0, 3000, { settle: false });
    expect(image(preview, 'A').placement.y).toBe(3000);
    expect(image(preview, 'A').parentId).toBe('G2');
    expect(image(preview, 'B').parentId).toBe('G');
    expect(settleHierarchy(preview)).toEqual(moveItems(p, [img('A'), img('B')], 0, 3000));
  });
});

describe('moveItems: floating-point noise in the placement', () => {
  it('going back and forth with a container returns to the exact x, without noise', () => {
    let q = multiProject();
    // 0.1 + 0.2 − 0.3 would leave 5.55e-17; 212 + 24.67 − 24.67 would leave 211.99999999999997.
    for (const d of [0.1, 0.2, -0.3]) q = moveItems(q, [img('A')], d, d);
    expect(image(q, 'A').placement).toEqual({ x: 0, y: 0, scale: 1 });
    expect(Object.is(image(q, 'A').placement.x, 0)).toBe(true);

    let r = multiProject();
    r = {
      ...r,
      containers: r.containers.map((c) =>
        c.id === 'A' ? { ...c, placement: { x: 212, y: 0, scale: 1 } } : c,
      ),
    };
    for (const d of [24.666666666666668, -24.666666666666668])
      r = moveItems(r, [img('A')], d, 0);
    expect(image(r, 'A').placement).toEqual({ x: 212, y: 0, scale: 1 });
  });

  it('a real fraction remains: +0.5 gives 0.5', () => {
    const q = moveItems(multiProject(), [img('A')], 0.5, 0.5);
    expect(image(q, 'A').placement).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });
});

describe('moveItems: all or nothing', () => {
  it('a container that starts to overlap a container that does not move fails', () => {
    const p = multiProject();
    // A (1500..2500) lands on top of B (2000..3000).
    expect(codeOf(() => moveItems(p, [img('A')], 1500, 0))).toBe('image-overlap');
    // A and B together: B (3500..4500) lands on top of C, which does not move.
    expect(codeOf(() => moveItems(p, [img('A'), img('B')], 1500, 0))).toBe(
      'image-overlap',
    );
    // A valid item together with an invalid one does not count: nothing is moved.
    expect(codeOf(() => moveItems(p, [mark('N'), img('C')], 3000, 0))).toBe(
      'image-overlap',
    );
  });

  it('the moved containers are not tested against each other', () => {
    const p = multiProject();
    // A goes where B was, B where C was, C touches D (7000): no overlap.
    const q = expectValid(moveItems(p, [img('A'), img('B'), img('C')], 2000, 0));
    expect(image(q, 'A').placement.x).toBe(2000);
    expect(image(q, 'B').placement.x).toBe(4000);
    expect(image(q, 'C').placement.x).toBe(6000);
    // B and C together, 3000: C (7000..8000) lands on top of D.
    expect(codeOf(() => moveItems(p, [img('B'), img('C')], 3000, 0))).toBe(
      'image-overlap',
    );
  });

  it('a container marking that would leave the container fails, in both directions', () => {
    const p = multiProject();
    // c1 is stuck to the bottom right corner of C (scale 1).
    expect(codeOf(() => moveItems(p, [mark('c1')], 10, 0))).toBe('rect-out-of-image');
    expect(codeOf(() => moveItems(p, [mark('a1')], -200, 0))).toBe('rect-out-of-image');
    // In B (500 px, scale 2), 1000 canvas units are 500 pixels.
    expect(codeOf(() => moveItems(p, [mark('b1')], 1000, 0))).toBe('rect-out-of-image');
    // a3 (600..800 in A) can go up to the edge (dx 200) and not one pixel further.
    expect(codeOf(() => moveItems(p, [mark('a3')], 200, 0))).toBeNull();
    expect(codeOf(() => moveItems(p, [mark('a3')], 201, 0))).toBe('rect-out-of-image');
    // An invalid item together with a valid one: the whole set fails.
    expect(codeOf(() => moveItems(p, [mark('N'), mark('c1')], 10, 0))).toBe(
      'rect-out-of-image',
    );
  });

  it('a locked item blocks the whole set', () => {
    const locked = setMarkingLocked(multiProject(), 'N', true);
    expect(codeOf(() => moveItems(locked, [img('A'), mark('N')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(locked, [img('A')], 10, 10))).toBeNull();
    const container = setImageLocked(multiProject(), 'A', true);
    expect(codeOf(() => moveItems(container, [img('D'), img('A')], 10, 10))).toBe(
      'locked',
    );
    // A locked marking, or one with a locked ancestor, in the container.
    const inner = setMarkingLocked(multiProject(), 'a1', true);
    expect(codeOf(() => moveItems(inner, [mark('a1')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(inner, [mark('a2')], 10, 10))).toBe('locked');
    // The dropped item does not count: the container carries the locked marking.
    expect(codeOf(() => moveItems(inner, [img('A'), mark('a1')], 10, 10))).toBeNull();
  });

  it('the lock of a canvas marking reaches the placement of the containers inside it', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    expect(codeOf(() => moveItems(p, [img('B')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(p, [img('A')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(p, [img('D'), mark('N')], 10, 10))).toBeNull();
  });

  it('zero displacement, or nothing to move, returns the same project without checking the lock', () => {
    const p = setMarkingLocked(multiProject(), 'N', true);
    expect(moveItems(p, [mark('N')], 0, 0)).toBe(p);
    expect(moveItems(p, [], 5, 5)).toBe(p);
    expect(moveItems(p, [mark('nonexistent'), img('nonexistent')], 5, 5)).toBe(p);
    // Rounding zeroes the canvas marking displacement: nothing changed.
    const q = multiProject();
    expect(moveItems(q, [mark('H')], 0.3, -0.2)).toBe(q);
    expect(moveItems(q, [mark('e1')], 0.2, 0.2)).toBe(q); // 0.2 / 0.5 = 0.4 → 0
  });

  it('the displacement must be finite', () => {
    const p = multiProject();
    expect(codeOf(() => moveItems(p, [img('A')], Number.NaN, 0))).toBe(
      'invalid-placement',
    );
    expect(codeOf(() => moveItems(p, [img('A')], 0, Number.POSITIVE_INFINITY))).toBe(
      'invalid-placement',
    );
  });
});

describe('selectionWithContents', () => {
  const p = multiProject();

  it('canvas marking: the content in depth order and itself last', () => {
    // G › G2 › A › (a1 › a2, a3); G › B › b1; G › C › c1. D, E, H and the floating N stay out.
    expect(ids(selectionWithContents(p, 'G'))).toEqual([
      'marking:G2',
      'image:A',
      'marking:a1',
      'marking:a2',
      'marking:a3',
      'image:B',
      'marking:b1',
      'image:C',
      'marking:c1',
      'marking:G',
    ]);
    expect(ids(selectionWithContents(p, 'G2'))).toEqual([
      'image:A',
      'marking:a1',
      'marking:a2',
      'marking:a3',
      'marking:G2',
    ]);
  });

  it('container marking: only the descendants', () => {
    expect(ids(selectionWithContents(p, 'a1'))).toEqual(['marking:a2', 'marking:a1']);
    expect(ids(selectionWithContents(p, 'a3'))).toEqual(['marking:a3']);
  });

  it('floating markings neither cover nor are covered; the floating one enters alone', () => {
    expect(ids(selectionWithContents(p, 'N'))).toEqual(['marking:N']);
    expect(ids(selectionWithContents(p, 'H'))).toEqual(['marking:H']);
    // A floating marking over G, with G geometrically containing it, does not become content.
    const q = settleHierarchy({
      ...p,
      markings: [
        ...p.markings,
        mk('F', null, rect(100, 100, 50, 50), { floating: true }),
      ],
    });
    expect(marking(q, 'F').parentId).toBeNull();
    expect(ids(selectionWithContents(q, 'G'))).not.toContain('marking:F');
  });

  it('a nonexistent marking fails with not-found', () => {
    expect(codeOf(() => selectionWithContents(p, 'nonexistent'))).toBe('not-found');
  });

  it('the result serves as input to the joint drag: it moves everything keeping the positions', () => {
    const items = selectionWithContents(p, 'G');
    expect(canMoveItems(p, items)).toBe(true);
    // The container markings are dropped (the containers carry them), the rest moves.
    expect(ids(movingItems(p, items))).toEqual([
      'marking:G2',
      'image:A',
      'image:B',
      'image:C',
      'marking:G',
    ]);
    const q = expectValid(moveItems(p, items, 55.5, 20.4));
    expect(image(q, 'B').parentId).toBe('G');
    expect(image(q, 'C').parentId).toBe('G');
    expect(image(q, 'A').parentId).toBe('G2');
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
  });
});

describe('itemsDeletionImpact', () => {
  const p = multiProjectAnnotated();
  const empty = {
    markings: 0,
    containers: 0,
    arrows: 0,
    annotations: 0,
    lockedMarkings: 0,
    containersStay: 0,
    brokenRefs: 0,
  };

  it('nothing selected, or only nonexistent items: all zero', () => {
    expect(itemsDeletionImpact(p, [])).toEqual(empty);
    expect(itemsDeletionImpact(p, [mark('nonexistent'), img('nonexistent')])).toEqual(
      empty,
    );
  });

  it('a selected marking and its child too: no double counting', () => {
    expect(itemsDeletionImpact(p, [mark('a1'), mark('a2')])).toEqual({
      ...empty,
      markings: 2,
      annotations: 3,
    });
    // Same as selecting only the parent, and as the impact of a single marking.
    expect(itemsDeletionImpact(p, [mark('a1')])).toEqual(
      itemsDeletionImpact(p, [mark('a1'), mark('a2'), mark('a2')]),
    );
    const single = markingDeletionImpact(p, 'a1');
    expect(itemsDeletionImpact(p, [mark('a1')])).toMatchObject({
      markings: single.descendants + 1,
      annotations: single.annotations,
      containersStay: single.containers,
    });
  });

  it('a selected container and a selected marking of it: the marking counts once', () => {
    const impact = itemsDeletionImpact(p, [img('A'), mark('a1')]);
    expect(impact).toEqual({ ...empty, markings: 3, containers: 1, annotations: 3 });
    const single = containerDeletionImpact(p, 'A');
    expect(impact).toMatchObject({
      markings: single.markings,
      annotations: single.annotations,
    });
  });

  it('the containers inside a marking that goes away and were not selected stay', () => {
    // G takes G2; the containers inside them are A (of G2), B and C (of G).
    expect(itemsDeletionImpact(p, [mark('G')])).toEqual({
      ...empty,
      markings: 2,
      containersStay: 3,
    });
    // Selecting B too: it goes (with b1 and its annotation) and stops staying.
    expect(itemsDeletionImpact(p, [mark('G'), img('B')])).toEqual({
      ...empty,
      markings: 3,
      containers: 1,
      annotations: 1,
      containersStay: 2,
    });
  });

  it('counts the locked ones that go along, selected or not, except the selected one that would block', () => {
    const locked = setMarkingLocked(p, 'a2', true);
    expect(itemsDeletionImpact(locked, [img('A')]).lockedMarkings).toBe(1);
    expect(itemsDeletionImpact(locked, [mark('a1')]).lockedMarkings).toBe(1);
    // a2 selected and locked goes with its parent a1 (also selected): the dialog counts it.
    expect(itemsDeletionImpact(locked, [mark('a1'), mark('a2')]).lockedMarkings).toBe(1);
    // Alone, a locked a2 blocks the deletion (canDeleteItems): it is not counted.
    expect(itemsDeletionImpact(locked, [mark('a2')]).lockedMarkings).toBe(0);
    expect(itemsDeletionImpact(locked, [img('B')]).lockedMarkings).toBe(0);
  });

  it('references that the deletion would break', () => {
    // The registration system: AIN, AII and AIE point to annotations of MF.
    let q = cadastroProject();
    q = createMarking(q, {
      id: 'MX',
      containerId: 'I1',
      rect: rect(100, 1500, 300, 100),
    });
    q = addTypedAnnotation(q, {
      id: 'AX',
      markingId: 'MX',
      layerId: layerOf(q, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'input' },
    });
    q = setFieldValue(q, 'AX', 'dado', { annotationId: 'AU', entryId: 'EN' });
    // Deleting MF takes AU and the source AX (in MX) is left with a broken reference; the others
    // (AIN, AII, AIE) go along with the descendants of MF.
    expect(itemsDeletionImpact(q, [mark('MF')]).brokenRefs).toBe(1);
    expect(markingDeletionImpact(q, 'MF').brokenRefs).toBe(1);
    // Deleting MX too takes the source: nothing breaks.
    expect(itemsDeletionImpact(q, [mark('MF'), mark('MX')]).brokenRefs).toBe(0);
  });
});

describe('canDeleteItems', () => {
  it('true with free items; false if any selected one is locked', () => {
    const p = multiProject();
    expect(canDeleteItems(p, [mark('G'), img('A'), mark('a1')])).toBe(true);
    expect(canDeleteItems(setMarkingLocked(p, 'a1', true), [mark('a1'), img('D')])).toBe(
      false,
    );
    expect(canDeleteItems(setImageLocked(p, 'D', true), [mark('G'), img('D')])).toBe(
      false,
    );
  });

  it('a locked one that goes along with the selected parent or container does not prevent it', () => {
    const p = setMarkingLocked(multiProject(), 'a2', true);
    // a2 is a child of a1 in A.
    expect(canDeleteItems(p, [mark('a2')])).toBe(false);
    expect(canDeleteItems(p, [mark('a1'), mark('a2')])).toBe(true);
    expect(canDeleteItems(p, [img('A'), mark('a2')])).toBe(true);
    expect(canDeleteItems(p, [img('B'), mark('a2')])).toBe(false);
  });

  it('the lock of an ancestor is a geometry lock and does not prevent deleting', () => {
    const p = setMarkingLocked(multiProject(), 'a1', true);
    expect(canDeleteItems(p, [mark('a2')])).toBe(true);
    // A locked descendant goes along with its parent, as in canDeleteMarking.
    expect(canDeleteItems(p, [img('A')])).toBe(true);
  });

  it('nonexistent items are ignored; with nothing to delete it is false', () => {
    const p = multiProject();
    expect(canDeleteItems(p, [])).toBe(false);
    expect(canDeleteItems(p, [mark('nonexistent')])).toBe(false);
    expect(canDeleteItems(p, [mark('nonexistent'), mark('H')])).toBe(true);
  });
});

describe('removeItems', () => {
  const p = multiProjectAnnotated();

  it('a marking with its descendants and annotations, like removeMarking', () => {
    const q = expectValid(removeItems(p, [mark('a1')]));
    expect(q).toEqual(removeMarking(p, 'a1'));
    expect(q.markings.map((m) => m.id)).not.toContain('a2');
    expect(q.annotations.map((a) => a.id)).toEqual(['n4']);
  });

  it('a container with its markings and annotations, like removeContainer', () => {
    const q = expectValid(removeItems(p, [img('A')]));
    expect(q).toEqual(removeContainer(p, 'A'));
    expect(q.containers.map((c) => c.id)).toEqual(['B', 'C', 'D', 'E']);
  });

  it('never deletes an unselected container: the inner ones pass to the parent or to none', () => {
    const q = expectValid(removeItems(p, [mark('G')]));
    expect(q).toEqual(removeMarking(p, 'G'));
    expect(q.containers.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(q.containers.map((c) => c.parentId)).toEqual([null, null, null, null, null]);
    // G2 goes along with G; their containers and markings stay.
    expect(q.markings.map((m) => m.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'b1',
      'c1',
      'e1',
      'N',
      'H',
    ]);
  });

  it('the whole selection in one operation, without counting twice', () => {
    const q = expectValid(
      removeItems(p, [mark('G'), img('A'), mark('a1'), mark('a2'), img('B'), mark('H')]),
    );
    expect(q.containers.map((c) => c.id)).toEqual(['C', 'D', 'E']);
    expect(q.containers.map((c) => c.parentId)).toEqual([null, null, null]);
    expect(q.markings.map((m) => m.id)).toEqual(['c1', 'e1', 'N']);
    expect(q.annotations).toEqual([]);
  });

  it('a locked item fails without deleting anything; nonexistent ones are ignored', () => {
    const locked = setMarkingLocked(p, 'a1', true);
    expect(codeOf(() => removeItems(locked, [mark('H'), mark('a1')]))).toBe('locked');
    // A locked one that goes along with the selected container does not block.
    expect(codeOf(() => removeItems(locked, [img('A'), mark('a1')]))).toBeNull();
    expect(codeOf(() => removeItems(locked, [mark('a1'), img('D')]))).toBe('locked');
    const container = setImageLocked(p, 'D', true);
    expect(codeOf(() => removeItems(container, [mark('H'), img('D')]))).toBe('locked');
    // A locked descendant goes along with its parent, without blocking.
    expect(codeOf(() => removeItems(locked, [img('A')]))).toBeNull();
    expect(removeItems(p, [mark('nonexistent'), img('nonexistent')])).toBe(p);
    expect(removeItems(p, [])).toBe(p);
  });

  it('settle: false leaves the membership as it is', () => {
    const q = removeItems(p, [mark('G')], { settle: false });
    expect(q.containers.map((c) => c.parentId)).toEqual(['G2', 'G', 'G', null, null]);
  });
});

describe('setItemsLocked', () => {
  it('locks and unlocks markings and containers in one operation', () => {
    const p = multiProject();
    const locked = setItemsLocked(p, [mark('G'), img('A'), mark('a1'), img('D')], true);
    expect(marking(locked, 'G').locked).toBe(true);
    expect(marking(locked, 'a1').locked).toBe(true);
    expect(image(locked, 'A').locked).toBe(true);
    expect(image(locked, 'D').locked).toBe(true);
    // The rest does not change and keeps its identity.
    expect(marking(locked, 'a2')).toBe(marking(p, 'a2'));
    expect(image(locked, 'B')).toBe(image(p, 'B'));
    expect(
      setItemsLocked(locked, [mark('G'), img('A'), mark('a1'), img('D')], false),
    ).toEqual(p);
  });

  it('only changes what it needs to; nothing to change returns the same project', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    const q = setItemsLocked(p, [mark('G'), mark('H')], true);
    expect(marking(q, 'H').locked).toBe(true);
    expect(q.containers).toBe(p.containers);
    expect(setItemsLocked(q, [mark('G'), mark('H')], true)).toBe(q);
    expect(setItemsLocked(p, [], true)).toBe(p);
    expect(setItemsLocked(p, [mark('nonexistent'), img('nonexistent')], true)).toBe(p);
    // Containers only: the markings keep the array.
    const r = setItemsLocked(p, [img('A')], true);
    expect(r.markings).toBe(p.markings);
  });
});

describe('limitItemsMove: the drag that touches', () => {
  it('a displacement that fits stays as it is', () => {
    const p = multiProject();
    expect(limitItemsMove(p, [img('A')], 500, 20)).toEqual({ dx: 500, dy: 20 });
    expect(limitItemsMove(p, [img('A')], -300, -40)).toEqual({ dx: -300, dy: -40 });
  });

  it('would overlap a fixed container: becomes the largest without overlap and touches (distance 0)', () => {
    const p = multiProject();
    // A (0..1000) against B (2000..3000): it only moves 1000 and the edges become equal.
    const d = limitItemsMove(p, [img('A')], 1500, 0);
    expect(d).toEqual({ dx: 1000, dy: 0 });
    const q = expectValid(moveItems(p, [img('A')], d.dx, d.dy));
    expect(image(q, 'A').placement.x + 1000).toBe(image(q, 'B').placement.x);
    // To the left, B against A: it touches the right edge of A.
    expect(limitItemsMove(p, [img('B')], -1500, 0)).toEqual({ dx: -1000, dy: 0 });
  });

  it('slides on the other axis: touches in x and the requested y stays', () => {
    const p = multiProject();
    expect(limitItemsMove(p, [img('A')], 1500, 300)).toEqual({ dx: 1000, dy: 300 });
    // Against an obstacle above/below: y touches and x moves fully.
    const q = multiProject();
    const d = limitItemsMove(q, [img('A')], 400, 1500);
    expect(d.dx).toBe(400);
    expect(d.dy).toBe(1500);
  });

  it('the joint selection moves the smallest displacement of whoever touches first', () => {
    const p = multiProject();
    // B (2000..3000) against the fixed C (4000): 1000; A goes along with the same displacement.
    expect(limitItemsMove(p, [img('A'), img('B')], 1500, 0)).toEqual({ dx: 1000, dy: 0 });
  });

  it('with a canvas marking in the selection the displacement is whole (never into the obstacle)', () => {
    const p = multiProject();
    const d = limitItemsMove(p, [img('A'), mark('N')], 1500.7, 0);
    expect(Number.isInteger(d.dx)).toBe(true);
    expect(d.dx).toBeLessThanOrEqual(1000);
    expect(() => moveItems(p, [img('A'), mark('N')], d.dx, d.dy)).not.toThrow();
  });

  it('fractional neighbor: with a canvas marking in the selection it stops less than 1 unit away, without overlapping', () => {
    const base = multiProject();
    const p = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'B' ? { ...c, placement: { ...c.placement, x: 2000.4 } } : c,
      ),
    };
    const items = [img('A'), mark('N')];
    const d = limitItemsMove(p, items, 1500, 0);
    const q = expectValid(moveItems(p, items, d.dx, d.dy));
    const gap = image(q, 'B').placement.x - (image(q, 'A').placement.x + 1000);
    expect(Number.isInteger(d.dx)).toBe(true);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(1);
    // Without a canvas marking in the selection the displacement is fractional and touches exactly.
    const solo = limitItemsMove(p, [img('A')], 1500, 0);
    const r = expectValid(moveItems(p, [img('A')], solo.dx, solo.dy));
    expect(image(r, 'A').placement.x + 1000).toBeCloseTo(image(r, 'B').placement.x, 9);
  });

  it('a free destination after passing over a container stays as requested', () => {
    const p = multiProject();
    // A (0..1000) goes to the gap between B (2000..3000) and C (4000): 3000..4000, without overlapping.
    expect(limitItemsMove(p, [img('A')], 3000, 0)).toEqual({ dx: 3000, dy: 0 });
  });

  it('without a container in the selection, or with zero displacement, returns the request', () => {
    const p = multiProject();
    expect(limitItemsMove(p, [mark('N')], 30, 0)).toEqual({ dx: 30, dy: 0 });
    expect(limitItemsMove(p, [img('A')], 0, 0)).toEqual({ dx: 0, dy: 0 });
  });
});

// Decision 9 of stage #1190: `touchDelta` filters the fixed ones by the swept box and gives the same result
// as the calculation without a filter (`slideToTouch` directly, with the rounding and truncation of `whole`).
describe('touchDelta: the swept-box filter does not change the result', () => {
  const grid = (r: Rand, n: number, span: number, size: number): Rect[] =>
    Array.from({ length: n }, () => ({
      x: Math.round(r() * span * 4) / 4,
      y: Math.round(r() * span * 4) / 4,
      width: 20 + Math.round(r() * size * 4) / 4,
      height: 20 + Math.round(r() * size * 4) / 4,
    }));

  it('in 200 scenarios with a fixed seed it gives the same as slideToTouch without the filter', () => {
    const r = rng(1190);
    let touched = 0;
    for (let i = 0; i < 200; i++) {
      const moving = grid(r, 1 + Math.floor(r() * 3), 300, 80);
      const fixed = grid(r, 3 + Math.floor(r() * 12), 600, 120);
      const whole = r() < 0.5;
      const dx = (r() - 0.5) * 500;
      const dy = (r() - 0.5) * 500;
      const wantedX = whole ? Math.round(dx) : dx;
      const wantedY = whole ? Math.round(dy) : dy;
      const slid = slideToTouch(moving, fixed, wantedX, wantedY);
      const expected = whole
        ? { dx: Math.trunc(slid.dx), dy: Math.trunc(slid.dy) }
        : slid;
      if (slid.dx !== wantedX || slid.dy !== wantedY) touched++;
      expect(touchDelta(moving, fixed, dx, dy, whole)).toEqual(expected);
    }
    // the generator really exercises the touch, not only a free destination
    expect(touched).toBeGreaterThan(20);
  });
});
