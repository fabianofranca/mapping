// HC1 of #2164: a `fill` child on the main axis of a `hug` frame is measured by its content
// (decisions 2 to 5), clamped by its limits and by the available limit, with no warning.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

/** Weight 600 and size 10: 6 px per character with the approximate measurer. */
const FONT = { size: 10, weight: 600, lineHeight: 12 };
const CHAR = 6;
const text = (chars: number, over: Raw = {}): Raw => ({
  type: 'text',
  text: 'a'.repeat(chars),
  font: FONT,
  ...over,
});
const frame = (over: Raw, children: Raw[] = []): Raw => ({
  type: 'frame',
  children,
  ...over,
});
const rect = (width: number, height: number, over: Raw = {}): Raw => ({
  type: 'rect',
  width,
  height,
  ...over,
});
/** A `fill` frame that asks for exactly `width` px of content on the row's axis. */
const block = (width: number, over: Raw = {}): Raw =>
  frame({ layout: { type: 'none' }, width: 'fill', height: 10, ...over }, [
    rect(width, 10),
  ]);

function file(template: Raw, formatVersion = 4): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'hug-fill',
    name: 'Hug fill',
    size: { width: 200, height: 100 },
    template,
  } as unknown as ComponentFile;
}

const hug = { width: null, height: null };
const measure = (template: Raw, size = hug, values: FieldValues = {}) =>
  measureComponent(file(template), values, size, { measure: approximateMeasurer });

const WARNING = 'fill inside hug becomes 0';

const kid = (node: SceneNode, index: number): SceneNode => {
  const found = (node as FrameNode).children[index];
  if (!found) throw new Error(`no child ${index}`);
  return found;
};

describe('a `fill` child on the main axis of a `hug` frame', () => {
  it('row: padding + icon + gap + the text width + padding, with no warning', () => {
    const result = measure(
      frame({ layout: { type: 'row', padding: 12, gap: 8 } }, [
        rect(24, 24),
        text(10, { width: 'fill' }),
      ]),
    );
    expect(result.width).toBeCloseTo(12 + 24 + 8 + 10 * CHAR + 12, 6);
    expect(result.warnings).not.toContain(WARNING);
    expect(result.warnings).toEqual([]);
  });

  it('in every component formatVersion (no key)', () => {
    for (const version of [1, 2, 3, 4]) {
      const result = measureComponent(
        file(
          frame({ layout: { type: 'row', gap: 8 } }, [
            rect(24, 24),
            text(10, { width: 'fill' }),
          ]),
          version,
        ),
        {},
        hug,
        { measure: approximateMeasurer },
      );
      expect(result.width).toBeCloseTo(24 + 8 + 10 * CHAR, 6);
      expect(result.warnings).toEqual([]);
    }
  });

  describe('with `minWidth` 96 and `maxWidth` 136 on the root (a menu item)', () => {
    const item = (label: string, labelOver: Raw = {}): Raw =>
      frame(
        { layout: { type: 'row', padding: 12, gap: 8 }, minWidth: 96, maxWidth: 136 },
        [
          rect(24, 24),
          { type: 'text', text: label, font: FONT, width: 'fill', ...labelOver },
        ],
      );

    it('short text: the minimum, and the label gets what is left', () => {
      const result = measure(item('abc'));
      expect(result.width).toBe(96);
      expect(result.warnings).toEqual([]);
      const { root } = instantiate(
        file(item('abc')),
        {},
        { x: 0, y: 0, width: 96, height: 24 },
        { measure: approximateMeasurer },
      );
      expect(kid(root, 1).width).toBeCloseTo(96 - 12 - 24 - 8 - 12, 6);
    });

    it('long text: the maximum, and the label wraps in the second pass', () => {
      const long = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
      const result = measure(item(long));
      expect(result.width).toBe(136);
      expect(result.height).toBeGreaterThan(24 + 24);
      const { root } = instantiate(
        file(item(long)),
        {},
        { x: 0, y: 0, width: result.width, height: result.height },
        { measure: approximateMeasurer },
      );
      expect(kid(root, 1).width).toBeCloseTo(136 - 12 - 24 - 8 - 12, 6);
      expect(kid(root, 1).height).toBeGreaterThan(12);
    });

    it('long text with `ellipsis`: the maximum, and the label is cut on one line', () => {
      const long = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
      const result = measure(
        item(long, { font: { ...FONT, ellipsis: true, maxLines: 1 } }),
      );
      expect(result.width).toBe(136);
      expect(result.height).toBe(24 + 24);
    });
  });

  describe('several `fill` children (the smallest content that gives each its own)', () => {
    const rowOf = (a: Raw, b: Raw, gap = 0): Raw =>
      frame({ layout: { type: 'row', gap } }, [a, b]);

    it('A = 100 and B = 50, equal weights: 200 (100 each)', () => {
      const result = measure(rowOf(block(100), block(50)));
      expect(result.width).toBe(200);
      expect(result.warnings).toEqual([]);
    });

    it('weights 2:1: 150 (A 100, B 50)', () => {
      const result = measure(rowOf(block(100, { weight: 2 }), block(50)));
      expect(result.width).toBe(150);
    });

    it('A with `maxWidth` 60 and equal weights: 120 (60 each)', () => {
      const result = measure(rowOf(block(100, { maxWidth: 60 }), block(50)));
      expect(result.width).toBe(120);
    });

    it('adds the gap and the padding, and the second pass divides by weight', () => {
      const template = frame({ layout: { type: 'row', gap: 10, padding: 5 } }, [
        block(100),
        block(50),
      ]);
      const result = measure(template);
      expect(result.width).toBe(5 + 100 + 10 + 100 + 5);
      const { root } = instantiate(
        file(template),
        {},
        { x: 0, y: 0, width: result.width, height: result.height },
        { measure: approximateMeasurer },
      );
      expect([kid(root, 0).width, kid(root, 1).width]).toEqual([100, 100]);
    });

    it('a single `fill` is the sum: the fixed children plus its content', () => {
      const result = measure(rowOf(rect(30, 10), block(70), 4));
      expect(result.width).toBe(30 + 4 + 70);
    });
  });

  describe('the available limit caps the `fill`s (shrink-to-fit)', () => {
    it('a `hug` frame inside a parent of 100 with a 300 `fill` text measures 100 and wraps', () => {
      const template = frame({ layout: { type: 'column' }, width: 100, height: 100 }, [
        frame({ name: 'item', layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          text(50, { name: 'label', width: 'fill', text: 'aaaa '.repeat(60).trim() }),
        ]),
      ]);
      const { root, warnings } = instantiate(
        file(template),
        {},
        { x: 0, y: 0, width: 100, height: 100 },
        { measure: approximateMeasurer },
      );
      const item = kid(root, 0);
      expect(item.width).toBe(100);
      expect(kid(item, 0).width).toBe(100);
      expect(kid(item, 0).height).toBeGreaterThan(12);
      expect(warnings.filter((w) => w.startsWith('text measured with width 0'))).toEqual(
        [],
      );
    });

    it('the fixed children are not capped', () => {
      const template = frame({ layout: { type: 'column' }, width: 100, height: 100 }, [
        frame({ layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          rect(150, 10),
          text(20, { width: 'fill' }),
        ]),
      ]);
      const { root } = instantiate(
        file(template),
        {},
        { x: 0, y: 0, width: 100, height: 100 },
        { measure: approximateMeasurer },
      );
      const item = kid(root, 0);
      expect(kid(item, 0).width).toBe(150);
      expect(item.width).toBe(150);
    });

    it('the root `maxWidth` is the limit when measuring', () => {
      const result = measure(
        frame({ layout: { type: 'row', gap: 4 }, maxWidth: 100 }, [
          rect(20, 10),
          text(40, { width: 'fill' }),
        ]),
      );
      expect(result.width).toBe(100);
    });
  });

  it('column `hug` height with a `fill` child frame: the content, not 0 (the `event` header)', () => {
    const result = measure(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'none' }, width: 80, height: 'fill' }, [rect(80, 40)]),
      ]),
    );
    expect(result.height).toBe(40);
    expect(result.warnings).toEqual([]);
  });

  describe('`repeat` without `distribute` (a `hug` frame underneath)', () => {
    const rows: FieldValues = { rows: [{ a: '1' }, { a: '2' }, { a: '3' }] };

    it('a `fill` row on the rows axis has its content', () => {
      const template = frame({ layout: { type: 'column' } }, [
        {
          type: 'repeat',
          field: 'rows',
          gap: 6,
          template: frame({ layout: { type: 'none' }, height: 'fill', width: 50 }, [
            rect(50, 20),
          ]),
        },
      ]);
      const { root, warnings } = instantiate(
        file(template),
        rows,
        { x: 0, y: 0, width: 200, height: 300 },
        { measure: approximateMeasurer },
      );
      const list = kid(root, 0) as FrameNode;
      expect(list.children.map((c) => c.height)).toEqual([20, 20, 20]);
      expect(list.height).toBe(20 * 3 + 6 * 2);
      expect(warnings).not.toContain(WARNING);
    });
  });

  describe('what does not change', () => {
    it('`distribute: "fill"` still divides the axis', () => {
      const template = frame({ layout: { type: 'column' } }, [
        {
          type: 'repeat',
          field: 'rows',
          gap: 6,
          distribute: 'fill',
          template: frame({ layout: { type: 'none' }, height: 'fill' }, [rect(50, 20)]),
        },
      ]);
      const { root } = instantiate(
        file(template),
        { rows: [{ a: '1' }, { a: '2' }, { a: '3' }] },
        { x: 0, y: 0, width: 200, height: 300 },
        { measure: approximateMeasurer },
      );
      expect((kid(root, 0) as FrameNode).children.map((c) => c.height)).toEqual([
        96, 96, 96,
      ]);
    });

    it('the root drawn at a given box: the `fill`s divide that box', () => {
      const template = frame({ layout: { type: 'row', gap: 10 } }, [
        block(100),
        block(50),
      ]);
      const { root } = instantiate(
        file(template),
        {},
        { x: 0, y: 0, width: 210, height: 10 },
        { measure: approximateMeasurer },
      );
      expect([kid(root, 0).width, kid(root, 1).width]).toEqual([100, 100]);
    });

    it('the cross axis already contributed (`fill` width in a `column` `hug`)', () => {
      const result = measure(
        frame({ layout: { type: 'column' } }, [text(10, { width: 'fill' })]),
      );
      expect(result.width).toBeCloseTo(10 * CHAR, 6);
    });

    it('`min-content` and `max-content` frames are measured as before', () => {
      const result = measure(
        frame({ layout: { type: 'row', gap: 4 } }, [
          text(10, { width: 'max-content' }),
          rect(20, 10),
        ]),
      );
      expect(result.width).toBeCloseTo(10 * CHAR + 4 + 20, 6);
    });

    it('a `wrap` row still measures a `fill` by what it would hug', () => {
      const result = measure(
        frame({ layout: { type: 'row', wrap: 'wrap', gap: 4 } }, [
          rect(30, 10),
          text(10, { width: 'fill' }),
        ]),
      );
      expect(result.warnings).not.toContain(WARNING);
      expect(result.width).toBeCloseTo(30 + 4 + 10 * CHAR, 6);
    });
  });
});
