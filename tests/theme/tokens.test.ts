import { describe, expect, it } from 'vitest';
import { TOKENS, renderTokensCss, tokenValue } from '../../src/theme/tokens';

// A sample of each family of design system tokens (docs/DESIGN-SYSTEM.md).
const FAMILIES: Record<string, readonly string[]> = {
  color: [
    'color-border-control',
    'color-selection-muted',
    'color-success-bg',
    'color-card',
  ],
  canvas: [
    'cv-line',
    'cv-halo',
    'cv-select',
    'cv-select-secondary',
    'cv-invalid',
    'cv-warning',
    'cv-name-tag',
  ],
  layers: ['layer-01', 'layer-10'],
  font: ['font-sans', 'font-mono'],
  typography: ['t-display', 't-body', 't-cv-name', 't-code', 't-kbd'],
  spacing: ['space-0-5', 'space-1-5', 'space-3', 'space-4', 'space-8'],
  radius: [
    'radius-xs',
    'radius-sm',
    'radius-md',
    'radius-lg',
    'radius-xl',
    'radius-full',
  ],
  size: [
    'size-touch',
    'size-target-min',
    'size-handle',
    'size-tw-right',
    'size-app-min',
    'size-app-min-height',
  ],
  breakpoint: ['bp-compact', 'bp-design'],
  opacity: ['opacity-disabled', 'opacity-halo'],
  duration: ['duration-instant', 'duration-base', 'easing-standard'],
  'z-index': ['z-canvas', 'z-dialog', 'z-banner'],
  shadow: ['shadow-popup'],
};

const css = renderTokensCss();

/** Declarations `--name: value` of the body of a block, in order. */
function block(selector: string): string[] {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('--'));
}

describe('tokens', () => {
  it.each(Object.entries(FAMILIES))('family %s present in the CSS', (_family, names) => {
    for (const name of names) expect(css, name).toContain(`--${name}:`);
  });

  it('space-3 is 12px and the old scale (16px) is now space-4', () => {
    expect(tokenValue('space-3', 'light')).toBe('12px');
    expect(tokenValue('space-4', 'light')).toBe('16px');
  });

  it('the dark blocks (media query and data-theme) are identical and come from one place', () => {
    const viaMedia = block("  :root:not([data-theme='light'])");
    const viaAttribute = block(":root[data-theme='dark']");
    expect(viaMedia.length).toBeGreaterThan(0);
    expect(viaMedia).toEqual(viaAttribute);
  });

  it('the dark block only redefines tokens that vary by theme', () => {
    const themed = Object.entries(TOKENS).filter(([, v]) => typeof v !== 'string');
    expect(block(":root[data-theme='dark']")).toHaveLength(themed.length);
    for (const [name] of themed) {
      expect(tokenValue(name, 'light'), name).not.toBe('');
      expect(tokenValue(name, 'dark'), name).not.toBe('');
    }
  });

  it('roles with a single value (desktop only): t-* text, 28px controls and 16px icon', () => {
    expect(tokenValue('t-text', 'light')).toBe('var(--t-body)');
    expect(tokenValue('control-height', 'light')).toBe('var(--size-control-lg)');
    expect(tokenValue('control-icon', 'light')).toBe('var(--size-icon)');
    expect(tokenValue('size-app-min', 'light')).toBe('900px');
    expect(tokenValue('size-app-min-height', 'light')).toBe('720px');
    // No density switch by width: the tokens CSS has no width media query.
    expect(css).not.toMatch(/@media \((?:min|max)-width/);
  });

  it('token names are valid as a CSS variable', () => {
    for (const name of Object.keys(TOKENS)) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
