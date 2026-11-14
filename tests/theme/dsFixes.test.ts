import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DS6 (#1468): CSS defects found in the DS sync. jsdom does not measure layout; the test
// checks the rules.

const read = (file: string) => readFileSync(file, 'utf8');
const rule = (css: string, selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('Inline Notice', () => {
  const css = read('src/theme/review.css');

  it('only the text anchor stretches; the X one (IconButton) does not', () => {
    expect(css).not.toMatch(/\n\.notice-box-line \.tooltip-anchor \{/);
    const anchor = rule(
      css,
      '.notice-box-line > .tooltip-anchor:has(> .notice-box-text)',
    );
    expect(anchor).toMatch(/flex:\s*1/);
  });
});

describe('Inline Notice without hint (DS7, finding 3)', () => {
  it('the text stretches by itself, with or without the hint anchor', () => {
    const text = rule(read('src/theme/review.css'), '.notice-box-line .notice-box-text');
    expect(text).toMatch(/flex:\s*1/);
    expect(text).toMatch(/min-width:\s*0/);
  });
});

describe('status bar item that opens a window', () => {
  it('inherits the item color (muted) so hover has an effect', () => {
    expect(rule(read('src/theme/review.css'), '.status-item-button')).toMatch(
      /color:\s*inherit/,
    );
  });
});

describe('IconButton badge', () => {
  it('stays in the corner, outside the central glyph (⋯)', () => {
    const badge = rule(read('src/theme/controls.css'), '.icon-button-badge');
    expect(badge).toMatch(/transform:\s*translate\(/);
  });

  // DS7 (#1472, finding 2): at 50% the badge came out ~8px from a 28px button in a 40px strip.
  it('sticks out at most a quarter of itself beyond the button box', () => {
    const badge = rule(read('src/theme/controls.css'), '.icon-button-badge');
    expect(badge).toMatch(/transform:\s*translate\(25%,\s*-25%\)/);
  });
});
