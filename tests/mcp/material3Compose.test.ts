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
import { ok, propose, readProposal } from './proposalSupport';
import {
  PNG_1X1,
  allIds,
  codeOf,
  connect,
  uuidFor,
  withUuids,
  type Connection,
} from './workspace';

// Material 3 Library stage (MD5): what script R17 of docs/TESTING.md checks. A screen
// mapped with the library `libraries/material3-compose/` (Scaffold, Top app bar, LazyColumn with
// List items, an outlined Button and a FAB): `get_code_hints` returns the tree with the right
// composables, and `find_by_code` finds the variant by its resolved symbol.

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
  SC: 'Screen',
  TB: 'Bar',
  LC: 'List',
  L1: 'Ana',
  L2: 'Bruno',
  BT: 'Cancel',
  FB: 'New',
};

/** 360 × 800 screen with the tree: Scaffold ⊃ (Top app bar, LazyColumn ⊃ 2 List items, Button, FAB). */
function screen(): Project {
  const spec = parseSpecText(
    readFileSync(join(LIB, 'material3-compose.spec.json'), 'utf8'),
  );
  if (!spec.ok) throw new Error('unreadable library');
  let p = applySpecialization(emptyProject(), spec.spec, {
    newId: idGen('LM'),
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'SCREEN', file: 'images/a.png', width: 360, height: 800 });
  const add = (
    id: string,
    typeId: string,
    layer: string,
    rect: { x: number; y: number; width: number; height: number },
    values: Record<string, string>,
  ): void => {
    p = createMarking(p, { id: `M${id}`, containerId: 'SCREEN', rect, name: NAMES[id] });
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
  add('TB', 'top-app-bar', 'components', r(0, 0, 360, 64), { title: 'Contacts' });
  add('LC', 'lazy-column', 'layout', r(0, 64, 360, 560), {});
  add('L1', 'list-item', 'components', r(0, 70, 360, 56), { headlineContent: 'Ana' });
  add('L2', 'list-item', 'components', r(0, 130, 360, 56), { headlineContent: 'Bruno' });
  add('BT', 'button', 'components', r(16, 640, 140, 48), {
    label: 'Cancel',
    style: 'outlined',
  });
  add('FB', 'fab', 'components', r(280, 700, 56, 56), { icon: 'Add' });
  return p;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-mcp-m3-'));
  const source = screen();
  for (const id of allIds(source)) ids[id] = uuidFor(id);
  const dir = join(root, 'projetos', 'contacts');
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

const mRef = (key: string) => `mapping://contacts/m/${codeOf(ids[key]!)}`;

function flatten(node: HintNode): HintAnnotation[] {
  return [...(node.annotations ?? []), ...(node.children ?? []).flatMap(flatten)];
}

describe('screen mapped with the Material 3 (Compose) library', () => {
  it('get_code_hints returns the screen tree with the right composables', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', { ref: mRef('MSC'), platform: 'compose' }),
    );
    // The symbol comes from `types` (the base) and, on types with `variants`, from the annotation's `code`.
    const symbolOf = (a: HintAnnotation) => a.code?.symbol ?? hints.types[a.type]?.symbol;
    const tree = (node: HintNode): unknown => ({
      composable: (node.annotations ?? []).map((a) => symbolOf(a)).join(','),
      ...(node.children?.length ? { children: node.children.map(tree) } : {}),
    });
    // The hierarchy comes from geometry: the Scaffold wraps everything and the LazyColumn wraps the items.
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

  it('the outlined Button resolves to OutlinedButton in the same file as the base; types brings the raw one', async () => {
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

  it('find_by_code finds the outlined button by the variant symbol, not the base one', async () => {
    const found = ok(
      await mcp.call<{ matches: { annotations: unknown[] }[] }>('find_by_code', {
        project: 'contacts',
        symbol: `${M3}.OutlinedButton`,
      }),
    );
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0]!.annotations).toHaveLength(1);
    const base = ok(
      await mcp.call<{ matches: { annotations: unknown[] }[] }>('find_by_code', {
        project: 'contacts',
        symbol: `${M3}.Button`,
      }),
    );
    expect(base.matches.flatMap((m) => m.annotations)).toHaveLength(0);
  });
});

describe('Top app bar without rect: born with the style height (TB1, decision 1 of #1335)', () => {
  // The `SCREEN` screen is 360 × 800. The batch goes through `propose_changes` (the same prepared batch as
  // `plan_changes`), and the new marking's rectangle is read from the proposal.
  const topAppBar = (extra: Record<string, unknown> = {}, values?: unknown) => ({
    op: 'create_marking',
    as: '$bar',
    container: `mapping://contacts/i/${codeOf(ids['SCREEN']!)}`,
    annotation: {
      type: 'material3-compose/top-app-bar',
      ...(values ? { values } : {}),
    },
    ...extra,
  });
  const created = async (operation: unknown) => {
    const proposed = await propose(mcp, 'contacts', [operation]);
    expect(proposed.errors ?? []).toEqual([]);
    const proposal = readProposal(
      join(root, 'projetos', 'contacts'),
      proposed.proposal.id,
    );
    const marking = proposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    return (marking?.to ?? {}) as { rect?: { width: number; height: number } };
  };

  it('without rect, the small style is born with height 64 and the width tied to the screen 360', async () => {
    const m = await created(topAppBar());
    expect(m.rect).toMatchObject({ width: 360, height: 64 });
  });

  it.each([
    ['medium', 112],
    ['large', 152],
  ])('the %s style is born with height %i', async (style, height) => {
    const m = await created(topAppBar({}, { style }));
    expect(m.rect).toMatchObject({ width: 360, height });
  });

  it('with an explicit rect, the rect wins', async () => {
    const rect = { x: 0, y: 700, width: 360, height: 90 };
    const m = await created(topAppBar({ rect }));
    expect(m.rect).toEqual(rect);
  });
});
