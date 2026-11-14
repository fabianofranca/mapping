// `formatVersion` 7 (ME4): `appliesTo` on the type and `ref` as a `table` column type.
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
  if (result.ok) throw new Error('should have failed');
  return result.issues.map(({ path, message }) => ({ path, message }));
}

const typeOf = (s: Spec) => s.layers[0]!.annotationTypes[0]!;

describe('appliesTo on the type', () => {
  it('accepts marking, arrow and both in 7 and returns the list', () => {
    for (const appliesTo of [['marking'], ['arrow'], ['marking', 'arrow']]) {
      const raw = spec(7, { appliesTo });
      const result = parseSpec(raw);
      expect(result.ok, JSON.stringify(appliesTo)).toBe(true);
      if (!result.ok) continue;
      expect(typeOf(result.spec).appliesTo).toEqual(appliesTo);
      expect(jsonValidator.safeParse(raw).success, JSON.stringify(appliesTo)).toBe(true);
    }
  });

  it('without appliesTo the type is valid and has no key', () => {
    const result = parseSpec(spec(7));
    expect(result.ok && typeOf(result.spec).appliesTo).toBeUndefined();
  });

  it('appliesTo in an earlier version is the "only allowed with formatVersion 7" error, at the exact path', () => {
    for (const v of [1, 4, 6]) {
      expect(errorsOf(spec(v, { appliesTo: ['arrow'] }))).toContainEqual({
        path: 'layers[0].annotationTypes[0].appliesTo',
        message: 'only allowed with formatVersion 7',
      });
    }
  });

  it('refuses an empty list, repetition and values other than marking and arrow', () => {
    const empty = errorsOf(spec(7, { appliesTo: [] }));
    expect(empty).toContainEqual({
      path: 'layers[0].annotationTypes[0].appliesTo',
      message: 'cannot be empty; use "marking", "arrow" or both',
    });
    const repeated = errorsOf(spec(7, { appliesTo: ['arrow', 'arrow'] }));
    expect(repeated.map((e) => e.message)).toContain('repeated values');
    const wrong = errorsOf(spec(7, { appliesTo: ['container'] }));
    expect(wrong[0]?.path).toBe('layers[0].annotationTypes[0].appliesTo[0]');
    expect(wrong[0]?.message).toContain('"container" is invalid');
    expect(parseSpec(spec(7, { appliesTo: 'arrow' })).ok).toBe(false);
  });

  it('the JSON Schema also refuses an empty list, repetition and an unknown value', () => {
    for (const appliesTo of [[], ['arrow', 'arrow'], ['container']]) {
      expect(jsonValidator.safeParse(spec(7, { appliesTo })).success).toBe(false);
    }
  });

  it('an arrow-only type cannot have a component or floating; with marking alongside, it can', () => {
    const only = errorsOf(
      spec(7, { appliesTo: ['arrow'], component: 'components/a.json', floating: true }),
    );
    expect(only).toContainEqual({
      path: 'layers[0].annotationTypes[0].component',
      message: 'an arrow-only type cannot have a component',
    });
    expect(only).toContainEqual({
      path: 'layers[0].annotationTypes[0].floating',
      message: 'an arrow-only type cannot have floating',
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
    // floating: false also counts as declared.
    expect(errorsOf(spec(7, { appliesTo: ['arrow'], floating: false }))).toHaveLength(1);
  });

  it('typeAppliesTo: without appliesTo only the marking; with the list, what it says', () => {
    expect(typeAppliesTo({}, 'marking')).toBe(true);
    expect(typeAppliesTo({}, 'arrow')).toBe(false);
    expect(typeAppliesTo({ appliesTo: ['arrow'] }, 'marking')).toBe(false);
    expect(typeAppliesTo({ appliesTo: ['arrow'] }, 'arrow')).toBe(true);
    expect(typeAppliesTo({ appliesTo: ['marking', 'arrow'] }, 'marking')).toBe(true);
    expect(typeAppliesTo({ appliesTo: ['marking', 'arrow'] }, 'arrow')).toBe(true);
  });

  it('the "floating that points" pattern: a floating table and an arrow-only type in the same specialization', () => {
    const table = {
      id: 'table',
      name: 'Table',
      floating: true,
      fields: [
        {
          key: 'events',
          type: 'table',
          columns: [
            { key: 'event', type: 'string' },
            { key: 'screen', type: 'ref', accepts: { tags: ['screen'] } },
          ],
        },
      ],
    };
    const link = { id: 'deep-link', name: 'Deep link', appliesTo: ['arrow'], fields: [] };
    const result = parseSpec(spec(7, table, [link]));
    expect(result.ok).toBe(true);
  });
});

describe('ref as a table column', () => {
  function withColumn(column: Json, formatVersion = 7, table: Json = {}): Json {
    return spec(formatVersion, {
      fields: [
        {
          key: 'refs',
          type: 'table',
          columns: [{ key: 'name', type: 'string' }, column],
          ...table,
        },
      ],
    });
  }

  it('accepts the ref column with accepts (tags and/or free) in 7', () => {
    for (const accepts of [
      { tags: ['data-field'] },
      { free: true },
      { tags: ['a'], free: true },
    ]) {
      const raw = withColumn({ key: 'target', type: 'ref', accepts });
      const result = parseSpec(raw);
      expect(result.ok, JSON.stringify(accepts)).toBe(true);
      expect(jsonValidator.safeParse(raw).success).toBe(true);
      if (!result.ok) continue;
      const field = typeOf(result.spec).fields[0];
      expect(field?.type === 'table' && field.columns[1]).toMatchObject({
        key: 'target',
        type: 'ref',
        accepts,
      });
    }
  });

  it('refuses the ref column without accepts, with empty accepts, with default and with tags', () => {
    const missing = errorsOf(withColumn({ key: 'target', type: 'ref' }));
    expect(missing).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].columns[1].accepts',
      message: 'required in a ref',
    });
    const empty = errorsOf(
      withColumn({ key: 'target', type: 'ref', accepts: { tags: [] } }),
    );
    expect(empty[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].accepts',
    );
    const withDefault = errorsOf(
      withColumn({ key: 'target', type: 'ref', accepts: { free: true }, default: 'x' }),
    );
    expect(withDefault[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].default',
    );
    const withTags = errorsOf(
      withColumn({ key: 'target', type: 'ref', accepts: { free: true }, tags: ['a'] }),
    );
    expect(withTags[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].tags',
    );
  });

  it('in a version earlier than 7 it is the "only allowed with formatVersion 7" error, at the column path', () => {
    for (const v of [1, 5, 6]) {
      expect(
        errorsOf(withColumn({ key: 'target', type: 'ref', accepts: { free: true } }, v)),
      ).toContainEqual({
        path: 'layers[0].annotationTypes[0].fields[0].columns[1].type',
        message: 'only allowed with formatVersion 7',
      });
    }
  });

  it('table inside table is still forbidden', () => {
    const errors = errorsOf(withColumn({ key: 'sub', type: 'table', columns: [] }));
    expect(errors[0]?.path).toBe(
      'layers[0].annotationTypes[0].fields[0].columns[1].type',
    );
    expect(errors[0]?.message).toContain('"table" is not allowed inside a table');
  });

  it('rowLabel cannot be a ref column', () => {
    const errors = errorsOf(
      withColumn({ key: 'target', type: 'ref', accepts: { free: true } }, 7, {
        tags: ['data-field'],
        rowLabel: 'target',
      }),
    );
    expect(errors).toContainEqual({
      path: 'layers[0].annotationTypes[0].fields[0].rowLabel',
      message: '"target" must be a string column of the table',
    });
  });
});
