import {
  reviewKey,
  type ReviewNode,
  type ReviewTarget,
  type ReviewTree,
} from '../../model';

// The rows of the Proposals window in review mode: the Proposal → Project/Image →
// Item → Change tree flattened into a list (to virtualize), respecting the collapsed nodes and
// the filters. Pure functions over the model tree (`reviewTree`).

export interface LevelRow {
  /** `reviewKey` of the target (`item:M1`, `change:c3`…). */
  readonly key: string;
  readonly target: ReviewTarget;
  /** Depth (0 = proposal); `aria-level` is `depth + 1`. */
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

export interface LevelRowsOptions {
  /** Changes that pass the filters; `null` = no filter (all). */
  readonly visible: ReadonlySet<string> | null;
  /** Collapsed nodes (`reviewKey`). */
  readonly collapsed: ReadonlySet<string>;
}

const nodeTarget = (node: ReviewNode): ReviewTarget => ({
  level: node.level,
  id: node.id,
});

/** Flattens the tree: each node, its direct changes and then the child nodes. */
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

/** Parent of each row (`reviewKey` → `reviewKey`), to open the selection's ancestors. */
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

/** Ancestors of a row, from the parent up to the root. */
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

/** Nodes that start collapsed in a large proposal: the images and the Project. */
export function initiallyCollapsed(tree: ReviewTree): Set<string> {
  return new Set(tree.root.children.map((node) => reviewKey(nodeTarget(node))));
}

/** All nodes with children (for "Collapse all"), except the root. */
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

/** Position of the row among the visible siblings (`aria-posinset`/`aria-setsize`, from 1). */
export interface RowPosition {
  readonly posinset: number;
  readonly setsize: number;
}

/**
 * Position of each row in its level: siblings are the visible rows with the same parent. The
 * proposal (without a parent) is the only one in its level.
 */
export function rowPositions(
  rows: readonly Pick<LevelRow, 'key'>[],
  parents: ReadonlyMap<string, string>,
): ReadonlyMap<string, RowPosition> {
  const groups = new Map<string, string[]>();
  for (const { key } of rows) {
    const parent = parents.get(key) ?? '';
    const list = groups.get(parent);
    if (list) list.push(key);
    else groups.set(parent, [key]);
  }
  const out = new Map<string, RowPosition>();
  for (const keys of groups.values()) {
    keys.forEach((key, i) => out.set(key, { posinset: i + 1, setsize: keys.length }));
  }
  return out;
}

/** `id` of a row's `treeitem` (target of the tree's `aria-activedescendant`). */
export function rowDomId(key: string): string {
  return `review-row-${key.replace(/[^\w-]/g, '_')}`;
}
