// `formatVersion` 9: `variants` na entrada de `code` (etapa Biblioteca Material 3, MD1).
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

/** A especialização de teste (`variantsSpecJson`) com `edit` aplicado ao `code.compose` do Button. */
function spec(edit?: (code: Json) => void, formatVersion = 9): Json {
  const json = variantsSpecJson(formatVersion) as Json;
  if (edit) edit(json.layers[0].annotationTypes[0].code.compose);
  return json;
}

/** A especialização com `edit` aplicado ao tipo Button inteiro. */
function withType(edit: (type: Json) => void): Json {
  const json = variantsSpecJson() as Json;
  edit(json.layers[0].annotationTypes[0]);
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

describe('formatVersion 9: variants', () => {
  it('a versão atual é a 9 e v1 a v8 continuam aceitas, com ou sem code', () => {
    expect(SPEC_FORMAT_VERSION).toBe(9);
    expect(SPEC_FORMAT_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
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

  it('aceita variants e devolve a entrada com os casos', () => {
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
      notes: 'sem fundo',
    });
  });

  it('variants numa 8 (e na 5 a 7) é erro no caminho exato', () => {
    for (const v of [5, 6, 7, 8]) {
      expect(issuesOf(spec(undefined, v)), `v${v}`).toEqual([
        { path: VARIANTS, message: 'só é permitido com formatVersion 9' },
      ]);
    }
    expect(issuesOf(spec((code) => delete code.variants, 8))).toEqual([]);
  });

  it('field ausente, inexistente, não enum e coluna de table', () => {
    expect(issuesOf(spec((c) => delete c.variants.field))).toEqual([
      { path: `${VARIANTS}.field`, message: 'obrigatório' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.field = 'nada')))).toEqual([
      { path: `${VARIANTS}.field`, message: '"nada" não é um campo do tipo' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.field = 'label')))).toEqual([
      { path: `${VARIANTS}.field`, message: '"label" deve ser um campo enum do tipo' },
    ]);
    const asColumn = withType((type) => {
      type.fields.push({
        key: 'linhas',
        type: 'table',
        columns: [{ key: 'estilo', type: 'enum', options: ['outlined'] }],
      });
      type.code.compose.variants = {
        field: 'estilo',
        cases: { outlined: { symbol: 'X' } },
      };
    });
    expect(issuesOf(asColumn)).toEqual([
      { path: `${VARIANTS}.field`, message: '"estilo" não é um campo do tipo' },
    ]);
  });

  it('cases ausente, vazio e com chave fora das options', () => {
    expect(issuesOf(spec((c) => delete c.variants.cases))).toEqual([
      { path: `${VARIANTS}.cases`, message: 'obrigatório' },
    ]);
    expect(issuesOf(spec((c) => (c.variants.cases = {})))).toEqual([
      { path: `${VARIANTS}.cases`, message: 'declare ao menos um caso' },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.elevated = { symbol: 'ElevatedButton' }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.elevated`,
        message: '"elevated" não está nas options de "style"',
      },
    ]);
  });

  it('caso vazio é erro', () => {
    expect(issuesOf(spec((c) => (c.variants.cases.outlined = {})))).toEqual([
      {
        path: `${VARIANTS}.cases.outlined`,
        message: 'caso vazio: declare symbol, path, params, values ou notes',
      },
    ]);
  });

  it('propriedade desconhecida no variants e no caso', () => {
    const unknownVariants = issuesOf(spec((c) => (c.variants.extra = 1)));
    expect(unknownVariants).toHaveLength(1);
    expect(unknownVariants[0]?.path).toBe(VARIANTS);
    const unknownCase = issuesOf(spec((c) => (c.variants.cases.outlined.extra = 1)));
    expect(unknownCase).toHaveLength(1);
    expect(unknownCase[0]?.path).toBe(`${VARIANTS}.cases.outlined`);
  });

  it('params e values de um caso só citam campos (e opções) do tipo', () => {
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.params = { nada: 'x' }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.params.nada`,
        message: '"nada" não é um campo do tipo',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { nada: { a: 'b' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.nada`,
        message: '"nada" não é um campo do tipo',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { label: { a: 'b' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.label`,
        message: '"label" deve ser um campo enum do tipo',
      },
    ]);
    expect(
      issuesOf(spec((c) => (c.variants.cases.outlined.values = { size: { huge: 'H' } }))),
    ).toEqual([
      {
        path: `${VARIANTS}.cases.outlined.values.size.huge`,
        message: '"huge" não está nas options de "size"',
      },
    ]);
  });

  it('path inválido no caso usa a mesma regra do path da base', () => {
    const [issue, ...others] = issuesOf(
      spec((c) => (c.variants.cases.outlined.path = '../fora/Button.kt')),
    );
    expect(others).toEqual([]);
    expect(issue?.path).toBe(`${VARIANTS}.cases.outlined.path`);
    expect(issue?.message).toContain('caminho inválido');
    expect(issuesOf(spec((c) => (c.variants.cases.outlined.symbol = '')))).toEqual([
      { path: `${VARIANTS}.cases.outlined.symbol`, message: 'não pode ser vazio' },
    ]);
  });

  it('o campo removido (codeRef) sai também dos params dos casos', () => {
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
      notes: 'sem fundo',
    });
    expect(code?.variants?.field).toBe('style');
  });
});
