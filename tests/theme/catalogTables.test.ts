import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// B5: the Catalog tables do not break words in the middle and scroll horizontally inside their
// own container; the target notice stays in view at the top of the scrolling area.

const css = readFileSync('src/theme/catalog.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rule(selector: string): string {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const found = blocks.filter(([, sel]) =>
    (sel ?? '').split(',').some((part) => part.trim() === selector),
  );
  return found.map(([, , body]) => body).join('\n');
}

describe('Catalog tables', () => {
  it('do not use overflow-wrap: anywhere nor break words', () => {
    for (const selector of ['.catalog-table', '.catalog-page .markdown table']) {
      const body = rule(selector);
      expect(body, selector).toMatch(/overflow-wrap:\s*normal/);
      expect(body, selector).toMatch(/word-break:\s*normal/);
      expect(body, selector).not.toMatch(/anywhere|break-all|break-word/);
    }
  });

  it('headers and short columns do not break; the container scrolls horizontally', () => {
    expect(rule('.catalog-table th')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.catalog-table td:nth-child(3)')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.catalog-table td:nth-child(4)')).toMatch(/white-space:\s*nowrap/);
    // CL1 (#1830): the label breaks between words; otherwise the table goes past the dialog width.
    expect(rule('.catalog-table td:nth-child(2)')).toMatch(/white-space:\s*normal/);
    for (const selector of ['.catalog-table-wrap', '.catalog-page .markdown-table']) {
      expect(rule(selector), selector).toMatch(/overflow-x:\s*auto/);
    }
  });

  it('document cells and list names do not split the word (CL1, 1.3)', () => {
    expect(rule('.catalog-page .markdown td')).not.toMatch(/anywhere|break-all/);
    expect(rule('.catalog-entry-name')).not.toMatch(/anywhere|break-all/);
    expect(rule('.catalog-entry')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the target notice is sticky at the top', () => {
    const body = rule('.catalog-notice');
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/top:\s*0/);
  });
});
