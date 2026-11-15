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
const LABELS: Record<string, Group[]> = {
  // MC5 (#1033, group C): button, extended-fab and chip grow with the label (hug height), so the label no longer fills the box height
  button: [{ names: ['label'] }],
  'extended-fab': [{ names: ['text'] }],
  chip: [{ names: ['label'] }],
  tabs: [{ names: ['label'], fill: true }],
  'segmented-button': [{ names: ['label'], fill: true }],
  'navigation-bar': [{ names: ['label'] }],
  'navigation-rail': [{ names: ['label'] }],
  'short-navigation-bar': [{ names: ['label'] }],
  'navigation-drawer': [{ names: ['title', 'label', 'badge'] }],
  badge: [{ names: ['number'] }],
  snackbar: [{ names: ['action label'], fill: true }],
  // MC5 (#1033): the text button grows with the label (hug height), so the label no longer fills the box height
  'alert-dialog': [{ names: ['label'] }],
  tooltip: [
    { names: ['action label'], fill: true },
    { names: ['text'], some: true },
  ],
  'dropdown-menu': [{ names: ['label', 'value', 'text'] }],
  'text-field': [{ names: ['label', 'value'] }],
  'secure-text-field': [{ names: ['label', 'value'] }],
  'list-item': [{ names: ['title', 'trailing content'] }],
  'search-bar': [{ names: ['hint', 'query'] }],
  'top-app-bar': [{ names: ['title', 'centered title'], fill: true }],
  'bottom-sheet': [{ names: ['label'] }],
  carousel: [{ names: ['label'] }],
  'date-picker': [{ pattern: /^((week)?day \d+|number|displayed month)$/ }],
  'time-picker': [
    { pattern: /^(value|separator|text|number( inner)? \d+|selected value)$/ },
  ],
};

interface RawNode {
  type?: string;
  name?: unknown;
  height?: unknown;
  font?: { verticalAlign?: unknown };
  children?: RawNode[];
  template?: RawNode;
  fallback?: RawNode;
}

function textNodes(node: RawNode, out: RawNode[] = []): RawNode[] {
  if (node.type === 'text') out.push(node);
  for (const child of node.children ?? []) textNodes(child, out);
  if (node.template !== undefined) textNodes(node.template, out);
  if (node.fallback !== undefined) textNodes(node.fallback, out);
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
