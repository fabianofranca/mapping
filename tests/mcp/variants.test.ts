import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpecText, serialize, specFiles } from '../../src/model';
import { emptyProject } from '../model/fixtures';
import {
  BUTTON_PATH,
  TEXT_BUTTON_PATH,
  variantsProject,
  variantsSpecJson,
} from '../model/variantsFixtures';
import { errorOf, ok } from './proposalSupport';
import {
  PNG_1X1,
  allIds,
  codeOf,
  connect,
  uuidFor,
  withUuids,
  type Connection,
} from './workspace';

// Etapa Biblioteca Material 3, MD1: `variants` no `code` (especialização formatVersion 9) pelo
// dist-mcp/mapping-mcp.js por stdio: get_code_hints, get_marking e get_annotation com o código
// resolvido pela anotação, find_by_code com a regra nova, e validate_specialization,
// validate_library e apply_specialization (plan_changes) com os mesmos erros da app.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FIELD = 'layers[0].annotationTypes[0].code.compose.variants';

interface CodeEntry {
  symbol: string;
  definition: { path: string; url: string | null } | null;
  params?: Record<string, string>;
  values?: Record<string, Record<string, string>>;
  notes?: string;
  variants?: unknown;
}
interface HintAnnotation {
  ref: string;
  type: string;
  label: string | null;
  code?: CodeEntry;
  args?: { field: string; name: string; value: unknown }[];
  linked?: HintAnnotation[];
}
interface HintNode {
  ref: string;
  annotations?: HintAnnotation[];
  children?: HintNode[];
}
interface Hints {
  types: Record<string, CodeEntry & { name: string }>;
  tree: HintNode;
}
interface Found {
  total: number;
  annotationTotal: number;
  matches: {
    type: { typeId: string };
    code: Record<string, CodeEntry>;
    annotations: { annotation: string }[];
  }[];
}
interface Validated {
  valid: boolean;
  errors: (string | { file: string; path: string; message: string })[];
}

let root: string;
let mcp: Connection;
const ids: Record<string, string> = {};

const specText = (edit?: (spec: Json) => void, formatVersion = 9): string => {
  const spec = variantsSpecJson(formatVersion) as Json;
  edit?.(spec);
  return `${JSON.stringify(spec, null, 2)}\n`;
};
const button = (spec: Json): Json => spec.layers[0].annotationTypes[0];

function writeLibrary(name: string, text: string): void {
  const dir = join(root, 'lib', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'm3.spec.json'), text);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-mcp-variants-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'm3.json'), specText());
  writeFileSync(join(root, 'fontes', 'm3-v8.json'), specText(undefined, 8));
  writeFileSync(
    join(root, 'fontes', 'm3-ruim.json'),
    specText((spec) => {
      button(spec).code.compose.variants.field = 'label';
    }),
  );
  writeLibrary('boa', specText());
  writeLibrary('v8', specText(undefined, 8));
  writeLibrary(
    'ruim',
    specText((spec) => {
      button(spec).code.compose.variants.cases.elevated = { symbol: 'ElevatedButton' };
    }),
  );

  const source = variantsProject();
  for (const id of allIds(source)) ids[id] = uuidFor(id);
  for (const name of ['botoes', 'vazio']) {
    const dir = join(root, 'projetos', name);
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, 'images', 'a.png'), PNG_1X1);
    if (name === 'vazio') {
      writeFileSync(join(dir, 'mapping.json'), serialize(emptyProject()));
      continue;
    }
    writeFileSync(
      join(dir, 'mapping.json'),
      withUuids(serialize(source), Object.keys(ids)),
    );
    for (const [file, content] of specFiles(source))
      writeFileSync(join(dir, file), content);
  }
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
});

const mRef = (key: string) => `mapping://botoes/m/${codeOf(ids[key]!)}`;
const aRef = (key: string) => `mapping://botoes/a/${codeOf(ids[key]!)}`;

function flatten(node: HintNode): HintAnnotation[] {
  return [
    ...(node.annotations ?? []).flatMap((a) => [a, ...(a.linked ?? [])]),
    ...(node.children ?? []).flatMap(flatten),
  ];
}

describe('get_code_hints com variants', () => {
  it('types traz a base (com variants) e cada anotação com variantes traz o código resolvido', async () => {
    const hints: Hints[] = [];
    for (const marking of ['MBF', 'MBO', 'MBT', 'MBN']) {
      hints.push(
        ok(
          await mcp.call<Hints>('get_code_hints', {
            ref: mRef(marking),
            platform: 'compose',
          }),
        ),
      );
    }
    const [filled, outlined, text, tonal] = hints.map((h) => flatten(h.tree)[0]!);
    expect(hints[0]!.types['m3/button']).toMatchObject({
      name: 'Button',
      symbol: 'androidx.compose.material3.Button',
      variants: { field: 'style' },
    });
    expect(filled!.code?.symbol).toBe('androidx.compose.material3.Button');
    expect(outlined!.code).toMatchObject({
      symbol: 'androidx.compose.material3.OutlinedButton',
      definition: { path: BUTTON_PATH },
      notes: 'content = { Text(label) }',
    });
    expect(outlined!.code).not.toHaveProperty('variants');
    expect(outlined!.args).toEqual([{ field: 'label', name: 'text', value: 'Outlined' }]);
    expect(text!.code).toMatchObject({
      symbol: 'androidx.compose.material3.TextButton',
      definition: {
        path: TEXT_BUTTON_PATH,
        url: `https://github.com/androidx/androidx/blob/main/${TEXT_BUTTON_PATH}`,
      },
      notes: 'sem fundo',
    });
    expect(tonal!.code?.params).toEqual({ label: 'text', size: 'sizeHint' });
    expect(tonal!.args).toEqual([
      { field: 'label', name: 'text', value: 'Tonal' },
      { field: 'size', name: 'sizeHint', value: 'XL' },
    ]);
  });

  it('o tipo sem variants não ganha `code` na árvore', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', { ref: mRef('MCD'), platform: 'compose' }),
    );
    const [card] = flatten(hints.tree);
    expect(card).not.toHaveProperty('code');
    expect(hints.types['m3/card']?.symbol).toBe('androidx.compose.material3.Card');
  });
});

describe('get_marking e get_annotation com variants', () => {
  it('o code da anotação é o resolvido, sem a chave variants', async () => {
    const annotation = ok(
      await mcp.call<{ code: { compose: CodeEntry } }>('get_annotation', {
        ref: aRef('BO'),
      }),
    );
    expect(annotation.code.compose.symbol).toBe(
      'androidx.compose.material3.OutlinedButton',
    );
    expect(annotation.code.compose).not.toHaveProperty('variants');
    const marking = ok(
      await mcp.call<{
        layers: { annotations: { ref: string; code?: Record<string, CodeEntry> }[] }[];
      }>('get_marking', { ref: mRef('MBT') }),
    );
    const typed = marking.layers.flatMap((l) => l.annotations)[0]!;
    expect(typed.code?.compose?.symbol).toBe('androidx.compose.material3.TextButton');
    expect(typed.code?.compose?.definition?.path).toBe(TEXT_BUTTON_PATH);
    // A base padrão (sem valor no style): o Button.
    const filled = ok(
      await mcp.call<{ code: { compose: CodeEntry } }>('get_annotation', {
        ref: aRef('BF'),
      }),
    );
    expect(filled.code.compose.symbol).toBe('androidx.compose.material3.Button');
  });
});

describe('find_by_code com variants', () => {
  const find = async (args: Record<string, string>) =>
    ok(await mcp.call<Found>('find_by_code', { project: 'botoes', ...args }));
  const annotationsOf = (found: Found, typeId = 'button') =>
    found.matches
      .find((m) => m.type.typeId === typeId)
      ?.annotations.map((a) => a.annotation.split(' ')[0])
      .sort();

  it('pelo símbolo da base, só a base; pelo de um caso, só as anotações dele', async () => {
    const base = await find({ symbol: 'androidx.compose.material3.Button' });
    expect(annotationsOf(base)).toEqual([aRef('BF')]);
    const outlined = await find({ symbol: 'androidx.compose.material3.OutlinedButton' });
    expect(annotationsOf(outlined)).toEqual([aRef('BO')]);
    // O code do resultado é o cru, com variants.
    expect(outlined.matches[0]?.code.compose?.variants).toBeDefined();
  });

  it('pelo path, todos os que apontam para o arquivo', async () => {
    const found = await find({ path: 'Button.kt' });
    expect(annotationsOf(found)).toEqual([aRef('BF'), aRef('BN'), aRef('BO')].sort());
    expect(annotationsOf(found, 'card')).toEqual([aRef('CD')]);
    expect(annotationsOf(await find({ path: 'TextButton.kt' }))).toEqual([aRef('BT')]);
  });
});

describe('validate_specialization, validate_library e apply_specialization com a 9', () => {
  const appErrors = (text: string): string[] => {
    const result = parseSpecText(text);
    if (result.ok) throw new Error('era para falhar');
    return result.errors;
  };

  it('uma 9 válida é aceita pelos três', async () => {
    const spec = ok(
      await mcp.call<Validated>('validate_specialization', { path: 'fontes/m3.json' }),
    );
    expect(spec).toMatchObject({ valid: true, errors: [] });
    const library = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/boa' }),
    );
    expect(library.valid).toBe(true);
    expect(library.errors).toEqual([]);
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'vazio',
        operations: [{ op: 'apply_specialization', file: 'fontes/m3.json' }],
      }),
    );
    expect(plan.valid).toBe(true);
  });

  it('variants inválido dá os mesmos erros da app', async () => {
    const text = specText((spec) => {
      button(spec).code.compose.variants.field = 'label';
    });
    const expected = appErrors(text);
    expect(expected).toEqual([`${FIELD}.field: "label" deve ser um campo enum do tipo`]);
    const spec = ok(
      await mcp.call<Validated>('validate_specialization', {
        path: 'fontes/m3-ruim.json',
      }),
    );
    expect(spec.valid).toBe(false);
    expect(spec.errors).toEqual(expected);
    const library = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/ruim' }),
    );
    expect(library.valid).toBe(false);
    expect(library.errors).toEqual([
      expect.objectContaining({
        path: `${FIELD}.cases.elevated`,
        message: '"elevated" não está nas options de "style"',
      }),
    ]);
    const plan = ok(
      await mcp.call<{ valid: boolean; errors?: { errors?: string[] }[] }>(
        'plan_changes',
        {
          project: 'vazio',
          operations: [{ op: 'apply_specialization', file: 'fontes/m3-ruim.json' }],
        },
      ),
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors?.[0]?.errors).toEqual(expected);
  });

  it('variants numa 8 é o mesmo erro no caminho exato', async () => {
    const expected = appErrors(specText(undefined, 8));
    expect(expected).toEqual([`${FIELD}: só é permitido com formatVersion 9`]);
    const spec = ok(
      await mcp.call<Validated>('validate_specialization', { path: 'fontes/m3-v8.json' }),
    );
    expect(spec.errors).toEqual(expected);
    const library = ok(await mcp.call<Validated>('validate_library', { path: 'lib/v8' }));
    expect(library.valid).toBe(false);
    expect(library.errors).toEqual([
      expect.objectContaining({
        path: FIELD,
        message: 'só é permitido com formatVersion 9',
      }),
    ]);
    const plan = ok(
      await mcp.call<{ valid: boolean; errors?: { errors?: string[] }[] }>(
        'plan_changes',
        {
          project: 'vazio',
          operations: [{ op: 'apply_specialization', file: 'fontes/m3-v8.json' }],
        },
      ),
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors?.[0]?.errors).toEqual(expected);
  });

  it('a recusa continua sendo um erro de ferramenta quando o arquivo não existe', async () => {
    expect(
      errorOf(await mcp.call('validate_specialization', { path: 'fontes/nada.json' }))
        .code,
    ).toBeTruthy();
  });
});
