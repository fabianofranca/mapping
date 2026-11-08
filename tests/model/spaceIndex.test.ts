import { describe, expect, it } from 'vitest';
import { containsRect, containsRectApprox, EPSILON } from '../../src/model';
import type { Rect } from '../../src/model';
import { buildRectIndex } from '../../src/model/spaceIndex';

/** Gerador determinístico (mulberry32). */
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
  it('devolve um superconjunto de quem contém, na ordem dada', () => {
    const SEED = 20261108;
    const r = rng(SEED);
    for (const scale of [1, 4, 1000]) {
      const rects = Array.from({ length: 200 }, () => randomRect(r, scale));
      // Mistura retângulos fora da grade: largura nula e valores não finitos.
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
          expect(exact, `semente ${SEED} escala ${scale} consulta ${q}`).toEqual(
            expected,
          );
          expect(found.map((rect) => rects.indexOf(rect))).toEqual(
            [...found.map((rect) => rects.indexOf(rect))].sort((a, b) => a - b),
          );
        }
      }
    }
  });

  it('retângulo de consulta inválido devolve todos', () => {
    const rects: Rect[] = [{ x: 0, y: 0, width: 10, height: 10 }];
    const index = buildRectIndex(rects, (rect) => rect);
    expect(index.containing({ x: 0, y: 0, width: -1, height: 1 })).toEqual(rects);
  });
});
