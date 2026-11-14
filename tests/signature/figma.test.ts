import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSignature, planSignatureImport } from '../../src/model/signatures';
import type { Spec } from '../../src/model/spec';
import { BUNDLE_CJS, BUNDLE_ESM, ROOT, run, spawnBundle, type Sig } from './support';

// The Figma reader (`mapping-signature/figma@1`, stage #1079, S4; decisions 3 and 10): the
// `componentPropertyDefinitions` of a COMPONENT_SET or COMPONENT, found by `--node` in the saved JSON.

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

/** A minimal COMPONENT_SET with the given properties. */
const set = (definitions: Record<string, unknown>, type = 'COMPONENT_SET') => ({
  id: '1:1',
  name: 'Thing',
  type,
  componentPropertyDefinitions: definitions,
});

describe('the four property kinds and the #id suffix', () => {
  let sig: Sig;
  beforeAll(() => {
    sig = fixtureSig();
  });

  it('source: design, figma, the node id and name, and the extractor', () => {
    expect(sig.source).toEqual({
      kind: 'design',
      system: 'figma',
      id: '12:34',
      name: 'Button',
      extractor: 'mapping-signature/figma@1',
    });
  });

  it('the properties, in source order', () => {
    expect(sig.params.map((p) => p.name)).toEqual(['Style', 'Disabled', 'Label', 'Icon']);
  });

  it('VARIANT: enum with the variantOptions and the default; no suffix, no id', () => {
    expect(sig.params[0]).toEqual({
      name: 'Style',
      role: 'value',
      type: 'VARIANT',
      default: 'Filled',
      value: { kind: 'enum', default: 'Filled', options: ['Filled', 'Outlined', 'Text'] },
    });
  });

  it('BOOLEAN: boolean with the default; the #<id> suffix leaves the name and goes to the id', () => {
    expect(sig.params[1]).toEqual({
      name: 'Disabled',
      id: '1:2',
      role: 'value',
      type: 'BOOLEAN',
      default: 'false',
      value: { kind: 'boolean', default: false },
    });
  });

  it('TEXT: text with the default', () => {
    expect(sig.params[2]).toEqual({
      name: 'Label',
      id: '1:3',
      role: 'value',
      type: 'TEXT',
      default: 'Button',
      value: { kind: 'text', default: 'Button' },
    });
  });

  it('INSTANCE_SWAP: slot, no default (the component id belongs to the file) and no required', () => {
    expect(sig.params[3]).toEqual({
      name: 'Icon',
      id: '1:4',
      role: 'slot',
      type: 'INSTANCE_SWAP',
    });
  });

  it('a standalone COMPONENT also works', () => {
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

describe('the suffix, the values and the shapes of the JSON', () => {
  it('the suffix leaves any kind; the name keeps spaces and symbols; only the last #id counts', () => {
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
    // empty text: the signature keeps the empty default
    expect(sig.params[2]).toMatchObject({
      default: '',
      value: { kind: 'text', default: '' },
    });
  });

  it('a default that is not one of the options: the enum has no value.default; without variantOptions: opaque', () => {
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

  it('a type the reader does not know becomes role other, without value', () => {
    const sig = figmaJson(set({ 'Slot#4:5': { type: 'SLOT' } }), '1:1');
    expect(sig.params[0]).toEqual({
      name: 'Slot',
      id: '4:5',
      role: 'other',
      type: 'SLOT',
      required: true,
    });
  });

  it('the property description, when present, goes to the doc', () => {
    const sig = figmaJson(
      set({
        'On#1:2': { type: 'BOOLEAN', defaultValue: false, description: 'Turns it on.' },
      }),
      '1:1',
    );
    expect(sig.doc).toEqual({ On: 'Turns it on.' });
  });

  it('empty componentPropertyDefinitions gives a signature without parameters', () => {
    expect(figmaJson(set({}), '1:1').params).toEqual([]);
  });

  it('the JSON of GET /v1/files/:key (the whole tree) and a loose node also work', () => {
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

  it('the URL id (12-34) finds node 12:34', () => {
    expect(fixtureSig('12-34')).toEqual(fixtureSig('12:34'));
  });
});

describe('errors (exit 1) with a clear message', () => {
  const files = { 'nodes.json': nodesText };

  it('missing node', () => {
    const result = extractFigma(files, '99:99');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('node 99:99 not found in nodes.json\n');
  });

  it('a node that is neither COMPONENT_SET nor COMPONENT', () => {
    const result = extractFigma(files, '30:1');
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      'the node 30:1 ("Home screen") is of type FRAME; expected COMPONENT_SET or COMPONENT\n',
    );
  });

  it('variant (COMPONENT without componentPropertyDefinitions): points to the component set', () => {
    const result = extractFigma(files, '12:35');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'the node 12:35 ("Style=Filled") has no componentPropertyDefinitions',
    );
    expect(result.stderr).toContain('use the id of the COMPONENT_SET');
  });

  it('invalid JSON, property without type and a type that is not text', () => {
    const bad = extractFigma({ 'nodes.json': '{ nope' }, '1:1');
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/^nodes\.json: invalid JSON: /);
    const noType = extractFigma(
      { 'nodes.json': JSON.stringify(set({ A: { defaultValue: 1 } })) },
      '1:1',
    );
    expect(noType.code).toBe(1);
    expect(noType.stderr).toContain('the property "A" has no type');
  });

  it('an unreadable file is an extraction error', () => {
    const result = extractFigma({}, '1:1', [], 'missing.json');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing.json');
  });
});

describe('options (exit 2)', () => {
  it('figma needs --file and --node, and has no --symbol, --path, --ref, --also, --overload or --init', () => {
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

  it('--node belongs to figma: in the code readers it is a usage error', () => {
    for (const reader of ['kotlin', 'swift']) {
      const result = run([reader, '--file', 'A', '--symbol', 'X', '--node', '1:1'], {
        A: 'x',
      });
      expect(result.code, reader).toBe(2);
      expect(result.stderr, reader).toContain('--node');
    }
  });

  it('code without --symbol is still a usage error', () => {
    expect(run(['swift', '--file', 'A.swift']).code).toBe(2);
    expect(run(['kotlin', '--file', 'A.kt']).code).toBe(2);
  });

  it('an absolute --file is valid in figma (there is no source.path)', () => {
    const result = run(['figma', '--file', '/abs/nodes.json', '--node', '12:34'], {
      '/abs/nodes.json': nodesText,
    });
    expect(result.code, result.stderr).toBe(0);
  });
});

describe('determinism and the bundle', () => {
  const args = ['figma', '--file', NODES, '--node', '12:34'];

  it('two runs and the .js against the .mjs give the same bytes; the signature passes parseSignature', () => {
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

  it('the expected signature of the fixture, byte by byte', () => {
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

describe('the imported Figma signature links the existing field by `sources`, with `values`', () => {
  const library = JSON.parse(
    readFileSync(join(ROOT, 'tests/fixtures/signature/library/lib.spec.json'), 'utf8'),
  ) as Spec;
  let signature: Parameters<typeof planSignatureImport>[1]['signature'];
  beforeAll(() => {
    const parsed = parseSignature(fixtureSig());
    if (!parsed.ok) throw new Error('invalid signature');
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

  it('Style matches the style field, the options match by normalized text and the leftover one warns', () => {
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
      'figma: the option `Text` of the source does not exist in the field',
    );
    expect(result.code).toBeUndefined();
    // the Icon slot stays in unmapped
    expect(result.unmapped.map((u) => u.name)).toContain('Icon');
  });

  it('importing the same signature twice changes nothing and duplicates neither field nor source', () => {
    const first = plan(library);
    const again = plan(first.spec, signature);
    expect(again.spec).toEqual(first.spec);
    expect(again.fields).toEqual([]);
    expect(again.versionBump).toBe(false);
    const keys = again.type.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
