import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { BREAKPOINTS } from '../../src/theme/breakpoints';
import { TOKENS, tokenValue } from '../../src/theme/tokens';

// R1 (docs/redesign/HANDOFF.md, seção 2): nenhum valor de cor, espaço, raio, fonte,
// opacidade, duração ou z-index fixo no CSS dos componentes; tudo vem de `var(--…)`.
// Larguras e alturas de componentes (e a largura de bordas) ainda podem ser literais.

const DIR = 'src/theme';
const files = readdirSync(DIR).filter((f) => f.endsWith('.css'));

/** Quantidade com unidade de comprimento, exceto `0` (o zero não tem unidade). */
const LENGTH = /(?<![\w.-])-?\d*\.?\d+(px|rem|em)\b/;
const TIME = /(?<![\w.-])\d*\.?\d+m?s\b/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(/;

/** Propriedades por categoria; o valor não pode ter literal da categoria. */
const CATEGORIES: readonly { name: string; property: RegExp; literal: RegExp }[] = [
  {
    name: 'espaço',
    property:
      /^(padding|margin|gap|row-gap|column-gap|top|right|bottom|left|inset)(-[a-z]+)?$/,
    literal: LENGTH,
  },
  { name: 'raio', property: /^border(-[a-z]+)*-radius$/, literal: LENGTH },
  {
    name: 'fonte',
    property: /^(font|font-size|font-family|line-height)$/,
    literal: /.*/,
  },
  { name: 'opacidade', property: /^opacity$/, literal: /\d/ },
  {
    name: 'duração',
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

/** Declarações de um CSS (sem comentários), uma por `propriedade: valor;`. */
function declarations(file: string): Declaration[] {
  const css = readFileSync(`${DIR}/${file}`, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    file,
    property: m[1]!,
    value: m[2]!.replaceAll(/\s+/g, ' ').trim(),
  }));
}

const all = files.flatMap(declarations);

/**
 * `font: inherit` e `font: var(--t-…)` são os únicos valores aceitos. Opacidade `0` e `1`
 * (mostrar ou esconder) não é valor de design: só os intermediários vêm dos tokens.
 */
function allowed(d: Declaration, category: string): boolean {
  if (category === 'fonte')
    return d.value === 'inherit' || /^var\(--[\w-]+\)$/.test(d.value);
  if (category === 'opacidade') return d.value === '0' || d.value === '1';
  return false;
}

describe('literais fora dos tokens', () => {
  it.each(CATEGORIES)('$name: só var(--…)', ({ name, property, literal }) => {
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

  it('todo var(--token) usado existe (ou é local ao componente)', () => {
    const local = new Set(['--layer-color', '--cols', '--depth']);
    const unknown = all
      .flatMap((d) => [...d.value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!))
      .filter((name) => !(name.slice(2) in TOKENS) && !local.has(name));
    expect([...new Set(unknown)]).toEqual([]);
  });
});

describe('media queries', () => {
  const known = new Set<number>(Object.values(BREAKPOINTS));

  it('usam só os breakpoints de breakpoints.ts', () => {
    const bad: string[] = [];
    for (const file of files) {
      const css = readFileSync(`${DIR}/${file}`, 'utf8');
      for (const m of css.matchAll(/@media[^{]*\((?:min|max)-width:\s*(\d+)px\)/g)) {
        if (!known.has(Number(m[1]))) bad.push(`${file}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('o tokens.ts emite o breakpoint do celular na mesma largura', () => {
    expect(BREAKPOINTS.mobileMax + 1).toBe(BREAKPOINTS.desktop);
  });
});

describe('theme-color', () => {
  const html = readFileSync('index.html', 'utf8');
  const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map((m) => m[0]);
  const content = (scheme: 'light' | 'dark') =>
    metas
      .find((m) => m.includes(`prefers-color-scheme: ${scheme}`))
      ?.match(/content="([^"]+)"/)?.[1];

  it('index.html segue o color-accent de cada tema', () => {
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
