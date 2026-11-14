import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CL1 (1.3 and 1.4): in the Details at 900 px the (i) of the long labels (Anchored to, Alignment,
// Offset, Drawing mode) fell alone onto its own line, the Segmented (Side, Alignment) wrapped
// leaving one option alone, and the Select cut "Right to left" without an ellipsis.
// jsdom does not measure layout: the test checks the CSS rules.

const read = (file: string): string => readFileSync(`src/theme/${file}`, 'utf8');
const details = read('details.css');
const controls = read('controls.css');
const review = read('review.css');
const rule = (css: string, selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('label with a help icon (1.3)', () => {
  it('the label and the (i) stay on the same line: the cell does not wrap, the label shrinks', () => {
    const cell = rule(review, '.props-label-cell');
    expect(cell).not.toMatch(/flex-wrap:\s*wrap/);
    const label = rule(review, '.props-label-cell > .props-label');
    expect(label).toMatch(/flex:\s*0?\s*1\s+1?\s*auto|flex:\s*1 1 auto/);
    expect(label).toMatch(/min-width:\s*0/);
  });
});

describe('Segmented in the Details (1.3)', () => {
  it('the options wrap whole (e2e detailsSegmented) and each line shares the whole width', () => {
    const seg = rule(details, '.props-value > .segmented');
    expect(seg).toMatch(/flex-wrap:\s*wrap/);
    expect(seg).toMatch(/width:\s*100%/);
    const cell = rule(details, '.props-value > .segmented .segmented-cell');
    expect(cell).toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it('the option text is not cut', () => {
    const text = rule(details, '.props-value > .segmented .segmented-text');
    expect(text).not.toMatch(/text-overflow/);
    expect(text).toMatch(/white-space:\s*nowrap/);
  });
});

describe('Narrow Select (1.4)', () => {
  it('the long value is cut with an ellipsis, not silently', () => {
    const control = rule(controls, '.select-control');
    expect(control).toMatch(/text-overflow:\s*ellipsis/);
    expect(control).toMatch(/overflow:\s*hidden/);
    expect(control).toMatch(/white-space:\s*nowrap/);
  });
});
