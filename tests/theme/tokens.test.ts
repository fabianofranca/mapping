import { describe, expect, it } from 'vitest';
import { TOKENS, renderTokensCss, tokenValue } from '../../src/theme/tokens';

// Uma amostra de cada família da seção 2 do HANDOFF (docs/redesign/HANDOFF.md).
const FAMILIES: Record<string, readonly string[]> = {
  cor: [
    'color-border-control',
    'color-selection-muted',
    'color-success-bg',
    'color-card',
  ],
  canvas: ['cv-line', 'cv-halo', 'cv-select', 'cv-invalid', 'cv-warning', 'cv-name-tag'],
  camadas: ['layer-01', 'layer-10'],
  fonte: ['font-sans', 'font-mono'],
  tipografia: [
    't-display',
    't-m-input',
    't-cv-name',
    't-cv-caption-size',
    't-code',
    't-kbd',
  ],
  espaço: ['space-0-5', 'space-1-5', 'space-3', 'space-4', 'space-8'],
  raio: ['radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full'],
  tamanho: ['size-touch', 'size-target-min', 'size-handle-touch', 'size-tw-right'],
  breakpoint: [
    'bp-mobile-max',
    'bp-desktop',
    'bp-compact',
    'bp-design',
    'bp-mobile-design',
  ],
  opacidade: ['opacity-disabled', 'opacity-halo'],
  duração: ['duration-instant', 'duration-base', 'easing-standard'],
  'z-index': ['z-canvas', 'z-dialog', 'z-banner'],
  sombra: ['shadow-popup', 'shadow-sheet', 'shadow-grabbed'],
};

const css = renderTokensCss();

/** Declarações `--nome: valor` do corpo de um bloco, em ordem. */
function block(selector: string): string[] {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('--'));
}

describe('tokens', () => {
  it.each(Object.entries(FAMILIES))('família %s presente no CSS', (_family, names) => {
    for (const name of names) expect(css, name).toContain(`--${name}:`);
  });

  it('space-3 vale 12px e a escala antiga (16px) agora é space-4', () => {
    expect(tokenValue('space-3', 'light')).toBe('12px');
    expect(tokenValue('space-4', 'light')).toBe('16px');
  });

  it('os blocos escuros (media query e data-theme) são idênticos e vêm de um só lugar', () => {
    const viaMedia = block("  :root:not([data-theme='light'])");
    const viaAttribute = block(":root[data-theme='dark']");
    expect(viaMedia.length).toBeGreaterThan(0);
    expect(viaMedia).toEqual(viaAttribute);
  });

  it('o bloco escuro só redefine tokens que variam por tema', () => {
    const themed = Object.entries(TOKENS).filter(([, v]) => typeof v !== 'string');
    expect(block(":root[data-theme='dark']")).toHaveLength(themed.length);
    for (const [name] of themed) {
      expect(tokenValue(name, 'light'), name).not.toBe('');
      expect(tokenValue(name, 'dark'), name).not.toBe('');
    }
  });

  it('o celular troca os papéis de texto para a escala t-m-*', () => {
    expect(css).toMatch(
      /@media \(max-width: 899px\) \{\s*:root \{[^}]*--t-text: var\(--t-m-body\)/,
    );
    expect(tokenValue('t-text', 'light')).toBe('var(--t-body)');
  });

  it('a densidade troca de 28px/16px (desktop) para 44px/20px (celular)', () => {
    expect(tokenValue('control-height', 'light')).toBe('var(--size-control-lg)');
    expect(tokenValue('control-icon', 'light')).toBe('var(--size-icon)');
    expect(css).toMatch(
      /@media \(max-width: 899px\) \{\s*:root \{[^}]*--control-height: var\(--size-touch\)[^}]*--control-icon: var\(--size-icon-touch\)/,
    );
  });

  it('nomes de token são válidos como variável CSS', () => {
    for (const name of Object.keys(TOKENS)) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
