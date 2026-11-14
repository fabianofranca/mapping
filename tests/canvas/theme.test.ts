import { describe, expect, it } from 'vitest';
import {
  canvasTokensFrom,
  hostFontsFrom,
  readCanvasTokens,
} from '../../src/canvas/theme';
import { TOKENS, tokenValue } from '../../src/theme/tokens';

/** Reader that resolves the tokens of `tokens.ts` (including the `var(--…)` ones), like the browser. */
function reader(theme: 'light' | 'dark') {
  const read = (name: string): string => {
    const value = tokenValue(name.slice(2), theme);
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    return alias?.[1] ? read(alias[1]) : value;
  };
  return read;
}

/** All the numbers and texts of `CanvasTokens`, flattened. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  return typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
    : [[path, value]];
}

describe('hostFontsFrom', () => {
  it('the host font is the stack of --font-sans and --font-mono of the theme', () => {
    expect(hostFontsFrom(reader('light'))).toEqual({
      sans: tokenValue('font-sans', 'light'),
      mono: tokenValue('font-mono', 'light'),
    });
  });

  it('empty value becomes absent (the model default applies)', () => {
    expect(hostFontsFrom(() => '')).toEqual({});
  });
});

describe('canvasTokensFrom', () => {
  it('reads each canvas token from the theme tokens', () => {
    const t = canvasTokensFrom(reader('light'));
    expect(t.line).toBe('#ffffff');
    expect(t.halo).toBe('rgba(10, 12, 16, 0.72)');
    expect(t.select).toBe('#4d8dff');
    expect(t.selectSecondary).toBe('#2b6ad9');
    expect(t.selectFill).toBe('rgba(77, 141, 255, 0.15)');
    expect(canvasTokensFrom(reader('dark')).selectFill).toBe(t.selectFill);
    expect(canvasTokensFrom(reader('dark')).selectSecondary).toBe('#8fb4ff');
    expect(t.nameTag).toBe(t.select);
    expect(t.badge).toBe('rgba(10, 12, 16, 0.9)');
    expect(t.card).toBe('rgba(255, 255, 255, 0.92)');
    expect(t.opacity).toEqual({ dimmed: 0.35, ancestor: 0.75, inherited: 0.7 });
    expect(t.type.name).toEqual({ size: 11, line: 16, weight: 600 });
    expect(t.radius).toEqual({ sm: 4, md: 6 });
    expect(t.fontFamily).toBe(tokenValue('font-sans', 'light'));
  });

  it('the drawing of the components reads color, fill, slot opacity and font from the theme', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { component } = canvasTokensFrom(reader(theme));
      expect(component.unknownLine).toBe(tokenValue('cv-component-unknown', theme));
      expect(component.unknownFill).toBe(tokenValue('cv-component-unknown-fill', theme));
      expect(component.slotOpacity).toBe(Number(tokenValue('opacity-slot', theme)));
      expect(component.labelFontSize).toBe(12);
      expect(component.labelFontFamily).toBe(tokenValue('font-sans', theme));
    }
  });

  it('no empty or NaN value, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [path, value] of leaves(canvasTokensFrom(reader(theme)))) {
        expect(value, `${theme}: ${path}`).not.toBe('');
        expect(value, `${theme}: ${path}`).not.toBeNaN();
      }
    }
  });

  it('theme colors change with it; the canvas ones do not', () => {
    const light = canvasTokensFrom(reader('light'));
    const dark = canvasTokensFrom(reader('dark'));
    expect(light.surface).not.toBe(dark.surface);
    expect(light.card).not.toBe(dark.card);
    expect(light.line).toBe(dark.line);
    expect(light.select).toBe(dark.select);
  });

  it('10 px handle', () => {
    expect(canvasTokensFrom(reader('light')).handleSize).toBe(10);
  });

  it('only uses tokens that exist', () => {
    const asked = new Set<string>();
    canvasTokensFrom((name) => {
      asked.add(name);
      return reader('light')(name);
    });
    for (const name of asked) expect(name.slice(2) in TOKENS, name).toBe(true);
  });
});

describe('readCanvasTokens', () => {
  it('reads the CSS of the document (the tokens are injected in tests/setup.ts)', () => {
    const t = readCanvasTokens();
    for (const [path, value] of leaves(t)) {
      expect(value, path).not.toBe('');
      expect(value, path).not.toBeNaN();
    }
    expect(t.select).toBe('#4d8dff');
  });
});

describe('lock tokens', () => {
  it('background and stroke come from the name tag pair, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const t = canvasTokensFrom(reader(theme));
      expect(t.lock.fill).toBe(t.nameTag);
      expect(t.lock.glyph).toBe(t.nameTagText);
    }
  });

  it('the side is 20 px', () => {
    expect(canvasTokensFrom(reader('light')).lock.size).toBe(20);
  });
});

describe('level of detail of the markings', () => {
  it('the limits come from the tokens size-lod-min-marking (24) and size-lod-hide-marking (2) in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const tokens = canvasTokensFrom(reader(theme));
      expect(tokens.lodMinMarking).toBe(24);
      expect(tokens.lodHideMarking).toBe(2);
    }
  });
});

describe('measures of the conversation pins and the arrival badge', () => {
  it('come from tokens, with the previous values, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { pin, arrival } = canvasTokensFrom(reader(theme));
      expect(pin).toMatchObject({
        height: 20,
        pad: 8,
        glyph: 12,
        glyphGap: 2,
        charWidth: 7,
      });
      expect(arrival).toEqual({
        height: 20,
        pad: 8,
        gap: 4,
        gapBelow: 10,
        nameBand: 24,
        charWidth: 7,
      });
    }
  });
});
