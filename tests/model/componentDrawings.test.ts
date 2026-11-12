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
import { validateLibrary } from '../../src/model/library';
import { COMPONENTS, SPEC_ID, componentProject, testCatalog } from './componentFixtures';

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

/** C (linha) com T1 e T2, mais um texto T3 fora dele e uma marcação comum P. */
function screen(): Project {
  let p = componentProject();
  p = add(p, 'C', 'row', { rect: { x: 100, y: 100, width: 300, height: 100 } });
  p = add(p, 'T3', 'text', { center: { x: 700, y: 500 } });
  p = createMarking(p, {
    id: 'P',
    containerId: 'I1',
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
      containerId: 'I1',
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
    expect(drawing.warnings.map((w) => w.text)).toEqual(['referência quebrada: target']);
    expect(drawing.warnings[0]?.code).toBe('value.refBroken');
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
  it('o aviso "texto maior que a caixa" também marca overflow (a pendência "não cabe")', () => {
    const tall = testCatalog({
      ...COMPONENTS,
      text: {
        format: 'mapping-component',
        formatVersion: 1,
        id: 'text',
        name: 'text',
        size: { width: 100, height: 40 },
        template: {
          type: 'frame',
          layout: { type: 'none' },
          children: [
            {
              type: 'text',
              name: 'rotulo',
              text: 'aaaa bbbb cccc dddd',
              width: 30,
              height: 12,
              font: { size: 10, lineHeight: 12 },
            },
          ],
        },
      },
    });
    const p = addComponentMarking(
      componentProject(),
      tall,
      {
        markingId: 'T1',
        annotationId: 'A_T1',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      },
      approximateMeasurer,
    );
    const drawing = createDrawingCache()(p, tall, approximateMeasurer, 0).get('T1')!;
    expect(drawing.warnings.map((w) => w.text)).toContain(
      'texto maior que a caixa: rotulo',
    );
    // Aviso do motor: com código (MB5), a interface o traduz.
    expect(drawing.warnings.find((w) => w.text.startsWith('texto maior'))).toMatchObject({
      code: 'engine.textTooBig',
      params: { name: 'rotulo' },
    });
    expect(drawing.overflow).toBe(true);
  });

  it('palavra mais larga que a caixa do texto também marca overflow (#1631)', () => {
    const word = testCatalog({
      ...COMPONENTS,
      text: {
        format: 'mapping-component',
        formatVersion: 1,
        id: 'text',
        name: 'text',
        size: { width: 100, height: 40 },
        template: {
          type: 'frame',
          layout: { type: 'none' },
          children: [
            {
              type: 'text',
              name: 'rotulo',
              text: 'Confirmar',
              width: 30,
              height: 40,
              font: { size: 10, lineHeight: 12 },
            },
          ],
        },
      },
    });
    const p = addComponentMarking(
      componentProject(),
      word,
      {
        markingId: 'T1',
        annotationId: 'A_T1',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
      },
      approximateMeasurer,
    );
    const drawing = createDrawingCache()(p, word, approximateMeasurer, 0).get('T1')!;
    expect(drawing.warnings).toMatchObject([
      { code: 'engine.textTooBig', params: { name: 'rotulo' } },
    ]);
    expect(drawing.overflow).toBe(true);
  });

  it('folha que cabe não estoura; o aviso do motor marca overflow', () => {
    let p = add(componentProject(), 'T1', 'text');
    p = add(p, 'W', 'wide', { center: { x: 600, y: 600 } });
    const drawings = createDrawingCache()(p, catalog, approximateMeasurer, 0);
    expect(drawings.get('T1')?.overflow).toBe(false);
    const wide = drawings.get('W')!;
    expect(wide.overflow).toBe(true);
    expect(
      wide.warnings.some((w) => w.text.startsWith('conteúdo maior que a caixa')),
    ).toBe(true);
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

describe('createDrawingCache: clip do slot (L2)', () => {
  /** O container `inset` (slot a 20 px das bordas) com `clip: true` no slot (formato 4). */
  function clippedCatalog(clip: unknown = true): ComponentCatalog {
    const base = COMPONENTS.inset as unknown as {
      template: { children: Record<string, unknown>[] };
    };
    const slot = { ...(base.template.children[0] as object), clip };
    const inset = {
      ...base,
      formatVersion: 4,
      template: { ...base.template, children: [slot] },
    };
    return testCatalog({ ...COMPONENTS, inset } as never);
  }

  function inScreen(cat: ComponentCatalog): Project {
    let p = componentProject();
    const put = (id: string, typeId: string, extra: Partial<NewComponentArgs> = {}) => {
      p = addComponentMarking(
        p,
        cat,
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
    };
    put('C', 'inset', { rect: { x: 100, y: 100, width: 300, height: 200 } });
    put('T1', 'text', { parentId: 'C' });
    put('T2', 'text', { parentId: 'C' });
    return p;
  }

  it('a filha de um slot com clip leva a caixa do slot da mãe', () => {
    const cat = clippedCatalog();
    const drawings = createDrawingCache()(inScreen(cat), cat, approximateMeasurer, 0);
    const slot = { x: 120, y: 120, width: 260, height: 160 };
    expect(drawings.get('T1')?.clip).toEqual(slot);
    expect(drawings.get('T2')?.clip).toEqual(slot);
    expect(drawings.get('C')?.clip).toBeUndefined();
  });

  it('slot sem clip (ou com clip falso): a filha não leva clip e o desenho é o de hoje', () => {
    const plain = createDrawingCache()(
      inScreen(catalog),
      catalog,
      approximateMeasurer,
      0,
    );
    expect('clip' in (plain.get('T1') as object)).toBe(false);
    const off = clippedCatalog(false);
    const drawings = createDrawingCache()(inScreen(off), off, approximateMeasurer, 0);
    expect('clip' in (drawings.get('T1') as object)).toBe(false);
  });

  it('mover ou redimensionar a mãe atualiza o clip da filha', () => {
    const cat = clippedCatalog();
    const cache = createDrawingCache();
    const p = inScreen(cat);
    const before = cache(p, cat, approximateMeasurer, 0);
    const moved = cache(moveMarking(p, 'C', 50, 0), cat, approximateMeasurer, 0);
    expect(moved.get('T1')?.clip).toEqual({ x: 170, y: 120, width: 260, height: 160 });
    expect(moved.get('T1')?.clip).not.toBe(before.get('T1')?.clip);
    const r = p.markings.find((m) => m.id === 'C')!.rect;
    const resized = cache(
      setMarkingRect(p, 'C', { ...r, width: 400 }),
      cat,
      approximateMeasurer,
      0,
    );
    expect(resized.get('T1')?.clip).toEqual({ x: 120, y: 120, width: 360, height: 160 });
  });

  it('sem mudança, o clip é o mesmo objeto; mexer numa irmã ou noutra marcação não o troca', () => {
    const cat = clippedCatalog();
    const cache = createDrawingCache();
    const p = inScreen(cat);
    const before = cache(p, cat, approximateMeasurer, 0);
    expect(cache(p, cat, approximateMeasurer, 0)).toBe(before);
    const sibling = cache(moveMarking(p, 'T2', 0, 5), cat, approximateMeasurer, 0);
    expect(sibling.get('T1')).toBe(before.get('T1'));
    expect(sibling.get('T1')?.clip).toBe(before.get('T1')?.clip);
    expect(sibling.get('T2')?.clip).toBe(before.get('T1')?.clip);
  });

  /** C (inset com clip) com D (box) meio fora do slot dele e o texto T dentro de D. */
  function nested(cat: ComponentCatalog): Project {
    let p = componentProject();
    const put = (id: string, typeId: string, extra: Partial<NewComponentArgs> = {}) => {
      p = addComponentMarking(
        p,
        cat,
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
    };
    put('C', 'inset', { rect: { x: 100, y: 100, width: 300, height: 200 } });
    put('D', 'box', { parentId: 'C', rect: { x: 300, y: 150, width: 90, height: 80 } });
    put('T', 'text', { parentId: 'D', center: { x: 345, y: 190 } });
    return p;
  }

  it('o clip do slot alcança as netas: a filha sem clip passa o recorte adiante', () => {
    const cat = clippedCatalog();
    const p = nested(cat);
    expect(p.markings.find((m) => m.id === 'T')?.parentId).toBe('D');
    const drawings = createDrawingCache()(p, cat, approximateMeasurer, 0);
    const slot = { x: 120, y: 120, width: 260, height: 160 };
    expect(drawings.get('D')?.clip).toEqual(slot);
    expect(drawings.get('T')?.clip).toEqual(slot);
  });

  it('slot com clip dentro de outro: a neta leva a interseção dos dois', () => {
    const withClip = (component: unknown) => {
      const c = component as { template: { children: object[] } };
      return {
        ...c,
        formatVersion: 4,
        template: {
          ...c.template,
          children: [{ ...c.template.children[0], clip: true }],
        },
      };
    };
    const cat = testCatalog({
      ...COMPONENTS,
      inset: withClip(COMPONENTS.inset),
      box: withClip(COMPONENTS.box),
    } as never);
    const drawings = createDrawingCache()(nested(cat), cat, approximateMeasurer, 0);
    // Slot de C: 120..380 × 120..280; slot de D (a caixa toda): 300..390 × 150..230.
    expect(drawings.get('T')?.clip).toEqual({ x: 300, y: 150, width: 80, height: 80 });
  });

  it('mãe com screen (cena na origem, em pixels de tela): a filha não leva o clip perto de 0,0', () => {
    const base = COMPONENTS.inset as unknown as {
      template: { children: Record<string, unknown>[] };
    };
    const inset = {
      ...base,
      formatVersion: 4,
      screen: { anchor: 'top-left' },
      template: {
        ...base.template,
        children: [{ ...(base.template.children[0] as object), clip: true }],
      },
    };
    const cat = testCatalog({ ...COMPONENTS, inset } as never);
    const drawings = createDrawingCache()(inScreen(cat), cat, approximateMeasurer, 0);
    expect(drawings.get('C')?.screen).toBeDefined();
    expect(drawings.get('T1')?.clip).toBeUndefined();
  });

  it('o clip muda a filha mesmo que ela, em si, não tenha mudado', () => {
    const cat = clippedCatalog();
    const cache = createDrawingCache();
    const p = inScreen(cat);
    const before = cache(p, cat, approximateMeasurer, 0);
    const r = p.markings.find((m) => m.id === 'C')!.rect;
    const after = cache(
      setMarkingRect(p, 'C', { ...r, height: 150 }),
      cat,
      approximateMeasurer,
      0,
    );
    expect(after.get('T1')).not.toBe(before.get('T1'));
    expect(after.get('T1')?.root).toEqual(before.get('T1')?.root);
    expect(after.get('T1')?.clip?.height).toBe(110);
  });
});

describe('aviso do none: a app e a prova de desenho dão o mesmo (#1093)', () => {
  // Raiz `none` com um quadro `hug` de padding 24 nas laterais e uma barra de 39: 87 de conteúdo.
  const chip = (id: string) => ({
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: 'Chip',
    size: { width: 58, height: 40 },
    template: {
      type: 'frame',
      name: 'chip',
      layout: { type: 'none' },
      children: [
        {
          type: 'frame',
          name: 'miolo',
          width: 'hug',
          height: 'hug',
          layout: { type: 'row', padding: [0, 24] },
          children: [{ type: 'rect', name: 'barra', width: 39, height: 36 }],
        },
      ],
    },
  });
  const TOO_BIG = 'conteúdo maior que a caixa: chip';

  it('a mesma instância pela app (componentDrawings) e pela prova (libraryDrawing) avisa igual', () => {
    const cat = testCatalog({ ...COMPONENTS, text: chip('text') } as never);
    const marked = addComponentMarking(
      componentProject(),
      cat,
      {
        markingId: 'T1',
        annotationId: 'A_T1',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x: 0, y: 0, width: 58, height: 40 },
      },
      approximateMeasurer,
    );
    const drawing = createDrawingCache()(marked, cat, approximateMeasurer, 0).get('T1')!;
    expect(drawing.overflow).toBe(true);
    expect(drawing.shortfalls).toEqual({ [TOO_BIG]: 29 });

    const spec = {
      format: 'mapping-spec',
      formatVersion: 15,
      id: 'm',
      name: 'M',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [
            { id: 't', name: 'T', component: 'components/chip.json', fields: [] },
          ],
        },
      ],
    };
    const report = validateLibrary({
      specPath: 'm.spec.json',
      level: 3,
      files: [
        { path: 'm.spec.json', text: JSON.stringify(spec) },
        { path: 'components/chip.json', text: JSON.stringify(chip('chip')) },
      ],
    });
    expect(report.warnings.map((w) => w.message)).toEqual([
      `tipo "t", os valores padrão, tamanho inicial 58×40: ${TOO_BIG} (aproximado)`,
    ]);
  });
});
