import {
  reviewKey,
  type ReviewNode,
  type ReviewTarget,
  type ReviewTree,
} from '../../model';

// As linhas da janela Propostas em modo revisão: a árvore Proposta → Projeto/Imagem →
// Item → Mudança achatada numa lista (para virtualizar), respeitando os nós recolhidos e
// os filtros. Funções puras sobre a árvore do modelo (`reviewTree`).

export interface LevelRow {
  /** `reviewKey` do alvo (`item:M1`, `change:c3`…). */
  readonly key: string;
  readonly target: ReviewTarget;
  /** Profundidade (0 = proposta); `aria-level` é `depth + 1`. */
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

export interface LevelRowsOptions {
  /** Mudanças que passam pelos filtros; `null` = sem filtro (todas). */
  readonly visible: ReadonlySet<string> | null;
  /** Nós recolhidos (`reviewKey`). */
  readonly collapsed: ReadonlySet<string>;
}

const nodeTarget = (node: ReviewNode): ReviewTarget => ({
  level: node.level,
  id: node.id,
});

/** Achata a árvore: cada nó, suas mudanças diretas e depois os nós filhos. */
export function buildLevelRows(tree: ReviewTree, options: LevelRowsOptions): LevelRow[] {
  const { visible, collapsed } = options;
  const rows: LevelRow[] = [];
  const shows = (node: ReviewNode) =>
    visible === null || tree.changeIdsOf(nodeTarget(node)).some((id) => visible.has(id));

  const visit = (node: ReviewNode, depth: number) => {
    const target = nodeTarget(node);
    const key = reviewKey(target);
    const changes =
      visible === null ? node.changeIds : node.changeIds.filter((id) => visible.has(id));
    const children = node.children.filter(shows);
    const expandable = changes.length + children.length > 0;
    const expanded = expandable && !collapsed.has(key);
    rows.push({ key, target, depth, expandable, expanded });
    if (!expanded) return;
    for (const id of changes) {
      const change: ReviewTarget = { level: 'change', id };
      rows.push({
        key: reviewKey(change),
        target: change,
        depth: depth + 1,
        expandable: false,
        expanded: false,
      });
    }
    for (const child of children) visit(child, depth + 1);
  };
  visit(tree.root, 0);
  return rows;
}

/** Pai de cada linha (`reviewKey` → `reviewKey`), para abrir os ancestrais da seleção. */
export function levelParents(tree: ReviewTree): ReadonlyMap<string, string> {
  const parents = new Map<string, string>();
  const visit = (node: ReviewNode) => {
    const key = reviewKey(nodeTarget(node));
    for (const id of node.changeIds) parents.set(reviewKey({ level: 'change', id }), key);
    for (const child of node.children) {
      parents.set(reviewKey(nodeTarget(child)), key);
      visit(child);
    }
  };
  visit(tree.root);
  return parents;
}

/** Ancestrais de uma linha, do pai até a raiz. */
export function ancestorKeys(
  parents: ReadonlyMap<string, string>,
  key: string,
): string[] {
  const out: string[] = [];
  const seen = new Set([key]);
  for (
    let up = parents.get(key);
    up !== undefined && !seen.has(up);
    up = parents.get(up)
  ) {
    seen.add(up);
    out.push(up);
  }
  return out;
}

/** Nós que começam recolhidos numa proposta grande: as imagens e o Projeto. */
export function initiallyCollapsed(tree: ReviewTree): Set<string> {
  return new Set(tree.root.children.map((node) => reviewKey(nodeTarget(node))));
}

/** Todos os nós com filhos (para "Recolher tudo"), menos a raiz. */
export function allNodeKeys(tree: ReviewTree): Set<string> {
  const keys = new Set<string>();
  const visit = (node: ReviewNode) => {
    for (const child of node.children) {
      keys.add(reviewKey(nodeTarget(child)));
      visit(child);
    }
  };
  visit(tree.root);
  return keys;
}
