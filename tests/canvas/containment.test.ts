import { describe, expect, it } from 'vitest';
import {
  ABSORB_TOLERANCE,
  absorbCandidates,
  absorbInto,
  snapTarget,
  spaceTolerance,
  type AbsorbCandidate,
} from '../../src/canvas/containment';
import {
  IDENTITY_PLACEMENT,
  addContainer,
  createMarking,
  setContainerPlacement,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';

// Two containers: A 1000×800 at (0, 0) at scale 1; B 500×500 at (1100, 0) at scale 0.5
// (takes up 250×250 on the canvas, from 1100 to 1350 × 0 to 250).
function twoContainers(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'A', file: 'images/a.jpg', width: 1000, height: 800 });
  p = addContainer(p, { id: 'B', file: 'images/b.jpg', width: 500, height: 500 });
  p = setContainerPlacement(p, 'A', { x: 0, y: 0, scale: 1 });
  p = setContainerPlacement(p, 'B', { x: 1100, y: 0, scale: 0.5 });
  return p;
}

const TOL = ABSORB_TOLERANCE; // zoom 1, escala 1

describe('spaceTolerance', () => {
  it('converts the screen px by the zoom and by the container scale', () => {
    expect(ABSORB_TOLERANCE).toBe(12);
    expect(spaceTolerance(1, 1)).toBe(12);
    expect(spaceTolerance(2, 1)).toBe(6);
    expect(spaceTolerance(0.5, 0.5)).toBe(48);
  });
});

describe('snapTarget: snapping of a moved marking', () => {
  const p = twoContainers();
  const containers = (): readonly ProjectContainer[] => p.containers;
  const from: Placement = IDENTITY_PLACEMENT;

  it('fully inside a container: it, without offset', () => {
    expect(
      snapTarget({ x: 100, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 0, dy: 0 });
    // Coinciding edges count as inside.
    expect(
      snapTarget({ x: 950, y: 750, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 0, dy: 0 });
  });

  it('almost whole: shifts it inside (the outside part up to 12 screen px)', () => {
    // 10 outside to the right.
    expect(
      snapTarget({ x: 960, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -10, dy: 0 });
    // 12 outside to the left and 5 on top: both axes.
    expect(
      snapTarget({ x: -12, y: -5, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 12, dy: 5 });
  });

  it('beyond the tolerance, far away or larger than the container: does not snap', () => {
    // 12 outside still snaps (inclusive limit); 13 does not.
    expect(
      snapTarget({ x: 962, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -12, dy: 0 });
    expect(
      snapTarget({ x: 963, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toBeNull();
    expect(
      snapTarget({ x: 5000, y: 5000, width: 50, height: 50 }, from, containers(), TOL),
    ).toBeNull();
    // Larger than container B (250×250 on the canvas): it does not fit, even flush.
    expect(
      snapTarget({ x: 1100, y: 0, width: 300, height: 100 }, from, containers(), TOL),
    ).toBeNull();
  });

  it('the tolerance is in screen px: with more zoom, fewer canvas units', () => {
    const rect = { x: 960, y: 100, width: 50, height: 50 }; // 10 units outside
    expect(snapTarget(rect, from, containers(), spaceTolerance(1, 1))).not.toBeNull();
    expect(snapTarget(rect, from, containers(), spaceTolerance(2, 1))).toBeNull();
    expect(snapTarget(rect, from, containers(), spaceTolerance(0.5, 1))).not.toBeNull();
  });

  it('between scales: the offset is the canvas one and returns to the origin space rounding inward', () => {
    // Origin: container B (scale 0.5). The marking, in canvas units, ended up 3.5 outside
    // to the right of container A (x = 1000 is A right edge): it must go 3.5 canvas units
    // to the left = 7 pixels of B.
    const fromB: Placement = { x: 1100, y: 0, scale: 0.5 };
    expect(
      snapTarget({ x: 953.5, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -7, dy: 0 });
    // 3.25 units = 6.5 px of B: rounds inward (more to the left).
    expect(
      snapTarget({ x: 953.25, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -7, dy: 0 });
    // On the left: 3.25 outside = 6.5 px; inward is to the right (rounds up).
    expect(
      snapTarget({ x: -3.25, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 7, dy: 0 });
  });

  it('marking the same size as the container that does not close with the rounding: does not snap', () => {
    // Width = 1000 (that of container A) at scale 0.5: the whole offset leaves 0.5 on
    // the other side.
    const fromB: Placement = { x: 1100, y: 0, scale: 0.5 };
    expect(
      snapTarget({ x: -0.25, y: 100, width: 1000, height: 50 }, fromB, containers(), TOL),
    ).toBeNull();
  });

  it('with two candidates, the one with the smaller offset wins', () => {
    let q = emptyProject();
    q = addContainer(q, { id: 'L', file: 'images/l.jpg', width: 400, height: 400 });
    q = addContainer(q, { id: 'R', file: 'images/r.jpg', width: 400, height: 400 });
    q = setContainerPlacement(q, 'L', { x: 0, y: 0, scale: 1 });
    q = setContainerPlacement(q, 'R', { x: 405, y: 0, scale: 1 });
    // Between the two (L ends at 400; R starts at 405): 30 wide; 4 from R, 6 from L.
    const rect = { x: 401, y: 100, width: 30, height: 30 };
    expect(snapTarget(rect, from, q.containers, TOL)).toEqual({
      containerId: 'R',
      dx: 4,
      dy: 0,
    });
  });
});

describe('absorbInto: absorption when drawing or resizing', () => {
  const item = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): AbsorbCandidate => ({
    kind: 'marking',
    id,
    rect: { x, y, width: w, height: h },
  });
  const R = { x: 100, y: 100, width: 200, height: 200 };

  it('the item that crosses within the tolerance is enclosed', () => {
    // Goes 10 past on the right and 5 below.
    const out = absorbInto(R, [item('a', 250, 250, 60, 55)], TOL, null);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 210, height: 205 });
    expect(out.absorbed.map((a) => a.id)).toEqual(['a']);
  });

  it('beyond the tolerance on some side: nothing', () => {
    const out = absorbInto(R, [item('a', 250, 250, 63, 55)], TOL, null);
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
  });

  it('already wholly inside, without crossing, or containing the rectangle: it is not absorbed', () => {
    const out = absorbInto(
      R,
      [
        item('dentro', 120, 120, 50, 50),
        item('fora', 400, 400, 20, 20),
        item('encosta', 300, 100, 20, 20),
        item('parent', 95, 95, 215, 215), // contains the rectangle: possible parent
      ],
      TOL,
      null,
    );
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
  });

  it('one by one, from the smallest excess to the largest, re-evaluating at each growth', () => {
    const near = item('near', 295, 150, 15, 20); // goes 10 past on the right
    const nearer = item('nearer', 295, 200, 8, 20); // goes 3 past on the right
    const out = absorbInto(R, [near, nearer], TOL, null);
    expect(out.absorbed.map((a) => a.id)).toEqual(['nearer', 'near']);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 210, height: 200 });
  });

  it('growing encloses an item that previously went past the tolerance', () => {
    // `b` goes 14 past on the right (outside); `a` goes 10 and, absorbed, leaves `b` at 4: it enters.
    const a = item('a', 290, 100, 20, 40);
    const b = item('b', 296, 150, 18, 40);
    const out = absorbInto(R, [b, a], TOL, null);
    expect(out.absorbed.map((x) => x.id)).toEqual(['a', 'b']);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 214, height: 200 });
  });

  it('on a container marking the growth does not leave the container', () => {
    const limit = { x: 0, y: 0, width: 305, height: 400 };
    const out = absorbInto(R, [item('a', 250, 150, 60, 20)], TOL, limit); // would go to 310
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
    const ok = absorbInto(R, [item('a', 250, 150, 55, 20)], TOL, limit);
    expect(ok.rect).toEqual({ x: 100, y: 100, width: 205, height: 200 });
  });

  it('decimal rectangles (canvas containers): floor on the left and top, ceil on the right and bottom', () => {
    const container: AbsorbCandidate = {
      kind: 'container',
      id: 'B',
      rect: { x: 290.4, y: 95.6, width: 20.3, height: 50.2 }, // 290.4..310.7 × 95.6..145.8
    };
    const out = absorbInto(R, [container], TOL, null);
    expect(out.rect).toEqual({ x: 100, y: 95, width: 211, height: 205 });
    expect(Number.isInteger(out.rect.x + out.rect.width)).toBe(true);
  });

  it('by the smallest crossed side, without growing on the others', () => {
    // Goes past only on the left (by 6).
    const out = absorbInto(R, [item('a', 94, 150, 20, 20)], TOL, null);
    expect(out.rect).toEqual({ x: 94, y: 100, width: 206, height: 200 });
  });

  it('without candidates, returns the same rectangle', () => {
    expect(absorbInto(R, [], TOL, null)).toEqual({ rect: R, absorbed: [] });
  });
});

describe('absorbCandidates', () => {
  it('the markings of the space (minus the excluded and the floating ones) and, on the canvas, the containers', () => {
    let p = twoContainers();
    p = createMarking(p, {
      id: 'M1',
      containerId: 'A',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'M2',
      containerId: 'A',
      rect: { x: 20, y: 20, width: 20, height: 20 },
    });
    p = createMarking(p, {
      id: 'M3',
      containerId: 'B',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -500, y: -500, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -700, y: -700, width: 100, height: 100 },
      floating: true,
    });
    const ids = (cs: AbsorbCandidate[]) => cs.map((c) => `${c.kind}:${c.id}`);
    expect(ids(absorbCandidates(p, 'A', new Set()))).toEqual([
      'marking:M1',
      'marking:M2',
    ]);
    expect(ids(absorbCandidates(p, 'A', new Set(['M1'])))).toEqual(['marking:M2']);
    expect(ids(absorbCandidates(p, 'B', new Set()))).toEqual(['marking:M3']);
    expect(ids(absorbCandidates(p, null, new Set()))).toEqual([
      'marking:C1',
      'container:A',
      'container:B',
    ]);
    const container = absorbCandidates(p, null, new Set()).find((c) => c.id === 'B');
    expect(container?.rect).toEqual({ x: 1100, y: 0, width: 250, height: 250 });
  });
});
