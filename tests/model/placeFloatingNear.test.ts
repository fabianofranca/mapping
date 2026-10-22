import { describe, expect, it } from 'vitest';
import {
  FLOATING_GAP,
  createMarking,
  placeFloatingNear,
  rectsOverlap,
  type Project,
  type Rect,
} from '../../src/model';
import { arrowBase } from './arrowFixtures';

// `placeFloatingNear` (ME4): lugar livre na margem do alvo. Geometria do `arrowBase`
// (tests/model/arrowFixtures.ts): A (0,0,1000), B (2000,0,1000), C (4000,0,1000).

const size = { width: 200, height: 100 };

function withFloating(p: Project, id: string, rect: Rect): Project {
  return createMarking(p, { id, containerId: null, rect, floating: true });
}

describe('placeFloatingNear', () => {
  it('container: à direita, no topo, com o vão', () => {
    expect(placeFloatingNear(arrowBase(), { kind: 'container', id: 'A' }, size)).toEqual({
      x: 1000 + FLOATING_GAP,
      y: 0,
      ...size,
    });
  });

  it('marcação de container: na margem do container, na altura dela', () => {
    expect(placeFloatingNear(arrowBase(), { kind: 'marking', id: 'a1' }, size)).toEqual({
      x: 1000 + FLOATING_GAP,
      y: 100,
      ...size,
    });
  });

  it('empilha de cima para baixo sem sobrepor outras flutuantes', () => {
    let p = arrowBase();
    const first = placeFloatingNear(p, { kind: 'container', id: 'A' }, size);
    p = withFloating(p, 'f1', first);
    const second = placeFloatingNear(p, { kind: 'container', id: 'A' }, size);
    expect(second.x).toBe(first.x);
    expect(second.y).toBe(first.y + first.height + FLOATING_GAP);
    expect(rectsOverlap(first, second)).toBe(false);
  });

  it('é determinístico', () => {
    const p = arrowBase();
    const target = { kind: 'marking', id: 'a3' } as const;
    expect(placeFloatingNear(p, target, size)).toEqual(
      placeFloatingNear(p, target, size),
    );
  });

  it('não sobrepõe containers: se a direita não cabe, vai para outro lado', () => {
    const big = { width: 1200, height: 100 };
    const p = arrowBase();
    const rect = placeFloatingNear(p, { kind: 'container', id: 'B' }, big);
    expect(rect).toEqual({ x: 2000, y: 1000 + FLOATING_GAP, ...big });
    for (const c of p.containers) {
      const canvas = {
        x: c.placement.x,
        y: c.placement.y,
        width: c.width * c.placement.scale,
        height: c.height * c.placement.scale,
      };
      expect(rectsOverlap(rect, canvas)).toBe(false);
    }
  });

  it('alvo inexistente falha', () => {
    expect(() =>
      placeFloatingNear(arrowBase(), { kind: 'container', id: 'zz' }, size),
    ).toThrow();
  });
});
