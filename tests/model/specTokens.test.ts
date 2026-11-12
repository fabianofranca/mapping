// `formatVersion` 15 (etapa #747, CF5): `tokens` na raiz da especialização.
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
  it('a versão atual é 16 e a 14 continua aceita', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(14);
  });

  it('tokens com modos, valor por modo e valor simples são válidos', () => {
    expect(issuesOf(spec(GOOD))).toEqual([]);
  });

  it('valor por modo sem todos os modos falha', () => {
    const bad = { ...GOOD, values: { primary: { light: '#1a73e8' } } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.primary');
  });

  it('valor por modo com modo não declarado falha', () => {
    const bad = {
      ...GOOD,
      values: { primary: { light: '#1', dark: '#2', contrast: '#3' } },
    };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.primary');
  });

  it('modos misturando texto e número num token falham', () => {
    const bad = { ...GOOD, values: { size: { light: 8, dark: '8' } } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.size');
  });

  it('chave desconhecida em tokens é erro no caminho dela (CR #945, item 45)', () => {
    const bad = { ...GOOD, extra: 1 };
    const r = parseSpec(spec(bad));
    expect(r.ok).toBe(false);
    const issue = (r.ok ? [] : r.issues).find((i) => i.path === 'tokens.extra');
    expect(issue?.message).toBe('chave desconhecida: extra');
  });

  it('modes vazio e modo repetido falham', () => {
    expect(issuesOf(spec({ modes: [], values: {} })).map((i) => i.path)).toContain(
      'tokens.modes',
    );
    expect(
      issuesOf(spec({ modes: ['light', 'light'], values: {} })).map((i) => i.path),
    ).toContain('tokens.modes[1]');
  });

  it('nome com maiúscula falha pelo padrão', () => {
    const bad = { ...GOOD, values: { Primary: '#fff' } };
    expect(issuesOf(spec(bad)).map((i) => i.path)).toContain('tokens.values.Primary');
  });

  it('tokens numa especialização v14 falha com a mensagem de versão', () => {
    expect(issuesOf(spec(GOOD, 14))).toContainEqual({
      path: 'tokens',
      message: 'só é permitido com formatVersion 15',
    });
  });
});
