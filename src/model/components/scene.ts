/**
 * Component engine (Library stage): scene.
 *
 * Scene model: what `instantiate` produces from a component template and what the Konva
 * renderer consumes. It is a small, neutral subset of a design model, with only what can be
 * drawn on the canvas without a network:
 * no remote fonts, images by `imageRef` or effects that the 2D canvas does not have.
 *
 * Convenções:
 * - Units in design px, with no screen conversion.
 * - `transform` is the node's 2D matrix **relative to its parent** (a, b, c, d, e, f, as in CSS/SVG:
 *   x' = a·x + c·y + e; y' = b·x + d·y + f). The node's geometry (`width`/`height`, `d`,
 *   `points`) stays in local space, with its origin at the node's top-left corner.
 * - Colors in CSS (`#rrggbb`, `#rrggbbaa` or `rgba(...)`). A `Paint`'s opacity is
 *   separate from the node's.
 */

import type { Box } from './box';
import type { ImageFit } from './componentFormat';
import type { RunLayout } from './richText';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Matriz 2D [a, b, c, d, e, f]. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m · n` (applies `n` first, then `m`). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/**
 * The matrix that takes the node's local space to its parent's: `transform` plus the `rotation`
 * around the center of the box. Without `rotation` it is `transform` itself.
 */
export function nodeMatrix(node: {
  readonly transform: Matrix;
  readonly rotation?: number;
  readonly width: number;
  readonly height: number;
}): Matrix {
  if (!node.rotation) return node.transform;
  const rad = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = node.width / 2;
  const cy = node.height / 2;
  // translate(c) · rotate · translate(-c)
  const turn: Matrix = [
    cos,
    sin,
    -sin,
    cos,
    cx - cos * cx + sin * cy,
    cy - sin * cx - cos * cy,
  ];
  return multiply(node.transform, turn);
}

export interface GradientStop {
  /** 0..1 along the gradient. */
  readonly offset: number;
  readonly color: string;
}

export type Paint =
  | { readonly type: 'solid'; readonly color: string; readonly opacity?: number }
  | {
      readonly type: 'linear';
      /** Points in the node's local space (px). */
      readonly start: Point;
      readonly end: Point;
      readonly stops: readonly GradientStop[];
      readonly opacity?: number;
    }
  | {
      readonly type: 'radial';
      readonly center: Point;
      readonly radius: number;
      readonly stops: readonly GradientStop[];
      readonly opacity?: number;
    }
  | {
      /**
       * Image, with two sources that do not mix. `src` is only the embedded image (`data:`),
       * a legacy of the lab and the Figma/SVG converters. `url` is the remote URL coming from the
       * component's `image` node: the model never downloads it nor applies the policy (whoever
       * draws decides). Without a ready or allowed image, the renderer draws a placeholder.
       */
      readonly type: 'image';
      readonly src?: string;
      readonly url?: string;
      /** How the image fills the box (absent = `cover`). */
      readonly fit?: ImageFit;
      readonly opacity?: number;
    };

export interface Stroke {
  readonly paints: readonly Paint[];
  readonly width: number;
  /** Figma aligns the stroke inside, centered or outside; SVG is always `center`. */
  readonly align: 'inside' | 'center' | 'outside';
  readonly dash?: readonly number[];
  /**
   * Stroke offset from the shape (px > 0; absent = 0): the stroke is drawn on the outline of the
   * shape grown by `offset` on each side, with each corner's radius + `offset`, and `align` is
   * relative to that outline. With `sides`, it only applies to the requested sides.
   */
  readonly offset?: number;
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
  /** `false`: the width is in screen pixels, at any zoom; absent = scales with the zoom. */
  readonly scale?: boolean;
  /**
   * Only these sides of the box have a stroke (`frame` and `rect`), in the order of `STROKE_SIDES`;
   * absent = all four, as an outline. The scene never carries all four sides here: `instantiate`
   * normalizes them to absent, and whoever draws reads `sides` directly.
   */
  readonly sides?: readonly ('top' | 'right' | 'bottom' | 'left')[];
  /**
   * Gaps in the outline (`frame` and `rect`, without `sides`), already computed by the layout: on
   * side `side`, the span from `from` to `to` (px along the side, in the node's local space; x on
   * top and bottom, y on the sides) has no stroke. Whoever draws only interrupts the outline (see
   * `gapOutlines`).
   */
  readonly gaps?: readonly StrokeGap[];
}

export interface StrokeGap {
  readonly side: 'top' | 'right' | 'bottom' | 'left';
  readonly from: number;
  readonly to: number;
}

/** Rectangle in the node's local space (px): the enlarged clip of a frame. */
export interface ClipBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Shadow {
  readonly color: string;
  readonly offset: Point;
  readonly blur: number;
  readonly spread?: number;
  /** Inner shadow: the 2D canvas does not have it; the renderer ignores it and warns. */
  readonly inner?: boolean;
}

export interface TextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  /** 100..900. */
  readonly fontWeight: number;
  readonly italic: boolean;
  /** Line height in px (absent = automatic). */
  readonly lineHeight?: number;
  /** Letter spacing in px. */
  readonly letterSpacing?: number;
  readonly align: 'left' | 'center' | 'right' | 'justify';
  /**
   * `rtl` when the text reads right to left (the `align` is already physical, resolved by the
   * direction). Absent = `ltr`. The drawing passes the direction to the text renderer; the MCP
   * raster aligns by the physical side and draws the glyphs in text order (no bidi).
   */
  readonly direction?: 'rtl';
  readonly verticalAlign: 'top' | 'middle' | 'bottom' | 'cap-middle';
  readonly decoration?: 'underline' | 'line-through';
  /** `none` = one line per paragraph (absent = wraps by word). */
  readonly wrap?: 'none';
  /** Text that does not fit ends in `…`. */
  readonly ellipsis?: true;
  /** Maximum number of lines drawn. */
  readonly maxLines?: number;
  /**
   * Resolved `baselinePadding.top` (px): the first baseline sits at this distance from the top
   * of the node, with the text placed by the font of whoever draws (`verticalAlign` is `top`).
   * Absent = the style's `verticalAlign` decides.
   */
  readonly baselineTop?: number;
}

interface NodeBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  /** 0..1, of the whole node (children included). */
  readonly opacity: number;
  readonly transform: Matrix;
  /**
   * Rotation in degrees, clockwise, around the center of the node's box (`width` × `height`),
   * applied in local space before `transform` (see `nodeMatrix`). Absent = does not rotate. The
   * children rotate along and so does the frame's clip; the box and the layout do not change.
   */
  readonly rotation?: number;
  /** The node's local box (px); in `path` and `line` it is the box of the points, informative. */
  readonly width: number;
  readonly height: number;
  readonly fills: readonly Paint[];
  readonly stroke?: Stroke;
  readonly effects: readonly Shadow[];
}

export interface FrameNode extends NodeBase {
  readonly type: 'frame';
  /** Clips the children to its own box (Figma: `clipsContent`). */
  readonly clip: boolean;
  /**
   * Clip larger than the box, when the `outside`/`center` stroke or the frame's shadow (or a
   * child's that goes past the box only because of them) goes out of it; absent = the clip is the
   * box itself. Only applies with `clip`. The content (shapes and text) stays clipped to the box.
   */
  readonly clipBox?: ClipBox;
  readonly cornerRadius: CornerRadius;
  readonly children: readonly SceneNode[];
}

export interface GroupNode extends NodeBase {
  readonly type: 'group';
  readonly children: readonly SceneNode[];
}

/** A radius or [top-left, top-right, bottom-right, bottom-left]. */
export type CornerRadius = number | readonly [number, number, number, number];

export interface RectNode extends NodeBase {
  readonly type: 'rect';
  readonly cornerRadius: CornerRadius;
}

export interface EllipseNode extends NodeBase {
  readonly type: 'ellipse';
}

export interface LineNode extends NodeBase {
  readonly type: 'line';
  /** Points in local space; `closed` closes the polygon. */
  readonly points: readonly Point[];
  readonly closed: boolean;
}

export interface PathNode extends NodeBase {
  readonly type: 'path';
  /** SVG data (`d`), in the node's local space. */
  readonly d: string;
  readonly fillRule: 'nonzero' | 'evenodd';
}

/** Resolved style of a run of rich text (the text and what the drawing needs from it). */
export interface SceneTextRun {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly italic: boolean;
  readonly color: string;
  readonly decoration?: 'underline' | 'line-through';
  /** Background color of the inline box; with it the run is an unbreakable block. */
  readonly background?: string;
  readonly radius?: number;
  /** Inline box padding: [vertical, horizontal]. */
  readonly padding?: readonly [number, number];
}

export interface TextNode extends NodeBase {
  readonly type: 'text';
  readonly text: string;
  readonly style: TextStyle;
  /**
   * Rich text (`runs` of the v4 component): the resolved style of each run; `text` is their
   * concatenation. Absent = text of a single style (`style`).
   */
  readonly runs?: readonly SceneTextRun[];
  /** The runs' lines at the node's width (positions before `verticalAlign`); with `runs`. */
  readonly runLayout?: RunLayout;
}

/** A node the converter recognized but cannot draw: just the box (and a warning). */
export interface UnknownNode extends NodeBase {
  readonly type: 'unknown';
  /** Source type (e.g. `BOOLEAN_OPERATION`, `<foreignObject>`). */
  readonly sourceType: string;
  /**
   * Only on `slot` (v4, the slot's `clip`): the child markings drawn inside it are clipped by
   * the slot's box. The components layer and the raster apply the clip to the child; the node
   * itself only draws the box.
   */
  readonly clipChildren?: true;
}

export type SceneNode =
  | FrameNode
  | GroupNode
  | RectNode
  | EllipseNode
  | LineNode
  | PathNode
  | TextNode
  | UnknownNode;

export interface Scene {
  /** Root: a `frame` (of the design's size) or `group` with the top-level nodes. */
  readonly root: SceneNode;
  /** What was left out or approximated, for the lab panel to show. */
  readonly warnings: readonly string[];
}

export function hasChildren(node: SceneNode): node is FrameNode | GroupNode {
  return node.type === 'frame' || node.type === 'group';
}

/** Walks the tree in pre-order. */
export function* walk(node: SceneNode): Generator<SceneNode> {
  yield node;
  if (hasChildren(node)) for (const child of node.children) yield* walk(child);
}

/** Default values to assemble nodes without repeating fields in the converters and in the tests. */
export function baseNode(
  partial: Partial<NodeBase> & Pick<NodeBase, 'id' | 'name'>,
): NodeBase {
  return {
    visible: true,
    opacity: 1,
    transform: IDENTITY,
    width: 0,
    height: 0,
    fills: [],
    effects: [],
    ...partial,
  };
}

export type AbsoluteBox = Box;

/**
 * Box of each node in the root's space, composing only the translations (the `rotation` and
 * the scale are ignored on purpose: the `rotation` is drawing only, so a frame's or slot's box
 * is the unrotated one, the one the layout and the slot's content use; see `nodeMatrix` for the
 * matrix that draws).
 */
export function absoluteBoxes(root: SceneNode): ReadonlyMap<string, AbsoluteBox> {
  const out = new Map<string, AbsoluteBox>();
  const visit = (node: SceneNode, ox: number, oy: number) => {
    const x = ox + node.transform[4];
    const y = oy + node.transform[5];
    out.set(node.id, { x, y, width: node.width, height: node.height });
    if (hasChildren(node)) for (const child of node.children) visit(child, x, y);
  };
  visit(root, 0, 0);
  return out;
}
