import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenValue } from '../../src/theme/tokens';

// CL1 (#1738): findings 1.1, 1.2, 1.4 and 3.1 of the tester of #1504, in the CSS of the Catalog and of the
// dialogs (jsdom does not compute layout: what is checked here is the rule; the measure in the
// browser is in the fix report).

function strip(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}
const catalog = strip('src/theme/catalog.css');
const dialogs = strip('src/theme/dialogs.css');

function rule(css: string, selector: string): string {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  return blocks
    .filter(([, sel]) => (sel ?? '').split(',').some((part) => part.trim() === selector))
    .map(([, , body]) => body)
    .join('\n');
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Catalog dialog (CL1)', () => {
  it('1.4: the <dialog> does not scroll (only the body): overflow clip, not the browser auto', () => {
    expect(rule(dialogs, '.dialog')).toMatch(/overflow:\s*clip/);
    expect(rule(dialogs, '.dialog-body')).toMatch(/overflow-y:\s*auto/);
  });

  it('1.1: the last column of the tables and the markdown cells break a long identifier', () => {
    expect(rule(catalog, '.catalog-table td:last-child')).toMatch(
      /overflow-wrap:\s*anywhere/,
    );
    // CL1 (tester leftovers, 1.3): only the last markdown column; the others do not break a word.
    expect(rule(catalog, '.catalog-page .markdown td:last-child')).toMatch(
      /overflow-wrap:\s*anywhere/,
    );
    expect(rule(catalog, '.catalog-page .markdown td')).not.toMatch(
      /overflow-wrap:\s*anywhere/,
    );
  });

  it('3.1: the Gallery frame does not center with justify-content (it cuts the left border)', () => {
    expect(rule(catalog, '.catalog-image-frame')).not.toMatch(/justify-content/);
    expect(rule(catalog, '.catalog-image')).toMatch(/margin-inline:\s*auto/);
  });

  it('1.2: the frame background keeps the inactive Slider track (#E8DEF8) distinguishable', () => {
    const bg = /background:\s*var\(--([\w-]+)\)/.exec(
      rule(catalog, '.catalog-image-frame'),
    )?.[1];
    expect(bg).toBeDefined();
    const light = tokenValue(bg ?? '', 'light');
    // Antes: color-canvas-bg (#e4e7eb), 1,04:1.
    expect(contrast('#e8def8', light)).toBeGreaterThanOrEqual(1.2);
  });
});
