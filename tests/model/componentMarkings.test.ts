import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  applySpecialization,
  addComponentMarking,
  addContainer,
  componentPlacement,
  componentSize,
  moveContainer,
  componentTypes,
  placementFitsSlot,
  setContainerDrawingMode,
  setFieldValue,
  settleHierarchy,
  approximateMeasurer,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_ID,
  componentProject,
  reversedContainer,
  testCatalog,
  tokenSlotCatalog,
  wrappedContainer,
} from './componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { expectValid, emptyProject, marking } from './fixtures';
import { catalog as m3Catalog, spec as m3Spec } from '../support/material3Adoption';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from './notesFixtures';

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

  it('passou do slot: no lugar livre mais perto, dentro do container', () => {
    let p = withRow();
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    p = add(p, 'T3', 'text', { parentId: 'C' });
    // Próxima posição: 316 + 100 > 400. Antes ficava presa em x = 300, em cima da T2 (sobreposta);
    // agora vai ao lugar livre mais perto, embaixo dela (148 = 100 + 40 + 8), ainda dentro do container.
    expect(rectOf(p, 'T3')).toEqual({ x: 300, y: 148, width: 100, height: 40 });
    expect(marking(p, 'T3').parentId).toBe('C');
    expectValid(p);
  });

  it('passou do slot e o container está cheio: presa dentro dele, sem erro', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 40 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    p = add(p, 'T3', 'text', { parentId: 'C' });
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

  it('layout.reverse em linha: a primeira filha no fim do slot, as seguintes à esquerda da última (FX3)', () => {
    const reverse = testCatalog({
      ...COMPONENTS,
      row: reversedContainer('row', 'row', { width: 300, height: 100 }),
    });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 300, height: 100 } },
      reverse,
    );
    p = add(p, 'T1', 'text', { parentId: 'C' }, reverse);
    p = add(p, 'T2', 'text', { parentId: 'C' }, reverse);
    expect(rectOf(p, 'T1')).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 192, y: 100, width: 100, height: 40 });
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T3', 'text', { parentId: 'C' }, reverse);
    expect(rectOf(p, 'T3').x).toBeGreaterThanOrEqual(100);
    expectValid(p);
  });

  it('layout.reverse em coluna: a primeira filha no fim do slot, as seguintes acima da última (FX3)', () => {
    const reverse = testCatalog({
      ...COMPONENTS,
      column: reversedContainer('column', 'column', { width: 300, height: 300 }),
    });
    let p = add(
      componentProject(),
      'C',
      'column',
      { rect: { x: 50, y: 50, width: 300, height: 300 } },
      reverse,
    );
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T1', 'text', { parentId: 'C' }, reverse);
    p = add(p, 'T2', 'text', { parentId: 'C' }, reverse);
    // O slot acaba em y = 350; com o padding de 4 a primeira filha termina em 346.
    expect(rectOf(p, 'T1')).toEqual({ x: 54, y: 306, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 54, y: 258, width: 100, height: 40 });
    expectValid(p);
  });

  it('gap e padding do slot em $token valem os da tabela do modo do desenho (#948)', () => {
    const tokens = tokenSlotCatalog();
    let p = add(
      componentProject(),
      'C',
      'column',
      { rect: { x: 50, y: 50, width: 300, height: 300 } },
      tokens,
    );
    p = add(p, 'T1', 'text', { parentId: 'C' }, tokens);
    p = add(p, 'T2', 'text', { parentId: 'C' }, tokens);
    // Primeiro modo: padding 10, gap 4.
    expect(rectOf(p, 'T1')).toEqual({ x: 60, y: 60, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 60, y: 104, width: 100, height: 40 });
    // O container no modo `dark`: padding 20, gap 12.
    let dark = setContainerDrawingMode(
      add(
        componentProject(),
        'C',
        'column',
        { rect: { x: 50, y: 50, width: 300, height: 300 } },
        tokens,
      ),
      'I1',
      'dark',
    );
    dark = add(dark, 'T1', 'text', { parentId: 'C' }, tokens);
    dark = add(dark, 'T2', 'text', { parentId: 'C' }, tokens);
    expect(rectOf(dark, 'T1')).toEqual({ x: 70, y: 70, width: 100, height: 40 });
    expect(rectOf(dark, 'T2')).toEqual({ x: 70, y: 122, width: 100, height: 40 });
  });

  it('layout none: a primeira no início do slot; a segunda, ao lado, sem coincidir', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 50, y: 50, width: 300, height: 200 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    // O início do slot já está ocupado pela T1: o lugar livre mais perto é logo abaixo (50 + 40 + 8).
    expect(rectOf(p, 'T2')).toEqual({ x: 50, y: 98, width: 100, height: 40 });
    expect(marking(p, 'T2').parentId).toBe('C');
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

  it('values parciais: os campos ausentes começam com o preview, os informados vencem', () => {
    const p = add(componentProject(), 'M1', 'text', {
      values: { label: 'Dado', count: 5 },
    });
    const values = p.annotations.find((a) => a.id === 'A_M1')?.values;
    // preview {label: 'Preview', count: 3, kind: 'b'}: o `kind` ausente vem do preview, não do default 'a'.
    expect(values).toMatchObject({ label: 'Dado', count: 5, kind: 'b' });
  });

  it('values parciais: table e ref continuam no default', () => {
    const p = add(componentProject(), 'M1', 'text', { values: { count: 5 } });
    expect(p.annotations.find((a) => a.id === 'A_M1')?.values).toMatchObject({
      label: 'Preview',
      count: 5,
      target: null,
      items: [],
    });
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

  it('o pai gravado é o que a geometria dá, nunca o pedido', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 400, y: 300, width: 300, height: 200 },
    });
    // Sem pai pedido, mas o centro da imagem cai dentro de C: C é o pai.
    p = add(p, 'M1', 'text');
    expect(marking(p, 'M1').parentId).toBe('C');
    // Pedido C como alvo do posicionamento; a instância cai dentro de D (dentro de C): D é o pai.
    p = add(p, 'D', 'box', { rect: { x: 420, y: 320, width: 100, height: 100 } });
    expect(marking(p, 'D').parentId).toBe('C');
    p = add(p, 'M2', 'text', {
      parentId: 'C',
      rect: { x: 430, y: 330, width: 60, height: 30 },
    });
    expect(marking(p, 'M2').parentId).toBe('D');
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

describe('no canvas (containerId nulo)', () => {
  const place = (args: Partial<Parameters<typeof componentPlacement>[2]> = {}) =>
    componentPlacement(
      componentProject(),
      catalog,
      { containerId: null, parentId: null, specId: SPEC_ID, typeId: 'text', ...args },
      approximateMeasurer,
    );

  it('sem centro: o size do componente em unidades do canvas, centrado em (0, 0)', () => {
    // O container I1 ocupa (0, 0) no canvas: o centro pedido está coberto, então a peça vai ao
    // lugar livre mais perto, logo acima dele (-8 − 40 = -48).
    expect(place()).toEqual({ x: -50, y: -48, width: 100, height: 40 });
    const away = moveContainer(componentProject(), 'I1', 5000, 5000);
    expect(
      componentPlacement(
        away,
        catalog,
        { containerId: null, parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toEqual({ x: -50, y: -20, width: 100, height: 40 });
  });

  it('centrada no ponto pedido, com coordenadas inteiras e sem limite nenhum', () => {
    expect(place({ center: { x: 5000.5, y: -3000.4 } })).toEqual({
      x: 4951,
      y: -3020,
      width: 100,
      height: 40,
    });
    expect(place({ center: { x: -90000, y: 90000 } })).toEqual({
      x: -90050,
      y: 89980,
      width: 100,
      height: 40,
    });
  });

  it('tipo sem componente continua recusado no canvas', () => {
    expect(() => place({ typeId: 'plain' })).toThrow('unknown-type');
  });

  it('cria a marcação do canvas com a anotação tipada, sem container nem pai', () => {
    const p = add(componentProject(), 'M1', 'text', {
      containerId: null,
      center: { x: -3000, y: 500 },
      name: 'Solta',
    });
    expect(marking(p, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: false,
      name: 'Solta',
      rect: { x: -3050, y: 480, width: 100, height: 40 },
    });
    const annotation = p.annotations.find((a) => a.id === 'A_M1')!;
    expect(annotation.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    expectValid(p);
  });

  it('o tamanho inicial vale mesmo onde um container não o comportaria', () => {
    const p = addContainer(componentProject(), {
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
    const q = add(p, 'M1', 'text', { containerId: null, center: { x: 0, y: -500 } });
    expect(rectOf(q, 'M1')).toEqual({ x: -50, y: -520, width: 100, height: 40 });
    expectValid(q);
  });

  it('caiu inteira dentro de um container: o assentar a faz marcação dele, convertida', () => {
    // Com `rect` explícito (sem `rect`, a colocação desvia do container, que é obstáculo no canvas).
    const p = add(componentProject(), 'M1', 'text', {
      containerId: null,
      rect: { x: 150, y: 280, width: 100, height: 40 },
    });
    // Container I1 em (0,0) na escala 1: o retângulo do canvas vira o mesmo em pixels dele.
    expect(marking(p, 'M1')).toMatchObject({
      containerId: 'I1',
      rect: { x: 150, y: 280, width: 100, height: 40 },
    });
    expectValid(p);
  });

  it('dentro de um componente com slot do canvas: posiciona no slot e grava o pai assentado', () => {
    let p = add(componentProject(), 'C', 'row', {
      containerId: null,
      rect: { x: -2000, y: 100, width: 300, height: 100 },
    });
    expect(marking(p, 'C').containerId).toBeNull();
    p = add(p, 'T1', 'text', { containerId: null, parentId: 'C' });
    p = add(p, 'T2', 'text', { containerId: null, parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: -2000, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: -1892, y: 100, width: 100, height: 40 });
    expect(marking(p, 'T2')).toMatchObject({ containerId: null, parentId: 'C' });
    expectValid(p);
  });

  it('o pai alvo precisa ser do mesmo espaço', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(() => add(p, 'T1', 'text', { containerId: null, parentId: 'C' })).toThrow(
      'invalid-parent',
    );
  });
});

describe('tipo flutuante (biblioteca de notas)', () => {
  const notes = notesCatalog();
  const addNote = (
    p: Project,
    id: string,
    extra: Partial<NewComponentArgs> = {},
  ): Project =>
    addComponentMarking(
      p,
      notes,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: null,
        parentId: null,
        specId: NOTES_SPEC_ID,
        typeId: 'nota',
        ...extra,
      },
      approximateMeasurer,
    );

  it('componentTypes expõe floating', () => {
    const types = componentTypes(notesProject(), notes);
    expect(types.map((t) => [t.typeId, t.floating])).toEqual([
      ['nota', true],
      ['tabela', true],
    ]);
    expect(componentTypes(componentProject(), catalog).every((t) => !t.floating)).toBe(
      true,
    );
  });

  it('cria a marcação flutuante no canvas, centrada em center, com o preview', () => {
    const p = addNote(notesProject(), 'N1', { center: { x: 3000, y: 500 } });
    const m = marking(p, 'N1');
    expect(m).toMatchObject({ floating: true, containerId: null, parentId: null });
    // Tamanho do componente da nota: 240 x 120, centrado em (3000, 500).
    expect(m.rect).toEqual({ x: 2880, y: 440, width: 240, height: 120 });
    const annotation = p.annotations.find((a) => a.id === 'A_N1')!;
    expect(annotation.type).toEqual({ specId: NOTES_SPEC_ID, typeId: 'nota' });
    expect(annotation.layerId).toBe(p.layers.find((l) => l.spec !== null)?.id);
    expect(annotation.values).toMatchObject({
      titulo: 'Título',
      texto: 'Escreva aqui o comentário.',
    });
    expectValid(p);
  });

  it('com containerId ou parentId falha com invalid-space', () => {
    const base = notesProject();
    expect(() => addNote(base, 'N1', { containerId: 'I1' })).toThrow('invalid-space');
    const withNote = addNote(base, 'N1');
    expect(() => addNote(withNote, 'N2', { parentId: 'N1' })).toThrow('invalid-space');
  });

  it('criada sobre um container, não vira filha e settleHierarchy a deixa em paz', () => {
    const base = addContainer(notesProject(), {
      id: 'I2',
      file: 'images/outra.png',
      width: 500,
      height: 500,
    });
    const container = base.containers.find((c) => c.id === 'I1')!;
    const center = {
      x: container.placement.x + 200,
      y: container.placement.y + 200,
    };
    const p = addNote(base, 'N1', { center });
    expect(marking(p, 'N1')).toMatchObject({
      floating: true,
      containerId: null,
      parentId: null,
    });
    expect(settleHierarchy(p)).toBe(p);
  });
});

describe('componentPlacement: tamanho opcional (size)', () => {
  const column = (): Project =>
    add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
  const place = (p: Project, size?: { width: number; height: number }): Rect =>
    componentPlacement(
      p,
      catalog,
      {
        containerId: 'I1',
        parentId: 'C',
        specId: SPEC_ID,
        typeId: 'text',
        ...(size === undefined ? {} : { size }),
      },
      approximateMeasurer,
    );

  it('substitui o size do componente e a posição continua vindo do slot', () => {
    let p = column();
    expect(place(p, { width: 200, height: 60 })).toEqual({
      x: 50,
      y: 50,
      width: 200,
      height: 60,
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    // Depois da última filha (50 + 40) e do gap de 8.
    expect(place(p, { width: 200, height: 60 })).toEqual({
      x: 50,
      y: 98,
      width: 200,
      height: 60,
    });
  });

  it('sem size, igual ao size do componente', () => {
    const p = column();
    expect(place(p)).toEqual({ x: 50, y: 50, width: 100, height: 40 });
  });

  it('preso à área do slot', () => {
    expect(place(column(), { width: 900, height: 900 })).toEqual({
      x: 50,
      y: 50,
      width: 300,
      height: 300,
    });
  });

  it('nunca abaixo do minSize do componente', () => {
    const rect = place(column(), { width: 1, height: 1 });
    const min = catalog.get(SPEC_ID)!.byType.get('text')!.minSize;
    expect(rect.width).toBeGreaterThanOrEqual(min?.width ?? 1);
    expect(rect.height).toBeGreaterThanOrEqual(min?.height ?? 1);
  });

  it('nem o mínimo cabe no slot: rect-outside-parent', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 50, height: 30 },
    });
    expect(() =>
      componentPlacement(
        p,
        catalog,
        {
          containerId: 'I1',
          parentId: 'C',
          specId: SPEC_ID,
          typeId: 'text',
          size: { width: 10, height: 10 },
        },
        approximateMeasurer,
      ),
    ).toThrow('rect-outside-parent');
  });
});

describe('placementFitsSlot', () => {
  const fits = (p: Project, rect: Rect): boolean =>
    placementFitsSlot(p, catalog, 'C', rect, approximateMeasurer);

  it('slot livre: o retângulo calculado cabe', () => {
    const p = add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(fits(p, rect)).toBe(true);
  });

  it('slot cheio: a filha presa ao componente não cabe na área do slot', () => {
    // O slot de `inset` fica 20 px para dentro do componente: x de 120 a 380, y de 120 a 160.
    let p = add(componentProject(), 'C', 'inset', {
      rect: { x: 100, y: 100, width: 300, height: 80 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    // 120 + 100 + 8 + 100 + 8 = 336; 336 + 100 passa de 380: presa ao componente (x = 300).
    expect(rect).toEqual({ x: 300, y: 120, width: 100, height: 40 });
    expect(fits(p, rect)).toBe(false);
  });

  it('slot cheio do tamanho do componente: presa dentro dele, mas em cima da última filha', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 40 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(rect).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expect(fits(p, rect)).toBe(false);
  });

  it('alvo sem slot: não cabe', () => {
    const p = add(componentProject(), 'C', 'text', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(fits(p, { x: 100, y: 100, width: 10, height: 10 })).toBe(false);
  });
});

describe('a instância nova nasce no tamanho medido (MC3, decisão 16 da #898)', () => {
  const fcat = fitCatalog();
  const args = (
    typeId: string,
    extra: Partial<NewComponentArgs> = {},
  ): NewComponentArgs => ({
    markingId: 'B',
    annotationId: 'A_B',
    containerId: 'I1',
    parentId: null,
    specId: FIT_SPEC_ID,
    typeId,
    ...extra,
  });
  const create = (typeId: string, extra: Partial<NewComponentArgs> = {}) =>
    addComponentMarking(fitProject(), fcat, args(typeId, extra), approximateMeasurer);

  it('sem rect, o eixo hug vale a altura do rótulo dado; a largura e o centro ficam', () => {
    const rect = marking(
      create('fit-button', { values: { label: LONG_LABEL } }),
      'B',
    ).rect;
    expect(rect.width).toBe(120);
    expect(rect.height).toBeGreaterThanOrEqual(76);
    expect((rect.height - 16) % 20).toBe(0);
    // Centrado na imagem de 1000 × 800 com o tamanho medido.
    expect(rect.x).toBe(500 - 60);
    expect(rect.y).toBe(Math.round(400 - rect.height / 2));
  });

  it('o rótulo que cabe dá o tamanho de sempre (o minSize vale)', () => {
    const rect = marking(create('fit-button', { values: { label: 'Ok' } }), 'B').rect;
    expect(rect).toMatchObject({ width: 120, height: 40 });
  });

  it('sem values mede o default do campo; componente sem eixo ajustável não muda', () => {
    expect(marking(create('fit-button'), 'B').rect).toMatchObject({
      width: 120,
      height: 40,
    });
    expect(marking(create('fit-plain'), 'B').rect).toMatchObject({
      width: 120,
      height: 40,
    });
  });

  it('o rect dado manda, sem medir', () => {
    const given = { x: 10, y: 20, width: 120, height: 40 };
    const p = create('fit-button', { values: { label: LONG_LABEL }, rect: given });
    expect(marking(p, 'B').rect).toEqual(given);
  });

  it('o sizing por expressão também: o campo que liga o px vale na criação', () => {
    const rect = marking(create('fit-px', { values: { tall: 'sim' } }), 'B').rect;
    expect(rect.height).toBe(80);
  });

  it('componentPlacement e componentSize medem com os values dados', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: FIT_SPEC_ID,
      typeId: 'fit-button',
    };
    const values = { label: LONG_LABEL };
    const size = componentSize(
      fitProject(),
      fcat,
      { ...base, values },
      approximateMeasurer,
    );
    expect(size.height).toBeGreaterThanOrEqual(76);
    const rect = componentPlacement(
      fitProject(),
      fcat,
      { ...base, values },
      approximateMeasurer,
    );
    expect({ width: rect.width, height: rect.height }).toEqual(size);
    // Sem values, o tamanho do componente (o rótulo é o default, curto).
    expect(componentSize(fitProject(), fcat, base, approximateMeasurer)).toEqual({
      width: 120,
      height: 40,
    });
  });

  it('com values de um valor que o campo recusa, mede sem ele (a criação falha como antes)', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: FIT_SPEC_ID,
      typeId: 'fit-button',
    };
    const size = componentSize(
      fitProject(),
      fcat,
      { ...base, values: { label: 5 as never, inexistente: 'x' } },
      approximateMeasurer,
    );
    expect(size).toEqual({ width: 120, height: 40 });
  });
});

describe('componentPlacement: filha nova num slot com wrap (MC4, decisão 12)', () => {
  const wrapped = (wrap: Record<string, unknown>) =>
    testCatalog({
      ...COMPONENTS,
      row: wrappedContainer('row', 'row', { width: 320, height: 100 }, wrap),
    });

  it('entra depois da última na mesma linha enquanto cabe e na linha seguinte quando não cabe', () => {
    const cat = wrapped({ wrap: 'wrap', lineGap: 12 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      p = add(p, id, 'text', { parentId: 'C' }, cat);
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 208, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 316, y: 100, width: 100, height: 40 });
    // 316 + 100 + 8 + 100 > 420: a quarta vai para o começo da linha seguinte.
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 152, width: 100, height: 40 });
    expectValid(p);
  });

  it('maxPerLine quebra a linha antes de o espaço acabar', () => {
    const cat = wrapped({ wrap: 'wrap', maxPerLine: 2 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3']) p = add(p, id, 'text', { parentId: 'C' }, cat);
    expect(rectOf(p, 'T3')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
  });

  it('maxLines: a filha que abriria uma linha além do limite não abre a linha seguinte', () => {
    const cat = wrapped({ wrap: 'wrap', maxLines: 1 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      p = add(p, id, 'text', { parentId: 'C' }, cat);
    // Sem a linha nova (y 140), a filha cai no fluxo de uma linha só e o lugar livre a leva adiante.
    expect(rectOf(p, 'T4').y).not.toBe(140);
  });

  it('sem wrap, a filha segue à direita da última (o comportamento de hoje)', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 320, height: 100 },
    });
    for (const id of ['T1', 'T2']) p = add(p, id, 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2').x).toBe(208);
  });
});

describe('top-app-bar da Material 3 nasce com a altura do estilo (TB1, decisão 1 da #1335)', () => {
  const m3 = (): Project => {
    let n = 0;
    const p = applySpecialization(emptyProject(), m3Spec, {
      newId: () => `TB${++n}`,
      packageSpecName: 'material3-compose.spec.json',
    });
    return addContainer(p, { id: 'I1', file: null, width: 360, height: 800 } as never);
  };
  const create = (values?: NewComponentArgs['values']): Project =>
    addComponentMarking(
      m3(),
      m3Catalog,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: m3Spec.id,
        typeId: 'top-app-bar',
        ...(values ? { values } : {}),
      },
      approximateMeasurer,
    );

  it.each([
    ['small', 64],
    ['medium', 112],
    ['large', 152],
  ])(
    'sem rect, o estilo %s nasce com altura %i e a largura presa aos 360 do container',
    (style, height) => {
      const rect = rectOf(create({ style }), 'B');
      expect(rect.height).toBe(height);
      expect(rect.width).toBe(360);
    },
  );

  it('sem values, o estilo padrão (small) dá 64', () => {
    expect(rectOf(create(), 'B').height).toBe(64);
  });

  it('componentSize e componentPlacement dão a mesma altura do estilo', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: m3Spec.id,
      typeId: 'top-app-bar',
      values: { style: 'medium' },
    };
    const size = componentSize(m3(), m3Catalog, base, approximateMeasurer);
    const rect = componentPlacement(m3(), m3Catalog, base, approximateMeasurer);
    expect(size.height).toBe(112);
    expect({ width: rect.width, height: rect.height }).toEqual(size);
  });

  it('com rect explícito, o rect manda', () => {
    const given = { x: 0, y: 0, width: 360, height: 90 };
    const p = addComponentMarking(
      m3(),
      m3Catalog,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: m3Spec.id,
        typeId: 'top-app-bar',
        rect: given,
      },
      approximateMeasurer,
    );
    expect(rectOf(p, 'B')).toEqual(given);
  });
});
