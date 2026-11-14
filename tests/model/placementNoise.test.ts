import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addContainer,
  createArrow,
  createMarking,
  limitItemsMove,
  moveContainer,
  moveItems,
  moveRootsInPerspective,
  perspectiveView,
  placeCreatedRoot,
  placeRootIn,
  rectsOverlap,
  imageCanvasRect,
  removeMarking,
  repairProject,
  replaceContainer,
  resizeContainer,
  setContainerPlacement,
  snapPlacement,
  validateProject,
  type Perspective,
  type Project,
} from '../../src/model';
import { emptyProject, image, sampleProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';
import { idGen } from './specFixtures';

// Floating-point noise in `placement` (`275.00000000000006`): no model operation writes it.
const NOISY = 275.00000000000006;
const TINY = 5.6843418860808e-14;

describe('snapPlacement', () => {
  it('an integer passes as it is', () => {
    expect(snapPlacement({ x: 10, y: -20, scale: 2 })).toEqual({
      x: 10,
      y: -20,
      scale: 2,
    });
  });

  it('noise on both sides of an integer becomes the integer', () => {
    expect(
      snapPlacement({ x: NOISY, y: 274.99999999999994, scale: 1.0000000000000002 }),
    ).toEqual({
      x: 275,
      y: 275,
      scale: 1,
    });
  });

  it('a real fraction stays as it is', () => {
    expect(snapPlacement({ x: 1868.13, y: 0.5, scale: 0.25 })).toEqual({
      x: 1868.13,
      y: 0.5,
      scale: 0.25,
    });
  });

  it('a negative near zero gives 0, not -0', () => {
    const p = snapPlacement({ x: -TINY, y: TINY, scale: 1 });
    expect(Object.is(p.x, 0)).toBe(true);
    expect(Object.is(p.y, 0)).toBe(true);
  });

  it('a small scale never becomes 0 nor an integer below 1', () => {
    expect(snapPlacement({ x: 0, y: 0, scale: 1e-9 }).scale).toBe(1e-9);
    expect(snapPlacement({ x: 0, y: 0, scale: 0.4 }).scale).toBe(0.4);
  });
});

describe('placement without noise in the model operations', () => {
  it('setContainerPlacement, moveContainer and resizeContainer write the integer', () => {
    const p = sampleProject();
    const id = 'I2';
    const a = setContainerPlacement(p, id, { x: NOISY, y: 3000 + TINY, scale: 1 });
    expect(image(a, id).placement).toEqual({ x: 275, y: 3000, scale: 1 });
    const b = moveContainer(p, id, 3000.0000000000005, 4000.0000000000005);
    expect(image(b, id).placement).toMatchObject({ x: 3000, y: 4000 });
    const c = resizeContainer(p, id, { x: 1050, y: 0, scale: 1.0000000000000002 });
    expect(image(c, id).placement.scale).toBe(1);
  });

  it('creating with a `center` that gives noise writes the integer', () => {
    // 100 x 100 enters at scale 10 (longer side = 1000): x = 275.00000000000006 - 500
    const size = { id: 'N1', file: 'images/n.jpg', width: 100, height: 100 };
    const p = addContainer(emptyProject(), {
      ...size,
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(p, 'N1').placement).toEqual({ x: -225, y: -400, scale: 10 });
    const bg = addBackgroundContainer(emptyProject(), {
      id: 'N2',
      width: 100,
      height: 100,
      background: '#FFFFFF',
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(bg, 'N2').placement).toEqual({ x: -225, y: -400, scale: 10 });
  });

  it('creating to the right of a container with noise writes the integer', () => {
    const base = sampleProject();
    const first = base.containers[0]!;
    // simulates an old project, saved with noise
    const noisy = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === first.id ? { ...c, placement: { ...c.placement, x: NOISY } } : c,
      ),
    };
    const p = addContainer(noisy, {
      id: 'N3',
      file: 'images/n3.jpg',
      width: 10,
      height: 10,
    });
    const { x, y, scale } = image(p, 'N3').placement;
    for (const v of [x, y, scale]) expect(v).toBe(Math.round(v * 1e6) / 1e6);
  });
});

// Decision 2 of stage #1190: every write path for a container position (and a perspective
// position) writes `x`/`y` with at most 6 decimal places and the scale with at most 12 digits.
const clean6 = (v: number) => expect(v).toBe(Number(v.toFixed(6)));
const clean12 = (v: number) => expect(v).toBe(Number(v.toPrecision(12)));
const placementIsClean = (p: { x: number; y: number; scale: number }) => {
  clean6(p.x);
  clean6(p.y);
  clean12(p.scale);
};

/** Swaps the `placement` directly, bypassing the model (simulates noisy input or an old file). */
function rawPlacement(
  p: Project,
  id: string,
  placement: { x: number; y: number; scale: number },
): Project {
  return {
    ...p,
    containers: p.containers.map((c) => (c.id === id ? { ...c, placement } : c)),
  };
}

const persp = (id: string, items: [string, number, number][]): Perspective => ({
  id,
  name: `Vista ${id}`,
  hiddenLayers: [],
  items: items.map(([root, x, y]) => ({ root, x, y })),
});

describe('write paths: the floating-point tail disappears (6 decimal places, scale with 12 digits)', () => {
  it('setContainerPlacement, moveContainer and resizeContainer', () => {
    const p = sampleProject();
    const a = setContainerPlacement(p, 'I2', {
      x: -188.75000000000006,
      y: 100000.6551724138,
      scale: 17.24137931034483,
    });
    expect(image(a, 'I2').placement).toEqual({
      x: -188.75,
      y: 100000.655172,
      scale: 17.2413793103,
    });
    const b = moveContainer(p, 'I2', 1099.9999785087473, 124.99959067430655);
    expect(image(b, 'I2').placement).toMatchObject({ x: 1099.999979, y: 124.999591 });
    const c = resizeContainer(p, 'I2', { x: 5000, y: 0, scale: 0.5000000000000001 });
    expect(image(c, 'I2').placement.scale).toBe(0.5);
  });

  it('moveItems', () => {
    const p = setContainerPlacement(sampleProject(), 'I2', { x: 5000, y: 0, scale: 1 });
    const moved = moveItems(
      p,
      [{ kind: 'image', id: 'I2' }],
      100.1234567891,
      -739.6551724137931,
    );
    expect(image(moved, 'I2').placement).toEqual({
      x: 5100.123457,
      y: -739.655172,
      scale: 1,
    });
  });

  it('addBackgroundContainer with center (the selection Size, 58 × 40) and without center', () => {
    const withCenter = addBackgroundContainer(emptyProject(), {
      id: 'B1',
      width: 58,
      height: 40,
      background: '#FFFFFF',
      center: { x: 100.1234567891, y: -719.6551724137931 },
    });
    placementIsClean(image(withCenter, 'B1').placement);
    expect(image(withCenter, 'B1').placement.scale).toBe(17.2413793103);
    expect(image(withCenter, 'B1').placement.x).toBe(-399.876543);
    // without `center`: to the right of what exists, with the fractional scale cleaned
    const next = addBackgroundContainer(withCenter, {
      id: 'B2',
      width: 58,
      height: 40,
      background: '#FFFFFF',
    });
    placementIsClean(image(next, 'B2').placement);
  });

  it('addContainer of the first container (with no other in view) writes the scale with 12 digits', () => {
    const first = addBackgroundContainer(emptyProject(), {
      id: 'F1',
      width: 390,
      height: 844,
      background: '#FFFFFF',
    });
    expect(image(first, 'F1').placement).toEqual({ x: 0, y: 0, scale: 1.18483412322 });
  });

  it('replaceContainer (the scale of the image swap)', () => {
    const p = sampleProject();
    const replaced = replaceContainer(p, 'I2', {
      file: 'images/new.jpg',
      width: 580,
      height: 580,
    });
    expect(image(replaced, 'I2').placement.scale).toBe(1.72413793103);
  });

  it('the images-overlap repair', () => {
    const p = rawPlacement(sampleProject(), 'I1', {
      x: 0.1234567891,
      y: 0,
      scale: 0.30000000000000004,
    });
    const broken: Project = rawPlacement(p, 'I2', { x: 0.2, y: 0, scale: 1 });
    const result = repairProject(broken, validateProject(broken), idGen('NEW'));
    expect(result.repaired.map((r) => r.code)).toContain('images-overlap');
    // 0.1234567891 + 1200.0000000000002 + 50
    expect(image(result.project, 'I2').placement.x).toBe(1250.123457);
  });

  it('movedItem (moving the root in the perspective)', () => {
    const p: Project = {
      ...sampleProject(),
      perspectives: [persp('P', [['I2', 0.1234567891, 10]])],
    };
    const next = moveRootsInPerspective(p, 'P', [
      { root: 'I2', dx: 100.30000000000001, dy: -0.30000000000000004 },
    ]);
    expect(next.perspectives[0]?.items).toEqual([{ root: 'I2', x: 100.423457, y: 9.7 }]);
  });

  it('the reconciled item (the child that becomes a root enters where it was)', () => {
    const base = multiProject();
    const fractional = rawPlacement(base, 'A', {
      x: 0.1234567891,
      y: 0.9876543219,
      scale: 1,
    });
    const p: Project = {
      ...fractional,
      perspectives: [persp('P', [['G', 900, 400]])],
    };
    const next = removeMarking(p, 'G');
    const item = next.perspectives[0]?.items.find((i) => i.root === 'A');
    expect(item).toEqual({ root: 'A', x: 1000.123457, y: 500.987654 });
  });

  it('placeCreatedRoot', () => {
    const base = sampleProject();
    const p = rawPlacement(base, 'I2', { x: 6000.1234567891, y: 0.9876543219, scale: 1 });
    expect(placeCreatedRoot(p, persp('P', []), 'I2')).toEqual({
      x: 6000.123457,
      y: 0.987654,
    });
  });

  it('the relative position and the arrival area (placeRootIn)', () => {
    let p = multiProject();
    p = createMarking(p, {
      id: 'd1',
      containerId: 'D',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    p = createArrow(p, { id: 'r1', from: 'd1', to: 'e1' });
    const source = perspectiveView(
      p,
      persp('S', [
        ['D', 7000, 0],
        ['E', 9000, 0],
      ]),
    );
    // with a reference: the same distance from D
    const target = perspectiveView(p, persp('T', [['D', 7000.1234567891, 0.9876543219]]));
    const near = placeRootIn(target, source, 'E');
    expect(near).toMatchObject({ kind: 'near', x: 9000.123457, y: 0.987654 });
    // no reference: the column to the right of everything
    const lone = perspectiveView(p, persp('L', [['D', 7000.1234567891, 0]]));
    const alone = placeRootIn(lone, perspectiveView(p, persp('S2', [['E', 0, 0]])), 'E');
    expect(alone).toMatchObject({ kind: 'arrival-area', x: 8050.123457 });
  });
});

describe('placeRootIn: the nearest free spot (occupied) also comes out with no tail', () => {
  it('a root container that lands on top of another goes to the nearest free spot, with 6 decimal places', () => {
    let p = multiProject();
    p = createMarking(p, {
      id: 'd1',
      containerId: 'D',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    p = createArrow(p, { id: 'r1', from: 'd1', to: 'e1' });
    p = addBackgroundContainer(p, {
      id: 'Q',
      width: 100,
      height: 100,
      background: '#FFFFFF',
    });
    const source = perspectiveView(
      p,
      persp('S', [
        ['D', 7000, 0],
        ['E', 9000, 0],
      ]),
    );
    // Q sits where E would land (9000.1234567891, 0.9876543219): the nearest free spot is fractional
    const target = perspectiveView(
      p,
      persp('T', [
        ['D', 7000.1234567891, 0.9876543219],
        ['Q', 9000.1234567891, 0.3333333333],
      ]),
    );
    const placed = placeRootIn(target, source, 'E');
    expect(placed.kind).toBe('occupied');
    clean6(placed.x);
    clean6(placed.y);
  });
});

describe('touching fractional edges creates no overlap and does not change containment', () => {
  it('two containers touched by slideToTouch: after saving they do not overlap', () => {
    const p = rawPlacement(multiProject(), 'D', {
      x: 7000.1234567891,
      y: 0.9876543219,
      scale: 1,
    });
    const items = [{ kind: 'image', id: 'E' }] as const;
    const wanted = limitItemsMove(p, items, -1500, 0.5);
    expect(wanted.dx).toBeGreaterThan(-1500); // touched D
    const moved = moveItems(p, items, wanted.dx, wanted.dy);
    const e = image(moved, 'E');
    const d = image(moved, 'D');
    expect(
      rectsOverlap(imageCanvasRect(e, e.placement), imageCanvasRect(d, d.placement)),
    ).toBe(false);
    placementIsClean(e.placement);
  });

  it('the settle keeps the parent of a container touching the edge of a canvas marking', () => {
    // K (3000 × 1000, scale 1/3) occupies 1000 × 333.33…: touching the right edge of W.
    let p = emptyProject();
    p = addBackgroundContainer(p, {
      id: 'K',
      width: 3000,
      height: 1000,
      background: '#FFFFFF',
    });
    p = createMarking(p, {
      id: 'W',
      containerId: null,
      rect: { x: 0, y: 0, width: 1000, height: 400 },
    });
    const resized = resizeContainer(p, 'K', { x: 0, y: 0, scale: 1 / 3 });
    expect(image(resized, 'K').placement.scale).toBe(0.333333333333);
    expect(image(resized, 'K').parentId).toBe('W');
  });
});

describe('setContainerPlacement: no-op with an old tail', () => {
  it('container saved with a floating-point tail: an equivalent placement returns the same project', () => {
    const base = sampleProject();
    const tailed: Project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'I1'
          ? { ...c, placement: { ...c.placement, x: -739.6551724137931 } }
          : c,
      ),
    };
    const at = tailed.containers.find((c) => c.id === 'I1')!.placement;
    expect(setContainerPlacement(tailed, 'I1', { ...at })).toBe(tailed);
  });
});
