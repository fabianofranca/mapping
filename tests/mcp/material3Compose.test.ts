import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpecText,
  serialize,
  setFieldValue,
  type Project,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';
import { ok } from './proposalSupport';
import {
  PNG_1X1,
  allIds,
  codeOf,
  connect,
  uuidFor,
  withUuids,
  type Connection,
} from './workspace';

// Etapa Biblioteca Material 3 (MD5): o que o roteiro R17 do docs/TESTING.md confere. Uma tela
// mapeada com a biblioteca `libraries/material3-compose/` (Scaffold, Top app bar, LazyColumn com
// List items, um Button outlined e um FAB): `get_code_hints` devolve a árvore com os composables
// certos, e `find_by_code` acha a variante pelo símbolo resolvido.

const LIB = join(__dirname, '../../libraries/material3-compose');
const M3 = 'androidx.compose.material3';

interface CodeEntry {
  symbol: string;
  definition: { path: string; url: string | null } | null;
  params?: Record<string, string>;
  notes?: string;
  variants?: unknown;
}
interface HintAnnotation {
  ref: string;
  type: string;
  code?: CodeEntry;
  args?: { field: string; name: string; value: unknown }[];
}
interface HintNode {
  ref: string;
  annotations?: HintAnnotation[];
  children?: HintNode[];
}
interface Hints {
  types: Record<string, CodeEntry>;
  tree: HintNode;
}

let root: string;
let mcp: Connection;
const ids: Record<string, string> = {};

const NAMES: Record<string, string> = {
  SC: 'Tela',
  TB: 'Barra',
  LC: 'Lista',
  L1: 'Ana',
  L2: 'Bruno',
  BT: 'Cancelar',
  FB: 'Novo',
};

/** Tela de 360 × 800 com a árvore: Scaffold ⊃ (Top app bar, LazyColumn ⊃ 2 List items, Button, FAB). */
function screen(): Project {
  const spec = parseSpecText(
    readFileSync(join(LIB, 'material3-compose.spec.json'), 'utf8'),
  );
  if (!spec.ok) throw new Error('biblioteca ilegível');
  let p = applySpecialization(emptyProject(), spec.spec, {
    newId: idGen('LM'),
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'TELA', file: 'images/a.png', width: 360, height: 800 });
  const add = (
    id: string,
    typeId: string,
    layer: string,
    rect: { x: number; y: number; width: number; height: number },
    values: Record<string, string>,
  ): void => {
    p = createMarking(p, { id: `M${id}`, containerId: 'TELA', rect, name: NAMES[id] });
    p = addTypedAnnotation(p, {
      id,
      markingId: `M${id}`,
      layerId: layerOf(p, 'material3-compose', layer),
      type: { specId: 'material3-compose', typeId },
    });
    for (const [key, value] of Object.entries(values))
      p = setFieldValue(p, id, key, value);
  };
  const r = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  add('SC', 'scaffold', 'layout', r(0, 0, 360, 800), {});
  add('TB', 'top-app-bar', 'components', r(0, 0, 360, 64), { title: 'Contatos' });
  add('LC', 'lazy-column', 'layout', r(0, 64, 360, 560), {});
  add('L1', 'list-item', 'components', r(0, 70, 360, 56), { headlineContent: 'Ana' });
  add('L2', 'list-item', 'components', r(0, 130, 360, 56), { headlineContent: 'Bruno' });
  add('BT', 'button', 'components', r(16, 640, 140, 48), {
    label: 'Cancelar',
    style: 'outlined',
  });
  add('FB', 'fab', 'components', r(280, 700, 56, 56), { icon: 'Add' });
  return p;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-mcp-m3-'));
  const source = screen();
  for (const id of allIds(source)) ids[id] = uuidFor(id);
  const dir = join(root, 'projetos', 'contatos');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'a.png'), PNG_1X1);
  writeFileSync(
    join(dir, 'mapping.json'),
    withUuids(serialize(source), Object.keys(ids)),
  );
  cpSync(LIB, join(dir, 'specs', 'material3-compose'), { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
});

const mRef = (key: string) => `mapping://contatos/m/${codeOf(ids[key]!)}`;

function flatten(node: HintNode): HintAnnotation[] {
  return [...(node.annotations ?? []), ...(node.children ?? []).flatMap(flatten)];
}

describe('tela mapeada com a biblioteca Material 3 (Compose)', () => {
  it('get_code_hints devolve a árvore da tela com os composables certos', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', { ref: mRef('MSC'), platform: 'compose' }),
    );
    // O símbolo vem do `types` (a base) e, nos tipos com `variants`, do `code` da anotação.
    const symbolOf = (a: HintAnnotation) => a.code?.symbol ?? hints.types[a.type]?.symbol;
    const tree = (node: HintNode): unknown => ({
      composable: (node.annotations ?? []).map((a) => symbolOf(a)).join(','),
      ...(node.children?.length ? { children: node.children.map(tree) } : {}),
    });
    // A hierarquia vem da geometria: o Scaffold envolve tudo e o LazyColumn envolve os itens.
    expect(tree(hints.tree)).toEqual({
      composable: `${M3}.Scaffold`,
      children: [
        { composable: `${M3}.TopAppBar` },
        {
          composable: 'androidx.compose.foundation.lazy.LazyColumn',
          children: [{ composable: `${M3}.ListItem` }, { composable: `${M3}.ListItem` }],
        },
        { composable: `${M3}.OutlinedButton` },
        { composable: `${M3}.FloatingActionButton` },
      ],
    });
  });

  it('o Button outlined resolve para OutlinedButton no mesmo arquivo da base; types traz o cru', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', { ref: mRef('MBT'), platform: 'compose' }),
    );
    const button = flatten(hints.tree)[0]!;
    expect(button.code?.symbol).toBe(`${M3}.OutlinedButton`);
    expect(button.code?.definition?.path).toMatch(/\/material3\/Button\.kt$/);
    expect(button.code).not.toHaveProperty('variants');
    expect(hints.types['material3-compose/button']).toMatchObject({
      symbol: `${M3}.Button`,
      variants: { field: 'style' },
    });
  });

  it('find_by_code acha o botão outlined pelo símbolo da variante, e não pelo da base', async () => {
    const found = ok(
      await mcp.call<{ matches: { annotations: unknown[] }[] }>('find_by_code', {
        project: 'contatos',
        symbol: `${M3}.OutlinedButton`,
      }),
    );
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0]!.annotations).toHaveLength(1);
    const base = ok(
      await mcp.call<{ matches: { annotations: unknown[] }[] }>('find_by_code', {
        project: 'contatos',
        symbol: `${M3}.Button`,
      }),
    );
    expect(base.matches.flatMap((m) => m.annotations)).toHaveLength(0);
  });
});
