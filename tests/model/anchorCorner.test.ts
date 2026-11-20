// Corner alignment of the anchor (stage #2093, CC3, decisions 11 to 13): `corner-start` and `corner-end`
// put the CENTER of the anchored marking on the anchor's corner, in the reading direction, and keep it
// there while the marking grows (a Badge `3`, `12`, `99+` on a bare icon).
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_ALIGNS,
  addComponentMarking,
  addContainer,
  anchoredRect,
  applySpecialization,
  approximateMeasurer,
  createMarking,
  fitMarking,
  markingAnchorDefaults,
  setFieldValue,
  setMarkingAnchor,
  setMarkingRect,
  setProjectDirection,
  snapToAnchor,
  type AnchorAlign,
  type AnchorSide,
  type ComponentCatalog,
  type MarkingAnchor,
  type Project,
  type Rect,
} from '../../src/model';
import { CORNER_SPEC_ID, cornerCatalog, cornerSpec } from './cornerFixtures';
import { emptyProject, marking } from './fixtures';

const T: Rect = { x: 400, y: 300, width: 200, height: 100 };

/** The center of a rectangle. */
const centerOf = (r: Rect): { x: number; y: number } => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

/** I1 1000×800 with T (200×100 at 400,300) and M (`width`×40 at 10,10), both in the container. */
function base(anchor: MarkingAnchor, width = 100): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = createMarking(p, { id: 'T', containerId: 'I1', rect: T });
  p = createMarking(p, {
    id: 'M',
    containerId: 'I1',
    rect: { x: 10, y: 10, width, height: 40 },
  });
  return setMarkingAnchor(p, 'M', anchor);
}

const snappedCenter = (p: Project) =>
  centerOf(snapToAnchor(p, 'M').project.markings[1]!.rect);

describe('ANCHOR_ALIGNS (decision 11)', () => {
  it('has the three alignments and the two corner ones', () => {
    expect([...ANCHOR_ALIGNS]).toEqual([
      'start',
      'center',
      'end',
      'corner-start',
      'corner-end',
    ]);
  });
});

describe('corner alignment: the center sits on the anchor corner (ltr)', () => {
  // M is 100×40; T is 200×100 at (400,300): left 400, right 600, top 300, bottom 400.
  const cases: [AnchorSide, AnchorAlign, { x: number; y: number }][] = [
    ['top', 'corner-start', { x: 400, y: 300 }],
    ['top', 'corner-end', { x: 600, y: 300 }],
    ['bottom', 'corner-start', { x: 400, y: 400 }],
    ['bottom', 'corner-end', { x: 600, y: 400 }],
    ['start', 'corner-start', { x: 400, y: 300 }],
    ['start', 'corner-end', { x: 400, y: 400 }],
    ['end', 'corner-start', { x: 600, y: 300 }],
    ['end', 'corner-end', { x: 600, y: 400 }],
  ];
  it.each(cases)('%s + %s', (side, align, center) => {
    expect(snappedCenter(base({ to: 'T', side, align }))).toEqual(center);
  });
});

describe('corner alignment in rtl: start and end follow the reading direction', () => {
  // In rtl `start` is the right edge: `top` + `corner-end` is the LEFT corner.
  const cases: [AnchorSide, AnchorAlign, { x: number; y: number }][] = [
    ['top', 'corner-start', { x: 600, y: 300 }],
    ['top', 'corner-end', { x: 400, y: 300 }],
    ['bottom', 'corner-start', { x: 600, y: 400 }],
    ['bottom', 'corner-end', { x: 400, y: 400 }],
    ['start', 'corner-start', { x: 600, y: 300 }],
    ['start', 'corner-end', { x: 600, y: 400 }],
    ['end', 'corner-start', { x: 400, y: 300 }],
    ['end', 'corner-end', { x: 400, y: 400 }],
  ];
  it.each(cases)('%s + %s', (side, align, center) => {
    const p = setProjectDirection(base({ to: 'T', side, align }), 'rtl');
    expect(snappedCenter(p)).toEqual(center);
  });
});

describe('corner alignment: equivalent spellings of the same corner', () => {
  it.each(['ltr', 'rtl'] as const)(
    'top + corner-end equals end + corner-start (%s)',
    (direction) => {
      const a = setProjectDirection(
        base({ to: 'T', side: 'top', align: 'corner-end' }),
        direction,
      );
      const b = setProjectDirection(
        base({ to: 'T', side: 'end', align: 'corner-start' }),
        direction,
      );
      expect(snapToAnchor(a, 'M').project.markings[1]!.rect).toEqual(
        snapToAnchor(b, 'M').project.markings[1]!.rect,
      );
    },
  );
});

describe('corner alignment: offset moves from the corner', () => {
  const corner = { x: 600, y: 300 }; // top + corner-end, ltr

  it('offset.main moves outward (positive away from the anchor)', () => {
    const anchor: MarkingAnchor = {
      to: 'T',
      side: 'top',
      align: 'corner-end',
      offset: { main: 4, cross: 0 },
    };
    expect(snappedCenter(base(anchor))).toEqual({ x: corner.x, y: corner.y - 4 });
    expect(
      snappedCenter(base({ ...anchor, side: 'end', align: 'corner-start' })),
    ).toEqual({
      x: corner.x + 4,
      y: corner.y,
    });
    expect(
      snappedCenter(base({ ...anchor, side: 'bottom', align: 'corner-start' })),
    ).toEqual({
      x: 400,
      y: 400 + 4,
    });
  });

  it('offset.cross moves along the side: reading direction on top/bottom, downward on start/end', () => {
    const anchor: MarkingAnchor = {
      to: 'T',
      side: 'top',
      align: 'corner-end',
      offset: { main: 0, cross: 6 },
    };
    expect(snappedCenter(base(anchor))).toEqual({ x: corner.x + 6, y: corner.y });
    expect(snappedCenter(setProjectDirection(base(anchor), 'rtl'))).toEqual({
      x: 400 - 6,
      y: corner.y,
    });
    expect(
      snappedCenter(base({ ...anchor, side: 'end', align: 'corner-start' })),
    ).toEqual({
      x: corner.x,
      y: corner.y + 6,
    });
  });

  it('a negative main overlaps the anchor', () => {
    const anchor: MarkingAnchor = {
      to: 'T',
      side: 'top',
      align: 'corner-end',
      offset: { main: -3, cross: 0 },
    };
    expect(snappedCenter(base(anchor))).toEqual({ x: corner.x, y: corner.y + 3 });
  });
});

describe('corner alignment: the center stays on the corner while the width grows', () => {
  // 6 is below the smallest marking (`MIN_MARKING_SIZE`), so the geometry is checked directly.
  it.each([6, 16, 22, 34])('width %i keeps the center within 0.5 px', (width) => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const rect = anchoredRect(
        T,
        { width, height: 16 },
        { side: 'top', align: 'corner-end', offset: { main: 0, cross: 0 } },
        direction,
      );
      const center = centerOf(rect);
      const corner = { x: direction === 'ltr' ? 600 : 400, y: 300 };
      expect(Math.abs(center.x - corner.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(center.y - corner.y)).toBeLessThanOrEqual(0.5);
    }
  });

  it.each([16, 22, 34])(
    'snapToAnchor of a marking of width %i keeps the center',
    (width) => {
      const center = snappedCenter(
        base({ to: 'T', side: 'top', align: 'corner-end' }, width),
      );
      expect(Math.abs(center.x - 600)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(center.y - 300)).toBeLessThanOrEqual(0.5);
    },
  );

  it('an odd width rounds to the nearest integer rectangle', () => {
    const rect = anchoredRect(
      T,
      { width: 7, height: 7 },
      { side: 'top', align: 'corner-end', offset: { main: 0, cross: 0 } },
      'ltr',
    );
    expect(rect).toEqual({ x: 597, y: 297, width: 7, height: 7 });
  });
});

const SPEC_ID = CORNER_SPEC_ID;
const spec = cornerSpec;
const catalog: ComponentCatalog = cornerCatalog();

/** The container with the bare icon `T` (200×100 at 400,300) and a Badge `B` with the given anchor. */
function withBadge(anchor: MarkingAnchor | null): Project {
  let p = applySpecialization(emptyProject(), spec(), {
    newId: (() => {
      let n = 0;
      return () => `CS${++n}`;
    })(),
    packageSpecName: 'corner.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 });
  p = createMarking(p, { id: 'T', containerId: 'I1', rect: T });
  p = addComponentMarking(
    p,
    catalog,
    {
      markingId: 'B',
      annotationId: 'A_B',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'badge',
      rect: { x: 50, y: 50, width: 16, height: 16 },
    },
    approximateMeasurer,
  );
  return anchor === null ? p : setMarkingAnchor(p, 'B', anchor);
}

/** Arrange as the store does it for an anchored marking: fit to the content, then snap to the anchor. */
function arrangeAndSnap(p: Project): Project {
  const fitted = fitMarking(p, catalog, 'B', approximateMeasurer);
  return snapToAnchor(fitted, 'B', { defaults: markingAnchorDefaults(fitted, catalog) })
    .project;
}

describe('the component root default (`anchor.align: corner-end`)', () => {
  it('applies when the marking says only `to`', () => {
    const p = withBadge({ to: 'T' });
    const snapped = snapToAnchor(p, 'B', {
      defaults: markingAnchorDefaults(p, catalog),
    }).project;
    const center = centerOf(marking(snapped, 'B').rect);
    expect(center).toEqual({ x: 600, y: 300 });
  });

  it('the marking can override it with another alignment', () => {
    const p = withBadge({ to: 'T', align: 'corner-start' });
    const snapped = snapToAnchor(p, 'B', {
      defaults: markingAnchorDefaults(p, catalog),
    }).project;
    expect(centerOf(marking(snapped, 'B').rect)).toEqual({ x: 400, y: 300 });
  });
});

describe('Arrange (fit then snap) keeps the center on the corner after the width grows', () => {
  it.each(['3', '12', '99+'])('count %s', (count) => {
    const p = setFieldValue(withBadge({ to: 'T' }), 'A_B', 'count', count);
    const arranged = arrangeAndSnap(p);
    const rect = marking(arranged, 'B').rect;
    const center = centerOf(rect);
    expect(Math.abs(center.x - 600)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(center.y - 300)).toBeLessThanOrEqual(0.5);
    expect(rect.width).toBeGreaterThanOrEqual(16);
  });

  it('the width really grows with the text and the center does not move', () => {
    const short = arrangeAndSnap(
      setFieldValue(withBadge({ to: 'T' }), 'A_B', 'count', '3'),
    );
    const long = arrangeAndSnap(
      setFieldValue(withBadge({ to: 'T' }), 'A_B', 'count', '99+'),
    );
    expect(marking(long, 'B').rect.width).toBeGreaterThan(marking(short, 'B').rect.width);
    const drift =
      centerOf(marking(long, 'B').rect).x - centerOf(marking(short, 'B').rect).x;
    expect(Math.abs(drift)).toBeLessThanOrEqual(0.5);
  });

  it('repeating Arrange changes nothing', () => {
    const once = arrangeAndSnap(
      setFieldValue(withBadge({ to: 'T' }), 'A_B', 'count', '99+'),
    );
    expect(arrangeAndSnap(once)).toBe(once);
  });
});

describe('moving the anchor takes the badge along (the corner is kept by the offset)', () => {
  it('after moving T by (10, 20) and snapping, the center is on the new corner', () => {
    const p = withBadge({ to: 'T' });
    const moved = setMarkingRect(p, 'T', { ...T, x: T.x + 10, y: T.y + 20 });
    const snapped = snapToAnchor(moved, 'B', {
      defaults: markingAnchorDefaults(moved, catalog),
    }).project;
    expect(centerOf(marking(snapped, 'B').rect)).toEqual({ x: 610, y: 320 });
  });
});
