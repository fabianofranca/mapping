import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Visible focus on everything and control height by the roles.

const DIR = 'src/theme';
const css = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(`${DIR}/${f}`, 'utf8')]),
);

describe('visible focus', () => {
  it('no CSS removes the focus outline', () => {
    for (const [file, text] of Object.entries(css)) {
      expect(text, file).not.toMatch(/outline\s*:\s*(none|0)\b/);
      expect(text, file).not.toMatch(/outline-style\s*:\s*none/);
    }
  });

  it('there is a global ring on :focus-visible with the focus token', () => {
    expect(css['base.css']).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
  });
});

describe('control height', () => {
  it.each(['.button', '.icon-button', '.segmented-item', '.input', '.tab'])(
    '%s uses the height of the --control-height role',
    (selector) => {
      const rule = new RegExp(
        `(?:^|[\\s,])${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*var\\(--control-height\\)`,
        'm',
      );
      expect(css['controls.css']).toMatch(rule);
    },
  );
});

// R4 (Layouts and ToolStripButton section of DS 2.0): the strip is discreet and the unfocused window
// fades the selection.
describe('janelas de ferramenta', () => {
  it('the strip button with the window open uses the weak selection, not the toggle blue', () => {
    expect(css['editor.css']).toMatch(
      /\.tool-strip \.icon-button\[aria-pressed='true'\][^{]*\{[^}]*background: var\(--color-selection-muted\)/,
    );
  });

  it('the unfocused window fades the selected row', () => {
    expect(css['editor.css']).toMatch(
      /\.tool-window:not\(:focus-within\)[^{]*\{[^}]*background: var\(--color-selection-muted\)/,
    );
  });
});

// Stage 6 (6.4): CSS rules behind findings 2, 3, 5 and 6 (e2e measures the layout).
describe('stage 6.4: tooltips, layers, table and Diagnostics', () => {
  it('the hint stays out of the flow (fixed position): hidden, it neither widens nor scrolls the container', () => {
    expect(css['controls.css']).toMatch(/\.tooltip\s*\{[^}]*position:\s*fixed/);
  });

  it('with the menu open (aria-expanded), the button hint does not appear over it', () => {
    expect(css['controls.css']).toMatch(
      /\.tooltip-anchor:has\(\[aria-haspopup\]\[aria-expanded='true'\]\) \.tooltip[^{]*\{[^}]*display:\s*none/,
    );
  });

  it('the editor clips instead of scrolling (overflow: clip): focus does not shift it', () => {
    expect(css['layout.css']).toMatch(/\.editor\s*\{[^}]*overflow:\s*clip/);
  });

  it('the rows of the Layers window do not shrink: the list scrolls', () => {
    expect(css['panels.css']).toMatch(/\.layer-row\s*\{[^}]*flex:\s*none/);
  });

  it('Diagnostics: Time and Context without a break in the middle', () => {
    expect(css['panels.css']).toMatch(
      /\.diagnostics-nowrap\s*\{[^}]*white-space:\s*nowrap/,
    );
  });

  it('table: the rows share the same columns (subgrid)', () => {
    expect(css['details.css']).toMatch(
      /\.data-grid \.grid-row\s*\{[^}]*grid-template-columns:\s*subgrid/,
    );
  });
});

describe('text field in Details', () => {
  it('the field inside the text editor wrapper takes the column (no intrinsic width)', () => {
    // Without this the <input> keeps ~220 px and goes past the edge of the narrow panel (horizontal bar).
    expect(css['details.css']).toMatch(
      /\.props-value > \.string-editor > \.input[^{]*\{[^}]*width:\s*100%/,
    );
  });
});
