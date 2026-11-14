// Text measure cache (#1078, decision 19): the memoized measurer (`cachedMeasurer`, LRU by
// text, font and limit) and the engine's `textMemo`, which does not ask the measurer for the same measure twice.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FrameTemplate,
  TextTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { cachedMeasurer } from '../../../src/model/components/measureCache';
import { memoizedTextMeasurer } from '../../../src/store/textMeasure';

const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};

/** A measurer that counts the calls and returns a new object for each one. */
function counting(): { measure: TextMeasurer; calls: () => number } {
  let count = 0;
  return {
    measure: (text, font, maxWidth) => {
      count++;
      return { ...approximateMeasurer(text, font, maxWidth) };
    },
    calls: () => count,
  };
}

describe('cachedMeasurer', () => {
  it('returns the same TextMetrics for the same key, without calling the measurer again', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const first = measure('Hello world', FONT, 120);
    const again = measure('Hello world', { ...FONT }, 120);
    expect(again).toBe(first);
    expect(spy.calls()).toBe(1);
  });

  it('another maxWidth, text or font field is another key', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const base = measure('Hello world', FONT, 120);
    expect(measure('Hello world', FONT, 60)).not.toBe(base);
    expect(measure('Hello world', FONT)).not.toBe(base);
    expect(measure('Other', FONT, 120)).not.toBe(base);
    expect(measure('Hello world', { ...FONT, weight: 700 }, 120)).not.toBe(base);
    expect(measure('Hello world', { ...FONT, wrap: 'none' }, 120)).not.toBe(base);
    expect(measure('Hello world', { ...FONT, maxLines: 1 }, 120)).not.toBe(base);
    expect(spy.calls()).toBe(7);
  });

  it('a maxWidth that differs by less than 1/64 px is the same key', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const first = measure('Hello world', FONT, 100);
    expect(measure('Hello world', FONT, 100.001)).toBe(first);
    expect(measure('Hello world', FONT, 100.5)).not.toBe(first);
    expect(spy.calls()).toBe(2);
  });

  it('forgets by LRU: the least used entry leaves', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 2 });
    const a = measure('a', FONT);
    measure('b', FONT);
    measure('a', FONT); // 'a' becomes the most recent; 'b' is the least used.
    measure('c', FONT); // Enters and evicts 'b'.
    expect(measure('a', FONT)).toBe(a);
    expect(spy.calls()).toBe(3);
    measure('b', FONT); // It was forgotten: the measurer is called again.
    expect(spy.calls()).toBe(4);
  });
});

// --- the engine: the same measure does not reach the measurer twice -------------------------------------

function text(content: string, extra: Partial<TextTemplate> = {}): TextTemplate {
  return { type: 'text', text: content, width: 'hug', height: 'hug', ...extra };
}

function frame(children: FrameTemplate['children'], extra: Partial<FrameTemplate> = {}) {
  const node: FrameTemplate = {
    type: 'frame',
    width: 'hug',
    height: 'hug',
    layout: { type: 'column' },
    children,
    ...extra,
  };
  return node;
}

function component(template: FrameTemplate): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'memo',
    name: 'Memo',
    size: { width: 200, height: 120 },
    template,
  };
}

/** The calls to the measurer by (text, font, limit): each key must appear once. */
function callsByKey(template: FrameTemplate): Map<string, number> {
  const byKey = new Map<string, number>();
  const measure: TextMeasurer = (value, font, maxWidth) => {
    const key = JSON.stringify([value, font, maxWidth ?? null]);
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
    return approximateMeasurer(value, font, maxWidth);
  };
  instantiate(
    component(template),
    {},
    { x: 0, y: 0, width: 200, height: 120 },
    { measure },
  );
  return byKey;
}

describe('engine textMemo', () => {
  it('3-level hug frame with the same text 4 times: one call per (text, limit)', () => {
    const same = 'Same repeated text';
    const tpl = frame([
      frame([text(same), text(same)], { layout: { type: 'row', gap: 4 } }),
      frame([frame([text(same), text(same)])]),
    ]);
    const byKey = callsByKey(tpl);
    expect(byKey.size).toBeGreaterThan(0);
    expect(Math.max(...byKey.values())).toBe(1);
  });

  it('a hug text with a width limit (fill) measures each limit only once', () => {
    const tpl = frame(
      [
        text('a sentence with several words to wrap around', { width: 'fill' }),
        frame([text('short label'), text('short label', { width: 'fill' })], {
          layout: { type: 'row', gap: 4 },
          width: 'fill',
        }),
      ],
      { width: 'fill' },
    );
    const byKey = callsByKey(tpl);
    expect(Math.max(...byKey.values())).toBe(1);
  });
});

describe('memoizedTextMeasurer (the app)', () => {
  it('is one per measurer and per font epoch', () => {
    const base: TextMeasurer = (text, font, maxWidth) =>
      approximateMeasurer(text, font, maxWidth);
    const first = memoizedTextMeasurer(base, 0);
    expect(memoizedTextMeasurer(base, 0)).toBe(first);
    expect(memoizedTextMeasurer(base, 1)).not.toBe(first);
    expect(memoizedTextMeasurer((t, f, w) => base(t, f, w), 0)).not.toBe(first);
  });

  it('the new epoch does not evict the current one: only the oldest leaves', () => {
    const base: TextMeasurer = (text, font, maxWidth) =>
      approximateMeasurer(text, font, maxWidth);
    const byEpoch = [0, 1, 2, 3].map((epoch) => memoizedTextMeasurer(base, epoch));
    memoizedTextMeasurer(base, 4);
    expect(memoizedTextMeasurer(base, 3)).toBe(byEpoch[3]);
    expect(memoizedTextMeasurer(base, 2)).toBe(byEpoch[2]);
  });
});

describe('textMemo and the width', () => {
  it('the same text measured at two limits has two measures, and the scene uses the final limit one', () => {
    const sentence = 'a sentence with several words to wrap around into lines';
    const tpl = frame([text(sentence, { maxWidth: 60 })], { width: 'fill' });
    const seen = new Map<string, number>();
    const measure: TextMeasurer = (value, font, maxWidth) => {
      // The key is (text, limit): the words measured without a limit (#1631) are other texts.
      const key = `${value}|${String(maxWidth ?? 'free')}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      return approximateMeasurer(value, font, maxWidth);
    };
    const { root } = instantiate(
      component(tpl),
      {},
      { x: 0, y: 0, width: 100, height: 120 },
      { measure },
    );
    // More than one limit (the natural one and the box one) and none measured twice.
    expect(seen.size).toBeGreaterThan(1);
    expect(Math.max(...seen.values())).toBe(1);
    const node = root.children[0];
    if (node?.type !== 'text') throw new Error('no text');
    const font = { ...FONT, size: 14, lineHeight: 16.8 };
    expect(node.height).toBeCloseTo(
      approximateMeasurer(sentence, font, node.width).height,
      5,
    );
    expect(node.height).toBeGreaterThan(font.lineHeight);
  });
});
