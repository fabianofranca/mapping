import { describe, expect, it } from 'vitest';
import { containsRect, containsRectApprox, EPSILON } from '../../src/model';
import type { Rect } from '../../src/model';
import { buildRectIndex } from '../../src/model/spaceIndex';

/** Deterministic generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRect(r: () => number, scale: number): Rect {
  return {
    x: Math.floor(r() * 400 - 100) / scale,
    y: Math.floor(r() * 400 - 100) / scale,
    width: 1 + Math.floor(r() * 300) / scale,
    height: 1 + Math.floor(r() * 300) / scale,
  };
}

describe('buildRectIndex', () => {
  it('returns a superset of the containers, in the given order', () => {
    const SEED = 20261108;
    const r = rng(SEED);
    for (const scale of [1, 4, 1000]) {
      const rects = Array.from({ length: 200 }, () => randomRect(r, scale));
      // Mixes in rectangles off the grid: zero width and non-finite values.
      rects.push(
        { x: 0, y: 0, width: 0, height: 5 },
        { x: NaN, y: 0, width: 4, height: 4 },
      );
      const index = buildRectIndex(rects, (rect) => rect);
      for (let q = 0; q < 200; q++) {
        const inner = randomRect(r, scale * 4);
        for (const [slack, contains] of [
          [0, containsRect],
          [EPSILON, containsRectApprox],
        ] as const) {
          const found = index.containing(inner, slack);
          const expected = rects.filter((rect) => contains(rect, inner));
          const exact = found.filter((rect) => contains(rect, inner));
          expect(exact, `seed ${SEED} scale ${scale} query ${q}`).toEqual(expected);
          expect(found.map((rect) => rects.indexOf(rect))).toEqual(
            [...found.map((rect) => rects.indexOf(rect))].sort((a, b) => a - b),
          );
        }
      }
    }
  });

  it('an invalid query rectangle returns all', () => {
    const rects: Rect[] = [{ x: 0, y: 0, width: 10, height: 10 }];
    const index = buildRectIndex(rects, (rect) => rect);
    expect(index.containing({ x: 0, y: 0, width: -1, height: 1 })).toEqual(rects);
  });

  it('far coordinates: the result is the same and the walk is bounded by the occupied cells', () => {
    // 100 small ones in the finest class (2^-10) near the origin, a few mid ones, and a huge one
    // that covers the far point: the padding of a query at y = 2e12 is ~2,000 units, which is
    // ~4e6 cells per axis of the finest class (about 600 ms per query without the bound).
    const rects: Rect[] = [];
    const r = rng(20261122);
    for (let k = 0; k < 100; k++) {
      rects.push({ x: r() * 50, y: r() * 50, width: 0.0009, height: 0.0009 });
    }
    for (let k = 0; k < 20; k++) {
      rects.push({ x: r() * 500, y: r() * 500, width: 10 + k, height: 10 + k });
    }
    const huge: Rect = { x: 0, y: 1.9e12, width: 2 ** 30, height: 2 ** 40 };
    rects.push(huge);
    const index = buildRectIndex(rects, (rect) => rect);
    const inner: Rect = { x: 5, y: 2e12, width: 0.5, height: 0.5 };
    const start = performance.now();
    let found: Rect[] = [];
    for (let q = 0; q < 10; q++) found = index.containing(inner, EPSILON);
    const elapsed = performance.now() - start;
    expect(found.filter((rect) => containsRectApprox(rect, inner))).toEqual([huge]);
    expect(
      found.filter((rect) => containsRectApprox(rect, inner)),
      'same as the brute force',
    ).toEqual(rects.filter((rect) => containsRectApprox(rect, inner)));
    expect(elapsed, `10 far queries took ${elapsed.toFixed(0)} ms`).toBeLessThan(100);
  });
});
