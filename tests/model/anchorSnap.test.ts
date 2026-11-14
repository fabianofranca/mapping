// `snapToAnchor` (R3, decision 12): snaps the anchored marking to the anchor, on the side, aligned and with the
// offset. `start`/`end` follow the effective reading direction of the space; `offset.cross` is in the
// reading direction on `top`/`bottom` and downwards on `start`/`end`.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  setMarkingRect,
  setContainerDensity,
  setMarkingAnchor,
  setProjectDirection,
  snapToAnchor,
  type AnchorAlign,
  type AnchorSide,
  type MarkingAnchor,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject, marking } from './fixtures';

const T: Rect = { x: 400, y: 300, width: 200, height: 100 };

/** I1 1000×800 with T (200×100 at 400,300) and M (100×40 at 10,10); canvas with CT and CM. */
function base(anchor: MarkingAnchor = { to: 'T' }): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = createMarking(p, { id: 'T', containerId: 'I1', rect: T });
  p = createMarking(p, {
    id: 'M',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 40 },
  });
  p = createMarking(p, {
    id: 'CT',
    containerId: null,
    rect: { x: -2000, y: -2000, width: 200, height: 100 },
  });
  p = createMarking(p, {
    id: 'CM',
    containerId: null,
    rect: { x: -3000, y: -3000, width: 100, height: 40 },
  });
  return setMarkingAnchor(setMarkingAnchor(p, 'M', anchor), 'CM', {
    ...anchor,
    to: 'CT',
  });
}

const moveMarkingTo = (p: Project, id: string, to: { x: number; y: number }): Project =>
  setMarkingRect(p, id, { ...marking(p, id).rect, ...to });

const snap = (p: Project, id = 'M', options?: Parameters<typeof snapToAnchor>[2]) =>
  snapToAnchor(p, id, options);
const at = (p: Project, id = 'M') => {
  const { x, y } = marking(p, id).rect;
  return { x, y };
};

describe('snapToAnchor: sides × alignments (ltr, no offset)', () => {
  // M is 100×40; T is 200×100 at (400,300).
  const cases: [AnchorSide, AnchorAlign, { x: number; y: number }][] = [
    ['top', 'start', { x: 400, y: 260 }],
    ['top', 'center', { x: 450, y: 260 }],
    ['top', 'end', { x: 500, y: 260 }],
    ['bottom', 'start', { x: 400, y: 400 }],
    ['bottom', 'center', { x: 450, y: 400 }],
    ['bottom', 'end', { x: 500, y: 400 }],
    ['start', 'start', { x: 300, y: 300 }],
    ['start', 'center', { x: 300, y: 330 }],
    ['start', 'end', { x: 300, y: 360 }],
    ['end', 'start', { x: 600, y: 300 }],
    ['end', 'center', { x: 600, y: 330 }],
    ['end', 'end', { x: 600, y: 360 }],
  ];
  it.each(cases)('%s / %s', (side, align, expected) => {
    const { project, warnings } = snap(base({ to: 'T', side, align }));
    expect(at(project)).toEqual(expected);
    expect(marking(project, 'M').rect).toMatchObject({ width: 100, height: 40 });
    expect(warnings).toEqual([]);
  });

  it('without side, align and offset it defaults to top / center / 0', () => {
    expect(at(snap(base()).project)).toEqual({ x: 450, y: 260 });
  });

  it('the anchor does not change (only the anchored rectangle) and the target anchor stays where it is', () => {
    const { project } = snap(base());
    expect(marking(project, 'T').rect).toEqual(T);
    expect(marking(project, 'M').anchor).toEqual({ to: 'T' });
  });
});

describe('snapToAnchor: offset', () => {
  it('main moves away from the edge (negative overlaps) and cross runs along the side', () => {
    const top = snap(
      base({ to: 'T', side: 'top', align: 'center', offset: { main: 10, cross: 5 } }),
    );
    expect(at(top.project)).toEqual({ x: 455, y: 250 });
    const over = snap(
      base({ to: 'T', side: 'bottom', align: 'start', offset: { main: -8, cross: 0 } }),
    );
    expect(at(over.project)).toEqual({ x: 400, y: 392 });
    const side = snap(
      base({ to: 'T', side: 'end', align: 'start', offset: { main: 12, cross: 7 } }),
    );
    expect(at(side.project)).toEqual({ x: 612, y: 307 });
    const left = snap(
      base({ to: 'T', side: 'start', align: 'end', offset: { main: 12, cross: -3 } }),
    );
    expect(at(left.project)).toEqual({ x: 288, y: 357 });
  });

  it('the anchor offset is in pixels; the component defaults are in units × density', () => {
    const dense = (anchor: MarkingAnchor) => setContainerDensity(base(anchor), 'I1', 2);
    const own = snap(dense({ to: 'T', side: 'top', offset: { main: 4, cross: 2 } }));
    expect(at(own.project)).toEqual({ x: 452, y: 256 });
    const fromDefaults = snap(dense({ to: 'T' }), 'M', {
      defaults: { side: 'bottom', align: 'start', offset: { main: 4, cross: 2 } },
    });
    // main 4 u × 2 = 8 px; cross 2 u × 2 = 4 px.
    expect(at(fromDefaults.project)).toEqual({ x: 404, y: 408 });
  });

  it('what the anchor specifies wins over the defaults; the rest comes from them (object or function)', () => {
    const defaults = {
      side: 'bottom',
      align: 'end',
      offset: { main: 2, cross: 0 },
    } as const;
    const mixed = snap(base({ to: 'T', align: 'start' }), 'M', { defaults });
    expect(at(mixed.project)).toEqual({ x: 400, y: 402 });
    const byFn = snap(base({ to: 'T', align: 'start' }), 'M', {
      defaults: (m) => (m.id === 'M' ? defaults : undefined),
    });
    expect(at(byFn.project)).toEqual({ x: 400, y: 402 });
  });

  it('density 1 does not scale the default', () => {
    const r = snap(base({ to: 'T' }), 'M', {
      defaults: { offset: { main: 4, cross: 0 } },
    });
    expect(at(r.project)).toEqual({ x: 450, y: 256 });
  });
});

describe('snapToAnchor: rtl', () => {
  const rtl = (anchor: MarkingAnchor) => setProjectDirection(base(anchor), 'rtl');

  it('on top/bottom, start is the right and a positive cross goes to the left', () => {
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'start' })).project)).toEqual({
      x: 500,
      y: 260,
    });
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'end' })).project)).toEqual({
      x: 400,
      y: 260,
    });
    expect(
      at(
        snap(
          rtl({ to: 'T', side: 'bottom', align: 'start', offset: { main: 0, cross: 6 } }),
        ).project,
      ),
    ).toEqual({ x: 494, y: 400 });
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'center' })).project).x).toBe(450);
  });

  it('on the sides, start is the physical right side and end the left; align goes from top to bottom', () => {
    expect(at(snap(rtl({ to: 'T', side: 'start', align: 'start' })).project)).toEqual({
      x: 600,
      y: 300,
    });
    expect(at(snap(rtl({ to: 'T', side: 'end', align: 'end' })).project)).toEqual({
      x: 300,
      y: 360,
    });
  });

  it('a container that pins ltr in an rtl project snaps in ltr', async () => {
    const { setContainerDirection } = await import('../../src/model');
    const p = setContainerDirection(
      rtl({ to: 'T', side: 'top', align: 'start' }),
      'I1',
      'ltr',
    );
    expect(at(snap(p).project)).toEqual({ x: 400, y: 260 });
  });
});

describe('snapToAnchor: bounds, lock and no change', () => {
  it('going past the container, clamps inside it and warns', () => {
    const { project, warnings } = snap(
      base({ to: 'T', side: 'top', offset: { main: 1000, cross: 0 } }),
    );
    expect(at(project)).toEqual({ x: 450, y: 0 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('arrange.outside');
    const right = snap(
      base({ to: 'T', side: 'end', align: 'start', offset: { main: 1000, cross: 0 } }),
    );
    expect(at(right.project).x).toBe(900);
  });

  it('a marking already at the limit that the snap would clamp keeps the warning (finding 4 of CL2)', () => {
    let p = base({
      to: 'T',
      side: 'end',
      align: 'start',
      offset: { main: 1000, cross: 0 },
    });
    p = moveMarkingTo(p, 'M', { x: 900, y: 300 });
    const { project, warnings } = snap(p);
    expect(project).toBe(p);
    expect(warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });

  it('the follower near the edge does not leave the container nor release the anchor (finding 3 of CL2)', () => {
    let p = base({ to: 'T', side: 'end', align: 'start' });
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: { x: 880, y: 600, width: 100, height: 40 },
    });
    p = setMarkingAnchor(p, 'F', { to: 'M' });
    const { project, warnings } = snap(p);
    const f = marking(project, 'F');
    expect(f.containerId).toBe('I1');
    expect(f.anchor?.to).toBe('M');
    expect(f.rect.x + f.rect.width).toBeLessThanOrEqual(1000);
    expect(f.rect.x).toBeGreaterThanOrEqual(0);
    expect(warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });

  it('on the canvas there is no limit nor warning', () => {
    const r = snap(
      base({ to: 'T', side: 'top', offset: { main: 100000, cross: 0 } }),
      'CM',
    );
    expect(at(r.project, 'CM')).toEqual({ x: -1950, y: -2000 - 40 - 100000 });
    expect(r.warnings).toEqual([]);
  });

  it('settles: when snapping inside another marking it becomes the parent', () => {
    let p = base({ to: 'T', side: 'top' });
    p = createMarking(p, {
      id: 'BIG',
      containerId: 'I1',
      rect: { x: 350, y: 250, width: 400, height: 300 },
    });
    expect(marking(p, 'M').parentId).toBeNull();
    expect(marking(snap(p).project, 'M').parentId).toBe('BIG');
  });

  it('a locked marking is refused with locked', () => {
    const p = base();
    const locked = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M' ? { ...m, locked: true } : m)),
    };
    expect(() => snap(locked)).toThrowError(/^locked/);
  });

  it('without an anchor it fails with not-anchored; a nonexistent marking with not-found', () => {
    const p = base();
    expect(() => snap(p, 'T')).toThrowError(/^not-anchored/);
    expect(() => snap(setMarkingAnchor(p, 'M', null))).toThrowError(/^not-anchored/);
    expect(() => snap(p, 'nothing')).toThrowError(/^not-found/);
  });

  it('already snapped: returns the same Project (even when locked)', () => {
    const once = snap(base()).project;
    const again = snap(once);
    expect(again.project).toBe(once);
    expect(again.warnings).toEqual([]);
    const locked = {
      ...once,
      markings: once.markings.map((m) => (m.id === 'M' ? { ...m, locked: true } : m)),
    };
    expect(snap(locked).project).toBe(locked);
  });
});

describe('snapToAnchor carries the anchored markings of the marking (like moveMarking)', () => {
  /** M snaps to T; F anchored to M (and G to F); D is a child of M; Z has no relation. */
  function chain(): Project {
    let p = base({ to: 'T', side: 'top', align: 'start' });
    p = createMarking(p, {
      id: 'D',
      containerId: 'I1',
      rect: { x: 12, y: 12, width: 20, height: 10 },
    });
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: { x: 100, y: 500, width: 50, height: 30 },
    });
    p = createMarking(p, {
      id: 'G',
      containerId: 'I1',
      rect: { x: 200, y: 500, width: 50, height: 30 },
    });
    p = createMarking(p, {
      id: 'Z',
      containerId: 'I1',
      rect: { x: 900, y: 700, width: 50, height: 30 },
    });
    p = setMarkingAnchor(p, 'F', { to: 'M' });
    return setMarkingAnchor(p, 'G', { to: 'F' });
  }

  it('snapping M carries the children and the markings anchored to it (and the anchored of the anchored), without touching the others', () => {
    const p = chain();
    // M goes from (10,10) to (400,260): dx 390, dy 250.
    const out = snap(p).project;
    expect(at(out, 'M')).toEqual({ x: 400, y: 260 });
    expect(at(out, 'D')).toEqual({ x: 402, y: 262 });
    expect(at(out, 'F')).toEqual({ x: 490, y: 750 });
    expect(at(out, 'G')).toEqual({ x: 590, y: 750 });
    expect(at(out, 'Z')).toEqual(at(p, 'Z'));
  });

  it('the anchored marking that the snap carries keeps the same relative position (canvas marking included)', () => {
    let p = base({ to: 'T', side: 'top', align: 'start' });
    p = createMarking(p, {
      id: 'CF',
      containerId: null,
      rect: { x: -3500, y: -3500, width: 50, height: 30 },
    });
    p = setMarkingAnchor(p, 'CF', { to: 'CM' });
    const out = snap(p, 'CM').project;
    const dx = at(out, 'CM').x - at(p, 'CM').x;
    const dy = at(out, 'CM').y - at(p, 'CM').y;
    expect(dx !== 0 || dy !== 0).toBe(true);
    expect(at(out, 'CF')).toEqual({ x: -3500 + dx, y: -3500 + dy });
  });

  it('without change returns the same project (with anchored markings too)', () => {
    const once = snap(chain()).project;
    expect(snap(once).project).toBe(once);
  });
});
