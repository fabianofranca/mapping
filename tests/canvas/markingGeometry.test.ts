import { describe, expect, it } from 'vitest';
import {
  canvasToImagePixel,
  floatingAt,
  handleHitRadius,
  isDrawableRect,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
  placementOfSpace,
  rectFromPoints,
  resizeMarkingRect,
} from '../../src/canvas/markingGeometry';
import {
  IDENTITY_PLACEMENT,
  addComponentMarking,
  approximateMeasurer,
  componentMinSize,
  createMarking,
  setContainerDensity,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';
import { marking, sampleProject } from '../model/fixtures';

describe('marking geometry on the canvas', () => {
  const placement = { x: 100, y: 50, scale: 0.25 };

  it('converts image pixels ↔ canvas', () => {
    const rect = { x: 400, y: 200, width: 80, height: 40 };
    expect(markingCanvasRect(placement, rect)).toEqual({
      x: 200,
      y: 100,
      width: 20,
      height: 10,
    });
    expect(canvasToImagePixel(placement, { x: 200, y: 100 })).toEqual({ x: 400, y: 200 });
  });

  it('drawing: whole-number rectangle between two points, limited to the image', () => {
    const image = { width: 1000, height: 500 };
    expect(rectFromPoints({ x: 10.4, y: 20.6 }, { x: 5, y: 5 }, image)).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 16,
    });
    expect(rectFromPoints({ x: 900, y: 400 }, { x: 1500, y: -30 }, image)).toEqual({
      x: 900,
      y: 0,
      width: 100,
      height: 400,
    });
    expect(isDrawableRect({ x: 0, y: 0, width: 8, height: 8 })).toBe(true);
    expect(isDrawableRect({ x: 0, y: 0, width: 7, height: 100 })).toBe(false);
  });

  it('drawing on the empty canvas (no image): canvas integers, unbounded and with negatives', () => {
    expect(rectFromPoints({ x: 10.4, y: 20.6 }, { x: -30, y: -5 }, null)).toEqual({
      x: -30,
      y: -5,
      width: 40,
      height: 26,
    });
    expect(rectFromPoints({ x: 5000, y: 4000 }, { x: 9000.6, y: 4500 }, null)).toEqual({
      x: 5000,
      y: 4000,
      width: 4001,
      height: 500,
    });
  });

  it("a marking's space: the container position or the identity, on the canvas", () => {
    const placements = new Map([['I1', placement]]);
    expect(placementOfSpace(placements, 'I1')).toBe(placement);
    expect(placementOfSpace(placements, 'X')).toBeUndefined();
    expect(placementOfSpace(placements, null)).toBe(IDENTITY_PLACEMENT);
  });

  it('chain under the point: the innermost first, then the ancestors', () => {
    const p = sampleProject();
    // M3 (Lock) sits at 1300..1350 × 1250..1300, inside M2 and M1.
    const ids = (x: number, y: number, containerId = 'I1') =>
      markingChainAt(p.markings, containerId, { x, y }).map((m) => m.id);
    expect(ids(1320, 1270)).toEqual(['M3', 'M2', 'M1']);
    expect(ids(1500, 1300)).toEqual(['M2', 'M1']);
    expect(ids(1900, 1900)).toEqual(['M1']);
    expect(ids(10, 10)).toEqual([]);
    expect(ids(10, 10, 'I2')).toEqual(['M4']);
  });

  it('chain on the canvas: canvas markings by the point; container and floating ones are not included', () => {
    // Far from the images (I1 spans 0..1000 × 0..750), so they remain canvas markings.
    let p = sampleProject();
    p = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -3000, y: -3000, width: 1000, height: 1000 },
    });
    p = createMarking(p, {
      id: 'C2',
      containerId: null,
      rect: { x: -2900, y: -2900, width: 300, height: 300 },
    });
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -2800, y: -2800, width: 50, height: 50 },
      floating: true,
    });
    expect(marking(p, 'C2').parentId).toBe('C1');
    const ids = (x: number, y: number) =>
      markingChainAt(p.markings, null, { x, y }).map((m) => m.id);
    expect(ids(-2780, -2780)).toEqual(['C2', 'C1']);
    expect(ids(-2100, -2100)).toEqual(['C1']);
    expect(ids(-500, -500)).toEqual([]);
    // Container ones (M1…) are not part of the canvas chain.
    expect(ids(1300, 1250)).toEqual([]);
    // The floating one gets its turn earlier, in `floatingAt`, and is never in a chain.
    expect(floatingAt(p.markings, { x: -2780, y: -2780 }).map((m) => m.id)).toEqual([
      'N1',
    ]);
    expect(floatingAt(p.markings, { x: -2000, y: -2000 })).toEqual([]);
  });

  it('overlapping floating markings: the top one (the last in the array) comes first', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -500, y: -500, width: 100, height: 100 },
      floating: true,
    });
    p = createMarking(p, {
      id: 'N2',
      containerId: null,
      rect: { x: -450, y: -450, width: 100, height: 100 },
      floating: true,
    });
    expect(floatingAt(p.markings, { x: -425, y: -425 }).map((m) => m.id)).toEqual([
      'N2',
      'N1',
    ]);
  });

  it('among overlapping siblings, the smallest area wins', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 1500, y: 1500, width: 400, height: 400 },
    });
    p = createMarking(p, {
      id: 'M6',
      containerId: 'I1',
      rect: { x: 1400, y: 1600, width: 200, height: 200 },
    });
    expect(marking(p, 'M5').parentId).toBe('M1');
    expect(marking(p, 'M6').parentId).toBe('M1');
    const chain = markingChainAt(p.markings, 'I1', { x: 1550, y: 1650 });
    expect(chain.map((m) => m.id)).toEqual(['M6', 'M1']);
  });

  it('touching the same point again goes up to the parent and then back to the innermost', () => {
    const chain = ['M3', 'M2', 'M1'];
    expect(nextInChain(chain, null, false)).toBe('M3');
    expect(nextInChain(chain, 'M3', true)).toBe('M2');
    expect(nextInChain(chain, 'M2', true)).toBe('M1');
    expect(nextInChain(chain, 'M1', true)).toBe('M3');
    // Another point (or selection outside the chain): back to the innermost.
    expect(nextInChain(chain, 'M2', false)).toBe('M3');
    expect(nextInChain(chain, 'M4', true)).toBe('M3');
    expect(nextInChain([], 'M1', true)).toBeNull();
  });

  it('resize: fixed opposite corner, integers and minimum size', () => {
    const limits = { outer: { x: 0, y: 0, width: 1000, height: 1000 } };
    const start = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeMarkingRect(start, 'se', { x: 400.4, y: 250.6 }, limits)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 151,
    });
    expect(resizeMarkingRect(start, 'nw', { x: 50, y: 20 }, limits)).toEqual({
      x: 50,
      y: 20,
      width: 250,
      height: 180,
    });
    // Crossing the opposite corner stops at the minimum size.
    expect(resizeMarkingRect(start, 'ne', { x: 0, y: 900 }, limits)).toEqual({
      x: 100,
      y: 192,
      width: 8,
      height: 8,
    });
  });

  it('resize with the minimum of a marking with a component (1 px or the minSize)', () => {
    const limits = { outer: { x: 0, y: 0, width: 1000, height: 1000 } };
    const start = { x: 100, y: 100, width: 200, height: 100 };
    const to = { x: 0, y: 900 };
    expect(resizeMarkingRect(start, 'ne', to, limits, { width: 1, height: 1 })).toEqual({
      x: 100,
      y: 199,
      width: 1,
      height: 1,
    });
    expect(resizeMarkingRect(start, 'ne', to, limits, { width: 20, height: 10 })).toEqual(
      { x: 100, y: 190, width: 20, height: 10 },
    );
  });

  it('resize bound to the component minimum × container density (#1085)', () => {
    const catalog = testCatalog();
    const withDensity = (density: number) =>
      setContainerDensity(
        addComponentMarking(
          componentProject(),
          catalog,
          {
            markingId: 'T',
            annotationId: 'A',
            containerId: 'I1',
            parentId: null,
            specId: SPEC_ID,
            typeId: 'text',
            rect: { x: 100, y: 100, width: 400, height: 200 },
          },
          approximateMeasurer,
        ),
        'I1',
        density,
      );
    const limits = { outer: { x: 0, y: 0, width: 1000, height: 800 } };
    const start = { x: 100, y: 100, width: 400, height: 200 };
    const to = { x: 0, y: 900 };
    const resized = (density: number) =>
      resizeMarkingRect(
        start,
        'ne',
        to,
        limits,
        componentMinSize(withDensity(density), catalog, 'T')!,
      );
    // The `text` has minSize 60×24 (units): 1x stays at 60×24, 3x at 180×72.
    expect(resized(1)).toMatchObject({ width: 60, height: 24 });
    expect(resized(3)).toMatchObject({ width: 180, height: 72 });
  });

  it('resize: only the container limits; the children and the parent do not', () => {
    const p = sampleProject();
    const m3 = marking(p, 'M3'); // inside M2 and M1, in I1 (4000×3000)
    const outer = { x: 0, y: 0, width: 4000, height: 3000 };
    // Grows up to the image edge, over the parent (what does not fit leaves the membership on release).
    expect(resizeMarkingRect(m3.rect, 'se', { x: 9000, y: 9000 }, { outer })).toEqual({
      x: 1300,
      y: 1250,
      width: 2700,
      height: 1750,
    });
    // The parent shrinks over the children: nothing holds it.
    const m1 = marking(p, 'M1');
    expect(resizeMarkingRect(m1.rect, 'se', { x: 0, y: 0 }, { outer })).toEqual({
      x: 1000,
      y: 1000,
      width: 8,
      height: 8,
    });
  });

  it('resize a canvas marking: unbounded, with negatives', () => {
    const start = { x: 0, y: 0, width: 100, height: 100 };
    expect(resizeMarkingRect(start, 'nw', { x: -500, y: -300 }, { outer: null })).toEqual(
      {
        x: -500,
        y: -300,
        width: 600,
        height: 400,
      },
    );
    expect(
      resizeMarkingRect(start, 'se', { x: 90000, y: 60000 }, { outer: null }),
    ).toEqual({ x: 0, y: 0, width: 90000, height: 60000 });
  });

  it('handles shrink on small markings, without going below 24 px', () => {
    expect(handleHitRadius(300)).toBe(22);
    expect(handleHitRadius(45)).toBe(15);
    expect(handleHitRadius(6)).toBe(12);
  });
});
