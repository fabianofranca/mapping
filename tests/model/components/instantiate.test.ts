// Components Lab: instantiating the template in a box (layout, style and warnings).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
  FrameTemplate,
  TemplateNode,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  normalizePadding,
  type Box,
} from '../../../src/model/components/instantiate';
import { catalog, entryOf } from '../../support/material3Fitted';
import { instantiateOptions } from '../../support/material3Library';
import { defaultValues } from '../../../src/model/libraryDrawing';
import {
  walk,
  type FrameNode,
  type PathNode,
  type SceneNode,
  type TextNode,
} from '../../../src/model/components/scene';

type Values = FieldValues;

// pt-BR kept: boolean enum values "sim"/"não" of the engine (FALSY_TEXT in expressions.ts)
const YES = 'sim';
const NO = 'não';

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
    name: 'Test',
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
  if (node.type !== 'frame') throw new Error('not a frame');
  const found = node.children[index];
  if (!found) throw new Error(`no child ${index}`);
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
const labelWidth = approximateMeasurer('Save', FONT).width;
const labelHeight = approximateMeasurer('Save', FONT).height;

describe('instantiate: button', () => {
  it('the root fills the given box', () => {
    const { root } = run(button, { label: 'Save', variant: 'primary', icon: NO }, BOX);
    expect(root.type).toBe('frame');
    expect(root.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(root.width).toBe(120);
    expect(root.height).toBe(40);
    expect(root.clip).toBe(true);
    expect(root.cornerRadius).toBe(10);
  });

  it('without an icon, only the text exists and it is centered', () => {
    const { root, warnings } = run(
      button,
      { label: 'Save', variant: 'primary', icon: NO },
      BOX,
    );
    expect(warnings).toEqual([]);
    expect(root.children).toHaveLength(1);
    const text = child(root, 0) as TextNode;
    expect(text.type).toBe('text');
    expect(text.text).toBe('Save');
    expect(tx(text)).toBeCloseTo((BOX.width - labelWidth) / 2, 0);
    expect(ty(text)).toBeCloseTo((BOX.height - labelHeight) / 2, 5);
    expect(text.width).toBeCloseTo(labelWidth, 5);
    expect(text.height).toBeCloseTo(labelHeight, 5);
    expect(text.style.fontWeight).toBe(600);
    expect(text.style.lineHeight).toBeCloseTo(16.8, 5);
  });

  it('with an icon, the icon sits on the left with 8px of gap and the group is centered', () => {
    const { root } = run(button, { label: 'Save', variant: 'primary', icon: YES }, BOX);
    expect(root.children).toHaveLength(2);
    const icon = child(root, 0) as PathNode;
    const text = child(root, 1) as TextNode;
    const group = 16 + 8 + labelWidth;
    expect(tx(icon)).toBeCloseTo((BOX.width - group) / 2, 5);
    expect(tx(text) - (tx(icon) + 16)).toBeCloseTo(8, 5);
    expect(ty(icon)).toBeCloseTo((BOX.height - 16) / 2, 5);
    expect(ty(text)).toBeCloseTo((BOX.height - labelHeight) / 2, 5);
  });

  it('the path scales the viewBox to the 16x16 box and corrects the stroke width', () => {
    const { root, warnings } = run(
      button,
      { label: 'Save', variant: 'primary', icon: YES },
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

  it('the variant switches the colors', () => {
    const primary = run(button, { label: 'A', variant: 'primary', icon: NO }, BOX).root;
    const secondary = run(
      button,
      { label: 'A', variant: 'secondary', icon: NO },
      BOX,
    ).root;
    expect(primary.fills).toEqual([{ type: 'solid', color: '#2563eb' }]);
    expect(secondary.fills).toEqual([{ type: 'solid', color: '#e5e7eb' }]);
    expect((child(secondary, 0) as TextNode).fills).toEqual([
      { type: 'solid', color: '#111827' },
    ]);
  });

  it('an empty field is false in visible and the icon disappears', () => {
    const { root } = run(button, { label: 'A', variant: 'primary', icon: '' }, BOX);
    expect(root.children).toHaveLength(1);
  });

  it('visible with $field and default: an instance without the field shows the node (#951)', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'row' },
      children: [
        {
          type: 'rect',
          name: 'badge',
          width: 5,
          height: 5,
          visible: { $field: 'badge', default: true },
        },
      ],
    };
    expect(run(tpl, {}, BOX).root.children).toHaveLength(1);
    expect(run(tpl, { badge: NO }, BOX).root.children).toHaveLength(0);
    expect(run(tpl, { badge: YES }, BOX).root.children).toHaveLength(1);
  });

  it('visible with $has hides the node when the field is empty; $field hides it with the falsy no value', () => {
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
    expect(names({ label: 'x', icon: YES })).toEqual(['has', 'flag']);
    expect(names({ label: '', icon: NO })).toEqual(['not']);
    expect(names({ label: '  ', icon: '' })).toEqual(['not']);
  });

  it('warns once per field not provided', () => {
    const { warnings } = run(button, { label: 'A' }, BOX);
    expect(warnings).toContain('field not provided: variant');
    expect(warnings).toContain('field not provided: icon');
    expect(warnings.filter((w) => w === 'field not provided: variant')).toHaveLength(1);
    expect(warnings).not.toContain('field not provided: label');
  });
});

describe('instantiate: card', () => {
  const longTitle = 'A very long title that needs to wrap across several lines';
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

  it('the divider takes the usable width and the two buttons split the row', () => {
    const { root, warnings } = run(
      card,
      { title: 'Title' },
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

  it('the title with fixed width wraps and the height comes from the wrapped measurement', () => {
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

  it('warns when the box is smaller than the content', () => {
    const { warnings } = run(
      card,
      { title: 'Title' },
      { x: 0, y: 0, width: 300, height: 40 },
    );
    expect(warnings).toContain('content larger than the box: card');
  });

  it('overflowWarnings lists exactly the "does not fit" warnings, without the others', () => {
    const { warnings, overflowWarnings } = run(
      card,
      {},
      { x: 0, y: 0, width: 300, height: 40 },
    );
    expect(overflowWarnings).toEqual(['content larger than the box: card']);
    expect(warnings.length).toBeGreaterThan(overflowWarnings?.length ?? 0);
  });

  it('space-between with two fixed-width children pushes them to the ends', () => {
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

describe('instantiate: layout none with anchors', () => {
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

  it('positions and stretches by the anchors', () => {
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

  it('a frame without layout is none', () => {
    const { root } = run(
      { type: 'frame', children: [{ type: 'rect', width: 4, height: 4 }] },
      {},
      { x: 0, y: 0, width: 50, height: 50 },
    );
    expect(tx(child(root, 0))).toBe(0);
  });
});

describe('instantiate: sizes, style and ids', () => {
  it('percentages and hug with children', () => {
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

  it('hug in a row sums children and gaps, and fill inside hug becomes 0 with a warning', () => {
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
    expect(warnings.filter((w) => w === 'fill inside hug becomes 0')).toHaveLength(1);
  });

  it('visible false removes the node and does not count in the layout', () => {
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

  it('stroke alignment: inside by default, center on paths', () => {
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

  it('gradient becomes a linear paint with 2 stops covering the box', () => {
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
    if (paint?.type !== 'linear') throw new Error('expected gradient');
    expect(paint.stops).toHaveLength(2);
    expect(paint.start.x).toBeCloseTo(50, 5);
    expect(paint.start.y).toBeCloseTo(0, 5);
    expect(paint.end.x).toBeCloseTo(50, 5);
    expect(paint.end.y).toBeCloseTo(40, 5);
    const horizontal = child(root, 0).fills[0];
    if (horizontal?.type !== 'linear') throw new Error('expected gradient');
    expect(horizontal.start.x).toBeCloseTo(0, 5);
    expect(horizontal.end.x).toBeCloseTo(100, 5);
    expect(child(root, 1).fills).toEqual([]);
  });

  it('shadow becomes an effect', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      shadow: { color: '#00000040', x: 1, y: 2, blur: 4 },
    };
    const { root } = run(tpl, {}, { x: 0, y: 0, width: 10, height: 10 });
    expect(root.effects).toEqual([
      { color: '#00000040', offset: { x: 1, y: 2 }, blur: 4 },
    ]);
  });

  it('warns stretched icon when the scale differs between the axes', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [{ type: 'path', d: 'M0 0', viewBox: [10, 10], width: 20, height: 10 }],
    };
    const { warnings } = run(tpl, {}, { x: 0, y: 0, width: 50, height: 50 });
    expect(warnings).toEqual(['stretched icon: different scale on the two axes']);
  });

  it('text with fixed width and hug height measures with line wrapping', () => {
    const text = 'a sentence with several words to wrap around';
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

  it('ids follow the index path and names come from the template or the type', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      children: [
        { type: 'rect', visible: false },
        {
          type: 'frame',
          name: 'inner',
          children: [{ type: 'ellipse' }, { type: 'slot', label: 'Content' }],
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
    expect(slot.name).toBe('Content');
    if (slot.type === 'unknown') expect(slot.sourceType).toBe('slot');
    const ids = [...walk(root)].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run(tpl, {}, { x: 0, y: 0, width: 1, height: 1 }).root.id).toBe('c/root');
  });

  it('per-corner rounded corners and clip of the inner frames', () => {
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

  it('align stretch stretches the hug child on the cross axis', () => {
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
  it('accepts one value, [v, h] and four sides', () => {
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
  it('measures without wrapping and with word wrapping', () => {
    const font = { ...FONT, weight: 400 };
    expect(approximateMeasurer('abcd', font).width).toBeCloseTo(4 * 14 * 0.55, 5);
    expect(approximateMeasurer('abcd', FONT).width).toBeCloseTo(4 * 14 * 0.6, 5);
    expect(approximateMeasurer('', font).height).toBeCloseTo(16.8, 5);
    const wrapped = approximateMeasurer('aaaa bbbb cccc', font, 4 * 14 * 0.55 + 1);
    expect(wrapped.height).toBeCloseTo(3 * 16.8, 5);
    expect(approximateMeasurer('a\nb', font).height).toBeCloseTo(2 * 16.8, 5);
  });
});

// --- slotContent and measureComponent (arrangement by sizes, phase L2) -------------------------

describe('instantiate: slotContent and measureComponent', () => {
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

  it('without slotContent the slot is 0 when measuring and fill inside hug warns', () => {
    const result = measure(columnWithSlot, { width: null, height: null });
    expect(result.height).toBeCloseTo(textHeight);
    expect(result.width).toBeCloseTo(textWidth);
    expect(result.warnings).toContain('fill inside hug becomes 0');
  });

  it('with slotContent the fill slot is worth the content of the children, without a warning', () => {
    const result = measure(
      columnWithSlot,
      { width: null, height: null },
      { width: 90, height: 20 },
    );
    expect(result.height).toBeCloseTo(textHeight + 20);
    expect(result.width).toBeCloseTo(90);
    expect(result.warnings).not.toContain('fill inside hug becomes 0');
  });

  it('slot hug is worth the slotContent of the axis (and 0 without it)', () => {
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

  it('a slot anchored on both sides is worth the slotContent plus the anchors', () => {
    const inset = component({
      type: 'frame',
      layout: { type: 'none' },
      children: [{ type: 'slot', anchors: { left: 5, right: 5, top: 2, bottom: 2 } }],
    });
    expect(
      measure(inset, { width: null, height: null }, { width: 30, height: 20 }),
    ).toMatchObject({ width: 40, height: 24 });
  });

  it('with a known size on one axis, it measures only the other', () => {
    const result = measure(
      columnWithSlot,
      { width: 100, height: null },
      { width: 90, height: 20 },
    );
    expect(result.width).toBe(100);
    expect(result.height).toBeCloseTo(textHeight + 20);
  });

  it('with the parent measured, the fill slot takes what is left (the slotContent itself)', () => {
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

  // A `none` hug root with a child stretched by anchors (the Material 3 chip): the child without
  // width is `fill`, and in a parent without a limit it is worth what it would hug, not 0 (it was width 1 in Arrange).
  it('measureComponent: a none hug root with a child stretched by anchors measures the content', () => {
    const chip: FrameTemplate = {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'frame',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout: { type: 'row', gap: 8, padding: [0, 16, 0, 16], align: 'center' },
          children: [{ type: 'text', text: 'Wi-Fi', font: FONT }],
        },
      ],
    };
    const measured = measureComponent(
      component(chip),
      {},
      { width: null, height: 32 },
      { measure: approximateMeasurer },
    );
    const text = approximateMeasurer('Wi-Fi', FONT, undefined).width;
    expect(measured.width).toBeCloseTo(16 * 2 + text);
  });

  it('measureComponent measures the flat root (hug on both axes)', () => {
    const values = { label: 'Save', variant: 'primary', icon: NO };
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

describe('padding coming from a field (#CR-11)', () => {
  const padded = (padding: unknown): FrameTemplate =>
    ({
      type: 'frame',
      layout: { type: 'column', padding },
      children: [{ type: 'rect', width: 10, height: 10 }],
    }) as FrameTemplate;
  const at = (padding: unknown, values: Values) => {
    const { root } = run(padded(padding), values, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    return [tx(child(root, 0)), ty(child(root, 0))];
  };

  it('numeric text becomes a number; non-numeric becomes 0; negative becomes 0', () => {
    expect(at({ $field: 'p' }, { p: '16' })).toEqual([16, 16]);
    expect(at({ $field: 'p' }, { p: 'abc' })).toEqual([0, 0]);
    expect(at({ $field: 'p' }, { p: -8 })).toEqual([0, 0]);
  });

  it('in a list, each side is normalized', () => {
    expect(at({ $field: 'p' }, { p: ['4', 'x', -2, '6'] as never })).toEqual([6, 4]);
  });
});

describe('ellipsis by code point (#CR-12)', () => {
  it('leaves no lone surrogate when cutting text ending in an emoji', () => {
    for (let limit = 8; limit <= 60; limit += 1) {
      const result = approximateMeasurer(
        '😀😀😀😀😀😀',
        { ...FONT, wrap: 'none', ellipsis: true },
        limit,
      );
      const line = result.lines?.[0] ?? '';
      expect(line.endsWith('…'), `limit ${limit}`).toBe(true);
      expect(LONE_SURROGATE.test(line), `limit ${limit}: ${JSON.stringify(line)}`).toBe(
        false,
      );
    }
  });
});

/** Unpaired surrogate (high without low, or low without high). */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// ---------------------------------------------------------------------------------------
// `$lines` in two passes (MC2, decision 8 of #898)
// ---------------------------------------------------------------------------------------

describe('$lines: the number of measured lines of a text node', () => {
  /** 10 px of font = 5.5 px per character; the 200 box takes 36 characters per line. */
  const ONE = 'Ok';
  const TWO = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd';
  const THREE = `${TWO} eeeeeeeeee ffffffffff gggggggggg hhhhhhhhhh`;
  const FIVE = `${THREE} ${THREE}`;

  const msg = (extra: Record<string, unknown> = {}) => ({
    type: 'text',
    name: 'msg',
    text: { $field: 'msg' },
    width: 'fill',
    height: 'hug',
    font: { size: 10, lineHeight: 30, ...(extra.font as object | undefined) },
  });

  /** The root with `minHeight` 48/68 by the lines of `msg` and `hug` height (the snackbar). */
  function snackbar(minHeight: unknown, text: Record<string, unknown> = msg()) {
    return {
      ...component({
        type: 'frame',
        width: 'fill',
        height: 'hug',
        minHeight,
        layout: { type: 'column' },
        children: [text],
      } as unknown as FrameTemplate),
      formatVersion: 4 as const,
    };
  }

  const STEP = {
    $if: { $gt: [{ $lines: 'msg' }, 1] },
    then: 68,
    else: 48,
  };

  const heightOf = (c: ComponentFile, msgValue: string) =>
    measureComponent(
      c,
      { msg: msgValue },
      { width: 200, height: null },
      { measure: approximateMeasurer },
    ).height;

  it('1, 2 and 3 lines: 48, 68 and the height of the lines (3 × 30 = 90)', () => {
    const c = snackbar(STEP);
    expect(heightOf(c, ONE)).toBe(48);
    expect(heightOf(c, TWO)).toBe(68);
    expect(heightOf(c, THREE)).toBe(90);
  });

  it('instantiate measures the same: the root comes out with the flat height', () => {
    const c = snackbar(STEP);
    const box = { x: 0, y: 0, width: 200, height: heightOf(c, TWO) };
    const { root } = instantiate(c, { msg: TWO }, box, { measure: approximateMeasurer });
    expect(root.height).toBe(68);
  });

  it('with maxLines the number is that of the lines that remain (at most maxLines)', () => {
    const c = snackbar(
      { $mul: [{ $lines: 'msg' }, 100] },
      msg({ font: { maxLines: 2 } }),
    );
    expect(heightOf(c, FIVE)).toBe(200);
  });

  it('empty text is 0 lines', () => {
    const c = snackbar({ $add: [{ $lines: 'msg' }, 100] });
    expect(heightOf(c, '')).toBe(100);
    expect(heightOf(c, ONE)).toBe(101);
  });

  it('inside a repeat it is the node of the same row', () => {
    const c = {
      ...component({
        type: 'frame',
        width: 'fill',
        height: 'hug',
        layout: { type: 'column' },
        children: [
          {
            type: 'repeat',
            field: 'rows',
            template: {
              type: 'frame',
              width: 'fill',
              minHeight: { $mul: [{ $lines: 'cell' }, 100] },
              layout: { type: 'column' },
              children: [
                {
                  type: 'text',
                  name: 'cell',
                  text: { $field: 'text' },
                  width: 'fill',
                  font: { size: 10, lineHeight: 5 },
                },
              ],
            },
          },
        ],
      } as FrameTemplate),
      formatVersion: 4 as const,
    };
    const { height } = measureComponent(
      c,
      { rows: [{ text: ONE }, { text: TWO }, { text: THREE }] },
      { width: 200, height: null },
      { measure: approximateMeasurer },
    );
    // 1 + 2 + 3 lines, 100 px per line.
    expect(height).toBe(600);
  });

  it('the number that changes between passes stays that of the second and warns "$lines unstable"', () => {
    // The spacer narrows `msg` when `msg` has more than one line: it never settles.
    const c = {
      ...component({
        type: 'frame',
        width: 'fill',
        height: 'hug',
        layout: { type: 'row' },
        children: [
          {
            type: 'frame',
            name: 'spacer',
            width: { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 150, else: 0 },
            height: 1,
          },
          msg(),
        ],
      } as FrameTemplate),
      formatVersion: 4 as const,
    };
    const result = instantiate(
      c,
      { msg: THREE },
      { x: 0, y: 0, width: 200, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(result.warnings).toContain('$lines unstable: msg');
    const stable = instantiate(
      c,
      { msg: ONE },
      { x: 0, y: 0, width: 200, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(stable.warnings).not.toContain('$lines unstable: msg');
  });

  it('measureComponent also warns "$lines unstable" (it is the path of hug and fit)', () => {
    const c = {
      ...component({
        type: 'frame',
        width: 'fill',
        height: 'hug',
        layout: { type: 'row' },
        children: [
          {
            type: 'frame',
            name: 'spacer',
            width: { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 150, else: 0 },
            height: 1,
          },
          msg(),
        ],
      } as unknown as FrameTemplate),
      formatVersion: 4 as const,
    };
    const measure = (value: string) =>
      measureComponent(
        c,
        { msg: value },
        { width: 200, height: null },
        { measure: approximateMeasurer },
      ).warnings;
    expect(measure(THREE)).toContain('$lines unstable: msg');
    expect(measure(ONE)).not.toContain('$lines unstable: msg');
  });

  it('without $lines in the template there is a single pass (the measurer is called the same number of times)', () => {
    let calls = 0;
    const counting: typeof approximateMeasurer = (text, font, maxWidth) => {
      calls += 1;
      return approximateMeasurer(text, font, maxWidth);
    };
    const plain = snackbar(48);
    instantiate(
      plain,
      { msg: TWO },
      { x: 0, y: 0, width: 200, height: 48 },
      {
        measure: counting,
      },
    );
    const single = calls;
    calls = 0;
    instantiate(
      snackbar(STEP),
      { msg: TWO },
      { x: 0, y: 0, width: 200, height: 68 },
      {
        measure: counting,
      },
    );
    expect(calls).toBeGreaterThan(single);
    // One pass measures the text only once (the engine's `textMemo`, #1078); before there were 3 calls.
    expect(single).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// L2 (stage #1078): aligned `none`, warning on `none` (#1093) and `clip` by expression / on the slot.
// ---------------------------------------------------------------------------------------

function component4(template: FrameTemplate): ComponentFile {
  return { ...component(template), formatVersion: 4 };
}

function run4(
  template: FrameTemplate,
  values: Values,
  box: Box,
): ReturnType<typeof instantiate> {
  return instantiate(component4(template), values, box, { measure: approximateMeasurer });
}

type NoneAlign = 'start' | 'center' | 'end' | 'stretch';

describe('instantiate: aligned none (vertical align, horizontal justify)', () => {
  const BOX_N: Box = { x: 0, y: 0, width: 200, height: 100 };
  const labelNode = {
    type: 'text' as const,
    name: 'label',
    text: 'Save',
    font: { size: 14, weight: 600 },
    color: '#000000',
  };
  const fixedNode = { type: 'rect' as const, name: 'fixed', width: 40, height: 20 };
  const tpl = (
    align?: NoneAlign,
    justify?: NoneAlign,
    kids: readonly TemplateNode[] = [labelNode, fixedNode],
  ) =>
    ({
      type: 'frame',
      layout: {
        type: 'none',
        ...(align === undefined ? {} : { align }),
        ...(justify === undefined ? {} : { justify }),
      },
      children: kids,
    }) as FrameTemplate;
  const at = (v: NoneAlign, free: number): number =>
    v === 'center' ? free / 2 : v === 'end' ? free : 0;
  const points: NoneAlign[] = ['start', 'center', 'end'];

  for (const align of points) {
    for (const justify of points) {
      it(`the nine points: align ${align} × justify ${justify}, hug child and fixed-size child`, () => {
        const { root } = run4(tpl(align, justify), {}, BOX_N);
        const label = child(root, 0);
        const fixed = child(root, 1);
        expect([tx(label), ty(label)]).toEqual([
          at(justify, 200 - labelWidth),
          at(align, 100 - labelHeight),
        ]);
        expect([tx(fixed), ty(fixed)]).toEqual([at(justify, 160), at(align, 80)]);
        expect([fixed.width, fixed.height]).toEqual([40, 20]);
      });
    }
  }

  it('stretch: the hug child stretches on the axis, the fill keeps taking the content and the fixed one stays at the start', () => {
    const { root } = run4(
      tpl('stretch', 'stretch', [labelNode, fixedNode, { type: 'rect', name: 'all' }]),
      {},
      BOX_N,
    );
    const label = child(root, 0);
    expect([tx(label), ty(label), label.width, label.height]).toEqual([0, 0, 200, 100]);
    const fixed = child(root, 1);
    expect([tx(fixed), ty(fixed), fixed.width, fixed.height]).toEqual([0, 0, 40, 20]);
    const whole = child(root, 2);
    expect([whole.width, whole.height]).toEqual([200, 100]);
  });

  it('stretch on one axis only: the other follows start', () => {
    const { root } = run4(tpl('start', 'stretch'), {}, BOX_N);
    const label = child(root, 0);
    expect([ty(label), label.width]).toEqual([0, 200]);
    expect(label.height).toBeCloseTo(labelHeight, 5);
  });

  it('the anchor of the child on the axis wins; on the other axis the frame applies', () => {
    const anchored: FrameTemplate = tpl('center', 'end', [
      { type: 'rect', name: 'a', width: 20, height: 10, anchors: { left: 5 } },
      { type: 'rect', name: 'b', width: 20, height: 10, anchors: { bottom: 7 } },
      { type: 'rect', name: 'c', anchors: { left: 8, right: 8 }, height: 10 },
    ]);
    const { root } = run4(anchored, {}, BOX_N);
    const a = child(root, 0);
    expect([tx(a), ty(a)]).toEqual([5, 45]);
    const b = child(root, 1);
    expect([tx(b), ty(b)]).toEqual([180, 100 - 7 - 10]);
    const c = child(root, 2);
    expect([tx(c), c.width, ty(c)]).toEqual([8, 184, 45]);
  });

  it('without align/justify the scene is the current one (same as start/start)', () => {
    const plain = run4(tpl(), {}, BOX_N).root;
    expect(run4(tpl('start', 'start'), {}, BOX_N).root).toEqual(plain);
    const old = run({ ...tpl(), layout: { type: 'none' } }, {}, BOX_N).root;
    expect(plain).toEqual(old);
  });

  it('the hug frame with aligned children hugs the largest child', () => {
    const { root } = run4(
      { ...tpl('center', 'center'), width: 'hug', height: 'hug' } as FrameTemplate,
      {},
      BOX_N,
    );
    const fixed = child(root, 1);
    expect(tx(fixed)).toBeCloseTo((root.width - 40) / 2, 5);
  });
});

describe('instantiate: content larger than the box warning on none (#1093)', () => {
  const chip = (rootLayout: 'row' | 'none'): FrameTemplate => ({
    type: 'frame',
    name: 'root',
    layout: { type: rootLayout },
    children: [
      {
        type: 'frame',
        name: 'core',
        width: 'hug',
        height: 'hug',
        layout: { type: 'row', padding: [0, 24] },
        children: [{ type: 'rect', name: 'bar', width: 39, height: 36 }],
      },
    ],
  });
  const SMALL: Box = { x: 0, y: 0, width: 58, height: 40 };
  const TOO_BIG = 'content larger than the box: root';

  it('row root warns (87 of content in a box of 58)', () => {
    const result = run4(chip('row'), {}, SMALL);
    expect(result.overflowWarnings).toEqual([TOO_BIG]);
    expect(result.shortfalls?.[TOO_BIG]).toBe(29);
  });

  it('none root ALSO warns, with the same shortfall on the x axis', () => {
    const result = run4(chip('none'), {}, SMALL);
    expect(result.overflowWarnings).toEqual([TOO_BIG]);
    expect(result.shortfalls?.[TOO_BIG]).toBe(29);
  });

  it('in a box that fits, nothing', () => {
    expect(
      run4(chip('none'), {}, { x: 0, y: 0, width: 87, height: 36 }).warnings,
    ).toEqual([]);
  });

  it('a child centered or aligned by the frame larger than the box warns by size', () => {
    const wide = (props: Record<string, unknown>): FrameTemplate => ({
      type: 'frame',
      name: 'root',
      layout: { type: 'none' },
      children: [{ type: 'rect', width: 70, height: 10, ...props } as TemplateNode],
    });
    const centered = run4(wide({ anchors: { centerX: true } }), {}, SMALL);
    expect(centered.shortfalls?.[TOO_BIG]).toBe(12);
    const aligned = run4(
      { ...wide({}), layout: { type: 'none', justify: 'center' } } as FrameTemplate,
      {},
      SMALL,
    );
    expect(aligned.shortfalls?.[TOO_BIG]).toBe(12);
  });

  it('the extent sums the anchors (start + size + end)', () => {
    const result = run4(
      {
        type: 'frame',
        name: 'root',
        layout: { type: 'none' },
        children: [
          { type: 'rect', width: 40, height: 10, anchors: { left: 10 } },
          { type: 'rect', width: 40, height: 10, anchors: { right: 30 } },
        ],
      },
      {},
      SMALL,
    );
    expect(result.shortfalls?.[TOO_BIG]).toBe(12);
  });

  it('the child with anchors on both sides (stretched) does not warn', () => {
    const result = run4(
      {
        type: 'frame',
        name: 'root',
        layout: { type: 'none' },
        children: [{ type: 'rect', anchors: { left: 8, right: 8 }, height: 10 }],
      },
      {},
      SMALL,
    );
    expect(result.overflowWarnings).toEqual([]);
  });

  it('the vertical axis also warns', () => {
    const result = run4(
      {
        type: 'frame',
        name: 'root',
        layout: { type: 'none' },
        children: [{ type: 'rect', width: 10, height: 50 }],
      },
      {},
      SMALL,
    );
    expect(result.shortfalls?.[TOO_BIG]).toBe(10);
  });

  it('tolerance: 1 px of excess due to text does not warn; 2 px warns', () => {
    const textW = approximateMeasurer('Save', FONT).width;
    const label: FrameTemplate = {
      type: 'frame',
      name: 'root',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          text: 'Save',
          font: { size: 14, weight: 600 },
          color: '#000000',
        },
      ],
    };
    expect(
      run4(label, {}, { x: 0, y: 0, width: textW - 1, height: 40 }).overflowWarnings,
    ).toEqual([]);
    expect(
      run4(label, {}, { x: 0, y: 0, width: textW - 2, height: 40 }).overflowWarnings,
    ).toEqual([TOO_BIG]);
  });
});

describe('instantiate: the real Material 3 button on none (#1093)', () => {
  const entry = entryOf('button');
  const drawButton = (width: number, height: number) =>
    instantiate(
      entry.component as ComponentFile,
      { ...defaultValues(entry.type), label: 'Save' },
      { x: 0, y: 0, width, height },
      instantiateOptions(catalog, 'light'),
    );
  const TOO_BIG = 'content larger than the box: button';

  // At 58×40 the engine does NOT warn: the library label has `maxWidth` = width − 48, so the
  // text is cut at 10 px and the content frame closes at 58 (see the L2 phase return).
  it('at 136×40 it does not warn', () => {
    expect(drawButton(136, 40).overflowWarnings ?? []).not.toContain(TOO_BIG);
  });
});

describe('instantiate: clip by expression on the frame and clip on the slot', () => {
  const clipFrame = (clip: FrameTemplate['clip']): FrameTemplate => ({
    type: 'frame',
    ...(clip === undefined ? {} : { clip }),
    children: [
      {
        type: 'frame',
        name: 'inner',
        width: 50,
        height: 50,
        ...(clip === undefined ? {} : {}),
      },
    ],
  });
  const BOX_C: Box = { x: 0, y: 0, width: 100, height: 100 };

  it('a frame with clip by $field clips when the field is true and does not when it is false', () => {
    const tpl: FrameTemplate = {
      type: 'frame',
      children: [
        {
          type: 'frame',
          name: 'inner',
          clip: { $field: 'clip', default: false },
          width: 50,
          height: 50,
        },
      ],
    };
    const on = child(run4(tpl, { clip: YES }, BOX_C).root, 0) as FrameNode;
    const off = child(run4(tpl, { cortar: '' }, BOX_C).root, 0) as FrameNode;
    expect(on.clip).toBe(true);
    expect(off.clip).toBe(false);
  });

  it('the default holds: only the root clips; a literal clip applies', () => {
    const root = run4(clipFrame(undefined), {}, BOX_C).root as FrameNode;
    expect(root.clip).toBe(true);
    expect((child(root, 0) as FrameNode).clip).toBe(false);
    expect((run4(clipFrame(false), {}, BOX_C).root as FrameNode).clip).toBe(false);
  });

  const slotTpl = (clip?: unknown): FrameTemplate =>
    ({
      type: 'frame',
      children: [
        {
          type: 'slot',
          name: 'content',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          ...(clip === undefined ? {} : { clip }),
        },
      ],
    }) as FrameTemplate;

  it('a slot with clip: true sets clipChildren; without clip or false, it does not', () => {
    const slotOf = (clip?: unknown, values: Values = {}) =>
      child(run4(slotTpl(clip), values, BOX_C).root, 0) as SceneNode & {
        clipChildren?: true;
      };
    expect(slotOf(true).clipChildren).toBe(true);
    expect(slotOf({ $field: 'c' }, { c: YES }).clipChildren).toBe(true);
    expect(slotOf({ $field: 'c' }, { c: '' }).clipChildren).toBeUndefined();
    expect(slotOf(false).clipChildren).toBeUndefined();
    expect('clipChildren' in slotOf()).toBe(false);
  });
});
