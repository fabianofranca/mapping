// MF4 (stage #899): scene regression of the examples of the types the phase touches. The scene from before the phase
// (`tests/fixtures/material3-mf4-before.json`, recorded with library v6) stays equal within ≤ 0.5 px per node,
// except where the change is the purpose (EXCEPTIONS: shadow, inherited color, gap, justified, disabled and
// number under the handle).
// pt-BR kept: shared fixture data asserted by tests/fixtures/material3-mf4-before.json: node names and example names
// (EXCEPTIONS, L2_EXAMPLES) are the Portuguese data of libraries/material3-compose
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files } from '../support/material3Library';

const TOUCHED = [
  'surface',
  'scaffold',
  'text',
  'icon',
  'icon-button',
  'icon-toggle-button',
  'card',
  'button',
  'fab',
  'extended-fab',
  'chip',
  'bottom-sheet',
  'dropdown-menu',
  'list-item',
  'pull-to-refresh',
  'snackbar',
  'tooltip',
  'switch',
  'slider',
  'text-field',
  'secure-text-field',
  'time-picker',
  'tabs',
];

type Rec = [string, string, number, number, number, number];

/**
 * Where the change of the phase is the purpose (the list below is the acceptance exceptions): the scene of the other
 * nodes stays equal within ≤ 0.5 px. Shadow (two per level), inherited color, opaque disabled, justified and
 * `over` change no box; only the rounded gap and the number under the handle change nodes.
 */
const EXCEPTIONS = {
  // Rounded gap: the outline is a single node (`contorno`, with `stroke.gap`); `contorno (lados)` and
  // `trecho final` go away, `trecho inicial` becomes `recuo` (spacing only) and the border label gets its own name.
  'text-field': {
    rename: {
      'contorno (lados)': 'contorno',
      recuo: 'trecho inicial',
      'rótulo minimizado': 'rótulo',
    },
    drop: ['trecho final'],
  },
  'secure-text-field': {
    rename: {
      'contorno (lados)': 'contorno',
      recuo: 'trecho inicial',
      'rótulo minimizado': 'rótulo',
    },
    drop: ['trecho final'],
  },
  // Number under the handle: `valor selecionado` goes away and the copy of the numbers enters inside the `alça`.
  'time-picker': { rename: {}, drop: ['valor selecionado'] },
  // MC5 (#1033): the label under the icon moved from the Roboto 14/20 estimate (text 12 above the bottom) to the Compose
  // baseline (`baselinePadding`): the node becomes `rótulo empilhado` and its box includes the baseline distances
  // (29 high instead of 20). `material3Mc5GrupoB.test.ts` checks the position; the rest of the scene stays equal.
  tabs: { rename: {}, drop: ['rótulo', 'rótulo empilhado', 'rótulo empilhado rolável'] },
  // MC5 (#1033): the rich tooltip moved from the Roboto 14/20 estimate (13, 9, 4 and 16 of padding) to the Compose
  // baseline distances (`baselinePadding`): the boxes of the title, the text and the action change place and the height
  // of the card with a title goes from 73 to 78 (`TooltipTest.kt` line 260: the text sits 24 below the END of the title
  // box, not its base). `material3Mc5GrupoA.test.ts` checks the positions; the `plain` one stays equal.
  tooltip: {
    rename: {},
    drop: ['rich', 'título', 'corpo', 'texto', 'ação', 'botão da ação', 'rótulo da ação'],
  },
  // MC5 (#1033, group C): the label and the `conteúdo` frame of the button, the extended-fab and the chip now hug the
  // height of the lines (`hug`, like the Compose `Row` with `defaultMinSize`) instead of filling the whole box: their box
  // shrinks and the chip hugs the width. The center of a one-line label stays the same (checked by
  // `material3Mc5GrupoC.test.ts`); the rest of the scene (container, icons, shadows) stays equal.
  button: { rename: {}, drop: ['conteúdo', 'rótulo'] },
  'extended-fab': { rename: {}, drop: ['conteúdo', 'texto'] },
  chip: { rename: {}, drop: ['conteúdo', 'rótulo'] },
  // MC6 (#1034): the menu item text now sits between the icons through the `left` and `right` anchors of the item frame
  // (`none`), instead of the `texto (caixa)` frame with the `padding`: the frame goes away and the text stays in the same
  // place (the menu box is the same, 200 wide). The menu width by the widest item is checked by `material3Mc6.test.ts`.
  'dropdown-menu': { rename: {}, drop: ['texto (caixa)'] },
  // L2 (#1078): no node exceeds the parent box (warning `content larger than the box`). The switch state layer went from
  // 40 to 32 (the rail height, in the `chave` frame) and, when pressed, the handle area grows from 24 to 28 to fit the 28 handle;
  // the rest of the scene (rail, travel, handle, icons) stays equal.
  switch: { rename: {}, drop: ['estado', 'área da alça'] },
  // Card: the `recorte` frame (top corners of the media by the Card radius, even with the shadow widening the straight
  // clip of the root) wraps the `corpo`, in the same box as it; the rest of the scene stays equal (checked by
  // `material3CardMediaCorners.test.ts`).
  card: { rename: {}, drop: ['recorte'] },
} as Record<string, { rename: Record<string, string>; drop: string[] }>;

/**
 * L2 (#1078): examples whose values changed to fit the `size` box (the text, which exceeds the 32-high box) or that
 * were removed because the `size` cannot hold them (the `rich` tooltip, which measures from 28 to over 100 high at 24).
 */
const L2_EXAMPLES: Record<string, string[]> = {
  text: ['Título de tela', 'Parágrafo', 'Parágrafo justificado'],
  tooltip: ['Rich com título', 'Rich com ação'],
};

/** Number under the handle: the `alça` gets the copy of the numbers (`números sob a alça`) in place of the `valor selecionado`. */
const SKIP_CHILDREN = { 'time-picker': ['alça'] } as Record<string, string[]>;

function flatten(
  node: SceneNode,
  ox: number,
  oy: number,
  out: Rec[],
  skip: readonly string[],
): void {
  const x = ox + node.transform[4];
  const y = oy + node.transform[5];
  if (node.visible) out.push([node.type, node.name, x, y, node.width, node.height]);
  if ('children' in node && !skip.includes(node.name))
    for (const c of node.children) flatten(c, x, y, out, skip);
}

function normalize(id: string, recs: Rec[]): Rec[] {
  const ex = EXCEPTIONS[id];
  if (ex === undefined) return recs;
  return recs
    .filter((r) => !ex.drop.includes(r[1]))
    .map((r): Rec => [r[0], ex.rename[r[1]] ?? r[1], r[2], r[3], r[4], r[5]]);
}

function sceneOf(
  catalog: ReturnType<typeof buildCatalog>,
  id: string,
): Record<string, Rec[]> {
  const entry = findEntry(catalog, id);
  const result: Record<string, Rec[]> = {};
  for (const mode of ['light', 'dark'] as const) {
    const cases: [string, Record<string, unknown>][] = [
      ['preview', entry?.previewValues ?? {}],
      ...(entry?.examples ?? [])
        .filter((e) => e.mode === 'values')
        .map((e): [string, Record<string, unknown>] => [e.name, e.values ?? {}]),
    ];
    for (const [name, values] of cases) {
      const recs: Rec[] = [];
      flatten(
        drawIn(catalog, entry!, values as never, mode).root,
        0,
        0,
        recs,
        SKIP_CHILDREN[id] ?? [],
      );
      result[`${id}|${mode}|${name}`] = normalize(id, recs);
    }
  }
  return result;
}

const FIXTURE = join(__dirname, '../fixtures/material3-mf4-before.json');
const TOLERANCE = 0.5;

/** Differences between the scene from before and the current one: an extra or missing node, or a box outside the tolerance. */
function diffScene(before: Rec[], now: Rec[]): string[] {
  const out: string[] = [];
  if (before.length !== now.length) out.push(`nodes: ${before.length} → ${now.length}`);
  const byName = new Map<string, Rec[]>();
  for (const r of now) byName.set(r[1], [...(byName.get(r[1]) ?? []), r]);
  const used = new Map<string, number>();
  for (const b of before) {
    const list = byName.get(b[1]) ?? [];
    const at = used.get(b[1]) ?? 0;
    used.set(b[1], at + 1);
    const n = list[at];
    if (n === undefined) {
      out.push(`gone: ${b[1]}`);
      continue;
    }
    for (let k = 2; k < 6; k++)
      if (Math.abs((b[k] as number) - (n[k] as number)) > TOLERANCE)
        out.push(`${b[1]}: ${b.slice(2).join(',')} → ${n.slice(2).join(',')}`);
  }
  return out;
}

describe('MF4: scene regression of the touched types', () => {
  const catalog = buildCatalog(files);
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Rec[]>;
  it.each(TOUCHED)(
    '%s: the examples scene stays equal within ≤ 0.5 px per node, except the exceptions',
    (id) => {
      const now = sceneOf(catalog, id);
      const keys = Object.keys(before).filter(
        (k) => k.startsWith(`${id}|`) && !L2_EXAMPLES[id]?.includes(k.split('|')[2]!),
      );
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(now[key], key).toBeDefined();
        expect(diffScene(normalize(id, before[key]!), now[key]!), key).toEqual([]);
      }
    },
  );
});
