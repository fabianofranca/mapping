// Stage #1900, NV1: the pure resolver of the specialization's named values (axes, aliases, composites).
import { describe, expect, it } from 'vitest';
import {
  knownTokenKinds,
  resolveTokens,
  type SpecTokens,
} from '../../src/model/components/tokens';
import { tokenAxes } from '../../src/model/specTokens';

const AXES = { theme: ['light', 'dark'], contrast: ['standard', 'high'] };

const TOKENS: SpecTokens = {
  axes: AXES,
  values: {
    surface: { $axis: 'theme', light: '#ffffff', dark: '#000000' },
    ink: { $axis: 'theme', light: '#000000', dark: '#ffffff' },
    outline: {
      $axis: 'theme',
      light: { $axis: 'contrast', standard: '#cccccc', high: '#333333' },
      dark: { $axis: 'contrast', standard: '#444444', high: '#eeeeee' },
    },
    gap: 8,
    bg: { $token: 'surface' },
    muted: { $token: 'ink', alpha: 0.5 },
    over: { $token: 'ink', alpha: 0.5, over: 'surface' },
    title: {
      size: { $axis: 'theme', light: 22, dark: 24 },
      lineHeight: 28,
      family: { $token: 'font-sans' },
    },
    big: { $token: 'title.size' },
    note: { $value: '#123456', $description: 'documented', $group: 'g' },
  },
};

const table = (selection?: string | Record<string, string>) =>
  resolveTokens(TOKENS, { sans: 'Inter' }, selection);

describe('tokenAxes', () => {
  it('lists the axes with their entries, the first being the default', () => {
    expect([...tokenAxes(TOKENS)]).toEqual([
      ['theme', ['light', 'dark']],
      ['contrast', ['standard', 'high']],
    ]);
  });

  it('modes are the axis "mode"', () => {
    const modes: SpecTokens = { modes: ['light', 'dark'], values: {} };
    expect([...tokenAxes(modes)]).toEqual([['mode', ['light', 'dark']]]);
  });

  it('no tokens or no axes give an empty map', () => {
    expect(tokenAxes(undefined).size).toBe(0);
    expect(tokenAxes({ values: {} }).size).toBe(0);
  });
});

describe('resolveTokens with a selection', () => {
  it('without a selection every axis uses its default entry', () => {
    const t = table();
    expect(t.surface).toBe('#ffffff');
    expect(t.outline).toBe('#cccccc');
    expect(t['title.size']).toBe(22);
  });

  it('a selection picks one entry per axis; an axis not listed keeps the default', () => {
    expect(table({ theme: 'dark' }).surface).toBe('#000000');
    expect(table({ theme: 'dark' }).outline).toBe('#444444');
    expect(table({ contrast: 'high' }).outline).toBe('#333333');
    expect(table({ theme: 'dark', contrast: 'high' }).outline).toBe('#eeeeee');
  });

  it('an entry the axis does not declare falls back to the default, with no warning', () => {
    expect(table({ theme: 'sepia' }).surface).toBe('#ffffff');
    expect(table({ size: 'big' }).surface).toBe('#ffffff');
  });

  it('the legacy string selects the axis "mode"', () => {
    const modes: SpecTokens = {
      modes: ['light', 'dark'],
      values: { p: { light: '#111111', dark: '#222222' }, q: 1 },
    };
    expect(resolveTokens(modes, {}, 'dark').p).toBe('#222222');
    expect(resolveTokens(modes, {}, 'nope').p).toBe('#111111');
    expect(resolveTokens(modes, {}).p).toBe('#111111');
    expect(resolveTokens(modes, {}, { mode: 'dark' }).p).toBe('#222222');
    expect(resolveTokens(modes, {}, 'dark').q).toBe(1);
  });

  it('a string selects that entry on every axis that declares it (decision 16)', () => {
    expect(table('dark').surface).toBe('#000000');
    expect(table('high').outline).toBe('#333333');
    expect(table('nope').surface).toBe('#ffffff');
  });

  it('plain values, the metadata wrapper and the built-ins', () => {
    const t = table();
    expect(t.gap).toBe(8);
    expect(t.note).toBe('#123456');
    expect(t['font-sans']).toBe('Inter');
    expect(t['font-mono']).toBe('monospace');
  });
});

describe('aliases', () => {
  it('follow the selection', () => {
    expect(table().bg).toBe('#ffffff');
    expect(table({ theme: 'dark' }).bg).toBe('#000000');
  });

  it('alpha is applied on the resolved color', () => {
    expect(table().muted).toBe('#00000080');
    expect(table({ theme: 'dark' }).muted).toBe('#ffffff80');
  });

  it('over composites on the color underneath', () => {
    expect(table().over).toBe('#7f7f7fff');
    expect(table({ theme: 'dark' }).over).toBe('#808080ff');
  });

  it('read a composite field', () => {
    expect(table().big).toBe(22);
    expect(table({ theme: 'dark' }).big).toBe(24);
  });

  it('an alias to a built-in takes the host font', () => {
    const tokens: SpecTokens = { values: { face: { $token: 'font-mono' } } };
    expect(resolveTokens(tokens, { mono: 'Fira' }).face).toBe('Fira');
  });

  it('a cycle in an invalid library ends with no value', () => {
    const tokens: SpecTokens = {
      values: { a: { $token: 'b' }, b: { $token: 'a' }, ok: 1 },
    };
    const t = resolveTokens(tokens, {});
    expect(t.a).toBeUndefined();
    expect(t.b).toBeUndefined();
    expect(t.ok).toBe(1);
  });

  it('a missing target leaves the name out', () => {
    const tokens: SpecTokens = { values: { a: { $token: 'zzz' } } };
    expect(resolveTokens(tokens, {}).a).toBeUndefined();
  });
});

describe('composites in the flat table', () => {
  it('each field is name.field and the composite itself is not a name', () => {
    const t = table();
    expect(t['title.size']).toBe(22);
    expect(t['title.lineHeight']).toBe(28);
    expect(t['title.family']).toBe('Inter');
    expect(t.title).toBeUndefined();
  });

  it('a composite chosen by axis gives its fields in the selection', () => {
    const tokens: SpecTokens = {
      axes: { theme: ['light', 'dark'] },
      values: {
        t: { $axis: 'theme', light: { size: 1 }, dark: { size: 2 } },
      },
    };
    expect(resolveTokens(tokens, {}, { theme: 'dark' })['t.size']).toBe(2);
  });
});

describe('knownTokenKinds', () => {
  const kinds = knownTokenKinds(TOKENS);

  it('scalars have their kind, aliases the kind of their target', () => {
    expect(kinds.get('surface')).toBe('color');
    expect(kinds.get('gap')).toBe('number');
    expect(kinds.get('bg')).toBe('color');
    expect(kinds.get('muted')).toBe('color');
    expect(kinds.get('big')).toBe('number');
    expect(kinds.get('note')).toBe('color');
  });

  it('a composite is "composite" and each field is name.field', () => {
    expect(kinds.get('title')).toBe('composite');
    expect(kinds.get('title.size')).toBe('number');
    expect(kinds.get('title.family')).toBe('family');
  });

  it('the built-ins are families', () => {
    expect(kinds.get('font-sans')).toBe('family');
    expect(kinds.get('font-mono')).toBe('family');
  });

  it('a modes library gives the same kinds as before', () => {
    const modes = knownTokenKinds({
      modes: ['light', 'dark'],
      values: { p: { light: '#111111', dark: '#222222' }, q: 1 },
    });
    expect(modes.get('p')).toBe('color');
    expect(modes.get('q')).toBe('number');
    expect(modes.get('title')).toBeUndefined();
  });
});
