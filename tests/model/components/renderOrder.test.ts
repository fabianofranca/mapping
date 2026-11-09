// renderOrder: a ordem de desenho (pais antes dos filhos, irmãos na ordem da lista) igual à da versão
// quadrática antiga, inclusive com raízes soltas, pais ausentes, auto-referência e ciclos.
import { describe, expect, it } from 'vitest';
import {
  renderOrder,
  type Instance,
  type Screen,
} from '../../../src/model/components/screen';

/** A implementação antiga (O(n²)): referência da ordem. */
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
  it('lista vazia', () => {
    expect(renderOrder(screenOf([]))).toEqual([]);
  });

  it('pais antes dos filhos, irmãos na ordem da lista, raízes soltas', () => {
    const s = screenOf([
      inst('b', 'a'),
      inst('x'),
      inst('a'),
      inst('c', 'b'),
      inst('d', 'a'),
    ]);
    expect(renderOrder(s).map((i) => i.id)).toEqual(['x', 'a', 'b', 'c', 'd']);
  });

  it('pai ausente vira raiz; auto-referência e ciclo ficam de fora, como antes', () => {
    const s = screenOf([
      inst('o', 'sumiu'),
      inst('self', 'self'),
      inst('p', 'q'),
      inst('q', 'p'),
      inst('r'),
    ]);
    expect(renderOrder(s).map((i) => i.id)).toEqual(['o', 'r']);
    expect(renderOrder(s)).toEqual(referenceOrder(s));
  });

  it('é igual à versão antiga em árvores embaralhadas', () => {
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

  it('5.000 instâncias em cadeia de irmãos e filhos rodam em tempo linear', () => {
    const instances = Array.from({ length: 5000 }, (_, i) =>
      inst(`i${i}`, i % 10 === 0 ? undefined : `i${i - (i % 10)}`),
    );
    const start = performance.now();
    expect(renderOrder(screenOf(instances))).toHaveLength(5000);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
