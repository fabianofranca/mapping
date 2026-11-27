// RT3 of #2916: the inline icon run (`{ "icon": "<name>", "color"?, "size"?, "baselineShift"? }`, v4):
// format, layout atom and scene. The drawers (RT4) are not covered here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import { grayscaleNode } from '../../../src/model/components/grayscale';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type MeasureFont,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import {
  layoutRuns,
  minContentRuns,
  type RichBase,
  type RichRun,
} from '../../../src/model/components/richText';
import { walk, type TextNode } from '../../../src/model/components/scene';

const V4 = 'only allowed with formatVersion 4';

function component(runs: unknown, version = 4): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [{ type: 'text', runs }] },
  };
}

const parsed = (runs: unknown, version = 4) =>
  validateComponent(component(runs, version));

describe('parse of an icon run', () => {
  it('{ icon } alone is valid', () => {
    expect(parsed([{ icon: 'x' }])).toEqual([]);
  });

  it('accepts color, size and baselineShift, literal or expression', () => {
    expect(
      parsed([
        { icon: 'x', color: '#f00', size: 12, baselineShift: '10%' },
        { icon: { $field: 'i' }, color: { $field: 'c' }, size: { $field: 's' } },
      ]),
    ).toEqual([]);
  });

  it('text together with icon asks for one or the other', () => {
    expect(parsed([{ text: 'a', icon: 'x' }])).toEqual([
      'template.children[0].runs[0]: text and icon together: use one or the other',
    ]);
  });

  it('weight on an icon run is an unknown key', () => {
    expect(parsed([{ icon: 'x', weight: 700 }])).toEqual([
      'template.children[0].runs[0].weight: unknown key: weight',
    ]);
  });

  it.each(['italic', 'family', 'decoration', 'background', 'radius', 'padding'])(
    '%s on an icon run is an unknown key',
    (key) => {
      expect(parsed([{ icon: 'x', [key]: 1 }])).toEqual([
        `template.children[0].runs[0].${key}: unknown key: ${key}`,
      ]);
    },
  );

  it('icon must be text', () => {
    expect(parsed([{ icon: 5 }])).toEqual([
      'template.children[0].runs[0].icon: expected text',
    ]);
  });

  it('a run with neither text nor icon asks for text', () => {
    expect(parsed([{ color: '#fff' }])).toEqual([
      'template.children[0].runs[0].text: required field',
    ]);
  });

  it('in formatVersion 3 it is only allowed with formatVersion 4', () => {
    expect(parsed([{ icon: 'x' }], 3)).toContain(`template.children[0].runs: ${V4}`);
  });
});

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};
const BASE: RichBase = { size: 14, lineHeight: 16.8 };

const text = (value: string): RichRun => ({ text: value, font: FONT });
const icon = (width: number, height: number): RichRun => ({
  text: '',
  font: FONT,
  inline: { width, height },
});

describe('layout of the inline atom', () => {
  it('the piece has the icon box and is flagged inline', () => {
    const layout = layoutRuns([text('ab'), icon(20, 24)], BASE, approximateMeasurer, 200);
    const piece = layout.lines[0]?.pieces[1];
    expect(piece).toMatchObject({
      run: 1,
      width: 20,
      height: 24,
      inline: true,
      chip: false,
    });
    expect(piece?.x).toBeCloseTo(layout.lines[0]!.pieces[0]!.width, 10);
  });

  it('the line height is the tallest of the node line and the icon', () => {
    const tall = layoutRuns([text('a'), icon(10, 30)], BASE, approximateMeasurer, 200);
    expect(tall.lines[0]?.height).toBe(30);
    const small = layoutRuns([text('a'), icon(10, 8)], BASE, approximateMeasurer, 200);
    expect(small.lines[0]?.height).toBe(16.8);
  });

  it('never breaks inside and goes whole to the next line', () => {
    // "aaaa " is 5 × 7.7 = 38.5; the 30 px icon does not fit in 50
    const layout = layoutRuns(
      [text('aaaa '), icon(30, 14)],
      BASE,
      approximateMeasurer,
      50,
    );
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1]?.pieces.map((p) => p.inline)).toEqual([true]);
    expect(layout.lines[1]?.pieces[0]?.x).toBe(0);
  });

  it('the edges are break opportunities (no space needed around it)', () => {
    const layout = layoutRuns(
      [text('aaaa'), icon(30, 14)],
      BASE,
      approximateMeasurer,
      50,
    );
    expect(layout.lines).toHaveLength(2);
  });

  it('wider than the box it stays alone and overflows', () => {
    const layout = layoutRuns([icon(80, 14)], BASE, approximateMeasurer, 50);
    expect(layout.lines).toHaveLength(1);
    expect(layout.width).toBe(80);
  });

  it('a leading space before the icon at the start of a line is discarded', () => {
    const layout = layoutRuns([text('  '), icon(10, 14)], BASE, approximateMeasurer, 50);
    expect(layout.lines[0]?.pieces).toHaveLength(1);
    expect(layout.lines[0]?.pieces[0]?.x).toBe(0);
  });

  it('min-content counts the icon as an atom', () => {
    expect(minContentRuns([text('a b'), icon(40, 14)], BASE, approximateMeasurer)).toBe(
      40,
    );
  });

  it('ellipsis removes the icon whole', () => {
    const layout = layoutRuns(
      [text('ab'), icon(30, 14)],
      { ...BASE, wrap: 'none', ellipsis: true },
      approximateMeasurer,
      30,
    );
    const pieces = layout.lines[0]!.pieces;
    expect(pieces.some((p) => p.inline === true)).toBe(false);
    expect(pieces.map((p) => p.text).join('')).toContain('…');
  });

  it('rtl puts the first piece at the right edge', () => {
    const ltr = layoutRuns([text('ab'), icon(20, 14)], BASE, approximateMeasurer, 100);
    const rtl = layoutRuns(
      [text('ab'), icon(20, 14)],
      { ...BASE, direction: 'rtl' },
      approximateMeasurer,
      100,
    );
    const w = ltr.width;
    expect(rtl.lines[0]?.pieces[1]?.x).toBeCloseTo(0, 10);
    expect(rtl.lines[0]?.pieces[0]?.x).toBeCloseTo(
      w - ltr.lines[0]!.pieces[0]!.width,
      10,
    );
  });
});

// ---------------------------------------------------------------------------------------
// Engine and scene
// ---------------------------------------------------------------------------------------

const ICONS: IconSet = {
  viewBox: [24, 24],
  icons: {
    check: {
      paths: [{ d: 'M5 12l5 5L20 7', stroke: true, width: 2, cap: 'round' }],
    },
    wide: {
      viewBox: [48, 24],
      paths: [{ d: 'M0 0h48v24z', fill: true }],
    },
    arrow: { mirror: true, paths: [{ d: 'M2 12h20', stroke: true, width: 2 }] },
  },
};

function file(runs: unknown[], extra: Record<string, unknown> = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width: 200, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 200,
          height: 'hug',
          font: { size: 12 },
          color: '#112233',
          runs,
          ...extra,
        },
      ],
    } as ComponentFile['template'],
  };
}

function build(f: ComponentFile, values: FieldValues = {}, direction?: 'rtl') {
  const opts = { measure: approximateMeasurer, icons: ICONS };
  const { height } = measureComponent(f, values, { width: 200, height: null }, opts);
  const result = instantiate(
    f,
    values,
    { x: 0, y: 0, width: 200, height },
    { ...opts, ...(direction ? { direction } : {}) },
  );
  const node = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
  if (!node) throw new Error('no text node');
  return { node, height, warnings: result.warnings };
}

describe('the engine resolves an icon run', () => {
  it('the box is size × vbW / vbH wide and size tall; the default size is the font size', () => {
    const { node } = build(file([{ icon: 'wide', size: 20 }, { icon: 'check' }]));
    const [a, b] = node.runLayout!.lines[0]!.pieces;
    expect(a).toMatchObject({ width: 40, height: 20, inline: true });
    expect(b).toMatchObject({ width: 12, height: 12, inline: true });
  });

  it('SceneTextRun.icon is the group of the icon paths in the run color', () => {
    const { node } = build(file([{ icon: 'check', size: 24, color: '#ff0000' }]));
    const run = node.runs![0]!;
    expect(run.text).toBe('');
    expect(run.icon?.type).toBe('group');
    const path = run.icon!.children[0]!;
    expect(path.type).toBe('path');
    expect(JSON.stringify(path.stroke)).toContain('#ff0000');
    // scaled from the 24 viewBox to a 24 px box: identity matrix
    expect(path.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(run.icon).toMatchObject({
      width: 24,
      height: 24,
      transform: [1, 0, 0, 1, 0, 0],
    });
  });

  it('the color defaults to the node color', () => {
    const { node } = build(file([{ icon: 'check' }]));
    expect(JSON.stringify(node.runs![0]!.icon)).toContain('#112233');
  });

  it('the node text is the concatenation of the text runs', () => {
    const { node } = build(file([{ text: 'a' }, { icon: 'check' }, { text: 'b' }]));
    expect(node.text).toBe('ab');
    expect(node.runs).toHaveLength(3);
  });

  it('an expression name is evaluated', () => {
    const { node } = build(file([{ icon: { $field: 'i' } }]), { i: 'wide' });
    expect(node.runLayout!.lines[0]!.pieces[0]!.width).toBe(24);
  });

  it('baselineShift on an icon run: a percentage is of its size', () => {
    const { node } = build(file([{ icon: 'check', size: 20, baselineShift: '50%' }]));
    expect(node.runs![0]!.baselineShift).toBe(10);
  });

  it('rtl mirrors an icon whose set says mirror', () => {
    const rtl = build(file([{ icon: 'arrow', size: 24 }]), {}, 'rtl').node.runs![0]!
      .icon!;
    const ltr = build(file([{ icon: 'arrow', size: 24 }])).node.runs![0]!.icon!;
    expect(ltr.children[0]!.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(rtl.children[0]!.transform).toEqual([-1, 0, 0, 1, 24, 0]);
  });

  it('the icon makes the line as tall as it is', () => {
    const { node, height } = build(file([{ text: 'a' }, { icon: 'check', size: 40 }]));
    expect(node.runLayout!.lines[0]!.height).toBe(40);
    expect(height).toBe(40);
  });
});

describe('an unknown or empty icon name', () => {
  it('an unknown name warns engine.iconUnknown and keeps an empty box of size × size', () => {
    const { node, warnings } = build(file([{ icon: 'nope', size: 18 }]));
    expect(warnings).toContain('unknown icon: nope');
    expect(node.runLayout!.lines[0]!.pieces[0]).toMatchObject({
      width: 18,
      height: 18,
      inline: true,
    });
    expect(node.runs![0]!.icon).toBeUndefined();
  });

  it('an empty name gives no piece and no warning', () => {
    const { node, warnings } = build(file([{ text: 'a' }, { icon: '' }]));
    expect(node.runLayout!.lines[0]!.pieces.every((p) => p.inline !== true)).toBe(true);
    expect(warnings.filter((w) => w.includes('icon'))).toEqual([]);
  });

  it('a name from an empty field gives no piece and no warning', () => {
    const { node, warnings } = build(file([{ icon: { $field: 'i' } }]), { i: '' });
    expect(node.runLayout!.lines[0]?.pieces ?? []).toEqual([]);
    expect(warnings.filter((w) => w.includes('icon'))).toEqual([]);
  });
});

describe('grayscale', () => {
  it('desaturates the icon of the run', () => {
    const { node } = build(file([{ icon: 'check', color: '#ff0000' }]));
    const gray = grayscaleNode(node, 1);
    const before = JSON.stringify(node.runs![0]!.icon);
    const after = JSON.stringify(gray.runs![0]!.icon);
    expect(before).toContain('#ff0000');
    expect(after).not.toContain('#ff0000');
    expect(gray.runs![0]!.color).not.toBe(node.runs![0]!.color);
  });
});

describe('docs/component.schema.json mirrors the icon run', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  const accepts = (runs: unknown) => checkSchema(schema, component(runs)).length === 0;

  it('accepts an icon run among the text runs', () => {
    expect(
      accepts([
        { text: 'a' },
        { icon: 'x', color: '#f00', size: 12, baselineShift: '10%' },
        { icon: { $field: 'i' } },
      ]),
    ).toBe(true);
  });

  it.each([
    [{ text: 'a', icon: 'x' }],
    [{ icon: 'x', weight: 700 }],
    [{ icon: 'x', background: '#fff' }],
    [{ icon: 1 }],
  ])('rejects %j', (run) => {
    expect(accepts([run])).toBe(false);
  });
});

describe('review fixes', () => {
  const ids = (node: TextNode) => {
    const out: string[] = [];
    const visit = (n: { id: string; children?: readonly unknown[] }): void => {
      out.push(n.id);
      (n.children ?? []).forEach((c) => visit(c as never));
    };
    node.runs?.forEach((r) => r.icon && visit(r.icon));
    return out;
  };

  it('two text nodes with an icon run at the same index have different scene ids', () => {
    const two = file([{ icon: 'check' }]);
    const frame = two.template as unknown as { children: Record<string, unknown>[] };
    frame.children.push({
      ...frame.children[0]!,
      name: 'u',
      anchors: { left: 0, top: 20 },
    });
    const result = instantiate(
      two,
      {},
      { x: 0, y: 0, width: 200, height: 40 },
      { measure: approximateMeasurer, icons: ICONS },
    );
    const nodes = [...walk(result.root)].filter((n): n is TextNode => n.type === 'text');
    const all = nodes.flatMap(ids);
    expect(all.length).toBeGreaterThan(2);
    expect(new Set(all).size).toBe(all.length);
  });

  it('the ellipsis after an icon uses the text font and does not stretch the line', () => {
    const base: RichBase = { ...BASE, maxLines: 1, ellipsis: true };
    const runs: RichRun[] = [
      text('aaaa aaaa '),
      { text: '', font: { ...FONT, size: 32 }, inline: { width: 10, height: 32 } },
      text(' bbbbbbbb'),
    ];
    const layout = layoutRuns(runs, base, approximateMeasurer, 100);
    const pieces = layout.lines[0]!.pieces;
    expect(pieces.map((p) => p.inline === true)).toContain(true);
    const dots = pieces[pieces.length - 1]!;
    expect(dots.text).toBe('…');
    expect(runs[dots.run]!.inline).toBeUndefined();
    expect(dots.height).toBeLessThan(32);
  });

  it('$lines counts the line of a node whose runs are all icons', () => {
    const f = file([{ icon: 'check' }]);
    const frame = f.template as unknown as { children: Record<string, unknown>[] };
    frame.children.push({
      type: 'text',
      name: 'u',
      anchors: { left: 0, top: 20 },
      width: 100,
      height: 'hug',
      text: { $lines: 't' },
    });
    const result = instantiate(
      f,
      {},
      { x: 0, y: 0, width: 200, height: 40 },
      { measure: approximateMeasurer, icons: ICONS },
    );
    const u = [...walk(result.root)].find(
      (n): n is TextNode => n.type === 'text' && n.name === 'u',
    );
    expect(u?.text).toBe('1');
  });
});
