// R3 (#1096, decisões 10 e 11): os pseudo-campos `$anchor.*` no motor (expressões, instância) e os
// padrões do `anchor` da raiz do componente (`componentAnchorDefaults`).
import { describe, expect, it } from 'vitest';
import { componentAnchorDefaults } from '../../../src/model/components/anchor';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  evaluate,
  evaluateBoolean,
  referencedFields,
} from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { walk, type SceneNode } from '../../../src/model/components/scene';

const VALUES: FieldValues = {
  '$anchor.side': 'bottom',
  '$anchor.x': 30,
  '$anchor.y': -12,
  '$anchor.width': 24,
  '$anchor.height': 20,
};

describe('expressões com $anchor.*', () => {
  it('$field, $switch, $eq, $has e as operações aritméticas leem os pseudo-campos', () => {
    expect(evaluate({ $field: '$anchor.x' }, VALUES, 0)).toBe(30);
    expect(evaluate({ $field: '$anchor.y' }, VALUES, 0)).toBe(-12);
    expect(evaluate({ $sub: [{ $field: '$anchor.x' }, 8] } as never, VALUES, 0)).toBe(22);
    expect(evaluate({ $div: [{ $field: '$anchor.width' }, 2] } as never, VALUES, 0)).toBe(
      12,
    );
    expect(
      evaluate(
        { $switch: '$anchor.side', cases: { top: 1, bottom: 2 }, default: 9 },
        VALUES,
        0,
      ),
    ).toBe(2);
    expect(evaluateBoolean({ $eq: ['$anchor.side', 'bottom'] }, VALUES, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $eq: ['$anchor.side', 'top'] }, VALUES, false)).toBe(false);
    expect(evaluateBoolean({ $has: '$anchor.side' }, VALUES, false)).toBe(true);
  });

  it('sem âncora ficam vazios: caem no default do $switch e no padrão do lugar', () => {
    const none: FieldValues = {};
    expect(evaluate({ $field: '$anchor.x', default: 7 }, none, 0)).toBe(7);
    expect(
      evaluate({ $switch: '$anchor.side', cases: { top: 1 }, default: 9 }, none, 0),
    ).toBe(9);
    expect(evaluateBoolean({ $has: '$anchor.side' }, none, true)).toBe(false);
  });

  it('referencedFields não conta os pseudo-campos como campos do tipo', () => {
    const tree = {
      a: { $field: '$anchor.x' },
      b: { $switch: '$anchor.side', cases: {} },
      c: { $eq: ['$anchor.side', 'top'] },
      d: { $has: '$anchor.y' },
      e: { $field: 'titulo' },
    };
    expect([...referencedFields(tree)]).toEqual(['titulo']);
  });
});

/** Um tooltip mínimo: corpo 100 × 40 e a seta (rect 16 × 8) sob o centro da âncora. */
const TOOLTIP = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'tooltip',
  name: 'Tooltip',
  size: { width: 100, height: 48 },
  anchor: { side: 'top', align: 'center', offset: { main: 4, cross: 0 } },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'seta-baixo',
        width: 16,
        height: 8,
        visible: { $eq: ['$anchor.side', 'top'] },
        anchors: { left: { $sub: [{ $field: '$anchor.x' }, 8] }, top: 40 },
        fill: '#000000',
      },
      {
        type: 'rect',
        name: 'seta-cima',
        width: 16,
        height: 8,
        visible: { $eq: ['$anchor.side', 'bottom'] },
        anchors: { left: { $sub: [{ $field: '$anchor.x' }, 8] }, top: 0 },
        fill: '#000000',
      },
      {
        type: 'rect',
        name: 'seta-lado',
        width: 8,
        height: 16,
        visible: {
          $or: [{ $eq: ['$anchor.side', 'start'] }, { $eq: ['$anchor.side', 'end'] }],
        },
        anchors: {
          top: { $sub: [{ $field: '$anchor.y' }, 8] },
          left: { $switch: '$anchor.side', cases: { start: 92, end: 0 }, default: 0 },
        },
        fill: '#000000',
      },
      { type: 'rect', name: 'corpo', width: 100, height: 40, fill: '#ffffff' },
    ],
  },
};

function tooltip(): ComponentFile {
  const parsed = parseComponent(TOOLTIP);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
}

function drawn(anchor?: {
  side: 'top' | 'bottom' | 'start' | 'end';
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}) {
  const { root, warnings } = instantiate(
    tooltip(),
    {},
    { x: 0, y: 0, width: 100, height: 48 },
    { measure: approximateMeasurer, ...(anchor === undefined ? {} : { anchor }) },
  );
  const byName = (name: string): SceneNode | undefined =>
    [...walk(root)].find((n) => n.name === name && n.visible);
  return { byName, warnings };
}

const at = (n: SceneNode | undefined): [number, number] | undefined =>
  n === undefined ? undefined : [n.transform[4], n.transform[5]];

describe('instância com a opção anchor (tooltip de teste)', () => {
  it('a seta muda de lado e de posição quando o side muda', () => {
    const top = drawn({ side: 'top', centerX: 50, centerY: 70, width: 20, height: 20 });
    expect(at(top.byName('seta-baixo'))).toEqual([42, 40]);
    expect(top.byName('seta-cima')).toBeUndefined();

    const bottom = drawn({
      side: 'bottom',
      centerX: 30,
      centerY: -20,
      width: 20,
      height: 20,
    });
    expect(at(bottom.byName('seta-cima'))).toEqual([22, 0]);
    expect(bottom.byName('seta-baixo')).toBeUndefined();

    const end = drawn({ side: 'end', centerX: -20, centerY: 24, width: 20, height: 20 });
    expect(at(end.byName('seta-lado'))).toEqual([0, 16]);
    const start = drawn({
      side: 'start',
      centerX: 120,
      centerY: 10,
      width: 20,
      height: 20,
    });
    expect(at(start.byName('seta-lado'))).toEqual([92, 2]);
  });

  it('x e y podem ser negativos ou passar da caixa', () => {
    const far = drawn({ side: 'top', centerX: 300, centerY: 0, width: 20, height: 20 });
    expect(at(far.byName('seta-baixo'))?.[0]).toBe(292);
  });

  it('sem âncora, os pseudo-campos ficam vazios: nenhuma seta, nenhum aviso', () => {
    const none = drawn();
    expect(none.byName('seta-baixo')).toBeUndefined();
    expect(none.byName('seta-cima')).toBeUndefined();
    expect(none.byName('seta-lado')).toBeUndefined();
    expect(none.byName('corpo')).toBeDefined();
    expect(none.warnings).toEqual([]);
  });

  it('o tipo não declara os pseudo-campos: um campo de mesmo nome nos valores é sombreado', () => {
    const { root } = instantiate(
      tooltip(),
      { '$anchor.side': 'top', '$anchor.x': 99 },
      { x: 0, y: 0, width: 100, height: 48 },
      { measure: approximateMeasurer },
    );
    expect([...walk(root)].some((n) => n.name === 'seta-baixo' && n.visible)).toBe(false);
  });

  it('measureComponent lê a mesma âncora (largura hug pela âncora)', () => {
    const c = parseComponent({
      ...TOOLTIP,
      template: {
        type: 'frame',
        layout: { type: 'row' },
        children: [{ type: 'rect', width: { $field: '$anchor.width' }, height: 10 }],
      },
    });
    if (!c.ok) throw new Error(c.errors.join('\n'));
    const anchor = {
      side: 'top' as const,
      centerX: 0,
      centerY: 0,
      width: 50,
      height: 10,
    };
    const measure = (withAnchor: boolean) =>
      measureComponent(
        c.component,
        {},
        { width: null, height: null },
        { measure: approximateMeasurer, ...(withAnchor ? { anchor } : {}) },
      );
    expect(measure(true).width).toBe(50);
    expect(measure(false).width).toBe(0);
  });
});

describe('componentAnchorDefaults', () => {
  const base = (anchor?: unknown): ComponentFile =>
    ({ ...tooltip(), anchor }) as ComponentFile;

  it('sem anchor na raiz: top, center e 0', () => {
    const { anchor, ...rest } = tooltip() as ComponentFile & { anchor?: unknown };
    void anchor;
    expect(componentAnchorDefaults(rest as ComponentFile, 2)).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 0, cross: 0 },
    });
  });

  it('o offset do componente (unidades) vira pixels pela densidade', () => {
    expect(componentAnchorDefaults(tooltip(), 1)).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 4, cross: 0 },
    });
    expect(componentAnchorDefaults(tooltip(), 2.5).offset).toEqual({
      main: 10,
      cross: 0,
    });
  });

  it('campos ausentes valem os padrões', () => {
    expect(
      componentAnchorDefaults(base({ side: 'end', offset: { cross: -2 } }), 2),
    ).toEqual({ side: 'end', align: 'center', offset: { main: 0, cross: -4 } });
    expect(componentAnchorDefaults(base({}), 1)).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 0, cross: 0 },
    });
  });
});
