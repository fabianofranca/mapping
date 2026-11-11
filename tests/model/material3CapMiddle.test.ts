// FX6 (#1013, decisões 23 e 25 da #896): os rótulos de uma linha da `material3-compose` centram pela
// maiúscula (`font.verticalAlign: "cap-middle"`). A lista abaixo é a do PR. O centro da tinta no raster
// do MCP está em `tests/mcp/material3CapMiddleRaster.test.ts`.
import { describe, expect, it } from 'vitest';
import { files } from '../support/material3Library';

interface Group {
  /** Nomes exatos dos nós de texto. */
  names?: string[];
  /** Ou um padrão para os nomes (dias, números do relógio). */
  pattern?: RegExp;
  /** `true`: basta um nó com o nome (há outro, de várias linhas, que fica como está). */
  some?: boolean;
  /** `true`: o nó ocupa a altura da caixa (`height` `fill`, ou uma expressão que o devolve). */
  fill?: boolean;
}

/** Componente → os rótulos de uma linha que centram pela maiúscula (decisão 23). */
const LABELS: Record<string, Group[]> = {
  button: [{ names: ['rótulo'], fill: true }],
  'extended-fab': [{ names: ['texto'], fill: true }],
  chip: [{ names: ['rótulo'], fill: true }],
  tabs: [{ names: ['rótulo'], fill: true }],
  'segmented-button': [{ names: ['rótulo'], fill: true }],
  'navigation-bar': [{ names: ['rótulo'] }],
  'navigation-rail': [{ names: ['rótulo'] }],
  'short-navigation-bar': [{ names: ['rótulo'] }],
  'navigation-drawer': [{ names: ['título', 'rótulo', 'selo'] }],
  badge: [{ names: ['número'] }],
  snackbar: [{ names: ['rótulo da ação'], fill: true }],
  // MC5 (#1033): o botão de texto cresce com o rótulo (altura hug), então o rótulo já não ocupa a altura da caixa
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

describe('rótulos de uma linha da Material 3 com cap-middle (decisão 23)', () => {
  for (const [id, groups] of Object.entries(LABELS)) {
    it(`${id}: ${groups.flatMap((g) => g.names ?? [String(g.pattern)]).join(', ')}`, () => {
      const all = textNodes(componentOf(id));
      for (const group of groups) {
        const hits = all.filter((n) =>
          group.names !== undefined
            ? group.names.includes(String(n.name))
            : group.pattern!.test(String(n.name)),
        );
        expect(hits.length, 'nenhum nó com o nome da lista').toBeGreaterThan(0);
        const capped = hits.filter((n) =>
          JSON.stringify(n.font?.verticalAlign ?? '').includes('cap-middle'),
        );
        if (group.fill === true)
          expect(
            hits
              .filter((n) => !JSON.stringify(n.height ?? '').includes('fill'))
              .map((n) => String(n.name)),
            'nós sem height fill',
          ).toEqual([]);
        if (group.some === true) expect(capped.length).toBeGreaterThan(0);
        else
          expect(
            hits.filter((n) => !capped.includes(n)).map((n) => String(n.name)),
            'nós sem cap-middle',
          ).toEqual([]);
      }
    });
  }
});
