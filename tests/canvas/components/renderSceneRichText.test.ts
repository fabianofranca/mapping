// Format 4, phase CF4: rich text (`runs`) becomes a KonvaText per line piece and a KonvaRect
// per inline box (chip), at the positions of the scene `runLayout`.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { canvasFontFamily } from '../../../src/model/components/fontFamily';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { WRAP_SLACK } from '../../../src/model/components/textWrap';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { walk, type Scene, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

// Font 10 / line 12: in the approximate measurer each character measures 5.5 (6 in bold).
function file(node: Record<string, unknown>, width = 100, height = 60): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width, height },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width,
          height,
          font: { size: 10, lineHeight: 12, family: 'Roboto' },
          color: '#111111',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
}

function build(
  node: Record<string, unknown>,
  values: FieldValues = {},
  width = 100,
  height = 60,
): { scene: Scene; text: TextNode } {
  const { root } = instantiate(
    file(node, width, height),
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer },
  );
  const text = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!text) throw new Error('no text node');
  return { scene: { root, warnings: [] }, text };
}

function drawn(scene: Scene): { texts: Konva.Text[]; rects: Konva.Rect[] } {
  const { root } = renderScene(scene);
  return {
    texts: root.find('Text') as Konva.Text[],
    // The transparent frame carries an invisible clickable area: it does not count as a chip background.
    rects: (root.find('Rect') as Konva.Rect[]).filter((r) => r.fill() !== 'transparent'),
  };
}

const CHIP = { background: '#ffeecc', radius: 4, padding: [2, 4] };

describe('rich text in Konva', () => {
  it('one KonvaText per piece, with the font, weight and color of the run', () => {
    const { scene } = build({
      runs: [
        { text: 'Due in ' },
        { text: '3 days', weight: 700, color: '#ff0000', italic: true },
      ],
    });
    const { texts, rects } = drawn(scene);
    expect(rects).toHaveLength(0);
    expect(texts.map((t) => t.text())).toEqual(['Due in ', '3 days']);
    expect(texts[0]?.fill()).toBe('#111111');
    expect(texts[0]?.fontStyle()).toBe('normal');
    expect(texts[1]?.fill()).toBe('#ff0000');
    expect(texts[1]?.fontStyle()).toBe('italic bold');
    expect(texts[1]?.fontFamily()).toBe(canvasFontFamily('Roboto'));
    expect(texts[1]?.fontSize()).toBe(10);
  });

  it('each piece is a line without width or wrap (wrap none) and falls at the layout position', () => {
    const { scene, text } = build({
      runs: [{ text: 'Due in ' }, { text: '3 days', weight: 700, size: 14 }],
    });
    const { texts } = drawn(scene);
    const pieces = text.runLayout?.lines[0]?.pieces ?? [];
    expect(texts).toHaveLength(2);
    texts.forEach((shape, i) => {
      expect(shape.wrap()).toBe('none');
      expect(shape.attrs.width).toBeUndefined();
      expect(shape.attrs.height).toBeUndefined();
      expect(shape.x()).toBeCloseTo(pieces[i]?.x ?? NaN, 6);
    });
    // The larger piece (14) has a line of 16.8 and the smaller one, of 12, is centered in it.
    expect(texts[0]?.fontSize()).toBe(10);
    expect(texts[1]?.fontSize()).toBe(14);
    expect(texts[1]?.lineHeight()).toBeCloseTo(1.2, 6);
    expect(texts[0]?.y()).toBeCloseTo((16.8 - 12) / 2, 6);
    expect(texts[1]?.y()).toBeCloseTo(0, 6);
  });

  it('run decoration and the node letter spacing reach Konva', () => {
    const { scene } = build({
      font: { size: 10, lineHeight: 12, letterSpacing: 1 },
      runs: [{ text: 'a ' }, { text: 'riscado', decoration: 'line-through' }],
    });
    const { texts } = drawn(scene);
    expect(texts[0]?.textDecoration()).toBe('');
    expect(texts[1]?.textDecoration()).toBe('line-through');
    expect(texts.every((t) => t.letterSpacing() === 1)).toBe(true);
  });

  it('the node stroke applies to each text piece, in an outline shape separate from the fill', () => {
    const { scene } = build({
      stroke: { color: '#00ff00', width: 1 },
      runs: [{ text: 'a ' }, { text: 'b', color: '#ff0000' }],
    });
    const { texts } = drawn(scene);
    // Per piece: the text with the fill and, on top, the same text with only the outline.
    expect(texts).toHaveLength(4);
    const fills = texts.filter((t) => t.fillEnabled());
    const outlines = texts.filter((t) => !t.fillEnabled());
    expect(fills).toHaveLength(2);
    expect(outlines).toHaveLength(2);
    expect(outlines.every((t) => t.stroke() === '#00ff00' && t.strokeWidth() === 1)).toBe(
      true,
    );
    expect(fills.every((t) => !t.stroke())).toBe(true);
    expect(fills[1]?.fill()).toBe('#ff0000');
    expect(outlines.map((t) => t.text())).toEqual(fills.map((t) => t.text()));
  });

  it('the chip becomes a KonvaRect with background, radius and the layout box; the text sits padding[1] inside', () => {
    const { scene, text } = build({
      runs: [{ text: 'Status ' }, { text: 'ok', ...CHIP }],
    });
    const { texts, rects } = drawn(scene);
    const chip = text.runLayout?.lines[0]?.pieces[1];
    expect(chip?.chip).toBe(true);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.fill()).toBe('#ffeecc');
    expect(rects[0]?.cornerRadius()).toBe(4);
    expect(rects[0]?.x()).toBeCloseTo(chip?.x ?? NaN, 6);
    expect(rects[0]?.width()).toBeCloseTo(chip?.width ?? NaN, 6);
    expect(rects[0]?.height()).toBeCloseTo(chip?.height ?? NaN, 6);
    // Line of 16 (12 + 2·2): the chip takes the whole line and the text falls 2 below its top.
    expect(rects[0]?.y()).toBeCloseTo(0, 6);
    expect(texts[1]?.text()).toBe('ok');
    expect(texts[1]?.x()).toBeCloseTo((chip?.x ?? NaN) + 4, 6);
    expect(texts[1]?.y()).toBeCloseTo(2, 6);
    // The background is drawn before the chip text.
    const order = renderScene(scene).root.find('Shape') as Konva.Shape[];
    const kinds = order.map((shape) => shape.className);
    expect(kinds.slice(-2)).toEqual(['Rect', 'Text']);
  });

  it('chip at the start of the line: the " new" text keeps the space and starts at x 0', () => {
    // "aaaa bbbb cccc" takes 77 of 100; the " new" chip (22 + 8) does not fit in the rest.
    const { scene, text } = build({
      runs: [{ text: 'aaaa bbbb cccc' }, { text: ' new', ...CHIP }],
    });
    expect(text.runLayout?.lines).toHaveLength(2);
    const { texts, rects } = drawn(scene);
    const second = text.runLayout?.lines[1];
    expect(second?.pieces[0]).toMatchObject({ text: ' new', x: 0, chip: true });
    expect(rects).toHaveLength(1);
    expect(rects[0]?.x()).toBe(0);
    expect(rects[0]?.y()).toBeCloseTo(second?.y ?? NaN, 6);
    const added = texts.find((t) => t.text().includes('new'));
    expect(added?.text()).toBe(' new');
    // Konva only strips the leading space when it wraps the line itself: here it does not wrap.
    expect(added?.textArr[0]?.text).toBe(' new');
    expect(added?.x()).toBeCloseTo(4, 6);
  });

  it('verticalAlign middle and bottom shift the pieces by the box slack', () => {
    const runs = [{ text: 'Due in ' }, { text: 'ok', ...CHIP }];
    const top = build({ runs });
    const middle = build({
      font: { size: 10, lineHeight: 12, verticalAlign: 'middle' },
      runs,
    });
    const bottom = build({
      font: { size: 10, lineHeight: 12, verticalAlign: 'bottom' },
      runs,
    });
    const height = top.text.runLayout?.height ?? NaN;
    const free = 60 - height;
    expect(free).toBeGreaterThan(0);
    const yOf = (s: Scene): number[] => drawn(s).texts.map((t) => t.y());
    const rectY = (s: Scene): number => drawn(s).rects[0]?.y() ?? NaN;
    yOf(middle.scene).forEach((y, i) =>
      expect(y).toBeCloseTo(yOf(top.scene)[i]! + free / 2, 6),
    );
    yOf(bottom.scene).forEach((y, i) =>
      expect(y).toBeCloseTo(yOf(top.scene)[i]! + free, 6),
    );
    expect(rectY(middle.scene)).toBeCloseTo(rectY(top.scene) + free / 2, 6);
  });

  it('the node without runs does not change: a KonvaText with the node width and height', () => {
    const { scene } = build({ text: 'hello world' });
    const { texts, rects } = drawn(scene);
    expect(rects).toHaveLength(0);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.text()).toBe('hello world');
    expect(texts[0]?.wrap()).toBe('word');
    expect(texts[0]?.width()).toBe(100 + WRAP_SLACK);
  });
});

describe('rich text in Konva: reading direction (R2, #1107)', () => {
  const runs = [{ text: 'ab ' }, { text: 'cd', weight: 700 }];

  it('in rtl each piece carries direction rtl and the first run sits to the right of the second', () => {
    const { root } = instantiate(
      file({ runs, font: { size: 10, lineHeight: 12, align: 'start' } }),
      {},
      { x: 0, y: 0, width: 100, height: 60 },
      { measure: approximateMeasurer, direction: 'rtl' },
    );
    const texts = renderScene({ root, warnings: [] }).root.find('Text') as Konva.Text[];
    expect(texts.map((t) => t.text())).toEqual(['ab ', 'cd']);
    for (const t of texts) expect(t.direction()).toBe('rtl');
    expect(texts[0]!.x()).toBeGreaterThan(texts[1]!.x());
  });

  it('in ltr the piece carries no direction and the order is the usual one', () => {
    const { scene } = build({ runs });
    const { texts } = drawn(scene);
    for (const t of texts) expect(t.direction()).not.toBe('rtl');
    expect(texts[0]!.x()).toBeLessThan(texts[1]!.x());
  });
});
