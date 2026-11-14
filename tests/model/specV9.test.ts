// `formatVersion` 9: `variants` in the `code` entry (Material 3 library stage, MD1).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  type Spec,
} from '../../src/model/spec';
import { variantsSpecJson } from './variantsFixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CODE = 'layers[0].annotationTypes[0].code.compose';
const VARIANTS = `${CODE}.variants`;

/** The test specialization (`variantsSpecJson`) with `edit` applied to the Button's `code.compose`. */
function spec(edit?: (code: Json) => void, formatVersion = 9): Json {
  const json = variantsSpecJson(formatVersion) as Json;
  if (edit) edit(json.layers[0].annotationTypes[0].code.compose);
  return json;
}

/** The specialization with `edit` applied to the whole Button type. */
function withType(edit: (type: Json) => void): Json {
  const json = variantsSpecJson() as Json;
  edit(json.layers[0].annotationTypes[0]);
  return json;
}

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

function parsed(input: unknown): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

describe('formatVersion 9: variants', () => {
  it('the current version is 16 and v1 to v9 are still accepted, with or without code', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    const plain = (formatVersion: number): Json => ({
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
            { id: 't', name: 'T', fields: [{ key: 'k', type: 'string' }] },
          ],
        },
      ],
    });
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const input: Json = plain(v);
      if (v >= 2) {
        input.platforms = [{ id: 'compose', name: 'Compose' }];
        input.layers[0].annotationTypes[0].code = {
          compose: { symbol: 'Foo', params: { k: 'k' } },
        };
      }
      expect(parseSpec(input).ok, `v${v}`).toBe(true);
    }
  });

  it('accepts variants and returns the entry with the cases', () => {
    const result = parsed(spec());
    const code = result.layers[0]?.annotationTypes[0]?.code?.compose;
    expect(code?.variants?.field).toBe('style');
    expect(Object.keys(code?.variants?.cases ?? {})).toEqual([
      'outlined',
      'text',
      'tonal',
    ]);
    expect(code?.variants?.cases.text).toEqual({
      symbol: 'androidx.compose.material3.TextButton',
      path: 'compose/material3/TextButton.kt',
      // pt-BR kept: shared fixture data asserted by tests/mcp, tests/model/codeVariants.test.ts (variantsFixtures)
      notes: 'sem fundo',
    });
  });

  it('variants in an 8 (and in 5 to 7) is an error at the exact path', () => {
    for (const v of [5, 6, 7, 8]) {
      expect(issuesOf(spec(undefined, v)), `v${v}`).toEqual([
        { path: VARIANTS, message: 'only allowed with formatVersion 9' },
      ]);
    }
    expect(issuesOf(spec((code) => delete code.variants, 8))).toEqual([]);
  });

  it('field missing, nonexistent, not an enum and a table column', () => {
    expect(issuesOf(spec((c) => delete c.variants.field))).toEqual([
      { path: `${VARIANTS}.field`, message: 'required' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.field = 'nothing')))).toEqual([
      { path: `${VARIANTS}.field`, message: '"nothing" is not a field of the type' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.field = 'label')))).toEqual([
      { path: `${VARIANTS}.field`, message: '"label" must be an enum field of the type' },
    ]);
    const asColumn = withType((type) => {
      type.fields.push({
        key: 'rows',
        type: 'table',
        columns: [{ key: 'look', type: 'enum', options: ['outlined'] }],
      });
      type.code.compose.variants = {
        field: 'look',
        cases: { outlined: { symbol: 'X' } },
      };
    });
    expect(issuesOf(asColumn)).toEqual([
      { path: `${VARIANTS}.field`, message: '"look" is not a field of the type' },
    ]);
  });

  it('cases missing, empty and with a key outside the options', () => {
    expect(issuesOf(spec((c) => delete c.variants.cases))).toEqual([
      { path: `${VARIANTS}.cases`, message: 'required' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.cases = {})))).toEqual([
      { path: `${VARIANTS}.cases`, message: 'declare at least one case' },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.elevated = { symbol: 'ElevatedButton' }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.elevated`,
        message: '"elevated" is not in the options of "style"',
      },
    ]);
  });

  it('empty case is an error', () => {
    expect(issuesOf(spec((c) => (c.variants.cases.outlined = {})))).toEqual([
      {
        path: `${VARIANTS}.cases.outlined`,
        message: 'empty case: declare symbol, path, params, values or notes',
      },
    ]);
  });

  it('unknown property in variants and in the case', () => {
    const unknownVariants = issuesOf(spec((c) => (c.variants.extra = 1)));
    expect(unknownVariants).toHaveLength(1);
    expect(unknownVariants[0]?.path).toBe(VARIANTS);
    const unknownCase = issuesOf(spec((c) => (c.variants.cases.outlined.extra = 1)));
    expect(unknownCase).toHaveLength(1);
    expect(unknownCase[0]?.path).toBe(`${VARIANTS}.cases.outlined`);
  });

  it('params and values of a case only cite fields (and options) of the type', () => {
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.params = { nothing: 'x' }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.params.nothing`,
        message: '"nothing" is not a field of the type',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { nothing: { a: 'b' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.nothing`,
        message: '"nothing" is not a field of the type',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { label: { a: 'b' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.label`,
        message: '"label" must be an enum field of the type',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { size: { huge: 'H' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.size.huge`,
        message: '"huge" is not in the options of "size"',
      },
    ]);
  });

  it('invalid path in the case uses the same rule as the base path', () => {
    const [issue, ...others] = issuesOf(
      spec((c) => (c.variants.cases.outlined.path = '../outside/Button.kt')),
    );
    expect(others).toEqual([]);
    expect(issue?.path).toBe(`${VARIANTS}.cases.outlined.path`);
    expect(issue?.message).toContain('invalid path');
    expect(issuesOf(spec((c) => (c.variants.cases.outlined.symbol = '')))).toEqual([
      { path: `${VARIANTS}.cases.outlined.symbol`, message: 'cannot be empty' },
    ]);
  });

  it('the removed field (codeRef) also leaves the params of the cases', () => {
    const input = withType((type) => {
      type.fields.push({ key: 'impl', type: 'codeRef' });
      type.code.compose.params.impl = 'impl';
      type.code.compose.variants.cases.outlined.params = { impl: 'impl', label: 'label' };
      type.code.compose.variants.cases.text.params = { impl: 'impl' };
    });
    const result = parseSpec(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const code = result.spec.layers[0]?.annotationTypes[0]?.code?.compose;
    expect(code?.params).toEqual({ label: 'text' });
    expect(code?.variants?.cases.outlined?.params).toEqual({ label: 'label' });
    expect(code?.variants?.cases.text).toEqual({
      symbol: 'androidx.compose.material3.TextButton',
      path: 'compose/material3/TextButton.kt',
      // pt-BR kept: shared fixture data asserted by tests/mcp, tests/model/codeVariants.test.ts (variantsFixtures)
      notes: 'sem fundo',
    });
    expect(code?.variants?.field).toBe('style');
  });
});
