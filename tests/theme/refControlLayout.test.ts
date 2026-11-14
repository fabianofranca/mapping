import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// R24.15 (retest d): at 900 px the reference field button gets narrow and the target layer
// (`flex: none`) took the space of the name, which vanished ("P C…"). jsdom does not measure layout; the test
// checks the rule: the layer yields first (shrinks before the name) and is not rigid.

const css = readFileSync('src/theme/details.css', 'utf8');
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('reference field at narrow width', () => {
  it('the target layer shrinks before the name', () => {
    const layer = rule('.ref-control-layer');
    expect(layer).not.toMatch(/flex:\s*none/);
    expect(layer).toMatch(/flex:\s*0\s+\d{2,}\s+auto/);
    expect(layer).toMatch(/min-width:\s*0/);
  });

  // CL1 (finding 2 of #827): with factor 100 the name still lost ~0.3 px (shrink proportional to the
  // size) and came out "Plugin…". The layer factor is so much bigger than the name one that it loses nothing.
  it('the layer shrinks with a factor much bigger than the name one', () => {
    const shrink = Number(
      /flex:\s*0\s+(\d+)\s+auto/.exec(rule('.ref-control-layer'))?.[1],
    );
    expect(shrink).toBeGreaterThanOrEqual(100_000);
  });
});

// R24.14/R24.15 (finding 3.1 of #954): "(broken reference)" appeared cut ("(broken refer…") 
// at 1280 and 900 px. The broken reference text wraps to a new line instead of being cut.
describe('broken reference cell', () => {
  it('the text wraps to a new line instead of being cut with an ellipsis', () => {
    const text = rule('.ref-control.is-broken .ref-control-text');
    expect(text).toMatch(/white-space:\s*normal/);
    expect(text).toMatch(/text-overflow:\s*clip/);
    // TE1: breaks between words (the whole "reference"); `anywhere` split it in the middle.
    expect(text).toMatch(/overflow-wrap:\s*break-word/);
    expect(text).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

// CL1 (finding 1 of #827): in the `ref` cell of the table the ✕ of Clear (which also comes in a Tooltip
// anchor) took half of the cell and covered the label; the broken reference broke into 4 lines.
describe('ref cell of the table', () => {
  it('only the control anchor stretches; the icons do not (cell and Details field)', () => {
    expect(rule('.ref-field > .tooltip-anchor')).toMatch(/flex:\s*none/);
    expect(rule('.ref-field > .tooltip-anchor:first-child')).toMatch(/flex:\s*1/);
    expect(rule('.ref-field.ref-cell > .tooltip-anchor:first-child')).toMatch(
      /flex:\s*1 1 auto/,
    );
  });

  // CL2 (finding 1-R): the 216px minimum of the column made the table scroll horizontally.
  it('the control shrinks inside the cell, with no minimum width of its own, and the broken text breaks between words', () => {
    expect(rule('.ref-cell .ref-control')).toMatch(/min-width:\s*0/);
    expect(rule('.ref-cell .ref-control .ref-control-text')).toMatch(
      /white-space:\s*normal/,
    );
    const cellText = rule('.ref-cell .ref-control .ref-control-text');
    expect(cellText).toMatch(/overflow-wrap:\s*break-word/);
    expect(cellText).not.toMatch(/overflow-wrap:\s*anywhere/);
    // The `min-width: 0` takes the word out of the column minimum: the broken cell goes back to the content minimum.
    expect(rule('.ref-cell .ref-control.is-broken')).toMatch(/min-width:\s*min-content/);
    const cell = rule('.data-grid .grid-cell-value .ref-cell');
    expect(cell).toMatch(/flex-wrap:\s*wrap/);
    expect(cell).toMatch(/min-width:\s*0/);
  });
});

// CD6 (finding 1.1 of #1372, R24.15): at 900 px the `item` column ended up at 40 px (the text breaks at
// any point, so the minimum of the `1fr` column was ~0) and the label fell to 3 lines ("Plu/gin/A").
// The floor alone (96 px) made the table scroll horizontally; the cell with the reference field gets
// 0.85 of the token and the text inputs of the table 0.5 (CL1, 4.3; they were 0.75), which fits in the 900 px Details (e2e in refAnnotation).
describe('reference column of the table at narrow width', () => {
  it('the cell with ref-cell has a width floor by the column token', () => {
    const cell = rule('.data-grid .grid-cell-value:has(> .ref-cell)');
    expect(cell).toMatch(/min-width:\s*calc\(var\(--size-grid-col-min\)\s*\*\s*0\.85\)/);
  });
});

// CL1 (finding 4.3 of #1533, R24.15): at 900×720, with Tree, Layers and Details open, the Details
// have 220 px of useful width and the `plugins` table (text + reference) measured 234 px of scroll
// (the text column asked for 0.75 of the token, 72 px). Sum of the floors of the two columns + the three
// fixed columns (handle, index and remove) has to fit in the 220 px, with no horizontal bar.
describe('text and reference table fits in the 900 px Details', () => {
  const token = Number(
    /'size-grid-col-min':\s*'(\d+)px'/.exec(
      readFileSync('src/theme/tokens.ts', 'utf8'),
    )?.[1],
  );
  const factor = (selector: string): number =>
    Number(
      /calc\(var\(--size-grid-col-min\)\s*\*\s*([\d.]+)\)/.exec(rule(selector))?.[1],
    );

  it('the summed floors (with the cell padding) stay below 220 px', () => {
    const input = factor('.data-grid .grid-cell-value .input') * token;
    const ref = factor('.data-grid .grid-cell-value:has(> .ref-cell)') * token;
    const fixed = 24 + 24 + 28; // size-target-min x2 e control-height
    const rest = 4.4; // borders and padding, from the earlier measure of 234 px: 234 - 76 - 72 - 81.6
    expect(fixed + rest + input + ref).toBeLessThanOrEqual(220);
  });

  // CL2 (finding A2, R24.15): the floor of the text field (0.5 of the token) fits in 220 px, but the text that
  // goes past it came out cut without warning ("primeii" instead of "primeiro"). As in the Tree name
  // (5.1), what does not fit ends in an ellipsis; the field hint (`title`) carries the whole value.
  it('text that goes past the field floor ends in an ellipsis, not cut without warning', () => {
    expect(rule('.data-grid .grid-cell-value .input')).toMatch(
      /text-overflow:\s*ellipsis/,
    );
  });
});
