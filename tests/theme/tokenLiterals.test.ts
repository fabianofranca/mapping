import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { BREAKPOINTS } from '../../src/theme/breakpoints';
import { TOKENS, tokenValue } from '../../src/theme/tokens';

// No color, spacing, radius, font,
// opacity, duration or z-index value fixed in the component CSS; everything comes from `var(--…)`.
// Widths and heights of components (and the border width) may still be literals.

const DIR = 'src/theme';
const files = readdirSync(DIR).filter((f) => f.endsWith('.css'));

/** Quantity with a length unit, except `0` (zero has no unit). */
const LENGTH = /(?<![\w.-])-?\d*\.?\d+(px|rem|em)\b/;
const TIME = /(?<![\w.-])\d*\.?\d+m?s\b/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(/;

/** Properties by category; the value cannot have a literal of the category. */
const CATEGORIES: readonly { name: string; property: RegExp; literal: RegExp }[] = [
  {
    name: 'spacing',
    property:
      /^(padding|margin|gap|row-gap|column-gap|top|right|bottom|left|inset)(-[a-z]+)?$/,
    literal: LENGTH,
  },
  { name: 'radius', property: /^border(-[a-z]+)*-radius$/, literal: LENGTH },
  {
    name: 'font',
    property: /^(font|font-size|font-family|line-height)$/,
    literal: /.*/,
  },
  { name: 'opacity', property: /^opacity$/, literal: /\d/ },
  {
    name: 'duration',
    property: /^(transition|animation)(-duration|-delay)?$/,
    literal: TIME,
  },
  { name: 'z-index', property: /^z-index$/, literal: /^-?\d+$/ },
];

interface Declaration {
  readonly file: string;
  readonly property: string;
  readonly value: string;
}

/** Declarations of a CSS (without comments), one per `property: value;`. */
function declarations(file: string): Declaration[] {
  const css = readFileSync(`${DIR}/${file}`, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    file,
    property: m[1]!,
    value: m[2]!.replaceAll(/\s+/g, ' ').trim(),
  }));
}

/**
 * The `<style>` of the interactive guide (`scripts/guia/template.html`) is also part of the scan
 * (stage #971, decision 12). The `@media` breakpoints stay (CSS does not accept `var()` there).
 */
function guideDeclarations(): Declaration[] {
  const html = readFileSync('scripts/guia/template.html', 'utf8');
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1] ?? '')
    .join('\n')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    file: 'scripts/guia/template.html',
    property: m[1]!,
    // The `0px` fallback of `env()` (safe area) is not a design value.
    value: m[2]!
      .replaceAll(/env\([^)]*\)/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  }));
}

const all = [...files.flatMap(declarations), ...guideDeclarations()];

/**
 * `font: inherit` and `font: var(--t-…)` are the only accepted values. Opacity `0` and `1`
 * (show or hide) is not a design value: only the intermediate ones come from the tokens.
 */
function allowed(d: Declaration, category: string): boolean {
  if (category === 'fonte')
    return d.value === 'inherit' || /^var\(--[\w-]+\)$/.test(d.value);
  if (category === 'opacidade') return d.value === '0' || d.value === '1';
  return false;
}

describe('literals outside the tokens', () => {
  it.each(CATEGORIES)('$name: only var(--…)', ({ name, property, literal }) => {
    const bad = all
      .filter((d) => property.test(d.property) && literal.test(d.value))
      .filter((d) => !allowed(d, name))
      .map((d) => `${d.file}: ${d.property}: ${d.value}`);
    expect(bad).toEqual([]);
  });

  it('nenhuma cor fixa', () => {
    const bad = all
      .filter((d) => COLOR.test(d.value))
      .map((d) => `${d.file}: ${d.property}: ${d.value}`);
    expect(bad).toEqual([]);
  });

  it('every var(--token) used exists (or is local to the component)', () => {
    const local = new Set([
      '--layer-color',
      // Color of the guide annotation, written by the page script.
      '--c',
      '--cols',
      '--depth',
      // Measures of the review legend, written by `ReviewLegend`.
      '--legend-top',
      '--legend-left',
      '--legend-width',
      '--legend-room',
    ]);
    const unknown = all
      .flatMap((d) => [...d.value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!))
      .filter((name) => !(name.slice(2) in TOKENS) && !local.has(name));
    expect([...new Set(unknown)]).toEqual([]);
  });
});

describe('media queries', () => {
  const known = new Set<number>(Object.values(BREAKPOINTS));

  it('use only the breakpoints of breakpoints.ts', () => {
    const bad: string[] = [];
    for (const file of files) {
      const css = readFileSync(`${DIR}/${file}`, 'utf8');
      for (const m of css.matchAll(/@media[^{]*\((?:min|max)-width:\s*(\d+)px\)/g)) {
        if (!known.has(Number(m[1]))) bad.push(`${file}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the minimum width of the app is the size-app-min token one', () => {
    expect(TOKENS['size-app-min']).toBe(`${BREAKPOINTS.appMin}px`);
    expect(TOKENS['size-app-min-height']).toBe(`${BREAKPOINTS.appMinHeight}px`);
  });
});

describe('theme-color', () => {
  const html = readFileSync('index.html', 'utf8');
  const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map((m) => m[0]);
  const content = (scheme: 'light' | 'dark') =>
    metas
      .find((m) => m.includes(`prefers-color-scheme: ${scheme}`))
      ?.match(/content="([^"]+)"/)?.[1];

  it('index.html follows the color-accent of each theme', () => {
    expect(content('light')).toBe(tokenValue('color-accent', 'light'));
    expect(content('dark')).toBe(tokenValue('color-accent', 'dark'));
  });

  it('o manifest segue o color-accent do tema claro', () => {
    const manifest = JSON.parse(readFileSync('pwa/manifest.webmanifest', 'utf8')) as {
      theme_color: string;
    };
    expect(manifest.theme_color).toBe(tokenValue('color-accent', 'light'));
  });
});
