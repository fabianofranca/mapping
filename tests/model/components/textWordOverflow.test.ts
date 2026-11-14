// NC1 (decision 4 of #1631): the engine warns `text larger than the box: <node>` also when the widest
// word of the text goes past the width of the node (the text only breaks between words), without changing the drawing.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  measureLines,
  instantiate,
} from '../../../src/model/components/instantiate';
import { defaultValues } from '../../../src/model/libraryDrawing';
import { catalog, entryOf } from '../../support/material3Fitted';
import { instantiateOptions } from '../../support/material3Library';

type Json = Record<string, unknown>;

/** Instantiates the Material 3 type at `width × height` with the given values. */
function drawBox(id: string, values: Json, width: number, height: number) {
  const entry = entryOf(id);
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values } as never,
    { x: 0, y: 0, width, height },
    instantiateOptions(catalog, 'light'),
  );
}

const tooBig = (warnings: readonly string[]): string[] =>
  warnings.filter((w) => w.startsWith('text larger than the box'));

describe('a word wider than the text box warns', () => {
  it('button "Submit" at 58 × 40 warns about the label; at 96 × 40 it does not warn', () => {
    const small = drawBox('button', { label: 'Submit' }, 58, 40);
    // pt-BR kept: node names of the Material 3 sample library (viewer/samples) are Portuguese
    expect(tooBig(small.warnings)).toEqual(['text larger than the box: rótulo']);
    const fits = drawBox('button', { label: 'Submit' }, 96, 40);
    expect(tooBig(fits.warnings)).toEqual([]);
  });

  it('extended-fab "Next" at 50 × 56 and "Customize layout" at 60 × 56 warn about the text', () => {
    const next = drawBox('extended-fab', { text: 'Next' }, 50, 56);
    // pt-BR kept: node names of the Material 3 sample library (viewer/samples) are Portuguese
    expect(tooBig(next.warnings)).toEqual(['text larger than the box: texto']);
    const long = drawBox('extended-fab', { text: 'Customize layout' }, 60, 56);
    // pt-BR kept: node names of the Material 3 sample library (viewer/samples) are Portuguese
    expect(tooBig(long.warnings)).toEqual(['text larger than the box: texto']);
  });

  it('button "Customize layout" at 58 × 40 keeps the content warning and gains the label one', () => {
    const made = drawBox('button', { label: 'Customize layout' }, 58, 40);
    expect(made.warnings).toContain('content larger than the box: button');
    // pt-BR kept: node names of the Material 3 sample library (viewer/samples) are Portuguese
    expect(tooBig(made.warnings)).toEqual(['text larger than the box: rótulo']);
  });
});

const file = (text: Json): never =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 40, height: 60 },
    template: {
      type: 'frame',
      name: 'root',
      width: 'fill',
      height: 'fill',
      layout: { type: 'none' },
      children: [text],
    },
  }) as never;

const run = (text: Json) =>
  instantiate(
    file(text),
    {} as never,
    { x: 0, y: 0, width: 40, height: 60 },
    { measure: approximateMeasurer },
  );

describe('what does not warn and the rich text', () => {
  const longWord = 'Incomprehensibility';

  it('text with maxLines or ellipsis does not warn', () => {
    const base = { type: 'text', name: 't', width: 40, height: 60, text: longWord };
    expect(tooBig(run({ ...base, font: { size: 14, maxLines: 1 } }).warnings)).toEqual(
      [],
    );
    expect(tooBig(run({ ...base, font: { size: 14, ellipsis: true } }).warnings)).toEqual(
      [],
    );
  });

  it('the same text without maxLines or ellipsis warns', () => {
    const base = { type: 'text', name: 't', width: 40, height: 60, text: longWord };
    expect(tooBig(run({ ...base, font: { size: 14 } }).warnings)).toEqual([
      'text larger than the box: t',
    ]);
  });

  it('rich text with a chip wider than the box warns', () => {
    const made = run({
      type: 'text',
      name: 'rich',
      width: 40,
      height: 60,
      font: { size: 14 },
      runs: [{ text: 'a ' }, { text: 'chipverylonger', background: '#cccccc' }],
    });
    expect(tooBig(made.warnings)).toEqual(['text larger than the box: rich']);
  });
});

describe('label with a non-breaking space and a word with a wide glyph', () => {
  const base = { type: 'text', name: 't', width: 80, height: 60 };

  it('wrap none with a space wider than the box warns, like the same text in runs', () => {
    const text = 'Customize layout';
    const plain = run({ ...base, text, font: { size: 14, wrap: 'none' } });
    expect(tooBig(plain.warnings)).toEqual(['text larger than the box: t']);
    const rich = run({ ...base, font: { size: 14, wrap: 'none' }, runs: [{ text }] });
    expect(tooBig(rich.warnings)).toEqual(['text larger than the box: t']);
  });

  it('wrap none with ellipsis does not warn and a line with a space that fits does not warn', () => {
    const text = 'Customize layout';
    const cut = run({ ...base, text, font: { size: 14, wrap: 'none', ellipsis: true } });
    expect(tooBig(cut.warnings)).toEqual([]);
    const fits = run({ ...base, width: 200, text, font: { size: 14, wrap: 'none' } });
    expect(tooBig(fits.warnings)).toEqual([]);
  });

  it('a word with a tab wider than the box warns (the break is only at a space)', () => {
    const made = run({ ...base, text: 'Customize\tlayout', font: { size: 14 } });
    expect(tooBig(made.warnings)).toEqual(['text larger than the box: t']);
  });

  it('an emoji wider than 1em does not disappear in the shortcut', () => {
    const wide = (value: string): number => [...value].length * 14 * 1.5;
    const made = instantiate(
      file({ ...base, width: 60, text: '😀😀😀', font: { size: 14 } }),
      {} as never,
      { x: 0, y: 0, width: 60, height: 60 },
      { measure: (text, font, max) => measureLines(text, font, max, wide) },
    );
    expect(tooBig(made.warnings)).toEqual(['text larger than the box: t']);
  });
});
