// FX6 (#1013, decisions 23 and 25 of #896): the single-line labels of the `material3-compose` are centered by the
// capital letter (`font.verticalAlign: "cap-middle"`). The list below is the PR's. The ink center in the
// MCP raster is in `tests/mcp/material3CapMiddleRaster.test.ts`.
import { describe, expect, it } from 'vitest';
import { files } from '../support/material3Library';

interface Group {
  /** Exact names of the text nodes. */
  names?: string[];
  /** Or a pattern for the names (days, clock numbers). */
  pattern?: RegExp;
  /** `true`: one node with the name is enough (there is another, multi-line one, that stays as is). */
  some?: boolean;
  /** `true`: the node fills the box height (`height` `fill`, or an expression that returns it). */
  fill?: boolean;
}

/** Component → the single-line labels centered by the capital letter (decision 23). */
// pt-BR kept: the node names below are the Portuguese names of the frozen fixture package (tests/fixtures/material3)
const LABELS: Record<string, Group[]> = {
  // MC5 (#1033, group C): button, extended-fab and chip grow with the label (hug height), so the label no longer fills the box height
  button: [{ names: ['rótulo'] }],
  'extended-fab': [{ names: ['texto'] }],
  chip: [{ names: ['rótulo'] }],
  tabs: [{ names: ['rótulo'], fill: true }],
  'segmented-button': [{ names: ['rótulo'], fill: true }],
  'navigation-bar': [{ names: ['rótulo'] }],
  'navigation-rail': [{ names: ['rótulo'] }],
  'short-navigation-bar': [{ names: ['rótulo'] }],
  'navigation-drawer': [{ names: ['título', 'rótulo', 'selo'] }],
  badge: [{ names: ['número'] }],
  snackbar: [{ names: ['rótulo da ação'], fill: true }],
  // MC5 (#1033): the text button grows with the label (hug height), so the label no longer fills the box height
  'alert-dialog': [{ names: ['rótulo'] }],
  tooltip: [
    { names: ['rótulo da ação'], fill: true },
    { names: ['texto'], some: true },
  ],
  'dropdown-menu': [{ names: ['rótulo', 'valor', 'texto'] }],
  'text-field': [{ names: ['rótulo', 'valor'] }],
  'secure-text-field': [{ names: ['rótulo', 'valor'] }],
  'list-item': [{ names: ['título', 'conteúdo final'] }],
  'search-bar': [{ names: ['dica', 'consulta'] }],
  'top-app-bar': [{ names: ['título', 'título centralizado'], fill: true }],
  'bottom-sheet': [{ names: ['rótulo'] }],
  carousel: [{ names: ['rótulo'] }],
  'date-picker': [{ pattern: /^(dia( da semana)? \d+|número|mês exibido)$/ }],
  'time-picker': [
    { pattern: /^(valor|separador|texto|número( interno)? \d+|valor selecionado)$/ },
  ],
};

interface RawNode {
  type?: string;
  name?: unknown;
  height?: unknown;
  font?: { verticalAlign?: unknown };
  children?: RawNode[];
  template?: RawNode;
}

function textNodes(node: RawNode, out: RawNode[] = []): RawNode[] {
  if (node.type === 'text') out.push(node);
  for (const child of node.children ?? []) textNodes(child, out);
  if (node.template !== undefined) textNodes(node.template, out);
  return out;
}

const componentOf = (id: string): RawNode => {
  const file = files.find((f) => f.path === `components/${id}.json`);
  return (JSON.parse(file?.text ?? '{}') as { template: RawNode }).template;
};

describe('single-line labels of Material 3 with cap-middle (decision 23)', () => {
  for (const [id, groups] of Object.entries(LABELS)) {
    it(`${id}: ${groups.flatMap((g) => g.names ?? [String(g.pattern)]).join(', ')}`, () => {
      const all = textNodes(componentOf(id));
      for (const group of groups) {
        const hits = all.filter((n) =>
          group.names !== undefined
            ? group.names.includes(String(n.name))
            : group.pattern!.test(String(n.name)),
        );
        expect(hits.length, 'no node with a name from the list').toBeGreaterThan(0);
        const capped = hits.filter((n) =>
          JSON.stringify(n.font?.verticalAlign ?? '').includes('cap-middle'),
        );
        if (group.fill === true)
          expect(
            hits
              .filter((n) => !JSON.stringify(n.height ?? '').includes('fill'))
              .map((n) => String(n.name)),
            'nodes without height fill',
          ).toEqual([]);
        if (group.some === true) expect(capped.length).toBeGreaterThan(0);
        else
          expect(
            hits.filter((n) => !capped.includes(n)).map((n) => String(n.name)),
            'nodes without cap-middle',
          ).toEqual([]);
      }
    });
  }
});
