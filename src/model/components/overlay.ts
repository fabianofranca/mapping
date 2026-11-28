// `overlay` (format 4, stage #2915): a node flagged `overlay: true` is drawn above the child markings of the
// same container, in a second pass. The scene tree stays whole (overflow, slots, gaps and the MCP reads see
// the same tree); `splitOverlay` cuts it into what is drawn in place and what is drawn on top, for whoever draws.
import type { FrameNode, GroupNode, SceneNode } from './scene';

export interface OverlaySplit {
  /** The scene without the overlay nodes: the very root when nothing is flagged. */
  readonly base: FrameNode;
  /**
   * The overlay nodes under the root's chain of ancestors, which keep the transform, the size, the clip, the
   * opacity and the rotation and scale but none of their own paint (fills, stroke, shadows and backdrop blur). Absent when
   * nothing is flagged.
   */
  readonly overlay?: FrameNode;
}

type Container = FrameNode | GroupNode;

const isContainer = (node: SceneNode): node is Container =>
  node.type === 'frame' || node.type === 'group';

/** `node` without any flagged descendant (a flagged node leaves with its whole subtree); the same object when it has none. */
function withoutOverlay<T extends SceneNode>(node: T): T {
  if (!isContainer(node)) return node;
  let changed = false;
  const children: SceneNode[] = [];
  for (const child of node.children) {
    if (child.overlay === true) {
      changed = true;
      continue;
    }
    const kept = withoutOverlay(child);
    if (kept !== child) changed = true;
    children.push(kept);
  }
  return changed ? { ...node, children } : node;
}

/** An ancestor of an overlay node: the geometry and the clip, without the paint. */
function unpainted<T extends Container>(node: T, children: readonly SceneNode[]): T {
  const copy: Record<string, unknown> = { ...node, fills: [], effects: [], children };
  delete copy.stroke;
  delete copy.backdropBlur;
  return copy as unknown as T;
}

/** The flagged nodes of `node`'s subtree, each under a copy of its ancestors, in drawing order; absent if none. */
function overlayOf(node: SceneNode): SceneNode | undefined {
  if (!isContainer(node)) return undefined;
  const kept: SceneNode[] = [];
  for (const child of node.children) {
    if (child.overlay === true) kept.push(child);
    else {
      const inner = overlayOf(child);
      if (inner !== undefined) kept.push(inner);
    }
  }
  return kept.length === 0 ? undefined : unpainted(node, kept);
}

const splits = new WeakMap<FrameNode, OverlaySplit>();

/**
 * Cuts the scene into the base and the overlay. Pure and memoized by the root's identity: the same root gives
 * the same pair, and a root with no flagged node gives itself as the base and no overlay.
 */
export function splitOverlay(root: FrameNode): OverlaySplit {
  const known = splits.get(root);
  if (known !== undefined) return known;
  const overlay = overlayOf(root) as FrameNode | undefined;
  const out: OverlaySplit =
    overlay === undefined ? { base: root } : { base: withoutOverlay(root), overlay };
  splits.set(root, out);
  return out;
}
