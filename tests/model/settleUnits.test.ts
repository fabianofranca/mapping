// A marking that draws a component keeps its size in component units when the settle moves it to
// another space (stage #2210, decisions 1 to 8): the set that goes from the same space S to the same
// space T scales as a whole by k = (d_T · s_T) ÷ (d_S · s_S) around the top-left corner of its
// bounding box; a set with no component keeps the size on screen; the minimum follows the target
// density. `minSizeOf` (null only for a plain marking) tells the settle who draws a component.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  moveContainer,
  moveMarking,
  setMarkingFloating,
  type Project,
  type Rect,
  type Size,
} from '../../src/model';
import { settleHierarchy, type SettleOptions } from '../../src/model/hierarchySettle';
import {
  boundingOrigin,
  isScaled,
  minInTarget,
  scaleAround,
  spaceDensity,
  unitsFactor,
} from '../../src/model/settleUnits';
import { emptyProject } from './fixtures';

// C1 and C2 are 400 x 300 px each. Their canvas rectangles: C1 x 1000..1400, C2 x 3000..3400 (scale 1).
const C1 = { x: 1000, y: 0 };
const C2 = { x: 3000, y: 0 };
const FAR = { x: 9000, y: 9000, width: 50, height: 50 };

interface Setup {
  readonly c1?: { density?: number; scale?: number };
  readonly c2?: { density?: number; scale?: number };
}

function base(setup: Setup = {}): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'C1', file: 'images/c1.png', width: 400, height: 300 });
  p = addContainer(p, { id: 'C2', file: 'images/c2.png', width: 400, height: 300 });
  const place = (id: string, at: { x: number; y: number }, o?: Setup['c1']) => {
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === id
          ? {
              ...c,
              placement: { ...at, scale: o?.scale ?? 1 },
              ...(o?.density === undefined ? {} : { density: o.density }),
            }
          : c,
      ),
    };
  };
  place('C1', C1, setup.c1);
  place('C2', C2, setup.c2);
  return p;
}

/**
 * A canvas marking at `rect` (canvas units). It is created far away and moved by editing the
 * `rect`, without settling (a later `createMarking` would settle the others without `minSizeOf`):
 * build every marking first and the geometry last (`settleHierarchy` with the options of the test).
 */
function onCanvas(p: Project, id: string, rect: Rect): Project {
  return canvasMarkings(p, { [id]: rect });
}

function canvasMarkings(p: Project, rects: Record<string, Rect>): Project {
  let next = p;
  for (const id of Object.keys(rects)) {
    const far = { ...FAR, x: FAR.x + 100 * next.markings.length };
    next = createMarking(next, { id, containerId: null, rect: far });
  }
  for (const [id, rect] of Object.entries(rects)) next = setRect(next, id, rect);
  return next;
}

/** A marking of a container (`rect` in its pixels). */
function inContainer(p: Project, id: string, containerId: string, rect: Rect): Project {
  return createMarking(p, { id, containerId, rect });
}

function setRect(p: Project, id: string, rect: Rect): Project {
  return { ...p, markings: p.markings.map((m) => (m.id === id ? { ...m, rect } : m)) };
}

const rectOf = (p: Project, id: string): Rect =>
  p.markings.find((m) => m.id === id)!.rect;
const spaceOf = (p: Project, id: string): string | null =>
  p.markings.find((m) => m.id === id)!.containerId;

const MIN: Size = { width: 1, height: 1 };
/** `minSizeOf` where the listed markings draw a component (minimum 1 px) and the rest are plain. */
const components =
  (...ids: string[]): SettleOptions['minSizeOf'] =>
  (id) =>
    ids.includes(id) ? MIN : null;
const opts = (...ids: string[]): SettleOptions => ({ minSizeOf: components(...ids) });

describe('settleUnits helpers', () => {
  it('the factor is the target units per canvas unit over the source ones', () => {
    expect(unitsFactor({ density: 1, scale: 1 }, { density: 2, scale: 1 })).toBe(2);
    expect(unitsFactor({ density: 1, scale: 1 }, { density: 1, scale: 3 })).toBe(3);
    expect(unitsFactor({ density: 1, scale: 1 }, { density: 2, scale: 3 })).toBe(6);
    expect(unitsFactor({ density: 2, scale: 1 }, { density: 1, scale: 1 })).toBe(0.5);
    expect(unitsFactor({ density: 2, scale: 2 }, { density: 3, scale: 1 })).toBe(0.75);
  });

  it('a factor within EPSILON of 1 is no change', () => {
    expect(isScaled(1)).toBe(false);
    expect(isScaled(1 + 1e-9)).toBe(false);
    expect(isScaled(2)).toBe(true);
  });

  it('the origin is the top-left corner of the bounding box', () => {
    expect(
      boundingOrigin([
        { x: 10, y: 50, width: 5, height: 5 },
        { x: 30, y: 20, width: 5, height: 5 },
      ]),
    ).toEqual({ x: 10, y: 20 });
  });

  it('scales position and size around the origin', () => {
    expect(
      scaleAround({ x: 10, y: 20 }, { x: 30, y: 40, width: 8, height: 4 }, 2),
    ).toEqual({
      x: 50,
      y: 60,
      width: 16,
      height: 8,
    });
  });

  it('the minimum in the target is scaled by the density ratio, rounded up', () => {
    expect(minInTarget({ width: 10, height: 5 }, 2)).toEqual({ width: 20, height: 10 });
    expect(minInTarget({ width: 5, height: 3 }, 0.5)).toEqual({ width: 3, height: 2 });
    expect(minInTarget({ width: 7, height: 7 }, 1)).toEqual({ width: 7, height: 7 });
  });

  it('a missing, non-finite or non-positive density counts as 1', () => {
    expect(spaceDensity(undefined)).toBe(1);
    expect(spaceDensity(null)).toBe(1);
    expect(spaceDensity(0)).toBe(1);
    expect(spaceDensity(-2)).toBe(1);
    expect(spaceDensity(Number.NaN)).toBe(1);
    expect(spaceDensity(Number.POSITIVE_INFINITY)).toBe(1);
    expect(spaceDensity(2)).toBe(2);
  });
});

describe('a component marking changes space', () => {
  it('canvas → density 2 container at scale 1: the rect doubles (the text keeps its units)', () => {
    let p = base({ c1: { density: 2 } });
    p = onCanvas(p, 'T', { x: 1010, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    expect(spaceOf(next, 'T')).toBe('C1');
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
  });

  it('canvas → container at scale 2, density 1: the box in pixels stays, the canvas size doubles', () => {
    let p = base({ c1: { scale: 2 } });
    p = onCanvas(p, 'T', { x: 1020, y: 20, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 100, height: 40 });
  });

  it('canvas → container with density 2 and scale 2: k = 4', () => {
    let p = base({ c1: { density: 2, scale: 2 } });
    p = onCanvas(p, 'T', { x: 1020, y: 20, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    // canvas 400 x 160 → 200 x 80 px
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
  });

  it('container → canvas: it halves from a density 2 container', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    p = setRect(p, 'T', { x: 390, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1390, y: 10, width: 50, height: 20 });
    expect(settleHierarchy(next, opts('T'))).toBe(next);
  });

  it('a set that would land inside a container after scaling down keeps today’s conversion', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    p = setRect(p, 'T', { x: 350, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    // Halved it would be 50 x 20 at x 1350, fully inside C1: the next settle would take it in.
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1350, y: 10, width: 100, height: 40 });
    expect(settleHierarchy(next, opts('T'))).toBe(next);
  });

  it('container → container: k is the ratio of the two density × scale', () => {
    let p = base({ c1: { density: 2 }, c2: { density: 3 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    // Its canvas rectangle is now fully inside C2.
    p = setRect(p, 'T', { x: 2010, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    expect(spaceOf(next, 'T')).toBe('C2');
    // canvas (3010, 10, 100, 40) × 1.5 = 150 x 60 at the origin
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 150, height: 60 });
  });

  it('a set of plain markings only keeps the size on screen', () => {
    let p = base({ c1: { density: 2, scale: 2 } });
    p = onCanvas(p, 'B', { x: 1020, y: 20, width: 100, height: 40 });
    const next = settleHierarchy(p, opts());
    expect(rectOf(next, 'B')).toEqual({ x: 10, y: 10, width: 50, height: 20 });
  });

  it('without minSizeOf the result is today’s: no marking counts as a component', () => {
    let p = base({ c1: { density: 2 } });
    p = onCanvas(p, 'T', { x: 1010, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p);
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 100, height: 40 });
  });

  it('a mixed set scales as a whole and the text stays the child of the plain area', () => {
    let p = base({ c1: { density: 2 } });
    p = canvasMarkings(p, {
      A: { x: 1010, y: 10, width: 150, height: 80 },
      T: { x: 1020, y: 20, width: 60, height: 30 },
    });
    // The text was the child of the area on the canvas.
    p = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'T' ? { ...m, parentId: 'A' } : m)),
    };
    const next = settleHierarchy(p, opts('T'));
    expect(spaceOf(next, 'A')).toBe('C1');
    expect(rectOf(next, 'A')).toEqual({ x: 10, y: 10, width: 300, height: 160 });
    expect(rectOf(next, 'T')).toEqual({ x: 30, y: 30, width: 120, height: 60 });
    expect(next.markings.find((m) => m.id === 'T')!.parentId).toBe('A');
  });

  it('a multiple selection of texts keeps its layout', () => {
    let p = base({ c1: { density: 2 } });
    p = canvasMarkings(p, {
      T1: { x: 1010, y: 10, width: 40, height: 20 },
      T2: { x: 1070, y: 10, width: 40, height: 20 },
    });
    const next = settleHierarchy(p, opts('T1', 'T2'));
    expect(rectOf(next, 'T1')).toEqual({ x: 10, y: 10, width: 80, height: 40 });
    // the gap of 20 canvas units becomes 40
    expect(rectOf(next, 'T2')).toEqual({ x: 130, y: 10, width: 80, height: 40 });
  });

  it('a container moved over a canvas text: the text then falls inside and is scaled', () => {
    let p = base({ c1: { density: 2 } });
    p = onCanvas(p, 'T', { x: 5010, y: 5010, width: 100, height: 40 });
    p = moveContainer(p, 'C1', 5000, 5000, opts('T'));
    expect(spaceOf(p, 'T')).toBe('C1');
    expect(rectOf(p, 'T')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
  });

  it('shifts the scaled rectangle back inside the container at the limit', () => {
    let p = base({ c1: { density: 2 } });
    p = onCanvas(p, 'T', { x: 1380, y: 10, width: 20, height: 10 });
    const next = settleHierarchy(p, opts('T'));
    // 380 + 40 = 420 > 400: it slides to 360
    expect(rectOf(next, 'T')).toEqual({ x: 360, y: 10, width: 40, height: 20 });
  });

  it('crops the scaled rectangle to the container when it is bigger', () => {
    let p = base({ c1: { density: 4 } });
    p = onCanvas(p, 'T', { x: 1000, y: 0, width: 100, height: 75 });
    const next = settleHierarchy(p, opts('T'));
    // 100 · 4 = 400 and 75 · 4 = 300: exactly the container
    expect(rectOf(next, 'T')).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    let q = base({ c1: { density: 4 } });
    q = onCanvas(q, 'T', { x: 1000, y: 0, width: 150, height: 100 });
    expect(rectOf(settleHierarchy(q, opts('T')), 'T')).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it('the minimum of a scaled member follows the target density', () => {
    const p = onCanvas(base({ c1: { density: 2 } }), 'T', {
      x: 1010,
      y: 10,
      width: 10,
      height: 5,
    });
    const next = settleHierarchy(p, {
      minSizeOf: (id) => (id === 'T' ? { width: 20, height: 10 } : null),
    });
    // 10 x 5 → 20 x 10 by the factor, below the minimum 40 x 20 (20 x 10 · 2)
    expect(rectOf(next, 'T')).toEqual({ x: 10, y: 10, width: 40, height: 20 });
  });

  it('the minimum goes down when leaving a denser container', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 80, height: 40 });
    p = setRect(p, 'T', { x: 390, y: 10, width: 80, height: 40 });
    const next = settleHierarchy(p, {
      minSizeOf: (id) => (id === 'T' ? { width: 40, height: 20 } : null),
    });
    // 80 x 40 · 0.5 = 40 x 20; the minimum 40 x 20 · 0.5 = 20 x 10 does not bind
    expect(rectOf(next, 'T')).toEqual({ x: 1390, y: 10, width: 40, height: 20 });
  });

  it('a plain member of a scaled set keeps the 8 px minimum', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 80, height: 40 });
    p = inContainer(p, 'B', 'C1', { x: 100, y: 10, width: 20, height: 20 });
    p = setRect(p, 'T', { x: 390, y: 10, width: 80, height: 40 });
    p = setRect(p, 'B', { x: 450, y: 10, width: 14, height: 14 });
    const next = settleHierarchy(p, opts('T'));
    // 14 · 0.5 = 7, below the 8 px minimum of a plain marking
    expect(rectOf(next, 'B').width).toBe(8);
    expect(rectOf(next, 'B').height).toBe(8);
  });

  it('is idempotent: a second settle returns the same object', () => {
    let p = base({ c1: { density: 2 } });
    p = canvasMarkings(p, {
      A: { x: 1010, y: 10, width: 150, height: 80 },
      T: { x: 1020, y: 20, width: 60, height: 30 },
    });
    const once = settleHierarchy(p, opts('T'));
    expect(settleHierarchy(once, opts('T'))).toBe(once);
  });

  it('the set is keyed by the pair: two targets scale on their own', () => {
    let p = base({ c1: { density: 2 }, c2: { density: 4 } });
    p = canvasMarkings(p, {
      T1: { x: 1010, y: 10, width: 100, height: 40 },
      T2: { x: 3010, y: 10, width: 50, height: 20 },
    });
    const next = settleHierarchy(p, opts('T1', 'T2'));
    expect(rectOf(next, 'T1')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
    expect(rectOf(next, 'T2')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
  });

  it('moving a plain area with a text out through the model scales both', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'A', 'C1', { x: 10, y: 10, width: 300, height: 160 });
    p = inContainer(p, 'T', 'C1', { x: 30, y: 30, width: 120, height: 60 });
    p = settleHierarchy(p, opts('T'));
    // Drag the area (with the text) out of C1 onto the canvas.
    const next = moveMarking(p, 'A', 0, 700, opts('T'));
    expect(spaceOf(next, 'A')).toBeNull();
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'A').width).toBe(150);
    expect(rectOf(next, 'T').width).toBe(60);
    expect(next.markings.find((m) => m.id === 'T')!.parentId).toBe('A');
  });
});

describe('the minimum follows the density when density × scale is 1', () => {
  // A density 2 container at scale 0.5: one pixel is half a canvas unit, k = 1 to the canvas,
  // but a component of 20 x 20 units is 40 x 40 px there and 20 x 20 on the canvas.
  const twentyUnits = (id: string): Size | null =>
    id === 'T' ? { width: 40, height: 40 } : null;

  it('container → canvas with k = 1: the component keeps 20 x 20 units', () => {
    let p = base({ c1: { density: 2, scale: 0.5 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 40, height: 40 });
    p = setRect(p, 'T', { x: 390, y: 10, width: 40, height: 40 });
    const next = settleHierarchy(p, { minSizeOf: twentyUnits });
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1195, y: 5, width: 20, height: 20 });
    expect(settleHierarchy(next, { minSizeOf: twentyUnits })).toBe(next);
  });

  it('the taken-back-in fallback converts the minimum too', () => {
    // Density 4 at scale 0.5: k = 0.5 and the minimum ratio is 0.25.
    let p = base({ c1: { density: 4, scale: 0.5 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 80, height: 40 });
    p = setRect(p, 'T', { x: 340, y: 10, width: 80, height: 40 });
    const minSizeOf = (id: string): Size | null =>
      id === 'T' ? { width: 80, height: 40 } : null;
    const next = settleHierarchy(p, { minSizeOf });
    // Halved it would be 20 x 10 at x 1170, fully inside C1: today's 40 x 20 on screen, with the
    // minimum 80 x 40 px · 0.25 = 20 x 10 (not 80 x 40 in canvas units).
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1170, y: 5, width: 40, height: 20 });
    expect(settleHierarchy(next, { minSizeOf })).toBe(next);
  });

  it('turning Floating on with k = 1 keeps 20 x 20 units', () => {
    let p = base({ c1: { density: 2, scale: 0.5 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 40, height: 40 });
    const next = setMarkingFloating(p, 'T', true, { minSizeOf: twentyUnits });
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1005, y: 5, width: 20, height: 20 });
  });
});

describe('a density of 0 counts as 1', () => {
  it('the settle keeps a finite rect leaving a density 0 container', () => {
    let p = base({ c1: { density: 0 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    p = setRect(p, 'T', { x: 390, y: 10, width: 100, height: 40 });
    const next = settleHierarchy(p, opts('T'));
    expect(spaceOf(next, 'T')).toBeNull();
    expect(rectOf(next, 'T')).toEqual({ x: 1390, y: 10, width: 100, height: 40 });
  });

  it('turning Floating on keeps a finite rect', () => {
    let p = base({ c1: { density: 0 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    const next = setMarkingFloating(p, 'T', true, { minSizeOf: components('T') });
    expect(rectOf(next, 'T')).toEqual({ x: 1010, y: 10, width: 100, height: 40 });
  });
});

describe('Floating keeps the component units', () => {
  it('turning on halves a component of a density 2 container on the canvas', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 200, height: 80 });
    const next = setMarkingFloating(p, 'T', true, { minSizeOf: components('T') });
    expect(rectOf(next, 'T')).toEqual({ x: 1010, y: 10, width: 100, height: 40 });
    expect(spaceOf(next, 'T')).toBeNull();
  });

  it('turning on with minSize applies the minimum in the canvas density', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 50, height: 30 });
    // The component minimum is 40 x 20 px in the density 2 container: 20 x 10 on the canvas.
    const next = setMarkingFloating(p, 'T', true, { minSize: { width: 40, height: 20 } });
    // 50 x 30 · 0.5 = 25 x 15 stays; with 30 x 16 it would be cut by the minimum
    expect(rectOf(next, 'T')).toEqual({ x: 1010, y: 10, width: 25, height: 15 });
    const small = inContainer(p, 'S', 'C1', { x: 100, y: 100, width: 40, height: 20 });
    const floated = setMarkingFloating(small, 'S', true, {
      minSize: { width: 60, height: 30 },
    });
    // 40 x 20 · 0.5 = 20 x 10, below the canvas minimum 60 x 30 · 0.5 = 30 x 15
    expect(rectOf(floated, 'S')).toEqual({ x: 1100, y: 100, width: 30, height: 15 });
  });

  it('a plain marking keeps its size on screen when turning Floating on', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'B', 'C1', { x: 10, y: 10, width: 100, height: 40 });
    const next = setMarkingFloating(p, 'B', true, { minSizeOf: components() });
    expect(rectOf(next, 'B')).toEqual({ x: 1010, y: 10, width: 100, height: 40 });
  });

  it('turning off takes it back into the container at the converted size', () => {
    let p = base({ c1: { density: 2 } });
    p = inContainer(p, 'T', 'C1', { x: 10, y: 10, width: 200, height: 80 });
    const floated = setMarkingFloating(p, 'T', true, { minSizeOf: components('T') });
    const back = setMarkingFloating(floated, 'T', false, { minSizeOf: components('T') });
    expect(spaceOf(back, 'T')).toBe('C1');
    expect(rectOf(back, 'T')).toEqual({ x: 10, y: 10, width: 200, height: 80 });
  });
});
