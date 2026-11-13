import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSignature, planSignatureImport } from '../../src/model/signatures';
import type { Spec } from '../../src/model/spec';
import { BUNDLE_CJS, BUNDLE_ESM, ROOT, run, spawnBundle, type Sig } from './support';

// O leitor Figma (`mapping-signature/figma@1`, etapa #1079, S4; decisões 3 e 10): as
// `componentPropertyDefinitions` de um COMPONENT_SET ou COMPONENT, achado por `--node` no JSON salvo.

const NODES = 'tests/fixtures/signature/figma/button.nodes.json';
const nodesText = readFileSync(join(ROOT, NODES), 'utf8');

function extractFigma(
  files: Readonly<Record<string, string>>,
  node: string,
  flags: readonly string[] = [],
  file = 'nodes.json',
) {
  return run(['figma', '--file', file, '--node', node, ...flags], files);
}

function figmaJson(json: unknown, node: string): Sig {
  const result = extractFigma({ 'nodes.json': JSON.stringify(json) }, node);
  if (result.code !== 0) throw new Error(`exit ${result.code}: ${result.stderr}`);
  const parsed = parseSignature(JSON.parse(result.stdout));
  expect(parsed.ok, result.stdout).toBe(true);
  return JSON.parse(result.stdout) as Sig;
}

const fixtureSig = (node = '12:34'): Sig => {
  const result = extractFigma({ 'nodes.json': nodesText }, node);
  expect(result.code, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Sig;
};

/** Um COMPONENT_SET mínimo com as propriedades dadas. */
const set = (definitions: Record<string, unknown>, type = 'COMPONENT_SET') => ({
  id: '1:1',
  name: 'Thing',
  type,
  componentPropertyDefinitions: definitions,
});

describe('as quatro naturezas de propriedade e o sufixo #id', () => {
  let sig: Sig;
  beforeAll(() => {
    sig = fixtureSig();
  });

  it('source: design, figma, o id e o nome do nó, e o extrator', () => {
    expect(sig.source).toEqual({
      kind: 'design',
      system: 'figma',
      id: '12:34',
      name: 'Button',
      extractor: 'mapping-signature/figma@1',
    });
  });

  it('as propriedades, na ordem da fonte', () => {
    expect(sig.params.map((p) => p.name)).toEqual(['Style', 'Disabled', 'Label', 'Icon']);
  });

  it('VARIANT: enum com as variantOptions e o padrão; sem sufixo, sem id', () => {
    expect(sig.params[0]).toEqual({
      name: 'Style',
      role: 'value',
      type: 'VARIANT',
      default: 'Filled',
      value: { kind: 'enum', default: 'Filled', options: ['Filled', 'Outlined', 'Text'] },
    });
  });

  it('BOOLEAN: boolean com o padrão; o sufixo #<id> sai do nome e vai para o id', () => {
    expect(sig.params[1]).toEqual({
      name: 'Disabled',
      id: '1:2',
      role: 'value',
      type: 'BOOLEAN',
      default: 'false',
      value: { kind: 'boolean', default: false },
    });
  });

  it('TEXT: text com o padrão', () => {
    expect(sig.params[2]).toEqual({
      name: 'Label',
      id: '1:3',
      role: 'value',
      type: 'TEXT',
      default: 'Button',
      value: { kind: 'text', default: 'Button' },
    });
  });

  it('INSTANCE_SWAP: slot, sem padrão (o id do componente é do arquivo) e sem required', () => {
    expect(sig.params[3]).toEqual({
      name: 'Icon',
      id: '1:4',
      role: 'slot',
      type: 'INSTANCE_SWAP',
    });
  });

  it('um COMPONENT avulso também vale', () => {
    const divider = fixtureSig('20:1');
    expect(divider.source).toMatchObject({ id: '20:1', name: 'Divider' });
    expect(divider.params).toEqual([
      {
        name: 'Inset',
        id: '9:9',
        role: 'value',
        type: 'BOOLEAN',
        default: 'true',
        value: { kind: 'boolean', default: true },
      },
    ]);
  });
});

describe('o sufixo, os valores e as formas do JSON', () => {
  it('o sufixo sai de qualquer natureza; o nome fica com espaços e símbolos; só o último #id conta', () => {
    const sig = figmaJson(
      set({
        'Size#10:20': { type: 'VARIANT', defaultValue: 'S', variantOptions: ['S', 'M'] },
        'Has icon #2#3:4': { type: 'BOOLEAN', defaultValue: true },
        '↳ Label': { type: 'TEXT', defaultValue: '' },
      }),
      '1:1',
    );
    expect(sig.params.map((p) => [p.name, (p as { id?: string }).id])).toEqual([
      ['Size', '10:20'],
      ['Has icon #2', '3:4'],
      ['↳ Label', undefined],
    ]);
    // texto vazio: a ficha guarda o padrão vazio
    expect(sig.params[2]).toMatchObject({
      default: '',
      value: { kind: 'text', default: '' },
    });
  });

  it('padrão que não é uma das opções: o enum fica sem value.default; sem variantOptions: opaque', () => {
    const sig = figmaJson(
      set({
        A: { type: 'VARIANT', defaultValue: 'Z', variantOptions: ['X', 'Y'] },
        B: { type: 'VARIANT', defaultValue: 'Z' },
      }),
      '1:1',
    );
    expect(sig.params[0]?.value).toEqual({ kind: 'enum', options: ['X', 'Y'] });
    expect(sig.params[0]?.default).toBe('Z');
    expect(sig.params[1]?.value).toEqual({ kind: 'opaque' });
  });

  it('um tipo que o leitor não conhece vira role other, sem value', () => {
    const sig = figmaJson(set({ 'Slot#4:5': { type: 'SLOT' } }), '1:1');
    expect(sig.params[0]).toEqual({
      name: 'Slot',
      id: '4:5',
      role: 'other',
      type: 'SLOT',
      required: true,
    });
  });

  it('o description da propriedade, quando existe, vai para o doc', () => {
    const sig = figmaJson(
      set({
        'On#1:2': { type: 'BOOLEAN', defaultValue: false, description: 'Turns it on.' },
      }),
      '1:1',
    );
    expect(sig.doc).toEqual({ On: 'Turns it on.' });
  });

  it('componentPropertyDefinitions vazio dá uma ficha sem parâmetros', () => {
    expect(figmaJson(set({}), '1:1').params).toEqual([]);
  });

  it('o JSON de GET /v1/files/:key (a árvore inteira) e o nó solto também servem', () => {
    const node = set({ 'On#1:2': { type: 'BOOLEAN', defaultValue: false } });
    const file = {
      name: 'File',
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        children: [
          {
            id: '0:1',
            type: 'CANVAS',
            children: [{ id: '5:5', type: 'FRAME', children: [node] }],
          },
        ],
      },
      components: {},
      componentSets: {},
    };
    expect(figmaJson(file, '1:1').params.map((p) => p.name)).toEqual(['On']);
    expect(figmaJson(node, '1:1').params.map((p) => p.name)).toEqual(['On']);
    expect(figmaJson([{ other: 1 }, node], '1:1').params.map((p) => p.name)).toEqual([
      'On',
    ]);
  });

  it('o id da URL (12-34) acha o nó 12:34', () => {
    expect(fixtureSig('12-34')).toEqual(fixtureSig('12:34'));
  });
});

describe('erros (exit 1) com mensagem clara', () => {
  const files = { 'nodes.json': nodesText };

  it('nó inexistente', () => {
    const result = extractFigma(files, '99:99');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('nó 99:99 não encontrado em nodes.json\n');
  });

  it('nó que não é COMPONENT_SET nem COMPONENT', () => {
    const result = extractFigma(files, '30:1');
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      'o nó 30:1 ("Home screen") é do tipo FRAME; esperado COMPONENT_SET ou COMPONENT\n',
    );
  });

  it('variante (COMPONENT sem componentPropertyDefinitions): aponta o component set', () => {
    const result = extractFigma(files, '12:35');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'o nó 12:35 ("Style=Filled") não tem componentPropertyDefinitions',
    );
    expect(result.stderr).toContain('use o id do COMPONENT_SET');
  });

  it('JSON inválido, propriedade sem type e type que não é texto', () => {
    const bad = extractFigma({ 'nodes.json': '{ nope' }, '1:1');
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/^nodes\.json: JSON inválido: /);
    const noType = extractFigma(
      { 'nodes.json': JSON.stringify(set({ A: { defaultValue: 1 } })) },
      '1:1',
    );
    expect(noType.code).toBe(1);
    expect(noType.stderr).toContain('a propriedade "A" não tem type');
  });

  it('arquivo ilegível é erro de extração', () => {
    const result = extractFigma({}, '1:1', [], 'falta.json');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('falta.json');
  });
});

describe('opções (exit 2)', () => {
  it('figma precisa de --file e --node, e não tem --symbol, --path, --ref, --also, --overload nem --init', () => {
    expect(run(['figma', '--node', '1:1']).code).toBe(2);
    expect(run(['figma', '--file', 'a.json']).code).toBe(2);
    for (const flag of [
      '--symbol',
      '--path',
      '--ref',
      '--also',
      '--overload',
      '--init',
    ]) {
      const value = flag === '--overload' || flag === '--init' ? '1' : 'x';
      const result = run(['figma', '--file', 'a.json', '--node', '1:1', flag, value], {
        'a.json': '{}',
      });
      expect(result.code, flag).toBe(2);
      expect(result.stderr, flag).toContain(flag);
    }
  });

  it('--node é do figma: nos leitores de código é erro de uso', () => {
    for (const reader of ['kotlin', 'swift']) {
      const result = run([reader, '--file', 'A', '--symbol', 'X', '--node', '1:1'], {
        A: 'x',
      });
      expect(result.code, reader).toBe(2);
      expect(result.stderr, reader).toContain('--node');
    }
  });

  it('o código sem --symbol continua sendo erro de uso', () => {
    expect(run(['swift', '--file', 'A.swift']).code).toBe(2);
    expect(run(['kotlin', '--file', 'A.kt']).code).toBe(2);
  });

  it('--file absoluto vale no figma (não há source.path)', () => {
    const result = run(['figma', '--file', '/abs/nodes.json', '--node', '12:34'], {
      '/abs/nodes.json': nodesText,
    });
    expect(result.code, result.stderr).toBe(0);
  });
});

describe('determinismo e o bundle', () => {
  const args = ['figma', '--file', NODES, '--node', '12:34'];

  it('duas execuções e o .js contra o .mjs dão os mesmos bytes; a ficha passa no parseSignature', () => {
    const a = spawnBundle(BUNDLE_CJS, args);
    const b = spawnBundle(BUNDLE_CJS, args);
    const esm = spawnBundle(BUNDLE_ESM, args);
    expect(a.stderr).toBe('');
    expect(a.code).toBe(0);
    expect(b.stdout).toBe(a.stdout);
    expect(esm.stdout).toBe(a.stdout);
    expect(a.stdout).not.toContain(process.cwd());
    expect(parseSignature(JSON.parse(a.stdout)).ok).toBe(true);
  });

  it('a ficha esperada da fixture, byte a byte', () => {
    const out = spawnBundle(BUNDLE_CJS, args);
    const expected = JSON.parse(
      readFileSync(
        join(ROOT, 'tests/fixtures/signature/figma/button.expected.json'),
        'utf8',
      ),
    );
    expect(out.stdout).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });
});

describe('a ficha Figma importada liga o campo existente por `sources`, com `values`', () => {
  const library = JSON.parse(
    readFileSync(join(ROOT, 'tests/fixtures/signature/library/lib.spec.json'), 'utf8'),
  ) as Spec;
  let signature: Parameters<typeof planSignatureImport>[1]['signature'];
  beforeAll(() => {
    const parsed = parseSignature(fixtureSig());
    if (!parsed.ok) throw new Error('ficha inválida');
    signature = parsed.signature;
  });

  function plan(spec: Spec, previous?: typeof signature) {
    const result = planSignatureImport(spec, {
      type: 'button',
      target: { system: 'figma' },
      signature,
      ...(previous === undefined ? {} : { previous }),
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    return result.plan;
  }

  it('Style casa com o campo style, as opções casam pelo texto normalizado e a que sobra avisa', () => {
    const result = plan(library);
    expect(result.links[0]).toEqual({ param: 'Style', field: 'style', via: 'name' });
    expect(result.sources).toEqual([
      {
        system: 'figma',
        id: '12:34',
        name: 'Button',
        signature: 'signatures/button.figma.json',
      },
    ]);
    const style = result.type.fields.find((f) => f.key === 'style');
    expect(style?.sources).toEqual([
      {
        system: 'figma',
        name: 'Style',
        values: { Filled: 'filled', Outlined: 'outlined' },
      },
    ]);
    expect(result.notices.map((n) => n.message)).toContain(
      'figma: a opção `Text` da fonte não existe no campo',
    );
    expect(result.code).toBeUndefined();
    // o slot Icon fica no unmapped
    expect(result.unmapped.map((u) => u.name)).toContain('Icon');
  });

  it('importar a mesma ficha duas vezes não muda nada e não duplica campo nem source', () => {
    const first = plan(library);
    const again = plan(first.spec, signature);
    expect(again.spec).toEqual(first.spec);
    expect(again.fields).toEqual([]);
    expect(again.versionBump).toBe(false);
    const keys = again.type.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
