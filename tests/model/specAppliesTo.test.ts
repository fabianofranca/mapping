// `formatVersion` 7 (ME4): `appliesTo` no tipo e `ref` como tipo de coluna de `table`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, typeAppliesTo, type Spec } from '../../src/model/spec';

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, unknown>;

function spec(formatVersion: number, type: Json = {}, extraType: Json[] = []): Json {
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
        annotationTypes: [{ id: 't', name: 'T', fields: [], ...type }, ...extraType],
      },
    ],
  };
}

function errorsOf(raw: unknown): { path: string; message: string }[] {
  const result = parseSpec(raw);
  if (result.ok) throw new Error('era para falhar');
  return [...result.issues];
}

const typeOf = (s: Spec) => s.layers[0]!.annotationTypes[0]!;

describe('appliesTo no tipo', () => {
  it('aceita marking, arrow e os dois na 7 e devolve a lista', () => {
    for (const appliesTo of [['marking'], ['arrow'], ['marking', 'arrow']]) {
      const raw = spec(7, { appliesTo });
      const result = parseSpec(raw);
      expect(result.ok, JSON.stringify(appliesTo)).toBe(true);
      if (!result.ok) continue;
      expect(typeOf(result.spec).appliesTo).toEqual(appliesTo);
      expect(jsonValidator.safeParse(raw).success, JSON.stringify(appliesTo)).toBe(true);
    }
  });

  it('sem appliesTo o tipo é válido e não tem a chave', () => {
    const result = parseSpec(spec(7));
    expect(result.ok && typeOf(result.spec).appliesTo).toBeUndefined();
  });

  it('appliesTo numa versão anterior é o erro "só é permitido com formatVersion 7", no caminho exato', () => {
    for (const v of [1, 4, 6]) {
      expect(errorsOf(spec(v, { appliesTo: ['arrow'] }))).toContainEqual({
        path: 'layers[0].annotationTypes[0].appliesTo',
        message: 'só é permitido com formatVersion 7',
      });
    }
  });

  it('recusa lista vazia, repetição e valores fora de marking e arrow', () => {
    const empty = errorsOf(spec(7, { appliesTo: [] }));
    expect(empty).toContainEqual({
      path: 'layers[0].annotationTypes[0].appliesTo',
      message: 'não pode ser vazio; use "marking", "arrow" ou os dois',
    });
    const repeated = errorsOf(spec(7, { appliesTo: ['arrow', 'arrow'] }));
    expect(repeated.map((e) => e.message)).toContain('valores repetidos');
    const wrong = errorsOf(spec(7, { appliesTo: ['container'] }));
    expect(wrong[0]?.path).toBe('layers[0].annotationTypes[0].appliesTo[0]');
    expect(wrong[0]?.message).toContain('"container" inválido');
    expect(parseSpec(spec(7, { appliesTo: 'arrow' })).ok).toBe(false);
  });

  it('o JSON Schema também recusa lista vazia, repetição e valor desconhecido', () => {
    for (const appliesTo of [[], ['arrow', 'arrow'], ['container']]) {
      expect(jsonValidator.safeParse(spec(7, { appliesTo })).success).toBe(false);
    }
  });

  it('um tipo só de seta não pode ter component nem floating; com marking ao lado, pode', () => {
    const only = errorsOf(
      spec(7, { appliesTo: ['arrow'], component: 'components/a.json', floating: true }),
    );
    expect(only).toContainEqual({
      path: 'layers[0].annotationTypes[0].component',
      message: 'um tipo só de seta não pode ter component',
    });
    expect(only).toContainEqual({
      path: 'layers[0].annotationTypes[0].floating',
      message: 'um tipo só de seta não pode ter floating',
    });
    expect(
      parseSpec(
        spec(7, {
          appliesTo: ['marking', 'arrow'],
          component: 'components/a.json',
          floating: true,
        }),
      ).ok,
    ).toBe(true);
    // floating: false também conta como declarado.
    expect(errorsOf(spec(7, { appliesTo: ['arrow'], floating: false }))).toHaveLength(1);
  });

  it('typeAppliesTo: sem appliesTo só a marcação; com a lista, o que ela diz', () => {
    expect(typeAppliesTo({}, 'marking')).toBe(true);
    expect(typeAppliesTo({}, 'arrow')).toBe(false);
    expect(typeAppliesTo({ appliesTo: ['arrow'] }, 'marking')).toBe(false);
    expect(typeAppliesTo({ appliesTo: ['arrow'] }, 'arrow')).toBe(true);
    expect(typeAppliesTo({ appliesTo: ['marking', 'arrow'] }, 'marking')).toBe(true);
    expect(typeAppliesTo({ appliesTo: ['marking', 'arrow'] }, 'arrow')).toBe(true);
  });

  it('o padrão "flutuante que aponta": uma tabela flutuante e um tipo só de seta na mesma especialização', () => {
    const table = {
      id: 'tabela',
      name: 'Tabela',
      floating: true,
      fields: [
        {
          key: 'eventos',
          type: 'table',
          columns: [
            { key: 'evento', type: 'string' },
            { key: 'tela', type: 'ref', accepts: { tags: ['screen'] } },
          ],
        },
      ],
    };
    const link = { id: 'deep-link', name: 'Deep link', appliesTo: ['arrow'], fields: [] };
    const result = parseSpec(spec(7, table, [link]));
    expect(result.ok).toBe(true);
  });
});

describe('ref como coluna de table', () => {
  function withColumn(column: Json, formatVersion = 7, table: Json = {}): Json {
    return spec(formatVersion, {
      fields: [
        {
          key: 'refs',
          type: 'table',
          columns: [{ key: 'nome', type: 'string' }, column],
          ...table,
        },
      ],
    });
  }

  it('aceita a coluna ref com accepts (tags e/ou free) na 7', () => {
    for (const accepts of [
      { tags: ['data-field'] },
      { free: true },
      { tags: ['a'], free: true },
    ]) {
      const raw = withColumn({ key: 'alvo', type: 'ref', accepts });
      const result = parseSpec(raw);
      expect(result.ok, JSON.stringify(accepts)).toBe(true);
      expect(jsonValidator.safeParse(raw).success).toBe(true);
      if (!result.ok) continue;
      const field = typeOf(result.spec).fields[0];
      expect(field?.type === 'table' && field.columns[1]).toMatchObject({
        key: 'alvo',
        type: 'ref',
        accepts,
      });
    }
  });

  it('recusa a coluna ref sem accepts, com accepts vazio, com default e com etiquetas', () => {
    const missing = errorsOf(withColumn({ key: 'alvo', type: 'ref' }));
    expect(missing).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].columns[1].accepts',
      message: 'obrigatório em ref',
    });
    const empty = errorsOf(
      withColumn({ key: 'alvo', type: 'ref', accepts: { tags: [] } }),
    );
    expect(empty[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].accepts',
    );
    const withDefault = errorsOf(
      withColumn({ key: 'alvo', type: 'ref', accepts: { free: true }, default: 'x' }),
    );
    expect(withDefault[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].default',
    );
    const withTags = errorsOf(
      withColumn({ key: 'alvo', type: 'ref', accepts: { free: true }, tags: ['a'] }),
    );
    expect(withTags[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].tags',
    );
  });

  it('numa versão anterior à 7 é o erro "só é permitido com formatVersion 7", no caminho da coluna', () => {
    for (const v of [1, 5, 6]) {
      expect(
        errorsOf(withColumn({ key: 'alvo', type: 'ref', accepts: { free: true } }, v)),
      ).toContainEqual({
        path: 'layers[0].annotationTypes[0].fields[0].columns[1].type',
        message: 'só é permitido com formatVersion 7',
      });
    }
  });

  it('table dentro de table continua proibido', () => {
    const errors = errorsOf(withColumn({ key: 'sub', type: 'table', columns: [] }));
    expect(errors[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].type',
    );
    expect(errors[0]?.message).toContain('"table" não é permitido dentro de table');
  });

  it('rowLabel não pode ser uma coluna ref', () => {
    const errors = errorsOf(
      withColumn({ key: 'alvo', type: 'ref', accepts: { free: true } }, 7, {
        tags: ['data-field'],
        rowLabel: 'alvo',
      }),
    );
    expect(errors).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].rowLabel',
      message: '"alvo" deve ser uma coluna string da tabela',
    });
  });
});
