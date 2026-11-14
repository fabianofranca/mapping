// renderOrder: the draw order (parents before children, siblings in list order) equal to that of the old
// quadratic version, including loose roots, missing parents, self-reference and cycles.
import { describe, expect, it } from 'vitest';
import {
  renderOrder,
  type Instance,
  type Screen,
} from '../../../src/model/components/screen';

/** The old implementation (O(n²)): reference for the order. */
function referenceOrder(screen: Screen): Instance[] {
  const out: Instance[] = [];
  const known = new Set(screen.instances.map((i) => i.id));
  const visit = (parentId: string | undefined) => {
    for (const child of screen.instances) {
      const parent =
        child.parentId && known.has(child.parentId) ? child.parentId : undefined;
      if (parent !== parentId) continue;
      out.push(child);
      visit(child.id);
    }
  };
  visit(undefined);
  return out;
}

function inst(id: string, parentId?: string): Instance {
  return {
    id,
    typeId: 'T',
    box: { x: 0, y: 0, width: 10, height: 10 },
    values: {},
    ...(parentId === undefined ? {} : { parentId }),
  } as Instance;
}

const screenOf = (instances: Instance[]): Screen =>
  ({ id: 'S', name: 'S', width: 100, height: 100, instances }) as unknown as Screen;

describe('renderOrder', () => {
  it('empty list', () => {
    expect(renderOrder(screenOf([]))).toEqual([]);
  });

  it('parents before children, siblings in list order, loose roots', () => {
    const s = screenOf([
      inst('b', 'a'),
      inst('x'),
      inst('a'),
      inst('c', 'b'),
      inst('d', 'a'),
    ]);
    expect(renderOrder(s).map((i) => i.id)).toEqual(['x', 'a', 'b', 'c', 'd']);
  });

  it('a missing parent becomes a root; self-reference and cycles are left out, as before', () => {
    const s = screenOf([
      inst('o', 'gone'),
      inst('self', 'self'),
      inst('p', 'q'),
      inst('q', 'p'),
      inst('r'),
    ]);
    expect(renderOrder(s).map((i) => i.id)).toEqual(['o', 'r']);
    expect(renderOrder(s)).toEqual(referenceOrder(s));
  });

  it('is equal to the old version on shuffled trees', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 40; round++) {
      const count = 1 + rand(60);
      const instances = Array.from({ length: count }, (_, i) => {
        const pick = rand(count + 3);
        return inst(`i${i}`, pick < count && rand(4) > 0 ? `i${pick}` : undefined);
      });
      const s = screenOf(instances);
      expect(renderOrder(s)).toEqual(referenceOrder(s));
    }
  });

  it('5,000 instances in a chain of siblings and children run in linear time', () => {
    const instances = Array.from({ length: 5000 }, (_, i) =>
      inst(`i${i}`, i % 10 === 0 ? undefined : `i${i - (i % 10)}`),
    );
    const start = performance.now();
    expect(renderOrder(screenOf(instances))).toHaveLength(5000);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
