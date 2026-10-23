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

  describe('container com placement fracionário (scale 10/3, y 166,666…)', () => {
    // 300×200 com escala 10/3: ocupa 1000×666,67 no canvas, a partir de y 166,67.
    function fractional(): Project {
      const p = arrowBase();
      return {
        ...p,
        containers: p.containers.map((c) =>
          c.id === 'A'
            ? {
                ...c,
                width: 300,
                height: 200,
                placement: { x: 0, y: 500 / 3, scale: 10 / 3 },
              }
            : c,
        ),
      };
    }
    const anchor = { x: 0, y: 500 / 3, width: 1000, height: (200 * 10) / 3 };
    const target = { kind: 'container', id: 'A' } as const;
    const fractionalSize = { width: 200.4, height: 99.5 };

    function expectFree(p: Project, rect: Rect): void {
      for (const v of [rect.x, rect.y, rect.width, rect.height]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      for (const c of p.containers) {
        expect(
          rectsOverlap(rect, {
            x: c.placement.x,
            y: c.placement.y,
            width: c.width * c.placement.scale,
            height: c.height * c.placement.scale,
          }),
        ).toBe(false);
      }
      for (const m of p.markings) {
        if (m.floating && m.containerId === null) {
          expect(rectsOverlap(rect, m.rect)).toBe(false);
        }
      }
    }

    it('direita: inteiro, com o vão', () => {
      const p = fractional();
      const rect = placeFloatingNear(p, target, fractionalSize);
      expectFree(p, rect);
      expect(rect.x).toBeGreaterThanOrEqual(anchor.x + anchor.width + FLOATING_GAP);
      expect(rect.y).toBe(Math.ceil(anchor.y));
    });

    it('marcação do container: inteiro', () => {
      const p = fractional();
      const rect = placeFloatingNear(p, { kind: 'marking', id: 'a1' }, size);
      expectFree(p, rect);
    });

    it('esquerda, embaixo e em cima: inteiros, sem sobrepor e com o vão', () => {
      let p = fractional();
      // Obstáculos altos/largos empurram o empilhamento para os outros lados.
      p = withFloating(p, 'wallR', { x: 1024, y: 0, width: 300, height: 5000 });
      const left = placeFloatingNear(p, target, fractionalSize);
      expectFree(p, left);
      expect(left.x + left.width).toBeLessThanOrEqual(anchor.x - FLOATING_GAP);

      p = withFloating(p, 'wallL', { x: -1500, y: 0, width: 1400, height: 5000 });
      const below = placeFloatingNear(p, target, fractionalSize);
      expectFree(p, below);
      expect(below.y).toBeGreaterThanOrEqual(anchor.y + anchor.height + FLOATING_GAP);

      p = withFloating(p, 'wallB', { x: -1500, y: 840, width: 4000, height: 400 });
      const above = placeFloatingNear(p, target, fractionalSize);
      expectFree(p, above);
      expect(above.y + above.height).toBeLessThanOrEqual(anchor.y - FLOATING_GAP);
    });
  });
});
