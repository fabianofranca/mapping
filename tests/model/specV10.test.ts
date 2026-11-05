// `formatVersion` 10: `notices` em tipo, campo e coluna de table (etapa #486, AV1).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  type Spec,
} from '../../src/model/spec';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TYPE = 'layers[0].annotationTypes[0]';
const FIELD = `${TYPE}.fields[1]`;
const COLUMN = `${FIELD}.columns[0]`;

/** Especialização com um tipo, um campo `string` e uma `table` de uma coluna. */
function spec(formatVersion = 10): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 't',
            name: 'T',
            fields: [
              { key: 'k', type: 'string' },
              { key: 'linhas', type: 'table', columns: [{ key: 'c', type: 'string' }] },
            ],
          },
        ],
      },
    ],
  };
}

/** A especialização com `notices` no tipo, no campo `k` (índice 0) e na coluna `c`. */
function withNotices(
  formatVersion: number,
  where: ('type' | 'field' | 'column')[] = ['type', 'field', 'column'],
  notices: Json[] = [{ kind: 'deprecated', message: 'use outro' }],
): Json {
  const json = spec(formatVersion);
  const type = json.layers[0].annotationTypes[0];
  if (where.includes('type')) type.notices = notices;
  if (where.includes('field')) type.fields[1].notices = notices;
  if (where.includes('column')) type.fields[1].columns[0].notices = notices;
  return json;
}

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues;
}

function parsed(input: unknown): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

/** Spec v10 com um único aviso `notice` no tipo. */
function typeNotice(notice: unknown): Json {
  return withNotices(10, ['type'], [notice as Json]);
}

describe('formatVersion 10: notices', () => {
  it('a versão atual é a 11 e v1 a v9 continuam aceitas', () => {
    expect(SPEC_FORMAT_VERSION).toBe(11);
    expect(SPEC_FORMAT_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const v of SPEC_FORMAT_VERSIONS) {
      expect(parseSpec(spec(v)).ok, `v${v}`).toBe(true);
    }
  });

  it('aceita notices no tipo, no campo e na coluna de table e os devolve', () => {
    const notices = [
      {
        kind: 'removed',
        message: 'saiu da biblioteca',
        since: '2026-03-01',
        ref: 'M3-12',
      },
      { kind: 'pending', message: 'falta o desenho' },
    ];
    const result = parsed(withNotices(10, ['type', 'field', 'column'], notices));
    const type = result.layers[0]?.annotationTypes[0];
    expect(type?.notices).toEqual(notices);
    const table = type?.fields[1];
    expect(table?.notices).toEqual(notices);
    expect(table?.type === 'table' ? table.columns[0]?.notices : undefined).toEqual(
      notices,
    );
  });

  it('notices vazio é aceito; os quatro kinds também', () => {
    expect(issuesOf(withNotices(10, ['type'], []))).toEqual([]);
    for (const kind of ['removed', 'deprecated', 'diverges', 'pending']) {
      expect(issuesOf(typeNotice({ kind, message: 'x' })), kind).toEqual([]);
    }
  });

  it('notices numa v9 (e anteriores) é erro no caminho do tipo, do campo e da coluna', () => {
    for (const v of [1, 5, 8, 9]) {
      expect(issuesOf(withNotices(v)), `v${v}`).toEqual([
        { path: `${TYPE}.notices`, message: 'só é permitido com formatVersion 10' },
        { path: `${FIELD}.notices`, message: 'só é permitido com formatVersion 10' },
        { path: `${COLUMN}.notices`, message: 'só é permitido com formatVersion 10' },
      ]);
    }
    expect(issuesOf(spec(9))).toEqual([]);
  });

  it('kind fora da lista ou ausente', () => {
    expect(issuesOf(typeNotice({ kind: 'obsolete', message: 'x' }))).toEqual([
      {
        path: `${TYPE}.notices[0].kind`,
        message:
          '"obsolete" inválido; use "removed", "deprecated", "diverges" ou "pending"',
      },
    ]);
    expect(issuesOf(typeNotice({ message: 'x' }))).toEqual([
      { path: `${TYPE}.notices[0].kind`, message: 'obrigatório' },
    ]);
  });

  it('message ausente, vazia ou só de espaços', () => {
    expect(issuesOf(typeNotice({ kind: 'pending' }))).toEqual([
      { path: `${TYPE}.notices[0].message`, message: 'obrigatório' },
    ]);
    for (const message of ['', '   ', '\t\n']) {
      expect(
        issuesOf(typeNotice({ kind: 'pending', message })),
        JSON.stringify(message),
      ).toEqual([{ path: `${TYPE}.notices[0].message`, message: 'não pode ser vazio' }]);
    }
  });

  it('since precisa ser uma data real AAAA-MM-DD', () => {
    const since = (value: string) =>
      issuesOf(typeNotice({ kind: 'pending', message: 'x', since: value }));
    const path = `${TYPE}.notices[0].since`;
    expect(since('2026-02-30')).toEqual([{ path, message: 'data inexistente' }]);
    // O formato errado também reprova a existência (o `dateString` do formato é o mesmo dos campos).
    expect(since('04/11/2026')).toEqual([
      { path, message: 'data inválida; use AAAA-MM-DD' },
      { path, message: 'data inexistente' },
    ]);
    expect(since('2026-02-28')).toEqual([]);
  });

  it('ref vazio é erro', () => {
    expect(issuesOf(typeNotice({ kind: 'pending', message: 'x', ref: '' }))).toEqual([
      { path: `${TYPE}.notices[0].ref`, message: 'não pode ser vazio' },
    ]);
  });

  it('propriedade a mais num aviso é erro', () => {
    const issues = issuesOf(typeNotice({ kind: 'pending', message: 'x', severity: 1 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe(`${TYPE}.notices[0]`);
    expect(issues[0]?.message).toContain('severity');
  });

  it('aviso repetido (mesmo kind e mesma message) no tipo, no campo e na coluna', () => {
    const notices = [
      { kind: 'pending', message: 'a' },
      { kind: 'pending', message: 'b' },
      { kind: 'pending', message: 'a', since: '2026-01-01' },
      { kind: 'removed', message: 'a' },
    ];
    expect(issuesOf(withNotices(10, ['type', 'field', 'column'], notices))).toEqual([
      { path: `${TYPE}.notices[2]`, message: 'aviso repetido' },
      { path: `${FIELD}.notices[2]`, message: 'aviso repetido' },
      { path: `${COLUMN}.notices[2]`, message: 'aviso repetido' },
    ]);
  });

  it('notices que não é lista é erro', () => {
    const json = spec();
    json.layers[0].annotationTypes[0].notices = { kind: 'pending', message: 'x' };
    expect(issuesOf(json)).toHaveLength(1);
    expect(issuesOf(json)[0]?.path).toBe(`${TYPE}.notices`);
  });
});
