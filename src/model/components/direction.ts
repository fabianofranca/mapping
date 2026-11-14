/**
 * Reading direction in the component engine (stage #1096, R1; formatVersion 4): resolves the
 * effective direction of each template node before the engine measures and positions. Pure
 * functions, no DOM.
 *
 * - The root follows the instance's direction (`options.direction`, default `ltr`); `direction` on
 *   a node (literal `ltr`/`rtl`) pins it for that node and for the subtree.
 * - Every node comes out with `direction` already written (the effective one), and the condition
 *   `{ "$direction": "rtl" }` becomes the literal (`{ "$and": [] }` true, `{ "$or": [] }` false)
 *   by the direction of the node it is in.
 * - Without `rtl` on the instance and without `direction`/`$direction` in the template nothing is
 *   rewritten: the engine reads `ltr` on every node and today's drawing does not change.
 */
import type { Direction, TemplateNode } from './componentFormat';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The direction the node itself pins (literal `direction`), if it pins one. `repeat` does not
 * count: on it `direction` remains the stacking of the rows (`row`/`column`).
 */
export function ownDirection(node: TemplateNode): Direction | undefined {
  if (node.type === 'repeat') return undefined;
  return node.direction === 'ltr' || node.direction === 'rtl'
    ? node.direction
    : undefined;
}

/** Does any key/value pair of the tree (at any depth) pass `hit`? */
function someEntry(
  tree: unknown,
  hit: (key: string, value: unknown) => boolean,
): boolean {
  if (Array.isArray(tree)) return tree.some((item) => someEntry(item, hit));
  if (!isRecord(tree)) return false;
  return Object.entries(tree).some(
    ([key, value]) => hit(key, value) || someEntry(value, hit),
  );
}

/** Literal `direction` on a node (on `repeat` the value is `row`/`column`, which does not count) or `$direction`. */
const directionEntry = (key: string, value: unknown): boolean =>
  key === '$direction' || (key === 'direction' && (value === 'ltr' || value === 'rtl'));

/** Does the template mention `direction` on a node or `$direction` in a condition? */
export function usesDirection(tree: unknown): boolean {
  return someEntry(tree, directionEntry);
}

/** `anchors` with a logical anchor: in `rtl` it swaps sides and can lose to a physical one on the same side. */
const logicalAnchorEntry = (key: string, value: unknown): boolean =>
  key === 'anchors' && isRecord(value) && ('start' in value || 'end' in value);

/**
 * Does the tree need a pass in `rtl`? Yes when it talks about direction (`usesDirection`), mirrors
 * (`mirror: true`) or has a logical anchor — the three cases that change the result, not just the
 * side: the condition changes what enters the scene, and a logical anchor that loses to a physical
 * one changes the size. Apart from that `rtl` is the exact mirror of `ltr` (the same sizes, because
 * the text measurement and `font.align` do not affect the width), so no warning is new and the
 * pass is skipped.
 */
export function isDirectionSensitive(tree: unknown): boolean {
  return someEntry(
    tree,
    (key, value) =>
      directionEntry(key, value) ||
      (key === 'mirror' && value === true) ||
      logicalAnchorEntry(key, value),
  );
}

/** Replaces each `{ "$direction": x }` in the value with the literal of the direction `dir`. */
function fixConditions(value: unknown, dir: Direction): unknown {
  if (Array.isArray(value)) return value.map((item) => fixConditions(item, dir));
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$direction')
    return value.$direction === dir ? { $and: [] } : { $or: [] };
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) out[key] = fixConditions(inner, dir);
  return out;
}

/** The node with the effective direction written, the `$direction` conditions resolved and the children too. */
function resolveNode(node: TemplateNode, inherited: Direction): TemplateNode {
  const dir: Direction = ownDirection(node) ?? inherited;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'children' && Array.isArray(value))
      out[key] = value.map((child: TemplateNode) => resolveNode(child, dir));
    else out[key] = fixConditions(value, dir);
  }
  out.direction = dir;
  return out as unknown as TemplateNode;
}

/**
 * The tree with the effective direction on every node (see the comment at the top). Returns the
 * `template` itself when nothing asks for it (`root` `ltr` and no `direction`/`$direction` in it).
 */
export function resolveDirections<T extends TemplateNode>(
  template: T,
  root: Direction,
): T {
  if (root === 'ltr' && !usesDirection(template)) return template;
  return resolveNode(template, root) as T;
}
