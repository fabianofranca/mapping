import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_CATALOG,
  NO_DRAWINGS,
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  moveMarking,
  removeMarking,
  renameMarking,
  setFieldValue,
  setMarkingRect,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

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
      imageId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** C (linha) com T1 e T2, mais um texto T3 fora dele e uma marcação comum P. */
function screen(): Project {
  let p = componentProject();
  p = add(p, 'C', 'row', { rect: { x: 100, y: 100, width: 300, height: 100 } });
  p = add(p, 'T3', 'text', { center: { x: 700, y: 500 } });
  p = createMarking(p, {
    id: 'P',
    imageId: 'I1',
    rect: { x: 600, y: 600, width: 50, height: 50 },
  });
  p = add(p, 'T1', 'text', { parentId: 'C' });
  p = add(p, 'T2', 'text', { parentId: 'C' });
  return p;
}

describe('createDrawingCache: o que desenha e em que ordem', () => {
  it('um desenho por marcação com componente, pais antes das filhas, irmãs na ordem do array', () => {
    const p = screen();
    const drawings = createDrawingCache()(p, catalog, approximateMeasurer, 0);
    // Raízes na ordem do array (C, T3, P comum), depois as filhas de C (T1, T2).
    expect([...drawings.keys()]).toEqual(['C', 'T3', 'T1', 'T2']);
    const c = drawings.get('C')!;
    expect(c).toMatchObject({
      markingId: 'C',
      imageId: 'I1',
      annotationId: 'A_C',
      overflow: false,
      warnings: [],
    });
    // A cena ocupa o retângulo da marcação, em pixels da imagem.
    expect(c.root).toMatchObject({ width: 300, height: 100 });
    expect(c.root.transform.slice(4)).toEqual([100, 100]);
    expect(drawings.get('T1')?.root.width).toBe(100);
  });

  it('projeto nulo ou sem componentes: nenhum desenho', () => {
    const cache = createDrawingCache();
    expect(cache(null, catalog, approximateMeasurer, 0)).toBe(NO_DRAWINGS);
    expect(cache(screen(), EMPTY_CATALOG, approximateMeasurer, 0).size).toBe(0);
    expect(cache(componentProject(), catalog, approximateMeasurer, 0)).toBe(NO_DRAWINGS);
  });

  it('o desenho usa os valores da anotação', () => {
    let p = add(componentProject(), 'T1', 'text');
    p = setFieldValue(p, 'A_T1', 'label', 'Outro texto');
    const root = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('T1')!.root;
    const texts = JSON.stringify(root);
    expect(texts).toContain('Outro texto');
  });

  it('os avisos das referências entram nos avisos do desenho', () => {
    let p = add(componentProject(), 'T1', 'text');
    p = {
      ...p,
      annotations: p.annotations.map((a) => ({
        ...a,
        values: { ...a.values, target: { annotationId: 'ZZ', key: 'label' } },
      })),
    };
    const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('T1')!;
    expect(drawing.warnings).toEqual(['referência quebrada: target']);
    expect(drawing.overflow).toBe(false);
  });
});

describe('createDrawingCache: memoização', () => {
  it('mesmo projeto, catálogo, medidor e época: o mesmo Map', () => {
    const cache = createDrawingCache();
    const p = screen();
    const first = cache(p, catalog, approximateMeasurer, 0);
    expect(cache(p, catalog, approximateMeasurer, 0)).toBe(first);
  });

  it('só a marcação editada é reinstanciada; as demais mantêm o mesmo objeto', () => {
    const cache = createDrawingCache();
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const p = screen();
    const before = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    const edited = setFieldValue(p, 'A_T3', 'label', 'Editado');
    const after = cache(edited, catalog, measure, 0);
    expect(after).not.toBe(before);
    expect(after.get('T3')).not.toBe(before.get('T3'));
    for (const id of ['C', 'T1', 'T2']) expect(after.get(id)).toBe(before.get(id));
    // Uma instância de texto mede o texto uma vez (a de T3).
    const perText = measure.mock.calls.length - calls;
    expect(perText).toBeGreaterThan(0);
    expect(perText).toBeLessThan(calls);
    expect([...after.keys()]).toEqual([...before.keys()]);
  });

  it('mexer no que não é desenho (nome, marcação comum) devolve o mesmo Map', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    expect(
      cache(renameMarking(p, 'T1', 'Novo nome'), catalog, approximateMeasurer, 0),
    ).toBe(before);
    expect(cache(moveMarking(p, 'P', 10, 10), catalog, approximateMeasurer, 0)).toBe(
      before,
    );
  });

  it('mover ou redimensionar a marcação reinstancia só ela', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const moved = cache(moveMarking(p, 'T3', 20, 0), catalog, approximateMeasurer, 0);
    expect(moved.get('T3')).not.toBe(before.get('T3'));
    expect(moved.get('T3')?.root.transform[4]).toBe(
      (before.get('T3')?.root.transform[4] ?? 0) + 20,
    );
    expect(moved.get('C')).toBe(before.get('C'));
    const r = p.markings.find((m) => m.id === 'T3')!.rect;
    const resized = cache(
      setMarkingRect(p, 'T3', { ...r, width: r.width + 10 }),
      catalog,
      approximateMeasurer,
      0,
    );
    expect(resized.get('T3')?.root.width).toBe(110);
  });

  it('mexer nas filhas de um container reinstancia o container (e só ele e a filha)', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const moved = cache(moveMarking(p, 'T2', 0, 10), catalog, approximateMeasurer, 0);
    expect(moved.get('T2')).not.toBe(before.get('T2'));
    expect(moved.get('C')).not.toBe(before.get('C'));
    expect(moved.get('T1')).toBe(before.get('T1'));
    expect(moved.get('T3')).toBe(before.get('T3'));
  });

  it('medidor novo ou época nova reinstanciam tudo', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const other: TextMeasurer = (text, font, maxWidth) =>
      approximateMeasurer(text, font, maxWidth);
    const withOther = cache(p, catalog, other, 0);
    expect(withOther).not.toBe(before);
    for (const id of before.keys()) expect(withOther.get(id)).not.toBe(before.get(id));
    const withEpoch = cache(p, catalog, other, 1);
    for (const id of withOther.keys())
      expect(withEpoch.get(id)).not.toBe(withOther.get(id));
  });

  it('componente novo no catálogo reinstancia as marcações dele', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const spec = catalog.get(SPEC_ID)!;
    const byType = new Map(spec.byType);
    byType.set('text', { ...spec.byType.get('text')!, size: { width: 120, height: 40 } });
    const newer: ComponentCatalog = new Map([[SPEC_ID, { ...spec, byType }]]);
    const after = cache(p, newer, approximateMeasurer, 0);
    expect(after.get('T1')).not.toBe(before.get('T1'));
    expect(after.get('T3')).not.toBe(before.get('T3'));
    expect(after.get('C')).toBe(before.get('C'));
  });

  it('marcação que sumiu sai do cache e, ao voltar, é desenhada de novo', () => {
    const cache = createDrawingCache();
    const p = screen();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const without = cache(removeMarking(p, 'T1'), catalog, approximateMeasurer, 0);
    expect([...without.keys()]).toEqual(['C', 'T3', 'T2']);
    const back = cache(p, catalog, approximateMeasurer, 0);
    expect(back.get('T1')).not.toBe(before.get('T1'));
    expect(back.get('T1')?.root.width).toBe(100);
  });

  it('um valor resolvido por referência que muda redesenha quem o usa', () => {
    const cache = createDrawingCache();
    let p = add(componentProject(), 'T1', 'text');
    p = add(p, 'T2', 'text', { center: { x: 200, y: 200 } });
    p = setFieldValue(p, 'A_T1', 'target', { annotationId: 'A_T2', key: 'label' });
    const before = cache(p, catalog, approximateMeasurer, 0);
    const edited = setFieldValue(p, 'A_T2', 'label', 'Mudou');
    const after = cache(edited, catalog, approximateMeasurer, 0);
    expect(after.get('T1')).not.toBe(before.get('T1'));
    expect(after.get('T2')).not.toBe(before.get('T2'));
  });
});

describe('overflow', () => {
  it('folha que cabe não estoura; o aviso do motor marca overflow', () => {
    let p = add(componentProject(), 'T1', 'text');
    p = add(p, 'W', 'wide', { center: { x: 600, y: 600 } });
    const drawings = createDrawingCache()(p, catalog, approximateMeasurer, 0);
    expect(drawings.get('T1')?.overflow).toBe(false);
    const wide = drawings.get('W')!;
    expect(wide.overflow).toBe(true);
    expect(wide.warnings.some((w) => w.startsWith('conteúdo maior que a caixa'))).toBe(
      true,
    );
  });

  it('container: filha com o retângulo fora da caixa do slot estoura', () => {
    // O slot de `inset` fica 20 px para dentro do container.
    let p = add(componentProject(), 'C', 'inset', {
      rect: { x: 100, y: 100, width: 300, height: 200 },
    });
    // No slot (120..380 × 120..280): cabe.
    p = add(p, 'T1', 'text', { parentId: 'C' });
    const cache = createDrawingCache();
    const fits = cache(p, catalog, approximateMeasurer, 0);
    expect(fits.get('C')?.overflow).toBe(false);
    expect(fits.get('C')?.warnings).toEqual([]);

    // Encostada na borda do container, fora do slot.
    const moved = moveMarking(p, 'T1', -20, -20);
    const out = cache(moved, catalog, approximateMeasurer, 0);
    expect(out.get('C')?.overflow).toBe(true);
    expect(out.get('T1')?.overflow).toBe(false);

    // Voltando para dentro, o desenho do container é refeito e deixa de estourar.
    const back = cache(p, catalog, approximateMeasurer, 0);
    expect(back.get('C')?.overflow).toBe(false);
  });

  it('a tolerância de 1 px do arredondamento não conta como estouro', () => {
    let p = add(componentProject(), 'C', 'inset', {
      rect: { x: 100, y: 100, width: 300, height: 200 },
    });
    p = add(p, 'T1', 'text', {
      parentId: 'C',
      rect: { x: 119, y: 119, width: 100, height: 40 },
    });
    expect(
      createDrawingCache()(p, catalog, approximateMeasurer, 0).get('C')?.overflow,
    ).toBe(false);
    p = moveMarking(p, 'T1', -1, 0);
    expect(
      createDrawingCache()(p, catalog, approximateMeasurer, 0).get('C')?.overflow,
    ).toBe(true);
  });
});
