// Laboratório Componentes: instanciação do template numa caixa (layout, estilo e avisos).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  normalizePadding,
  type Box,
} from '../../../src/model/components/instantiate';
import {
  walk,
  type FrameNode,
  type PathNode,
  type SceneNode,
  type TextNode,
} from '../../../src/model/components/scene';

type Values = FieldValues;

const FONT = {
  family: 'Inter',
  size: 14,
  weight: 600,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};

function component(template: FrameTemplate): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'test',
    name: 'Teste',
    size: { width: 100, height: 40 },
    template,
  };
}

function run(template: FrameTemplate, values: Values, box: Box, idPrefix?: string) {
  return instantiate(component(template), values, box, {
    measure: approximateMeasurer,
    ...(idPrefix ? { idPrefix } : {}),
  });
}

function child(node: SceneNode, index: number): SceneNode {
  if (node.type !== 'frame') throw new Error('não é um quadro');
  const found = node.children[index];
  if (!found) throw new Error(`sem filho ${index}`);
  return found;
}

function tx(node: SceneNode): number {
  return node.transform[4];
}
function ty(node: SceneNode): number {
  return node.transform[5];
}

const ICON_D = 'M0 0 L10 10';

const button: FrameTemplate = {
  type: 'frame',
  name: 'button',
  layout: { type: 'row', padding: [0, 16], gap: 8, align: 'center', justify: 'center' },
  cornerRadius: 10,
  fill: {
    $switch: 'variant',
    cases: { primary: '#2563eb', secondary: '#e5e7eb' },
    default: '#2563eb',
  },
  children: [
    {
      type: 'path',
      name: 'icon',
      d: ICON_D,
      viewBox: [10, 10],
      width: 16,
      height: 16,
      visible: { $field: 'icon' },
      stroke: { color: '#ffffff', width: 2 },
    },
    {
      type: 'text',
      name: 'label',
      text: { $field: 'label' },
      font: { size: 14, weight: 600 },
      color: {
        $switch: 'variant',
        cases: { primary: '#ffffff', secondary: '#111827' },
        default: '#ffffff',
      },
    },
  ],
};

const BOX: Box = { x: 10, y: 20, width: 120, height: 40 };
const labelWidth = approximateMeasurer('Salvar', FONT).width;
const labelHeight = approximateMeasurer('Salvar', FONT).height;

describe('instantiate: botão', () => {
  it('a raiz ocupa a caixa dada', () => {
    const { root } = run(
      button,
      { label: 'Salvar', variant: 'primary', icon: 'não' },
      BOX,
    );
    expect(root.type).toBe('frame');
    expect(root.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(root.width).toBe(120);
    expect(root.height).toBe(40);
    expect(root.clip).toBe(true);
    expect(root.cornerRadius).toBe(10);
  });

  it('sem ícone, só o texto existe e fica centralizado', () => {
    const { root, warnings } = run(
      button,
      { label: 'Salvar', variant: 'primary', icon: 'não' },
      BOX,
    );
    expect(warnings).toEqual([]);
    expect(root.children).toHaveLength(1);
    const text = child(root, 0) as TextNode;
    expect(text.type).toBe('text');
    expect(text.text).toBe('Salvar');
    expect(tx(text)).toBeCloseTo((BOX.width - labelWidth) / 2, 0);
    expect(ty(text)).toBeCloseTo((BOX.height - labelHeight) / 2, 5);
    expect(text.width).toBeCloseTo(labelWidth, 5);
    expect(text.height).toBeCloseTo(labelHeight, 5);
    expect(text.style.fontWeight).toBe(600);
    expect(text.style.lineHeight).toBeCloseTo(16.8, 5);
  });

  it('com ícone, o ícone fica à esquerda com 8px de espaço e o grupo é centralizado', () => {
    const { root } = run(
      button,
      { label: 'Salvar', variant: 'primary', icon: 'sim' },
      BOX,
    );
    expect(root.children).toHaveLength(2);
    const icon = child(root, 0) as PathNode;
    const text = child(root, 1) as TextNode;
    const group = 16 + 8 + labelWidth;
    expect(tx(icon)).toBeCloseTo((BOX.width - group) / 2, 5);
    expect(tx(text) - (tx(icon) + 16)).toBeCloseTo(8, 5);
    expect(ty(icon)).toBeCloseTo((BOX.height - 16) / 2, 5);
    expect(ty(text)).toBeCloseTo((BOX.height - labelHeight) / 2, 5);
  });

  it('o caminho escala a viewBox para a caixa de 16x16 e corrige a espessura do traço', () => {
    const { root, warnings } = run(
      button,
      { label: 'Salvar', variant: 'primary', icon: 'sim' },
      BOX,
    );
    const icon = child(root, 0) as PathNode;
    expect(icon.type).toBe('path');
    expect(icon.d).toBe(ICON_D);
    expect(icon.width).toBe(10);
    expect(icon.height).toBe(10);
    expect(icon.transform[0]).toBeCloseTo(1.6, 5);
    expect(icon.transform[1]).toBe(0);
    expect(icon.transform[2]).toBe(0);
    expect(icon.transform[3]).toBeCloseTo(1.6, 5);
    expect(icon.stroke?.align).toBe('center');
    expect(icon.stroke?.width).toBeCloseTo(2 / 1.6, 5);
    expect(warnings).toEqual([]);
  });

  it('a variante troca as cores', () => {
    const primary = run(
      button,
      { label: 'A', variant: 'primary', icon: 'não' },
      BOX,
    ).root;
    const secondary = run(
      button,
      { label: 'A', variant: 'secondary', icon: 'não' },
      BOX,
    ).root;
    expect(primary.fills).toEqual([{ type: 'solid', color: '#2563eb' }]);
    expect(secondary.fills).toEqual([{ type: 'solid', color: '#e5e7eb' }]);
    expect((child(secondary, 0) as TextNode).fills).toEqual([
      { type: 'solid', color: '#111827' },
    ]);
  });

  it('campo vazio vale falso em visible e o ícone some', () => {
    const { root } = run(button, { label: 'A', variant: 'primary', icon: '' }, BOX);
    expect(root.children).toHaveLength(1);
  });

  it('visible com $has esconde o nó quando o campo está vazio; $field esconde com "não"', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'row' },
      children: [
        { type: 'rect', name: 'has', width: 5, height: 5, visible: { $has: 'label' } },
        { type: 'rect', name: 'flag', width: 5, height: 5, visible: { $field: 'icon' } },
        {
          type: 'rect',
          name: 'not',
          width: 5,
          height: 5,
          visible: { $not: { $has: 'label' } },
        },
      ],
    };
    const names = (values: Values) =>
      run(tpl, values, { x: 0, y: 0, width: 50, height: 10 }).root.children.map(
        (n) => n.name,
      );
    expect(names({ label: 'x', icon: 'sim' })).toEqual(['has', 'flag']);
    expect(names({ label: '', icon: 'não' })).toEqual(['not']);
    expect(names({ label: '  ', icon: '' })).toEqual(['not']);
  });

  it('avisa uma vez de cada campo não informado', () => {
    const { warnings } = run(button, { label: 'A' }, BOX);
    expect(warnings).toContain('campo não informado: variant');
    expect(warnings).toContain('campo não informado: icon');
    expect(warnings.filter((w) => w === 'campo não informado: variant')).toHaveLength(1);
    expect(warnings).not.toContain('campo não informado: label');
  });
});

describe('instantiate: cartão', () => {
  const longTitle = 'Um título bem comprido que precisa quebrar em várias linhas';
  const card: FrameTemplate = {
    type: 'frame',
    name: 'card',
    layout: { type: 'column', padding: 16, gap: 8 },
    fill: '#ffffff',
    children: [
      { type: 'text', name: 'title', text: { $field: 'title' }, width: 'fill' },
      { type: 'rect', name: 'divider', height: 1, width: 'fill', fill: '#cccccc' },
      {
        type: 'frame',
        name: 'actions',
        height: 'hug',
        layout: { type: 'row', gap: 8, justify: 'space-between' },
        children: [
          { type: 'frame', name: 'a', width: 'fill', height: 36, fill: '#111111' },
          { type: 'frame', name: 'b', width: 'fill', height: 36, fill: '#222222' },
        ],
      },
    ],
  };

  it('o divisor ocupa a largura útil e os dois botões dividem a linha', () => {
    const { root, warnings } = run(
      card,
      { title: 'Título' },
      {
        x: 0,
        y: 0,
        width: 300,
        height: 200,
      },
    );
    expect(warnings).toEqual([]);
    const title = child(root, 0) as TextNode;
    const divider = child(root, 1);
    const actions = child(root, 2) as FrameNode;
    expect(divider.width).toBe(268);
    expect(tx(divider)).toBe(16);
    expect(title.width).toBe(268);
    expect(title.height).toBeCloseTo(16.8, 5);
    expect(ty(divider)).toBeCloseTo(16 + 16.8 + 8, 5);
    expect(divider.height).toBe(1);
    expect(actions.width).toBe(268);
    expect(actions.height).toBe(36);
    expect(ty(actions)).toBeCloseTo(16 + 16.8 + 8 + 1 + 8, 5);
    const a = child(actions, 0);
    const b = child(actions, 1);
    expect(a.width).toBe((268 - 8) / 2);
    expect(b.width).toBe((268 - 8) / 2);
    expect(tx(b)).toBe(a.width + 8);
  });

  it('o título com largura fixa quebra e a altura vem da medição com quebra', () => {
    const { root } = run(
      card,
      { title: longTitle },
      { x: 0, y: 0, width: 150, height: 300 },
    );
    const title = child(root, 0) as TextNode;
    const expected = approximateMeasurer(
      longTitle,
      { ...FONT, weight: 400 },
      150 - 32,
    ).height;
    expect(expected).toBeGreaterThan(16.8 * 2);
    expect(title.height).toBeCloseTo(expected, 5);
    const divider = child(root, 1);
    expect(ty(divider)).toBeCloseTo(16 + expected + 8, 5);
  });

  it('avisa quando a caixa é menor que o conteúdo', () => {
    const { warnings } = run(
      card,
      { title: 'Título' },
      { x: 0, y: 0, width: 300, height: 40 },
    );
    expect(warnings).toContain('conteúdo maior que a caixa: card');
  });

  it('space-between com dois filhos de largura fixa os afasta para as pontas', () => {
    const row: FrameTemplate = {
      type: 'frame',
      layout: { type: 'row', justify: 'space-between' },
      children: [
        { type: 'rect', width: 20, height: 10 },
        { type: 'rect', width: 30, height: 10 },
      ],
    };
    const { root } = run(row, {}, { x: 0, y: 0, width: 100, height: 10 });
    expect(tx(child(root, 0))).toBe(0);
    expect(tx(child(root, 1))).toBe(70);
  });
});

describe('instantiate: layout none com âncoras', () => {
  const tpl: FrameTemplate = {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'stretch',
        anchors: { left: 8, right: 8, top: 8, bottom: 8 },
      },
      {
        type: 'ellipse',
        name: 'dot',
        width: 20,
        height: 20,
        anchors: { centerX: true, centerY: true },
      },
      {
        type: 'rect',
        name: 'corner',
        width: 12,
        height: 6,
        anchors: { right: 10, bottom: 10 },
      },
      { type: 'rect', name: 'free', width: 5, height: 5 },
      { type: 'rect', name: 'whole' },
    ],
  };

  it('posiciona e estica pelas âncoras', () => {
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 200, height: 100 });
    const stretch = child(root, 0);
    expect([tx(stretch), ty(stretch), stretch.width, stretch.height]).toEqual([
      8, 8, 184, 84,
    ]);
    const dot = child(root, 1);
    expect([tx(dot), ty(dot), dot.width, dot.height]).toEqual([90, 40, 20, 20]);
    expect(dot.type).toBe('ellipse');
    const corner = child(root, 2);
    expect([tx(corner), ty(corner)]).toEqual([200 - 10 - 12, 100 - 10 - 6]);
    const free = child(root, 3);
    expect([tx(free), ty(free)]).toEqual([0, 0]);
    const whole = child(root, 4);
    expect([tx(whole), ty(whole), whole.width, whole.height]).toEqual([0, 0, 200, 100]);
  });

  it('um quadro sem layout é none', () => {
    const { root } = run(
      { type: 'frame', children: [{ type: 'rect', width: 4, height: 4 }] },
      {},
      { x: 0, y: 0, width: 50, height: 50 },
    );
    expect(tx(child(root, 0))).toBe(0);
  });
});

describe('instantiate: tamanhos, estilo e ids', () => {
  it('porcentagens e hug com filhos', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        { type: 'rect', name: 'half', width: '50%', height: '25%' },
        {
          type: 'frame',
          name: 'group',
          width: 'hug',
          height: 'hug',
          layout: { type: 'column', padding: [4, 6], gap: 2 },
          children: [
            { type: 'rect', width: 30, height: 10 },
            { type: 'rect', width: 50, height: 20 },
          ],
        },
      ],
    };
    const { root, warnings } = run(tpl, {}, { x: 0, y: 0, width: 200, height: 80 });
    const half = child(root, 0);
    expect([half.width, half.height]).toEqual([100, 20]);
    const group = child(root, 1);
    expect(group.width).toBe(50 + 12);
    expect(group.height).toBe(10 + 20 + 2 + 8);
    const inner = child(group, 1);
    expect([tx(inner), ty(inner)]).toEqual([6, 4 + 10 + 2]);
    expect(warnings).toEqual([]);
  });

  it('hug em linha soma filhos e espaços, e fill dentro de hug vira 0 com aviso', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'frame',
          width: 'hug',
          height: 'hug',
          layout: { type: 'row', gap: 4 },
          children: [
            { type: 'rect', width: 10, height: 10 },
            { type: 'rect', width: 'fill', height: 10 },
            { type: 'rect', width: 20, height: 14 },
          ],
        },
      ],
    };
    const { root, warnings } = run(tpl, {}, { x: 0, y: 0, width: 200, height: 80 });
    const group = child(root, 0);
    expect([group.width, group.height]).toEqual([10 + 0 + 20 + 8, 14]);
    expect(child(group, 1).width).toBe(0);
    expect(warnings.filter((w) => w === 'fill dentro de hug vira 0')).toHaveLength(1);
  });

  it('visible falso remove o nó e não conta no layout', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'row', gap: 10 },
      children: [
        { type: 'rect', width: 10, height: 10, visible: false },
        { type: 'rect', width: 10, height: 10, name: 'first' },
        { type: 'rect', width: 10, height: 10, name: 'second', opacity: 0.4 },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 100, height: 10 });
    expect(root.children).toHaveLength(2);
    expect(root.children.map((n) => n.name)).toEqual(['first', 'second']);
    expect(tx(child(root, 1))).toBe(20);
    expect(child(root, 1).opacity).toBe(0.4);
    expect(child(root, 0).opacity).toBe(1);
  });

  it('alinhamento do traço: dentro por padrão, centro em caminhos', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      stroke: { color: '#000000' },
      children: [
        { type: 'rect', stroke: { color: '#111111', width: 3 } },
        { type: 'ellipse', stroke: { color: '#222222', align: 'outside', dash: [2, 2] } },
        { type: 'path', d: 'M0 0', viewBox: [10, 10], stroke: { color: '#333333' } },
        { type: 'rect', stroke: { color: 'none' } },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 50, height: 50 });
    expect(root.stroke?.align).toBe('inside');
    expect(root.stroke?.width).toBe(1);
    expect(child(root, 0).stroke).toEqual({
      paints: [{ type: 'solid', color: '#111111' }],
      width: 3,
      align: 'inside',
    });
    expect(child(root, 1).stroke?.align).toBe('outside');
    expect(child(root, 1).stroke?.dash).toEqual([2, 2]);
    expect(child(root, 2).stroke?.align).toBe('center');
    expect(child(root, 3).stroke).toBeUndefined();
  });

  it('gradiente vira um paint linear com 2 stops cobrindo a caixa', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      fill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#0000ff' },
        ],
      },
      children: [
        {
          type: 'rect',
          fill: {
            type: 'linear',
            angle: 0,
            stops: [
              { offset: 0, color: '#000000' },
              { offset: 1, color: '#ffffff' },
            ],
          },
        },
        { type: 'rect', fill: 'none' },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 100, height: 40 });
    const paint = root.fills[0];
    expect(paint?.type).toBe('linear');
    if (paint?.type !== 'linear') throw new Error('esperava gradiente');
    expect(paint.stops).toHaveLength(2);
    expect(paint.start.x).toBeCloseTo(50, 5);
    expect(paint.start.y).toBeCloseTo(0, 5);
    expect(paint.end.x).toBeCloseTo(50, 5);
    expect(paint.end.y).toBeCloseTo(40, 5);
    const horizontal = child(root, 0).fills[0];
    if (horizontal?.type !== 'linear') throw new Error('esperava gradiente');
    expect(horizontal.start.x).toBeCloseTo(0, 5);
    expect(horizontal.end.x).toBeCloseTo(100, 5);
    expect(child(root, 1).fills).toEqual([]);
  });

  it('sombra vira efeito', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      shadow: { color: '#00000040', x: 1, y: 2, blur: 4 },
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 10, height: 10 });
    expect(root.effects).toEqual([
      { color: '#00000040', offset: { x: 1, y: 2 }, blur: 4 },
    ]);
  });

  it('avisa ícone esticado quando a escala difere nos eixos', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [{ type: 'path', d: 'M0 0', viewBox: [10, 10], width: 20, height: 10 }],
    };
    const { warnings } = run(tpl, {}, { x: 0, y: 0, width: 50, height: 50 });
    expect(warnings).toEqual(['ícone esticado: escala diferente nos dois eixos']);
  });

  it('texto com largura fixa e altura hug mede com quebra de linha', () => {
    const text = 'uma frase com várias palavras para quebrar';
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        { type: 'text', text, width: 80, height: 'hug' },
        { type: 'text', text, width: 'hug', height: 'hug' },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 300, height: 300 });
    const wrapped = child(root, 0);
    const single = child(root, 1);
    const font = { ...FONT, weight: 400 };
    expect(wrapped.width).toBe(80);
    expect(wrapped.height).toBeCloseTo(approximateMeasurer(text, font, 80).height, 5);
    expect(wrapped.height).toBeGreaterThan(single.height);
    expect(single.height).toBeCloseTo(16.8, 5);
    expect(single.width).toBeCloseTo(approximateMeasurer(text, font).width, 5);
  });

  it('ids seguem o caminho de índices e os nomes vêm do template ou do tipo', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      children: [
        { type: 'rect', visible: false },
        {
          type: 'frame',
          name: 'inner',
          children: [{ type: 'ellipse' }, { type: 'slot', label: 'Conteúdo' }],
        },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 50, height: 50 }, 'inst-1');
    expect(root.id).toBe('inst-1/root');
    expect(root.name).toBe('frame');
    const inner = child(root, 0);
    expect(inner.id).toBe('inst-1/root.1');
    expect(inner.name).toBe('inner');
    expect(child(inner, 0).id).toBe('inst-1/root.1.0');
    expect(child(inner, 0).name).toBe('ellipse');
    const slot = child(inner, 1);
    expect(slot.id).toBe('inst-1/root.1.1');
    expect(slot.type).toBe('unknown');
    expect(slot.name).toBe('Conteúdo');
    if (slot.type === 'unknown') expect(slot.sourceType).toBe('slot');
    const ids = [...walk(root)].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run(tpl, {}, { x: 0, y: 0, width: 1, height: 1 }).root.id).toBe('c/root');
  });

  it('cantos arredondados por canto e clip dos quadros internos', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      clip: false,
      children: [
        { type: 'frame', cornerRadius: [1, 2, 3, 4] },
        { type: 'frame', clip: true },
      ],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 20, height: 20 });
    expect(root.clip).toBe(false);
    expect((child(root, 0) as FrameNode).clip).toBe(false);
    expect((child(root, 0) as FrameNode).cornerRadius).toEqual([1, 2, 3, 4]);
    expect((child(root, 1) as FrameNode).clip).toBe(true);
  });

  it('align stretch estica o filho hug no eixo cruzado', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'column', align: 'stretch', padding: 10 },
      children: [{ type: 'text', text: 'x' }],
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 100, height: 100 });
    expect(child(root, 0).width).toBe(80);
  });
});

describe('normalizePadding', () => {
  it('aceita um valor, [v, h] e quatro lados', () => {
    expect(normalizePadding(4)).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
    expect(normalizePadding([1, 2])).toEqual({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(normalizePadding([1, 2, 3, 4])).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });
    expect(normalizePadding(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('approximateMeasurer', () => {
  it('mede sem quebra e com quebra por palavras', () => {
    const font = { ...FONT, weight: 400 };
    expect(approximateMeasurer('abcd', font).width).toBeCloseTo(4 * 14 * 0.55, 5);
    expect(approximateMeasurer('abcd', FONT).width).toBeCloseTo(4 * 14 * 0.6, 5);
    expect(approximateMeasurer('', font).height).toBeCloseTo(16.8, 5);
    const wrapped = approximateMeasurer('aaaa bbbb cccc', font, 4 * 14 * 0.55 + 1);
    expect(wrapped.height).toBeCloseTo(3 * 16.8, 5);
    expect(approximateMeasurer('a\nb', font).height).toBeCloseTo(2 * 16.8, 5);
  });
});

// --- slotContent e measureComponent (arrumação por tamanhos, fase L2) -------------------------

describe('instantiate: slotContent e measureComponent', () => {
  const TEXT_FONT = { size: 10, lineHeight: 12 };
  const textHeight = 12;
  const textWidth = approximateMeasurer('AAAA', { ...FONT, size: 10, weight: 400 }).width;

  const columnWithSlot = component({
    type: 'frame',
    layout: { type: 'column' },
    children: [
      { type: 'text', text: 'AAAA', font: TEXT_FONT },
      { type: 'slot', name: 'content' },
    ],
  });

  const measure = (
    c: ComponentFile,
    size: { width: number | null; height: number | null },
    slotContent?: { width: number; height: number },
  ) =>
    measureComponent(c, {}, size, {
      measure: approximateMeasurer,
      ...(slotContent ? { slotContent } : {}),
    });

  it('sem slotContent o slot vale 0 ao medir e o fill dentro de hug avisa', () => {
    const result = measure(columnWithSlot, { width: null, height: null });
    expect(result.height).toBeCloseTo(textHeight);
    expect(result.width).toBeCloseTo(textWidth);
    expect(result.warnings).toContain('fill dentro de hug vira 0');
  });

  it('com slotContent o slot fill vale o conteúdo dos filhos, sem aviso', () => {
    const result = measure(
      columnWithSlot,
      { width: null, height: null },
      { width: 90, height: 20 },
    );
    expect(result.height).toBeCloseTo(textHeight + 20);
    expect(result.width).toBeCloseTo(90);
    expect(result.warnings).not.toContain('fill dentro de hug vira 0');
  });

  it('slot hug vale o slotContent do eixo (e 0 sem ele)', () => {
    const hugSlot = component({
      type: 'frame',
      layout: { type: 'column' },
      children: [{ type: 'slot', width: 'hug', height: 'hug' }],
    });
    expect(
      measure(hugSlot, { width: null, height: null }, { width: 30, height: 20 }),
    ).toMatchObject({ width: 30, height: 20 });
    expect(measure(hugSlot, { width: null, height: null })).toMatchObject({
      width: 0,
      height: 0,
    });
  });

  it('slot ancorado nos dois lados vale o slotContent mais as âncoras', () => {
    const inset = component({
      type: 'frame',
      layout: { type: 'none' },
      children: [{ type: 'slot', anchors: { left: 5, right: 5, top: 2, bottom: 2 } }],
    });
    expect(
      measure(inset, { width: null, height: null }, { width: 30, height: 20 }),
    ).toMatchObject({ width: 40, height: 24 });
  });

  it('com tamanho conhecido num eixo, mede só o outro', () => {
    const result = measure(
      columnWithSlot,
      { width: 100, height: null },
      { width: 90, height: 20 },
    );
    expect(result.width).toBe(100);
    expect(result.height).toBeCloseTo(textHeight + 20);
  });

  it('com o pai medido, o slot fill divide o que sobra (o próprio slotContent)', () => {
    const { root } = instantiate(
      columnWithSlot,
      {},
      { x: 0, y: 0, width: 100, height: 32 },
      {
        measure: approximateMeasurer,
        slotContent: { width: 90, height: 20 },
      },
    );
    const slot = child(root, 1);
    expect(slot.height).toBeCloseTo(20);
    expect(slot.width).toBe(100);
  });

  it('measureComponent mede o plano da raiz (hug nos dois eixos)', () => {
    const values = { label: 'Salvar', variant: 'primary', icon: 'não' };
    const measured = measureComponent(
      component(button),
      values,
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBeCloseTo(16 * 2 + labelWidth);
    expect(measured.height).toBeCloseTo(labelHeight);
    const { root } = run(button, values, {
      x: 0,
      y: 0,
      width: measured.width,
      height: measured.height,
    });
    expect(tx(child(root, 0))).toBeCloseTo(16);
  });
});
