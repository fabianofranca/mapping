import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  addComponentMarking,
  addContainer,
  componentPlacement,
  componentTypes,
  setFieldValue,
  approximateMeasurer,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { COMPONENTS, SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { expectValid, marking } from './fixtures';

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
  cat: ComponentCatalog = catalog,
): Project {
  return addComponentMarking(
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
}

const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

describe('componentTypes', () => {
  it('lista os tipos com componente na ordem da especialização', () => {
    const types = componentTypes(componentProject(), catalog);
    expect(types.map((t) => t.typeId)).toEqual(Object.keys(COMPONENTS));
    const text = types[0];
    expect(text).toMatchObject({
      specId: SPEC_ID,
      typeId: 'text',
      name: 'Tipo text',
      layerId: 'componentes',
      container: false,
    });
    expect(text?.component.id).toBe('text');
    expect(types.find((t) => t.typeId === 'row')?.container).toBe(true);
    expect(types.find((t) => t.typeId === 'box')?.container).toBe(true);
    expect(types.find((t) => t.typeId === 'wide')?.container).toBe(false);
  });

  it('tipo sem componente fica de fora; catálogo vazio ou de outra versão, lista vazia', () => {
    const p = componentProject();
    expect(componentTypes(p, catalog).some((t) => t.typeId === 'plain')).toBe(false);
    expect(componentTypes(p, EMPTY_CATALOG)).toEqual([]);
    const stale: ComponentCatalog = new Map([
      [SPEC_ID, { ...catalog.get(SPEC_ID)!, version: 9 }],
    ]);
    expect(componentTypes(p, stale)).toEqual([]);
  });
});

describe('componentPlacement: sem container', () => {
  const place = (center?: { x: number; y: number }, typeId = 'text') =>
    componentPlacement(
      componentProject(),
      catalog,
      {
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId,
        ...(center ? { center } : {}),
      },
      approximateMeasurer,
    );

  it('sem centro: no centro da imagem, no tamanho inicial', () => {
    expect(place()).toEqual({ x: 450, y: 380, width: 100, height: 40 });
  });

  it('centrada no ponto pedido, com coordenadas inteiras', () => {
    expect(place({ x: 200, y: 300 })).toEqual({ x: 150, y: 280, width: 100, height: 40 });
    expect(place({ x: 200.5, y: 300.4 })).toEqual({
      x: 151,
      y: 280,
      width: 100,
      height: 40,
    });
  });

  it('presa dentro da imagem', () => {
    expect(place({ x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(place({ x: 5000, y: 5000 })).toEqual({
      x: 900,
      y: 760,
      width: 100,
      height: 40,
    });
    expect(place({ x: -10, y: 790 })).toEqual({ x: 0, y: 760, width: 100, height: 40 });
  });

  it('imagem menor que o tamanho inicial: encolhe até o mínimo', () => {
    let p = componentProject();
    p = addContainer(p, { id: 'I2', file: 'images/pequena.png', width: 80, height: 30 });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I2', parentId: null, specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    // 100×40 preso em 80×30; o mínimo (60×24) cabe.
    expect(rect).toEqual({ x: 0, y: 0, width: 80, height: 30 });
  });

  it('nem o mínimo cabe na imagem: rect-out-of-image', () => {
    let p = componentProject();
    p = addContainer(p, {
      id: 'I2',
      file: 'images/minuscula.png',
      width: 50,
      height: 50,
    });
    expect(() =>
      componentPlacement(
        p,
        catalog,
        { containerId: 'I2', parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toThrow('rect-out-of-image');
  });

  it('tipo desconhecido, sem componente ou imagem inexistente', () => {
    const p = componentProject();
    const args = { containerId: 'I1', parentId: null, specId: SPEC_ID };
    expect(() =>
      componentPlacement(p, catalog, { ...args, typeId: 'plain' }, approximateMeasurer),
    ).toThrow('unknown-type');
    expect(() =>
      componentPlacement(p, catalog, { ...args, typeId: 'nada' }, approximateMeasurer),
    ).toThrow('unknown-type');
    expect(() =>
      componentPlacement(
        p,
        catalog,
        { ...args, typeId: 'text', containerId: 'X' },
        approximateMeasurer,
      ),
    ).toThrow('not-found');
  });
});

describe('componentPlacement: dentro de um container', () => {
  function withRow(): Project {
    return add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
  }

  it('primeira filha no início do slot; as seguintes à direita, com o gap', () => {
    let p = withRow();
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2')).toEqual({ x: 208, y: 100, width: 100, height: 40 });
    expect(marking(p, 'T2').parentId).toBe('C');
    expectValid(p);
  });

  it('passou do slot: presa dentro do retângulo do container', () => {
    let p = withRow();
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    p = add(p, 'T3', 'text', { parentId: 'C' });
    // Próxima posição: 316 + 100 > 400; presa em x = 300.
    expect(rectOf(p, 'T3')).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expectValid(p);
  });

  it('o padding do slot desloca o início', () => {
    let p = withRow();
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 104, y: 104, width: 100, height: 40 });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2')).toEqual({ x: 212, y: 104, width: 100, height: 40 });
  });

  it('coluna: abaixo da última filha, com o gap', () => {
    let p = add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 50, y: 98, width: 100, height: 40 });
    expectValid(p);
  });

  it('layout none: sempre no início do slot', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 50, y: 50, width: 300, height: 200 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
  });

  it('container menor que o tamanho inicial: encolhe, respeitando o mínimo', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 80, height: 30 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 80, height: 30 });
    expectValid(p);
  });

  it('nem o mínimo cabe no container: rect-outside-parent', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 50, height: 30 },
    });
    expect(() => add(p, 'T1', 'text', { parentId: 'C' })).toThrow('rect-outside-parent');
  });

  it('o pai precisa estar na mesma imagem', () => {
    let p = withRow();
    p = addContainer(p, { id: 'I2', file: 'images/outra.png', width: 500, height: 500 });
    expect(() => add(p, 'T1', 'text', { parentId: 'C', containerId: 'I2' })).toThrow(
      'invalid-parent',
    );
  });
});

describe('addComponentMarking', () => {
  it('cria a marcação e a anotação tipada na camada do tipo, com o preview', () => {
    const p = add(componentProject(), 'M1', 'text', { name: 'Título' });
    const m = marking(p, 'M1');
    expect(m).toMatchObject({
      parentId: null,
      name: 'Título',
      containerId: 'I1',
      needsReview: false,
      locked: false,
    });
    expect(m.rect).toEqual({ x: 450, y: 380, width: 100, height: 40 });
    const annotation = p.annotations.find((a) => a.id === 'A_M1')!;
    expect(annotation.markingId).toBe('M1');
    expect(annotation.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    expect(annotation.layerId).toBe('LS1');
    // preview {label, count, kind}; o resto fica no default do campo.
    expect(annotation.values).toEqual({
      label: 'Preview',
      count: 3,
      kind: 'b',
      when: null,
      target: null,
      items: [],
    });
    expectValid(p);
  });

  it('sem preview os campos ficam nos default', () => {
    const p = add(componentProject(), 'C', 'row');
    expect(p.annotations.find((a) => a.id === 'A_C')?.values).toEqual({
      spacing: 8,
      padding: 0,
    });
  });

  it('values explícitos substituem o preview (sobre os default)', () => {
    const p = add(componentProject(), 'M1', 'text', {
      values: { label: 'Dado', count: 5 },
    });
    const values = p.annotations.find((a) => a.id === 'A_M1')?.values;
    expect(values).toMatchObject({ label: 'Dado', count: 5, kind: 'a' });
  });

  it('values inválidos são recusados com o erro do campo', () => {
    const p = componentProject();
    expect(() => add(p, 'M1', 'text', { values: { nada: 1 } })).toThrow('unknown-field');
    expect(() => add(p, 'M1', 'text', { values: { kind: 'z' } })).toThrow(
      'unknown-option',
    );
    expect(() => add(p, 'M1', 'text', { values: { count: 'x' } })).toThrow(
      'invalid-value',
    );
  });

  it('preview que o campo não aceita fica no default, sem falhar', () => {
    const bad = {
      ...COMPONENTS,
      text: { ...COMPONENTS.text, preview: { label: 'Ok', kind: 'zzz', count: 'x' } },
    };
    const p = add(componentProject(), 'M1', 'text', {}, testCatalog(bad));
    expect(p.annotations.find((a) => a.id === 'A_M1')?.values).toMatchObject({
      label: 'Ok',
      kind: 'a',
      count: null,
    });
  });

  it('retângulo explícito vale em vez da colocação', () => {
    const rect = { x: 10, y: 20, width: 70, height: 30 };
    const p = add(componentProject(), 'M1', 'text', { rect });
    expect(rectOf(p, 'M1')).toEqual(rect);
  });

  it('retângulo explícito: respeita minSize, a imagem e o pai', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(() =>
      add(p, 'M1', 'text', { rect: { x: 10, y: 20, width: 50, height: 30 } }),
    ).toThrow('rect-too-small');
    expect(() =>
      add(p, 'M1', 'text', { rect: { x: 950, y: 20, width: 100, height: 40 } }),
    ).toThrow('rect-out-of-image');
    expect(() =>
      add(p, 'M1', 'text', {
        parentId: 'C',
        rect: { x: 350, y: 120, width: 100, height: 40 },
      }),
    ).toThrow('rect-outside-parent');
    p = add(p, 'M2', 'text', {
      parentId: 'C',
      rect: { x: 120, y: 120, width: 100, height: 40 },
    });
    expect(marking(p, 'M2').parentId).toBe('C');
  });

  it('nível da imagem: não vira filha de quem está por baixo', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 400, y: 300, width: 300, height: 200 },
    });
    p = add(p, 'M1', 'text');
    // O centro da imagem cai dentro de C, mas o pedido foi nível da imagem.
    expect(marking(p, 'M1').parentId).toBeNull();
    expectValid(p);
  });

  it('é uma operação pura: o projeto de entrada não muda', () => {
    const p = componentProject();
    add(p, 'M1', 'text');
    expect(p.markings).toHaveLength(0);
    expect(p.annotations).toHaveLength(0);
  });

  it('recusas: tipo sem componente, catálogo de outra versão, camada ausente, id repetido', () => {
    const p = componentProject();
    expect(() => add(p, 'M1', 'plain')).toThrow('unknown-type');
    expect(() => add(p, 'M1', 'text', {}, EMPTY_CATALOG)).toThrow('unknown-type');
    const stale: ComponentCatalog = new Map([
      [SPEC_ID, { ...catalog.get(SPEC_ID)!, version: 9 }],
    ]);
    expect(() => add(p, 'M1', 'text', {}, stale)).toThrow('unknown-type');
    const noLayer: Project = {
      ...p,
      layers: p.layers.map((l) => (l.spec ? { ...l, spec: null } : l)),
    };
    expect(() => add(noLayer, 'M1', 'text')).toThrow('type-not-in-layer');
    const once = add(p, 'M1', 'text');
    expect(() => add(once, 'M1', 'text')).toThrow('duplicate-id');
    expect(() => add(p, 'M2', 'text', { annotationId: 'A_M2', parentId: 'ZZ' })).toThrow(
      'not-found',
    );
  });
});
