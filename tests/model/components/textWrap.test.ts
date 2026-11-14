// Format 4, phase CF3: `font.wrap`, `font.ellipsis`, `font.maxLines`, the warning for text that does not
// fit in the height and the 1 px tolerance per text node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { baseNode, type TextNode } from '../../../src/model/components/scene';
import { textBars } from '../../../mcp/image/textBars';
import {
  cutLineLeft,
  konvaLineHeight,
  visibleLineCount,
} from '../../../src/model/components/textWrap';

const V4 = 'only allowed with formatVersion 4';
const LONG = 'Words spill beyond into a frame';
type MeasureFont = Parameters<TextMeasurer>[1];

/** 10 px, 5.5 px per character (approximate), line of 12 px. */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 10,
  weight: 400,
  italic: false,
  lineHeight: 12,
  letterSpacing: 0,
};

describe('approximateMeasurer: wrap, ellipsis and maxLines', () => {
  it('wrap "none" measures a single line, even in an 80 px box', () => {
    const wrapped = approximateMeasurer(LONG, FONT, 80);
    expect(wrapped.height).toBeGreaterThan(12);
    const single = approximateMeasurer(LONG, { ...FONT, wrap: 'none' }, 80);
    expect(single.height).toBe(12);
  });

  it('ellipsis + wrap "none": the text that does not fit ends in … and the width does not go past 80', () => {
    const result = approximateMeasurer(
      LONG,
      { ...FONT, wrap: 'none', ellipsis: true },
      80,
    );
    expect(result.width).toBeLessThanOrEqual(80);
    expect(result.height).toBe(12);
    expect(result.lines).toHaveLength(1);
    expect(result.lines?.[0]?.endsWith('…')).toBe(true);
  });

  it('wrap "none" without ellipsis does not cut the text', () => {
    const result = approximateMeasurer(LONG, { ...FONT, wrap: 'none' }, 80);
    expect(result.lines?.[0]).toBe(LONG);
  });

  it('maxLines 2 + ellipsis: the second line ends in …; without ellipsis, it is cut', () => {
    const text = 'aaaa bbbb cccc dddd eeee';
    const full = approximateMeasurer(text, FONT, 40);
    expect(full.lines).toHaveLength(5);
    const withDots = approximateMeasurer(
      text,
      { ...FONT, maxLines: 2, ellipsis: true },
      40,
    );
    expect(withDots.lines).toHaveLength(2);
    expect(withDots.lines?.[1]?.endsWith('…')).toBe(true);
    expect(withDots.height).toBe(24);
    const cut = approximateMeasurer(text, { ...FONT, maxLines: 2 }, 40);
    expect(cut.lines).toEqual(['aaaa', 'bbbb']);
    expect(cut.height).toBe(24);
  });

  it('text that fits in maxLines does not change', () => {
    const result = approximateMeasurer(
      'aaaa bbbb',
      { ...FONT, maxLines: 3, ellipsis: true },
      40,
    );
    expect(result.lines).toEqual(['aaaa', 'bbbb']);
  });
});

describe('textBars (raster measurer): wrap, ellipsis and maxLines', () => {
  const text = (extra: Partial<TextNode['style']>, width = 80): TextNode => ({
    ...baseNode({ id: 't', name: 't', width, height: 40, fills: [] }),
    type: 'text',
    text: LONG,
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 12,
      align: 'left',
      verticalAlign: 'top',
      ...extra,
    },
  });

  it('wrap "none" draws a single bar', () => {
    expect(textBars(text({}), approximateMeasurer).length).toBeGreaterThan(1);
    const bars = textBars(text({ wrap: 'none' }), approximateMeasurer);
    expect(bars).toHaveLength(1);
  });

  it('ellipsis + wrap "none": the bar does not go past the node width', () => {
    const bars = textBars(text({ wrap: 'none', ellipsis: true }), approximateMeasurer);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.width).toBeLessThanOrEqual(80);
  });

  it('maxLines limits the number of bars', () => {
    expect(textBars(text({ maxLines: 2 }, 40), approximateMeasurer)).toHaveLength(2);
  });
});

function component(
  child: Record<string, unknown>,
  version = 4,
  size = { width: 100, height: 40 },
): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size,
    template: { type: 'frame', children: [child] },
  };
}

const textNode = (font: Record<string, unknown>): Record<string, unknown> => ({
  type: 'text',
  text: LONG,
  font,
});

describe('validation of font.wrap, font.ellipsis and font.maxLines', () => {
  it('they apply in formatVersion 4, with literal or expression', () => {
    expect(
      validateComponent(
        component(
          textNode({
            wrap: 'none',
            ellipsis: true,
            maxLines: 2,
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      validateComponent(
        component(
          textNode({
            wrap: { $field: 'wrap', default: 'word' },
            ellipsis: { $field: 'dots', default: true },
            maxLines: { $field: 'lines', default: 2 },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it.each(['wrap', 'ellipsis', 'maxLines'])(
    '%s in formatVersion 3 is an error at the key path',
    (key) => {
      const value = { wrap: 'none', ellipsis: true, maxLines: 2 }[key];
      const errors = validateComponent(component(textNode({ [key]: value }), 3));
      expect(errors).toEqual([`template.children[0].font.${key}: ${V4}`]);
    },
  );

  it('expression in formatVersion 3 is also an error', () => {
    const errors = validateComponent(
      component(textNode({ maxLines: { $field: 'lines', default: 2 } }), 3),
    );
    expect(errors).toEqual([`template.children[0].font.maxLines: ${V4}`]);
  });

  it('maxLines 0, negative or fractional is an error', () => {
    for (const bad of [0, -1, 1.5]) {
      const errors = validateComponent(component(textNode({ maxLines: bad })));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('template.children[0].font.maxLines');
    }
  });

  it('wrap outside word/none and ellipsis that is not a boolean are an error', () => {
    expect(validateComponent(component(textNode({ wrap: 'char' })))).toHaveLength(1);
    expect(validateComponent(component(textNode({ ellipsis: 'sim' })))).toHaveLength(1);
  });
});

function drawn(
  font: Record<string, unknown>,
  node: Record<string, unknown> = {},
  box = { x: 0, y: 0, width: 100, height: 40 },
) {
  const tpl = {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'text', name: 'label', text: LONG, font, ...node }],
  } as unknown as FrameTemplate;
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width: box.width, height: box.height },
    template: tpl,
  };
  return instantiate(file, {}, box, { measure: approximateMeasurer });
}

describe('warning text larger than the box', () => {
  const OVERFLOW = 'text larger than the box: label';

  it('3 lines in a box that fits 2, without maxLines or ellipsis: warning', () => {
    // width 80: "Words spill beyond into a frame" wraps into 3 lines of 12 px = 36 > 24.
    const { warnings } = drawn({ size: 10, lineHeight: 12 }, { width: 80, height: 24 });
    expect(warnings).toContain(OVERFLOW);
  });

  it('with maxLines or ellipsis the text is cut on purpose: no warning', () => {
    const node = { width: 80, height: 24 };
    expect(drawn({ size: 10, lineHeight: 12, maxLines: 2 }, node).warnings).not.toContain(
      OVERFLOW,
    );
    expect(
      drawn({ size: 10, lineHeight: 12, ellipsis: true }, node).warnings,
    ).not.toContain(OVERFLOW);
  });

  it('fitting in the height does not warn', () => {
    const { warnings } = drawn({ size: 10, lineHeight: 12 }, { width: 80, height: 48 });
    expect(warnings).not.toContain(OVERFLOW);
  });

  it('an excess of 0.6 px coming from text does not warn; of 2 px, it warns', () => {
    const short = { text: 'short', width: 100 };
    // line of 12.6 px in a box of 12 px.
    expect(
      drawn({ size: 10, lineHeight: 12.6 }, { ...short, height: 12 }).warnings,
    ).not.toContain(OVERFLOW);
    // line of 14 px in a box of 12 px.
    expect(
      drawn({ size: 10, lineHeight: 14 }, { ...short, height: 12 }).warnings,
    ).toContain(OVERFLOW);
  });
});

describe('1 px tolerance in the "content larger than the box" coming from text', () => {
  const column = (lineHeight: number): ComponentFile => ({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'col',
    name: 'Col',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      name: 'col',
      layout: { type: 'column' },
      children: [{ type: 'text', name: 'a', text: 'short', font: { lineHeight } }],
    },
  });
  const warnings = (lineHeight: number, height: number) =>
    instantiate(
      column(lineHeight),
      {},
      { x: 0, y: 0, width: 100, height },
      { measure: approximateMeasurer },
    ).warnings;

  it('0.6 px of extra text does not warn', () => {
    expect(warnings(12.6, 12)).not.toContain('content larger than the box: col');
  });

  it('2 px of extra text warns', () => {
    expect(
      warnings(14, 12).some((w) => w.startsWith('content larger than the box')),
    ).toBe(true);
  });
});

describe('component.schema.json: wrap, ellipsis and maxLines', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

  it('accepts the three keys, with literal or expression, and refuses maxLines 0', () => {
    const ok = component(
      textNode({
        wrap: 'none',
        ellipsis: true,
        maxLines: { $field: 'lines', default: 2 },
      }),
    );
    expect(checkSchema(schema, ok)).toEqual([]);
    expect(
      checkSchema(schema, component(textNode({ maxLines: 0 }))).length,
    ).toBeGreaterThan(0);
    expect(
      checkSchema(schema, component(textNode({ wrap: 'char' }))).length,
    ).toBeGreaterThan(0);
  });
});

describe('cutLineLeft (MC0, decision 30): where the line of the cut text starts', () => {
  // Box of 100; the block is the widest line.
  it.each([
    ['left', 0, 0],
    ['justify', 0, 0],
    ['center', 20, 20],
    ['right', 40, 40],
  ] as const)('%s: the widest line (60) starts at %i', (align, _x, expected) => {
    expect(cutLineLeft(align, 100, 60, 60)).toBe(expected);
  });

  it.each([
    ['left', 0],
    ['justify', 0],
    ['center', 20 + 10],
    ['right', 40 + 20],
  ] as const)(
    '%s: the short line (40) inside the block of 60 starts at %i',
    (align, expected) => {
      expect(cutLineLeft(align, 100, 60, 40)).toBe(expected);
    },
  );

  it.each(['left', 'justify', 'center', 'right'] as const)(
    '%s: the block wider than the box starts at the left edge',
    (align) => {
      expect(cutLineLeft(align, 100, 160, 160)).toBe(0);
    },
  );

  it('the block wider than the box aligns the short line inside the block, not the box', () => {
    expect(cutLineLeft('center', 100, 160, 100)).toBe(30);
    expect(cutLineLeft('right', 100, 160, 100)).toBe(60);
    expect(cutLineLeft('left', 100, 160, 100)).toBe(0);
  });

  it('the block the size of the box starts at 0', () => {
    expect(cutLineLeft('right', 100, 100, 100)).toBe(0);
    expect(cutLineLeft('center', 100, 100, 100)).toBe(0);
  });
});

describe('visibleLineCount (MC0, decision 31): the lines that Konva keeps', () => {
  it('the first line always stays, even in a box smaller than the line', () => {
    expect(visibleLineCount(3, 5, 12)).toBe(1);
  });

  it('box of 1 line: 1; of 2: 2; of 2.5: 2; of 3: 3', () => {
    expect(visibleLineCount(5, 12, 12)).toBe(1);
    expect(visibleLineCount(5, 24, 12)).toBe(2);
    expect(visibleLineCount(5, 30, 12)).toBe(2);
    expect(visibleLineCount(5, 36, 12)).toBe(3);
  });

  it('block smaller than the box: all the lines', () => {
    expect(visibleLineCount(2, 100, 12)).toBe(2);
    expect(visibleLineCount(0, 100, 12)).toBe(0);
  });

  it('without a height (0), all the lines', () => {
    expect(visibleLineCount(4, 0, 12)).toBe(4);
  });

  it('without a total (Infinity) returns how many lines fit', () => {
    expect(visibleLineCount(Number.POSITIVE_INFINITY, 30, 12)).toBe(2);
  });

  it('the same arithmetic as Konva: lineHeight / fontSize × fontSize, summed line by line', () => {
    // 14.3 / 11 × 11 is not exactly 14.3; the sum of 3 lines in the box of 3 × 14.3 decides.
    const lh = konvaLineHeight(14.3, 11);
    expect(visibleLineCount(9, lh * 3, lh)).toBe(3);
  });
});
