import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  effectiveDensity,
  setContainerDensity,
  setMarkingRect,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { addContainer } from '../../src/model';

// Densidade (schema v19): o desenho instancia o componente na caixa em unidades e a raiz da cena
// leva `translate(rect.x, rect.y) · scale(density)`.

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

const draw = (p: Project, id: string) =>
  createDrawingCache()(p, catalog, approximateMeasurer, 0).get(id)!;

/** Os filhos da cena, sem a matriz da raiz (o que não depende da densidade). */
const inside = (root: { children?: unknown }) => JSON.stringify(root.children);

describe('desenho com densidade', () => {
  it('3x em 180×72 desenha a cena de 60×24 unidades com escala 3 na raiz', () => {
    const base = componentProject();
    const at1 = add(base, 'T', 'text', { rect: { x: 40, y: 50, width: 60, height: 24 } });
    const at3 = setContainerDensity(
      add(base, 'T', 'text', { rect: { x: 40, y: 50, width: 180, height: 72 } }),
      'I1',
      3,
    );
    const one = draw(at1, 'T');
    const three = draw(at3, 'T');
    expect(three.root.width).toBe(60);
    expect(three.root.height).toBe(24);
    expect(three.root.transform).toEqual([3, 0, 0, 3, 40, 50]);
    expect(one.root.transform).toEqual([1, 0, 0, 1, 40, 50]);
    expect(inside(three.root as never)).toBe(inside(one.root as never));
  });

  it('a densidade 1 não muda nada: a raiz mede o retângulo e a matriz é só a translação', () => {
    const p = add(componentProject(), 'T', 'text', {
      rect: { x: 7, y: 9, width: 61, height: 25 },
    });
    const root = draw(p, 'T').root;
    expect(root).toMatchObject({ width: 61, height: 25 });
    expect(root.transform).toEqual([1, 0, 0, 1, 7, 9]);
  });

  it('o "não cabe" de um filho fora da caixa vem em pixels (faltam × densidade)', () => {
    const base = componentProject();
    const at1 = add(base, 'W', 'wide', {
      rect: { x: 10, y: 10, width: 100, height: 40 },
    });
    const at3 = setContainerDensity(
      add(base, 'W', 'wide', { rect: { x: 10, y: 10, width: 300, height: 120 } }),
      'I1',
      3,
    );
    const a = draw(at1, 'W');
    const b = draw(at3, 'W');
    expect(a.overflow).toBe(true);
    expect(b.overflow).toBe(true);
    expect(Object.keys(b.shortfalls)).toEqual(Object.keys(a.shortfalls));
    const miss1 = Object.values(a.shortfalls)[0] ?? 0;
    expect(miss1).toBeGreaterThan(0);
    expect(Object.values(b.shortfalls)[0]).toBeCloseTo(miss1 * 3, 6);
  });

  it('a filha do slot é conferida em pixels da imagem (caixa do slot × densidade)', () => {
    const base = setContainerDensity(componentProject(), 'I1', 3);
    const ok = add(
      add(base, 'C', 'column', { rect: { x: 30, y: 30, width: 900, height: 700 } }),
      'T1',
      'text',
      { parentId: 'C', rect: { x: 40, y: 40, width: 180, height: 72 } },
    );
    expect(draw(ok, 'C').overflow).toBe(false);
    // A filha passa da borda direita da mãe (30 + 900 = 930) por 50 px: não cabe.
    const wide = setMarkingRect(
      ok,
      'T1',
      { x: 880, y: 40, width: 100, height: 72 },
      {
        settle: false,
      },
    );
    expect(draw(wide, 'C').overflow).toBe(true);
  });
});

describe('cache com densidade', () => {
  it('mudar a densidade de um container reinstancia só as marcações dele', () => {
    let p = componentProject();
    p = addContainer(p, { id: 'I2', file: 'images/outra.png', width: 500, height: 400 });
    p = add(p, 'A', 'text', { rect: { x: 10, y: 10, width: 60, height: 24 } });
    p = add(p, 'B', 'text', {
      containerId: 'I2',
      rect: { x: 10, y: 10, width: 60, height: 24 },
    });
    const cache = createDrawingCache();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const after = cache(setContainerDensity(p, 'I1', 2), catalog, approximateMeasurer, 0);
    expect(after.get('A')).not.toBe(before.get('A'));
    expect(after.get('B')).toBe(before.get('B'));
    expect(after.get('A')!.root.transform).toEqual([2, 0, 0, 2, 10, 10]);
  });

  it('pan e zoom (mesmo projeto, container 3x) não instanciam nem medem nada', () => {
    const p = setContainerDensity(
      add(componentProject(), 'T', 'text', {
        rect: { x: 0, y: 0, width: 180, height: 72 },
      }),
      'I1',
      3,
    );
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('effectiveDensity do container usado pelo cache é o do projeto', () => {
    const p = setContainerDensity(componentProject(), 'I1', 3);
    expect(effectiveDensity(p, 'I1')).toBe(3);
  });
});
