// `formatVersion` 8: `suggestions` em campo e coluna `string` (etapa Sugestões no campo de texto).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  type Spec,
} from '../../src/model/spec';
import { diffSpecs } from '../../src/model/specVersions';
import { checkSimpleValue } from '../../src/model/typed';

type Json = Record<string, unknown>;

function spec(formatVersion: number, field: Json, asColumn = false, version = 1): Json {
  const fields = asColumn
    ? [
        {
          key: 'tabela',
          type: 'table',
          columns: [{ key: 'nome', type: 'string' }, field],
        },
      ]
    : [field];
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 't', name: 'T', fields }],
      },
    ],
  };
}

const fieldPath = 'layers[0].annotationTypes[0].fields[0]';
const columnPath = 'layers[0].annotationTypes[0].fields[0].columns[1]';

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues;
}

function parsed(input: unknown): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

const str = (extra: Json = {}): Json => ({ key: 'tipo', type: 'string', ...extra });

describe('formatVersion 8: suggestions', () => {
  it('a versão atual é a 9 e as anteriores continuam aceitas', () => {
    expect(SPEC_FORMAT_VERSION).toBe(9);
    expect(SPEC_FORMAT_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const v of SPEC_FORMAT_VERSIONS) expect(parseSpec(spec(v, str())).ok).toBe(true);
  });

  it('aceita suggestions num campo string e as devolve', () => {
    const s = parsed(spec(8, str({ suggestions: ['String', 'Int'] })));
    expect(s.layers[0]?.annotationTypes[0]?.fields[0]).toMatchObject({
      suggestions: ['String', 'Int'],
    });
  });

  it('aceita suggestions numa coluna string de table', () => {
    expect(parseSpec(spec(8, str({ suggestions: ['A'] }), true)).ok).toBe(true);
  });

  it('um default fora da lista é válido', () => {
    expect(
      parseSpec(spec(8, str({ suggestions: ['String'], default: 'Outro' }))).ok,
    ).toBe(true);
  });

  it('numa versão anterior é o erro "só é permitido com formatVersion 8", no caminho exato', () => {
    for (const v of [1, 4, 7]) {
      expect(issuesOf(spec(v, str({ suggestions: ['A'] })))).toContainEqual({
        path: `${fieldPath}.suggestions`,
        message: 'só é permitido com formatVersion 8',
      });
      expect(issuesOf(spec(v, str({ suggestions: ['A'] }), true))).toContainEqual({
        path: `${columnPath}.suggestions`,
        message: 'só é permitido com formatVersion 8',
      });
    }
  });

  it('em campo ou coluna que não é string é erro, apontando a chave', () => {
    const cases: Json[] = [
      { key: 'n', type: 'number' },
      { key: 'd', type: 'date' },
      { key: 'e', type: 'enum', options: ['a'] },
      { key: 'r', type: 'ref', accepts: { free: true } },
    ];
    for (const base of cases) {
      expect(issuesOf(spec(8, { ...base, suggestions: ['A'] }))).toContainEqual({
        path: `${fieldPath}.suggestions`,
        message: 'só é permitido em campo ou coluna string',
      });
      expect(issuesOf(spec(8, { ...base, suggestions: ['A'] }, true))).toContainEqual({
        path: `${columnPath}.suggestions`,
        message: 'só é permitido em campo ou coluna string',
      });
    }
    const table = spec(8, {
      key: 'tb',
      type: 'table',
      columns: [{ key: 'c', type: 'string' }],
      suggestions: ['A'],
    });
    expect(issuesOf(table)).toContainEqual({
      path: `${fieldPath}.suggestions`,
      message: 'só é permitido em campo ou coluna string',
    });
  });

  it('recusa lista vazia, mais de 200, repetida, item vazio e espaço nas pontas', () => {
    const many = Array.from({ length: 201 }, (_, i) => `v${i}`);
    const bad: [unknown[], string][] = [
      [[], 'não pode ser vazio'],
      [many, 'no máximo 200 sugestões'],
      [['A', 'A'], 'sugestões repetidas'],
      [['A', ''], 'sugestões não podem ser vazias'],
      [[' A'], 'sugestões não podem ter espaço no começo nem no fim'],
      [['A '], 'sugestões não podem ter espaço no começo nem no fim'],
    ];
    for (const [suggestions, text] of bad) {
      const issues = issuesOf(spec(8, str({ suggestions })));
      expect(
        issues.some(
          (i) => i.path === `${fieldPath}.suggestions` && i.message.includes(text),
        ),
        text,
      ).toBe(true);
    }
    expect(parseSpec(spec(8, str({ suggestions: many.slice(0, 200) }))).ok).toBe(true);
    expect(parseSpec(spec(8, str({ suggestions: ['List<A>', 'a b'] }))).ok).toBe(true);
  });

  it('item que não é texto é erro', () => {
    expect(parseSpec(spec(8, str({ suggestions: [1] }))).ok).toBe(false);
  });
});

describe('suggestions e o contrato de versão', () => {
  it('incluir, mudar ou tirar suggestions não gera diferença, e a 7 passa à 8', () => {
    const before = parsed(spec(7, str(), false, 1));
    const added = parsed(spec(8, str({ suggestions: ['A'] }), false, 2));
    const changed = parsed(spec(8, str({ suggestions: ['A', 'B'] }), false, 3));
    const removed = parsed(spec(8, str(), false, 4));
    expect(diffSpecs(before, added)).toEqual([]);
    expect(diffSpecs(added, changed)).toEqual([]);
    expect(diffSpecs(changed, removed)).toEqual([]);
    const col = parsed(spec(8, str({ suggestions: ['A'] }), true, 2));
    expect(diffSpecs(parsed(spec(7, str(), true, 1)), col)).toEqual([]);
  });
});

describe('suggestions não restringe o valor', () => {
  it('texto fora da lista não é problema de valor', () => {
    const s = parsed(spec(8, str({ suggestions: ['String', 'Int'] })));
    const field = s.layers[0]?.annotationTypes[0]?.fields[0];
    if (field?.type !== 'string') throw new Error('campo string esperado');
    expect(checkSimpleValue(field, 'String')).toBeNull();
    expect(checkSimpleValue(field, 'List<Endereco>?')).toBeNull();
    expect(checkSimpleValue(field, 3)).toBe('invalid-value');
  });
});

// `linkedRef`: liga o texto a um campo/coluna `ref` irmão (mesmo tipo / mesma table).
function linkedSpec(
  formatVersion: number,
  field: Json,
  asColumn = false,
  version = 1,
  withRef = true,
): Json {
  const ref = { key: 'typeRef', type: 'ref', accepts: { free: true } };
  const siblings = [{ key: 'nome', type: 'string' }, ...(withRef ? [ref] : []), field];
  const fields = asColumn
    ? [{ key: 'tabela', type: 'table', columns: siblings }]
    : siblings;
  const base = spec(formatVersion, field, false, version);
  const layers = base.layers as { annotationTypes: Json[] }[];
  layers[0]!.annotationTypes = [{ id: 't', name: 'T', fields }];
  return base;
}

const linkedField = 'layers[0].annotationTypes[0].fields[2]';
const linkedColumn = 'layers[0].annotationTypes[0].fields[0].columns[2]';
const linked = (extra: Json = {}): Json => ({
  key: 'tipo',
  type: 'string',
  linkedRef: 'typeRef',
  ...extra,
});

describe('formatVersion 8: linkedRef', () => {
  it('aceita linkedRef em campo e em coluna string, com ou sem suggestions', () => {
    expect(
      parsed(linkedSpec(8, linked())).layers[0]?.annotationTypes[0]?.fields[2],
    ).toMatchObject({
      linkedRef: 'typeRef',
    });
    expect(parseSpec(linkedSpec(8, linked(), true)).ok).toBe(true);
    expect(parseSpec(linkedSpec(8, linked({ suggestions: ['Int'] }))).ok).toBe(true);
    expect(parseSpec(linkedSpec(8, linked({ suggestions: ['Int'] }), true)).ok).toBe(
      true,
    );
  });

  it('em campo ou coluna que não é string é erro, apontando a chave', () => {
    const cases: Json[] = [
      { key: 'n', type: 'number' },
      { key: 'e', type: 'enum', options: ['a'] },
    ];
    for (const base of cases) {
      expect(issuesOf(linkedSpec(8, { ...base, linkedRef: 'typeRef' }))).toContainEqual({
        path: `${linkedField}.linkedRef`,
        message: 'só é permitido em campo ou coluna string',
      });
      expect(
        issuesOf(linkedSpec(8, { ...base, linkedRef: 'typeRef' }, true)),
      ).toContainEqual({
        path: `${linkedColumn}.linkedRef`,
        message: 'só é permitido em campo ou coluna string',
      });
    }
  });

  it('chave inexistente é erro', () => {
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nada' })))).toContainEqual({
      path: `${linkedField}.linkedRef`,
      message: '"nada" não é um campo do tipo',
    });
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nada' }), true))).toContainEqual({
      path: `${linkedColumn}.linkedRef`,
      message: '"nada" não é uma coluna da tabela',
    });
  });

  it('chave que existe mas não é ref é erro', () => {
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nome' })))).toContainEqual({
      path: `${linkedField}.linkedRef`,
      message: '"nome" deve ser um campo ref',
    });
    expect(issuesOf(linkedSpec(8, linked({ linkedRef: 'nome' }), true))).toContainEqual({
      path: `${linkedColumn}.linkedRef`,
      message: '"nome" deve ser uma coluna ref',
    });
  });

  it('a coluna não enxerga um campo de fora da tabela', () => {
    const raw = linkedSpec(8, linked(), true, 1, false);
    const layers = raw.layers as { annotationTypes: { fields: Json[] }[] }[];
    const type = layers[0]!.annotationTypes[0]!;
    type.fields.push({ key: 'typeRef', type: 'ref', accepts: { free: true } });
    expect(issuesOf(raw)).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].columns[1].linkedRef',
      message: '"typeRef" não é uma coluna da tabela',
    });
  });

  it('numa versão anterior é o erro "só é permitido com formatVersion 8", no caminho exato', () => {
    for (const v of [1, 4, 7]) {
      expect(issuesOf(linkedSpec(v, linked()))).toContainEqual({
        path: `${linkedField}.linkedRef`,
        message: 'só é permitido com formatVersion 8',
      });
      expect(issuesOf(linkedSpec(v, linked(), true))).toContainEqual({
        path: `${linkedColumn}.linkedRef`,
        message: 'só é permitido com formatVersion 8',
      });
    }
  });

  it('incluir, mudar ou tirar linkedRef (e suggestions) não gera diferença; a 7 passa à 8', () => {
    const plain = (v: number, version: number, asColumn = false) =>
      parsed(linkedSpec(v, { key: 'tipo', type: 'string' }, asColumn, version));
    for (const asColumn of [false, true]) {
      const before = plain(7, 1, asColumn);
      const added = parsed(linkedSpec(8, linked({ suggestions: ['Int'] }), asColumn, 2));
      const changed = parsed(
        linkedSpec(8, linked({ suggestions: ['Int', 'Long'] }), asColumn, 3),
      );
      const removed = plain(8, 4, asColumn);
      expect(diffSpecs(before, added)).toEqual([]);
      expect(diffSpecs(added, changed)).toEqual([]);
      expect(diffSpecs(changed, removed)).toEqual([]);
      expect(diffSpecs(before, added).filter((c) => c.kind === 'breaking')).toEqual([]);
    }
  });
});
