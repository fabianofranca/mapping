import { describe, expect, it } from 'vitest';
import { canvasTokensFrom, readCanvasTokens } from '../../src/canvas/theme';
import { TOKENS, tokenValue } from '../../src/theme/tokens';

/** Leitor que resolve os tokens de `tokens.ts` (inclusive os `var(--…)`), como o navegador. */
function reader(theme: 'light' | 'dark') {
  const read = (name: string): string => {
    const value = tokenValue(name.slice(2), theme);
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    return alias?.[1] ? read(alias[1]) : value;
  };
  return read;
}

/** Todos os números e textos de `CanvasTokens`, achatados. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  return typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
    : [[path, value]];
}

describe('canvasTokensFrom', () => {
  it('lê cada token do canvas dos tokens do tema', () => {
    const t = canvasTokensFrom(reader('light'));
    expect(t.line).toBe('#ffffff');
    expect(t.halo).toBe('rgba(10, 12, 16, 0.72)');
    expect(t.select).toBe('#4d8dff');
    expect(t.nameTag).toBe(t.select);
    expect(t.card).toBe('rgba(255, 255, 255, 0.92)');
    expect(t.opacity).toEqual({
      dimmed: 0.35,
      ancestor: 0.75,
      inherited: 0.7,
      grabbed: 0.25,
    });
    expect(t.type.name).toEqual({ size: 11, line: 16, weight: 600 });
    expect(t.type.caption).toEqual({ size: 10, line: 14, weight: 400 });
    expect(t.radius).toEqual({ sm: 4, md: 6 });
    expect(t.grabShadow).toEqual({ blur: 14, color: 'rgba(77, 141, 255, 0.8)' });
    expect(t.fontFamily).toBe(tokenValue('font-sans', 'light'));
  });

  it('nenhum valor vazio ou NaN, nos dois temas', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [path, value] of leaves(canvasTokensFrom(reader(theme)))) {
        expect(value, `${theme}: ${path}`).not.toBe('');
        expect(value, `${theme}: ${path}`).not.toBeNaN();
      }
    }
  });

  it('cores do tema mudam com ele; as do canvas, não', () => {
    const light = canvasTokensFrom(reader('light'));
    const dark = canvasTokensFrom(reader('dark'));
    expect(light.surface).not.toBe(dark.surface);
    expect(light.card).not.toBe(dark.card);
    expect(light.line).toBe(dark.line);
    expect(light.select).toBe(dark.select);
  });

  it('alça maior com toque', () => {
    expect(canvasTokensFrom(reader('light')).handleSize).toBe(10);
    expect(canvasTokensFrom(reader('light'), true).handleSize).toBe(14);
  });

  it('só usa tokens que existem', () => {
    const asked = new Set<string>();
    canvasTokensFrom((name) => {
      asked.add(name);
      return reader('light')(name);
    }, true);
    for (const name of asked) expect(name.slice(2) in TOKENS, name).toBe(true);
  });
});

describe('readCanvasTokens', () => {
  it('lê o CSS do documento (os tokens são injetados em tests/setup.ts)', () => {
    const t = readCanvasTokens();
    for (const [path, value] of leaves(t)) {
      expect(value, path).not.toBe('');
      expect(value, path).not.toBeNaN();
    }
    expect(t.select).toBe('#4d8dff');
  });
});

describe('tokens do cadeado', () => {
  it('fundo e traço vêm do par da etiqueta do nome, nos dois temas', () => {
    for (const theme of ['light', 'dark'] as const) {
      const t = canvasTokensFrom(reader(theme));
      expect(t.lock.fill).toBe(t.nameTag);
      expect(t.lock.glyph).toBe(t.nameTagText);
    }
  });

  it('o lado é 20 px, e 24 px (alvo mínimo) com toque', () => {
    expect(canvasTokensFrom(reader('light')).lock.size).toBe(20);
    expect(canvasTokensFrom(reader('light'), true).lock.size).toBe(24);
  });
});
