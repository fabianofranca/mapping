/**
 * Embeddable viewer: the tree of a screen's instances, ready for the host to
 * draw in a list or a panel (selection and hover go back to the viewer through `setSelection`
 * and `setHover`). Pure, no DOM.
 *
 * The order is that of `renderOrder` (parent before children, siblings in list order) and the root
 * criterion is too: a `parentId` that does not exist on the screen counts as the screen level.
 */
import type { Library } from '../src/model/components/library';
import { instanceLabel } from '../src/model/components/library';
import type { Instance, Screen } from '../src/model/components/screen';

export interface TreeNode {
  readonly id: string;
  /** Absent on roots (including when the instance's `parentId` does not exist on the screen). */
  readonly parentId?: string;
  /** 0 on roots. */
  readonly depth: number;
  /** `instanceLabel(type, values)`; unknown type (or no library): the `typeId`. */
  readonly label: string;
  readonly typeId: string;
  /** Absent when the type does not exist in the library. */
  readonly typeName?: string;
  readonly instance: Instance;
  readonly children: readonly TreeNode[];
}

/** The screen's roots, in drawing order, with the children nested. */
export function screenTree(
  screen: Screen,
  library: Library | undefined,
): readonly TreeNode[] {
  const types = new Map((library?.types ?? []).map((t) => [t.id, t]));
  const known = new Set(screen.instances.map((i) => i.id));
  // Children by parent (`undefined` = roots), in list order: a single pass.
  const byParent = new Map<string | undefined, Instance[]>();
  for (const instance of screen.instances) {
    const parent =
      instance.parentId !== undefined && known.has(instance.parentId)
        ? instance.parentId
        : undefined;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(instance);
    else byParent.set(parent, [instance]);
  }
  const build = (parent: string | undefined, depth: number): TreeNode[] =>
    (byParent.get(parent) ?? []).map((instance) => {
      const type = types.get(instance.typeId);
      return {
        id: instance.id,
        ...(parent === undefined ? {} : { parentId: parent }),
        depth,
        label: type ? instanceLabel(type, instance.values) : instance.typeId,
        typeId: instance.typeId,
        ...(type ? { typeName: type.name } : {}),
        instance,
        children: build(instance.id, depth + 1),
      };
    });
  return build(undefined, 0);
}

/** The tree as a list, in pre-order (the same order as `renderOrder`). */
export function flattenTree(nodes: readonly TreeNode[]): readonly TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (list: readonly TreeNode[]): void => {
    for (const node of list) {
      out.push(node);
      visit(node.children);
    }
  };
  visit(nodes);
  return out;
}
