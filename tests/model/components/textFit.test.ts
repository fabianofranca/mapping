// Format 4, stage #2916, phase RT1: text that shrinks its font to fit its width (`font.fit:
// "shrink"` with `fitSizes`), in the engine, with the `approximateMeasurer` (a character is
// 0.55 × the size wide, the line is 1.2 × the size high).
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk, type TextNode } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

/** 10 characters: 225.5 px at 41, 176 at 32 and 159.5 at 29. */
const VALUE = '1234567890';
/** Three words of 4 characters: a word is 90.2 px at 41, 70.4 at 32 and 63.8 at 29. */
const WORDS = 'abcd efgh ijkl';
const FIT = { size: 41, fit: 'shrink', fitSizes: [32, 29] };
const WARNING = /^text larger than the box/;

function file(template: Json, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 400, height: 200 },
    template,
    ...extra,
  };
}

function text(name: string, value: unknown, font: Json = FIT, extra: Json = {}): Json {
  return { type: 'text', name, text: value, width: 'fill', font, ...extra };
}

function host(...kids: Json[]): Json {
  return {
    type: 'frame',
    name: 'host',
    layout: { type: 'column' },
    children: kids,
    width: 'fill',
    height: 'fill',
  };
}

function build(
  template: Json,
  width: number,
  values: Json = {},
  measure: TextMeasurer = approximateMeasurer,
) {
  const result = instantiate(
    file(template) as never,
    values as never,
    { x: 0, y: 0, width, height: 200 },
    { measure },
  );
  absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string) => {
    const node = nodes.find((n) => n.name === name) as TextNode | undefined;
    if (node === undefined) throw new Error(`no node ${name}`);
    return node;
  };
  return { ...result, at };
}

describe('RT1: the first size that fits the width wins', () => {
  it.each([
    [250, 41, 41 * 1.2],
    [200, 32, 32 * 1.2],
    [170, 29, 29 * 1.2],
  ])('in %s px the text takes %s and hugs %s px of height', (width, size, height) => {
    const { at, warnings } = build(host(text('v', VALUE)), width);
    expect(at('v').style.fontSize).toBe(size);
    expect(at('v').height).toBeCloseTo(height, 9);
    expect(warnings.filter((w) => WARNING.test(w))).toEqual([]);
  });

  it('too narrow for all three: the smallest applies and the text is larger than the box', () => {
    const { at, warnings } = build(host(text('v', VALUE)), 100);
    expect(at('v').style.fontSize).toBe(29);
    expect(warnings.filter((w) => WARNING.test(w))).toHaveLength(1);
  });

  it('without `fit` the text keeps its size, as before', () => {
    const { at } = build(host(text('v', VALUE, { size: 41 })), 200);
    expect(at('v').style.fontSize).toBe(41);
    const none = build(
      host(text('v', VALUE, { size: 41, fit: 'none', fitSizes: [32] })),
      200,
    );
    expect(none.at('v').style.fontSize).toBe(41);
  });

  it('`wrap: "none"` takes the first size whose single line fits', () => {
    const font = { ...FIT, wrap: 'none' };
    const { at, warnings } = build(host(text('v', VALUE, font)), 180);
    expect(at('v').style.fontSize).toBe(32);
    expect(warnings.filter((w) => WARNING.test(w))).toEqual([]);
  });

  it('each paragraph of `wrap: "none"` has to fit', () => {
    const font = { ...FIT, wrap: 'none' };
    const { at } = build(host(text('v', `${VALUE}\n12345`, font)), 180);
    expect(at('v').style.fontSize).toBe(32);
    const long = build(host(text('v', `12\n${VALUE}${VALUE}`, font)), 180);
    expect(long.at('v').style.fontSize).toBe(29);
  });

  it('a `fill` text takes the width of the box where it is laid out (a field drives the size)', () => {
    const template = host(text('v', { $field: 'value' }));
    expect(build(template, 250, { value: VALUE }).at('v').style.fontSize).toBe(41);
    expect(
      build(template, 250, { value: `${VALUE}${VALUE}` }).at('v').style.fontSize,
    ).toBe(29);
  });
});

describe('RT1: hug text', () => {
  it('a `hug` text without `maxWidth` keeps font.size', () => {
    const { at } = build(host(text('v', VALUE, FIT, { width: 'hug' })), 100);
    expect(at('v').style.fontSize).toBe(41);
    expect(at('v').width).toBeCloseTo(225.5, 9);
  });

  it('a `hug` text cut by `maxWidth` takes the first size that fits it', () => {
    const { at } = build(
      host(text('v', VALUE, FIT, { width: 'hug', maxWidth: 200 })),
      400,
    );
    expect(at('v').style.fontSize).toBe(32);
    expect(at('v').width).toBeCloseTo(176, 9);
    expect(at('v').height).toBeCloseTo(32 * 1.2, 9);
  });
});

describe('RT1: maxLines and $lines follow the chosen size', () => {
  it('`maxLines: 2` with `wrap: "word"` shrinks until the text fits on 2 lines', () => {
    const font = { ...FIT, maxLines: 2 };
    const { at } = build(host(text('v', WORDS, font)), 150);
    expect(at('v').style.fontSize).toBe(29);
    expect(at('v').height).toBeCloseTo(2 * 29 * 1.2, 9);
    // Without `maxLines` the words fit on 3 lines at the first size.
    expect(build(host(text('v', WORDS)), 150).at('v').style.fontSize).toBe(41);
  });

  it('`maxLines` is not enough to cut: the smallest applies when no size reaches it', () => {
    const font = { ...FIT, maxLines: 1 };
    const { at } = build(host(text('v', WORDS, font)), 150);
    expect(at('v').style.fontSize).toBe(29);
  });

  it('`$lines` counts at the chosen size', () => {
    const font = { ...FIT, maxLines: 3 };
    const template = host(
      text('v', 'abcd efgh ijkl mnop', font),
      text('n', { $lines: 'v' }, { size: 10 }, { width: 'hug' }),
    );
    const { at } = build(template, 150);
    expect(at('v').style.fontSize).toBe(29);
    expect(at('n').text).toBe('2');
  });
});

describe('RT1: min-content and max-content', () => {
  it('`min-content` is the widest word at the smallest size', () => {
    const { at } = build(host(text('v', WORDS, FIT, { width: 'min-content' })), 400);
    expect(at('v').width).toBeCloseTo(4 * 29 * 0.55, 9);
    expect(at('v').style.fontSize).toBe(29);
    expect(at('v').height).toBeCloseTo(3 * 29 * 1.2, 9);
  });

  it('`max-content` is the widest line at `font.size`', () => {
    const { at } = build(host(text('v', WORDS, FIT, { width: 'max-content' })), 50);
    expect(at('v').width).toBeCloseTo(14 * 41 * 0.55, 9);
    expect(at('v').style.fontSize).toBe(41);
  });
});

describe('RT1: the sizes of the list', () => {
  it('an expression item that is not smaller is skipped with `engine.invalidValue`', () => {
    const font = { size: 41, fit: 'shrink', fitSizes: [32, { $field: 'next' }] };
    const { at, warnings } = build(host(text('v', VALUE, font)), 170, { next: 40 });
    expect(warnings).toContain('invalid value in font.fitSizes: 40');
    // Only 41 and 32 are candidates, and neither fits: the smallest (32) applies.
    expect(at('v').style.fontSize).toBe(32);
  });

  it('an expression item that is smaller takes part', () => {
    const font = { size: 41, fit: 'shrink', fitSizes: [32, { $field: 'next' }] };
    const { at, warnings } = build(host(text('v', VALUE, font)), 170, { next: 29 });
    expect(warnings.filter((w) => w.includes('fitSizes'))).toEqual([]);
    expect(at('v').style.fontSize).toBe(29);
  });

  it('an item that is not greater than 0 is skipped with `engine.invalidValue`', () => {
    const font = { size: 41, fit: 'shrink', fitSizes: [32, { $field: 'next' }] };
    const { at, warnings } = build(host(text('v', VALUE, font)), 170, { next: 0 });
    expect(warnings).toContain('invalid value in font.fitSizes: 0');
    expect(at('v').style.fontSize).toBe(32);
  });

  it('a `fit` from an expression chooses the mode', () => {
    const font = {
      size: 41,
      fit: { $field: 'fit', default: 'none' },
      fitSizes: [32, 29],
    };
    const template = host(text('v', VALUE, font));
    expect(build(template, 200, { fit: 'shrink' }).at('v').style.fontSize).toBe(32);
    expect(build(template, 200).at('v').style.fontSize).toBe(41);
  });
});

describe('RT1: only the engine chooses', () => {
  it('the measurer sees the chosen size, and the style carries it', () => {
    const sizes = new Set<number>();
    const measure: TextMeasurer = (value, font, maxWidth) => {
      if (value === VALUE) sizes.add(font.size);
      return approximateMeasurer(value, font, maxWidth);
    };
    const { at } = build(host(text('v', VALUE)), 200, {}, measure);
    expect(at('v').style.fontSize).toBe(32);
    expect(sizes.has(32)).toBe(true);
  });
});
