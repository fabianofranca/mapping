// `formatVersion` 15 (stage #747, CF5): `tokens` at the root of the specialization.
import { describe, expect, it } from 'vitest';
import { SPEC_FORMAT_VERSION, SPEC_FORMAT_VERSIONS, parseSpec } from '../../src/model';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function spec(tokens: unknown, formatVersion = 15): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [],
    tokens,
  };
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const GOOD = {
  modes: ['light', 'dark'],
  values: { primary: { light: '#1a73e8', dark: '#8ab4f8' }, radius: 8 },
};

describe('formatVersion 15: tokens', () => {
  it('the current version is 16 and 14 is still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(14);
  });

  it('tokens with modes, per-mode value and plain value are valid', () => {
    expect(issuesOf(spec(GOOD))).toEqual([]);
  });

  it('per-mode value without all the modes fails', () => {
    const bad = { ...GOOD, values: { primary: { light: '#1a73e8' } } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.primary');
  });

  it('per-mode value with an undeclared mode fails', () => {
    const bad = {
      ...GOOD,
      values: { primary: { light: '#1', dark: '#2', contrast: '#3' } },
    };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.primary');
  });

  it('modes mixing text and number in a token fail', () => {
    const bad = { ...GOOD, values: { size: { light: 8, dark: '8' } } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.size');
  });

  it('unknown key in tokens is an error at its path (CR #945, item 45)', () => {
    const bad = { ...GOOD, extra: 1 };
    const r = parseSpec(spec(bad));
    expect(r.ok).toBe(false);
    const issue = (r.ok ? [] : r.issues).find((i) => i.path === 'tokens.extra');
    expect(issue?.message).toBe('unknown key: extra');
  });

  it('empty modes and repeated mode fail', () => {
    expect(issuesOf(spec({ modes: [], values: {} })).map((i) => i.path)).toContain(
      'tokens.modes',
    );
    expect(
      issuesOf(spec({ modes: ['light', 'light'], values: {} })).map((i) => i.path),
    ).toContain('tokens.modes[1]');
  });

  it('name with an uppercase letter fails by the pattern', () => {
    const bad = { ...GOOD, values: { Primary: '#fff' } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.Primary');
  });

  it('tokens in a v14 specialization fail with the version message', () => {
    expect(issuesOf(spec(GOOD, 14))).toContainEqual({
      path: 'tokens',
      message: 'only allowed with formatVersion 15',
    });
  });
});
