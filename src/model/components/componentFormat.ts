/**
 * Component engine (Library stage): format of the component file (`mapping-component`).
 *
 * A component is the generic drawing of an annotation type of the specialization. Each component
 * lives in its **own file**; the specialization's type only references it
 * (`"component": "components/button.json"`, path relative to the specialization file).
 * The drawing is a `template`: a tree of neutral primitives (frame, rectangle, ellipse, text,
 * path, slot, `repeat` in `formatVersion` 2 and `image` in 3) whose attributes can be **bound to
 * the fields** of the type by expressions (`{"$field": "label"}`, `{"$if": …}`, `{"$switch": …}`).
 * Changing a field's value in the annotation redraws the component.
 *
 * Position: the instance takes the marking's rectangle. Inside the template, each node has a
 * `layout` that says how the children are distributed (`none` with anchors, `row` or `column`), so
 * the drawing adapts to the size of the rectangle.
 */
import type { IconSet } from './icons';
import type { AnchorAlign, AnchorSide } from '../anchorSides';

export const COMPONENT_FORMAT = 'mapping-component';
/** Version in which components without `repeat` are written (the repository's generators write it). */
export const COMPONENT_FORMAT_VERSION = 1;
/** Version 2 adds the `repeat` node (the drawn table); 1 is still accepted and valid without it. */
export const COMPONENT_FORMAT_VERSION_REPEAT = 2;
/**
 * Version 3 adds the `image` node (remote image by `https://` URL); 1 and 2 are still
 * accepted unchanged (and `repeat` is valid in 2 and 3).
 */
export const COMPONENT_FORMAT_VERSION_IMAGE = 3;
/**
 * Version 4 (the "faithful components" stage) gathers the file's new keys: `stroke.cap`,
 * `stroke.join` and `stroke.sides` already here. Every v4 key in an earlier version is the error
 * `only allowed with formatVersion 4`, at the key's path. Variables (`let` on the frame and
 * `{ "$var": … }` in expressions and conditions) are also keys of 4, swapped on reading.
 */
export const COMPONENT_FORMAT_VERSION_FIDELITY = 4;
/** Accepted versions. */
export const COMPONENT_FORMAT_VERSIONS = [1, 2, 3, 4] as const;
export type ComponentFormatVersion = (typeof COMPONENT_FORMAT_VERSIONS)[number];

// ---------------------------------------------------------------------------------------
// Expressions: a literal value or a binding to fields of the annotation
// ---------------------------------------------------------------------------------------

/**
 * A row of a `table` field, as `repeat` reads it: the value of each column (text, number or
 * empty; the `ref` cell arrives as the target's label).
 */
export type FieldRow = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Field value as the annotation saves it: text, number or empty (enum and date are text). A
 * `table` field arrives as the list of rows, which only the `repeat` node reads.
 */
export type FieldValue = string | number | null | undefined | readonly FieldRow[];

/** Values of the instance's fields, by the field's `key`. */
export type FieldValues = Readonly<Record<string, FieldValue>>;

/** Reading direction (v4): left to right (default) or right to left. */
export type Direction = 'ltr' | 'rtl';
export const DIRECTIONS: readonly Direction[] = ['ltr', 'rtl'];

export type Condition =
  /** "True" field: non-empty and different from `"não"`, `"false"`, `"0"`, `"off"`. */
  | { readonly $field: string }
  | { readonly $eq: readonly [field: string, value: string | number] }
  | { readonly $has: string }
  | { readonly $not: Condition }
  /** The node's effective reading direction (v4): `ltr` or `rtl`; valid wherever a condition is. */
  | { readonly $direction: Direction }
  | { readonly $and: readonly Condition[] }
  | { readonly $or: readonly Condition[] }
  /** Numeric comparisons (v4): an operand without a value gives false. */
  | { readonly $gt: readonly [Expr<number>, Expr<number>] }
  | { readonly $gte: readonly [Expr<number>, Expr<number>] }
  | { readonly $lt: readonly [Expr<number>, Expr<number>] }
  | { readonly $lte: readonly [Expr<number>, Expr<number>] };

/**
 * Boolean expression: a literal, an `Expr<boolean>` or a direct condition
 * (`{"$has": "label"}`, `{"$not": …}`). A field cited by `$field` is read by truthiness
 * (`"sim"`/`"não"`, see `truthy` in expressions.ts), never as text.
 */
export type BoolExpr = Expr<boolean> | Condition;

/** Expression that produces a value of type `T` (or the literal). */
export type Expr<T> =
  | T
  | { readonly $field: string; readonly default?: T }
  | { readonly $if: Condition; readonly then: Expr<T>; readonly else?: Expr<T> }
  | {
      readonly $switch: string;
      readonly cases: Readonly<Record<string, Expr<T>>>;
      readonly default?: Expr<T>;
    }
  /**
   * Inherited color (v4): the value that an ancestor's slot offers (`SlotTemplate.provide`) with
   * this name, the one from the nearest ancestor that offers it. Without an ancestor that offers
   * it, `default` applies (an expression); without `default`, the place's default.
   */
  | { readonly $provided: string; readonly default?: Expr<T> }
  /** Text only: concatenates the parts (numbers become text). */
  | { readonly $concat: readonly Expr<string | number>[] }
  /**
   * Number only (v4): arithmetic and trigonometric operations (`$sin`/`$cos` in degrees). An
   * operand without a value (empty, non-numeric text, division by zero) makes the operation
   * produce no value.
   */
  | { readonly $add: readonly Expr<number>[] }
  | { readonly $sub: readonly [Expr<number>, Expr<number>] }
  | { readonly $mul: readonly Expr<number>[] }
  | { readonly $div: readonly [Expr<number>, Expr<number>] }
  | { readonly $mod: readonly [Expr<number>, Expr<number>] }
  | { readonly $round: Expr<number> }
  | { readonly $floor: Expr<number> }
  | { readonly $ceil: Expr<number> }
  | { readonly $abs: Expr<number> }
  | { readonly $min: readonly Expr<number>[] }
  | { readonly $max: readonly Expr<number>[] }
  | { readonly $clamp: readonly [Expr<number>, Expr<number>, Expr<number>] }
  | { readonly $sin: Expr<number> }
  | { readonly $cos: Expr<number> }
  /** Number of rows of the `table` field (v4; with no rows, 0). */
  | { readonly $rows: string }
  /** Width or height of the instance in image px (v4; in the drawing proof and in `hug`, `size`). */
  | { readonly $size: 'width' | 'height' }
  /**
   * Number of measured lines of the `text` node of the given name (v4; at most `maxLines`, empty
   * text = 0).
   * The engine lays out in two passes when the template uses `$lines` (decision 8 of #898).
   */
  | { readonly $lines: string }
  /**
   * Named value of the specialization, in the drawing's mode (v4; see `tokens.ts`). In a color
   * position,
   * `alpha` (0 to 1, literal or number `$token`) multiplies the color's alpha, and `over` (name of
   * a color token or literal color) composes the result over that color, which makes it opaque.
   */
  | {
      readonly $token: string;
      readonly alpha?: number | { readonly $token: string };
      readonly over?: string;
    };

// ---------------------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------------------

/** CSS color (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) or `"none"`. */
export type Color = string;

export interface GradientSpec {
  readonly type: 'linear';
  /** Angle in degrees (0 = left to right, 90 = top to bottom). */
  readonly angle: number;
  readonly stops: readonly { readonly offset: number; readonly color: Expr<Color> }[];
}

export type FillSpec = Color | GradientSpec;

export interface StrokeSpec {
  readonly color: Expr<Color>;
  readonly width?: Expr<number>;
  readonly align?: 'inside' | 'center' | 'outside';
  /**
   * Dashing: list of numbers ≥ 0. In v4 it accepts an expression (`$switch`/`$if`/`$field` that
   * return the list) and a number `$token` in each item; an invalid resolved value gives the
   * warning `invalid value in stroke.dash` and no dashing.
   */
  readonly dash?: Expr<readonly (number | { readonly $token: string })[]>;
  /**
   * Offset of the stroke from the shape (v4, px ≥ 0, on `frame`, `rect` and `ellipse`): the stroke
   * is drawn on the outline of the shape grown by `offset` on each side (like CSS's
   * `outline-offset`) and `align` is relative to that outline.
   */
  readonly offset?: number | { readonly $token: string };
  /** Stroke end (v4); the default is `butt`. */
  readonly cap?: Expr<'butt' | 'round' | 'square'>;
  /** Stroke corner (v4); the default is `miter`. */
  readonly join?: Expr<'miter' | 'round' | 'bevel'>;
  /** Only these sides have a stroke (v4, on `frame` and `rect`); absent = all four. */
  readonly sides?: Expr<readonly StrokeSide[]>;
  /**
   * Stroke width (v4, literal): `true` (default) scales with the zoom; `false` keeps the width
   * in screen pixels, at any zoom.
   */
  readonly scale?: boolean;
  /**
   * Gap in the outline (v4, on `frame` and `rect`, without `sides`): the side that the box of the
   * node `node` (the first with that name in the template) crosses is interrupted over the span it
   * covers, plus `padding` (px, default 0) on each side: the cut in the `OutlinedTextField` outline.
   */
  readonly gap?: StrokeGapSpec;
}

export interface StrokeGapSpec {
  readonly node: string;
  readonly padding?: Expr<number>;
}

export type StrokeSide = 'top' | 'right' | 'bottom' | 'left';
export const STROKE_SIDES: readonly StrokeSide[] = ['top', 'right', 'bottom', 'left'];

/** A corner radius: number ≥ 0 or, in v4, number `$token`. */
type Radius = number | { readonly $token: string };

export interface ShadowSpec {
  readonly color: Expr<Color>;
  /** In v4 each measure also accepts a number `$token`. */
  readonly x?: number | { readonly $token: string };
  readonly y?: number | { readonly $token: string };
  readonly blur?: number | { readonly $token: string };
  /** Grows (or, if negative, shrinks) the shadow's shape on each side (v4, px; literal or `$token`). */
  readonly spread?: number | { readonly $token: string };
}

export interface FontSpec {
  readonly family?: Expr<string>;
  readonly size?: Expr<number>;
  /** 100..900. */
  readonly weight?: Expr<number>;
  readonly italic?: BoolExpr;
  /** Multiple of the size (1.2) or px when > 3. */
  readonly lineHeight?: Expr<number>;
  readonly letterSpacing?: Expr<number>;
  /**
   * `justify` (v4): the text fills the box's width, and the last line of each paragraph stays on
   * the left. `start` (the default) and `end` (v4) follow the reading direction: `left`/`right` in
   * `ltr`, `right`/`left` in `rtl`; `left` and `right` remain physical.
   */
  readonly align?: Expr<'left' | 'center' | 'right' | 'justify' | 'start' | 'end'>;
  /** `cap-middle` centers by the capital letter's height (formatVersion 4 only). */
  readonly verticalAlign?: Expr<'top' | 'middle' | 'bottom' | 'cap-middle'>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
  /** `word` (default) wraps by word; `none` is one line per paragraph. formatVersion 4 only. */
  readonly wrap?: Expr<'word' | 'none'>;
  /** Text that does not fit ends in `…` (width with `wrap: none`; height with `maxLines`). v4. */
  readonly ellipsis?: BoolExpr;
  /** Maximum lines (integer ≥ 1); the last takes the `…` (with `ellipsis`) or is cut. v4 only. */
  readonly maxLines?: Expr<number>;
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

/**
 * The intrinsic measure (v4, decision 17 of #1078): `"min-content"` is the largest unbreakable
 * piece (text: the widest word) and `"max-content"` the size without wrapping (text: the widest
 * line).
 */
export type IntrinsicSize = 'min-content' | 'max-content';

/**
 * Size of a node on one axis: fixed px, `"fill"` (takes what is left in the parent; in
 * `row`/`column` splits it with the other `fill`s), `"hug"` (from the content: measured text, or
 * children), a fraction of the parent (`"50%"`) or, in v4, `"min-content"`/`"max-content"`
 * (`IntrinsicSize`).
 */
export type SizeSpec = number | 'fill' | 'hug' | IntrinsicSize | `${number}%`;

/**
 * Anchors in the parent with `layout: none`: distance from the edge, like Figma's constraints. In
 * `formatVersion` 4 each value can be an expression; one that produces no number counts as an
 * absent anchor.
 */
export interface Anchors {
  readonly left?: Expr<number>;
  readonly right?: Expr<number>;
  /**
   * Logical (v4), on the horizontal axis: `start` is the edge where reading begins (left in `ltr`,
   * right in `rtl`) and `end` the opposite. `start` does not combine with `left`, nor `end` with
   * `right`.
   */
  readonly start?: Expr<number>;
  readonly end?: Expr<number>;
  readonly top?: Expr<number>;
  readonly bottom?: Expr<number>;
  /** Centers on the axis (ignores left/right or top/bottom). */
  readonly centerX?: BoolExpr;
  readonly centerY?: BoolExpr;
}

/** Layout type of a frame or slot. */
export type LayoutType = 'none' | 'row' | 'column' | 'grid';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type LayoutJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'stretch';
/** Row wrapping (v4): `none` (default), `wrap` or `wrap-reverse`, like CSS's `flex-wrap`. */
export type LayoutWrap = 'none' | 'wrap' | 'wrap-reverse';

/**
 * Layout of the children. In `formatVersion` 4, `type`, `align` and `justify` accept an expression
 * (the resolved value is checked at drawing: outside the set, it falls back to the default with
 * the warning `invalid value in layout.<key>: <value>`); with a literal `type` `"none"` only
 * `type`, `align` (vertical axis) and `justify` (horizontal axis) apply, with `start` (default),
 * `center`, `end` and `stretch` (v4): they align the children without an anchor on that axis; the
 * child's anchor wins. `justify: "stretch"` only applies in `none`; in `row`/`column` it is invalid.
 */
export interface LayoutSpec {
  readonly type: Expr<LayoutType>;
  readonly gap?: Expr<number>;
  /** One value, [vertical, horizontal] or [top, right, bottom, left]. */
  readonly padding?: Expr<
    number | readonly [number, number] | readonly [number, number, number, number]
  >;
  /**
   * On the cross axis. `baseline` (v4, only in `row`): the children align by the first baseline,
   * like Compose's `alignByBaseline` and CSS's `align-items: baseline`.
   */
  readonly align?: Expr<LayoutAlign>;
  /** On the main axis (`space-around` and `space-evenly` only in v4). */
  readonly justify?: Expr<LayoutJustify>;
  /**
   * The children in reverse order on the main axis and `start` becomes the end, like CSS's
   * `row-reverse`/`column-reverse` (v4; boolean or expression; default `false`).
   */
  readonly reverse?: BoolExpr;
  /**
   * Row wrapping (v4; only in `row`/`column`): with `wrap` or `wrap-reverse`, a child that does not
   * fit in what is left of the main axis goes to the next line, like CSS's `flex-wrap` (Compose's
   * `FlowRow`/`FlowColumn`). `wrap-reverse` stacks the lines in the opposite direction of the
   * cross axis. Default `none`.
   */
  readonly wrap?: Expr<LayoutWrap>;
  /** Space between the lines, in px (v4; only with `wrap`; default 0). `gap` is within a line. */
  readonly lineGap?: Expr<number>;
  /** Children per line, at most (v4; only with `wrap`; integer ≥ 1; Compose's `maxItemsInEachRow`). */
  readonly maxPerLine?: Expr<number>;
  /** Lines, at most (v4; only with `wrap`; integer ≥ 1): children beyond the last are not drawn. */
  readonly maxLines?: Expr<number>;
  /**
   * Grid (`type: "grid"`, v4; exactly one of the four tracks, numbers or expression): `columns`
   * (integer ≥ 1) is Compose's `GridCells.Fixed` and CSS's `repeat(n, 1fr)`; `minColumnWidth`
   * (> 0) is `GridCells.Adaptive` and `repeat(auto-fit, minmax(x, 1fr))`; `rows` and `minRowHeight`
   * the same on the horizontal grid (which fills columns, `LazyHorizontalGrid`). `gap` stays between
   * the tracks and `lineGap` between the flow lines.
   */
  readonly columns?: Expr<number>;
  readonly minColumnWidth?: Expr<number>;
  readonly rows?: Expr<number>;
  readonly minRowHeight?: Expr<number>;
}

// ---------------------------------------------------------------------------------------
// Template nodes
// ---------------------------------------------------------------------------------------

interface TemplateNodeBase {
  /** Name of the node (appears in the tree and on hover); optional. */
  readonly name?: string;
  readonly visible?: BoolExpr;
  readonly opacity?: Expr<number>;
  /**
   * `formatVersion` 4: rotates the node (and a frame's children, with its `clip`) in degrees,
   * clockwise, around the center of the box. It is drawing only, like CSS's `transform`: it does
   * not change layout, measure, `hug` or the node's box. Not valid on the root. Without a value,
   * or 0, it does not rotate.
   */
  readonly rotation?: Expr<number>;
  /**
   * `formatVersion` 4: pins the reading direction of the subtree (literal `ltr` or `rtl`), instead
   * of following the container's: a phone number, a snippet of code. The node is placed by its
   * parent in the parent's direction; what is inside the node follows the one it pins.
   */
  readonly direction?: Direction;
  /** Size on the axis; accepts an expression in `formatVersion` 4 (invalid: default plus warning). */
  readonly width?: Expr<SizeSpec>;
  readonly height?: Expr<SizeSpec>;
  /**
   * Size limits (px, `formatVersion` 4; accept an expression), applied after `fill`/`hug`/`%` and
   * before the instance's `minSize`. A `fill` that hits the `max` gives the leftover back to the
   * other `fill`s of the same parent, like flexbox.
   */
  readonly minWidth?: Expr<number>;
  readonly maxWidth?: Expr<number>;
  readonly minHeight?: Expr<number>;
  readonly maxHeight?: Expr<number>;
  /**
   * Tracks the node occupies in a `layout: grid` parent (v4; integer ≥ 1, expression; limited to
   * the number of tracks; default 1), like Compose's `GridItemSpan` and CSS's `grid-column: span n`.
   */
  readonly span?: Expr<number>;
  /**
   * Weight of the `fill` node on the main axis of a `row`/`column` parent (v4; number > 0,
   * expression; default 1): what is left is split in proportion to the weights, like Compose's
   * `Modifier.weight` and CSS's `flex-grow`.
   */
  readonly weight?: Expr<number>;
  /** Only with a `layout: none` parent. */
  readonly anchors?: Anchors;
  readonly fill?: Expr<FillSpec>;
  readonly stroke?: StrokeSpec;
  /** One shadow, or (v4) 1 to 4: the first sits on top, like CSS's `box-shadow`. */
  readonly shadow?: ShadowSpec | readonly ShadowSpec[];
  /** In v4 each item of the list also accepts a number `$token`. */
  readonly cornerRadius?: Expr<number | readonly [Radius, Radius, Radius, Radius]>;
}

export interface FrameTemplate extends TemplateNodeBase {
  readonly type: 'frame';
  /** Clips the children to the box (default: only the root clips). Expression only in v4. */
  readonly clip?: BoolExpr;
  readonly layout?: LayoutSpec;
  readonly children?: readonly TemplateNode[];
  /**
   * Frame variables (v4, only in the written file): name → expression, used with
   * `{ "$var": "name" }` in this frame and in the descendants. `parseComponent` swaps the `$var`s
   * for the content and returns the frame **without** `let`: whoever uses the parsed component
   * (engine, raster, viewer, Catalog) never sees it (`variables.ts`).
   */
  readonly let?: Readonly<Record<string, unknown>>;
}

export interface RectTemplate extends TemplateNodeBase {
  readonly type: 'rect';
}

export interface EllipseTemplate extends TemplateNodeBase {
  readonly type: 'ellipse';
}

/**
 * A run of rich text (`runs`, `formatVersion` 4). The runs of a node break lines as ONE text only,
 * by word; each key accepts an expression and the `text` is evaluated like the node's `text`.
 * `weight`, `italic`, `family`, `size` and `decoration` override those of the node's `font`, and
 * `color` the node's `color`; `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`,
 * `ellipsis` and `maxLines` remain the node's only. With `background`, the run becomes an inline
 * box (the "chip"): an unbreakable block with `padding` (a number for both axes or `[vertical,
 * horizontal]`) and corner `radius`. `padding` and `radius` without `background` have no effect.
 */
export interface TextRunTemplate {
  readonly text: Expr<string | number>;
  readonly weight?: Expr<number>;
  readonly italic?: BoolExpr;
  readonly color?: Expr<Color>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
  readonly family?: Expr<string>;
  readonly size?: Expr<number>;
  /** Background color of the inline box (`none` = no box). */
  readonly background?: Expr<Color>;
  readonly radius?: Expr<number>;
  readonly padding?: Expr<number | readonly [number, number]>;
}

/**
 * Text of the node: `text` (a single style) **or** `runs` (runs with their own style, only in
 * `formatVersion` 4); both together are not valid, and one of them is required.
 */
export interface TextTemplate extends TemplateNodeBase {
  readonly type: 'text';
  readonly text?: Expr<string | number>;
  readonly runs?: readonly TextRunTemplate[];
  readonly font?: FontSpec;
  /** Text color (the node's `fill`). Default: `#000000`. */
  readonly color?: Expr<Color>;
  /**
   * Distances from the baseline (v4), like Compose's `Modifier.paddingFromBaseline(top, bottom)`
   * (px ≥ 0): `top` from the top of the node's box to the first baseline; `bottom`, from the last
   * baseline to the bottom of the box.
   */
  readonly baselinePadding?: BaselinePadding;
  /**
   * Scope of a `repeat` row (`$r0_1`), placed by the expansion on the node whose line count a
   * `$lines` of the same row cites; it never comes from the file (the parser refuses the key).
   */
  readonly linesScope?: string;
}

export interface BaselinePadding {
  readonly top?: Expr<number>;
  readonly bottom?: Expr<number>;
}

export interface PathTemplate extends TemplateNodeBase {
  readonly type: 'path';
  /** SVG data, drawn in a `viewBox` box and scaled to the node's box. */
  readonly d: Expr<string>;
  readonly viewBox: readonly [number, number];
  readonly fillRule?: 'nonzero' | 'evenodd';
  /** Mirrors the drawing horizontally when the node's direction is `rtl` (v4; default `false`). */
  readonly mirror?: BoolExpr;
}

/**
 * Space reserved for another component (e.g. a button's icon, a card's content).
 * In the lab it draws only a dashed outline with the name; in the app, it would be filled by the
 * child marking.
 */
export interface SlotTemplate extends TemplateNodeBase {
  readonly type: 'slot';
  readonly label?: Expr<string>;
  /**
   * How the child instances are organized inside the slot (component with a slot): `row`/`column`
   * position the children by sibling order and save their rectangles; `none` (or absent) leaves
   * each child in its own rectangle. `gap` and `padding` can come from fields.
   */
  readonly layout?: LayoutSpec;
  /**
   * Clips the child markings to the slot's box (v4; boolean or expression; default `false`):
   * the child's drawing only appears inside it.
   */
  readonly clip?: BoolExpr;
  /**
   * Inherited color (v4): values that the slot offers to the child markings, by name (free, no
   * platform name). Each value is resolved in the parent (its fields, tokens and mode) and the
   * child reads it with `{ "$provided": "<name>", "default": … }`, like Compose's
   * `CompositionLocal`. A value that produces nothing does not offer: the ancestor further up wins.
   */
  readonly provide?: Readonly<Record<string, Expr<string | number>>>;
}

/**
 * Drawn table (`formatVersion` 2): repeats the `template` (the drawing of **one** row) for each
 * row of the type's `table` field. Inside the `template`, `{ "$field": "<column>" }` (and `$has`,
 * `$eq`, `$switch`) reads the row's column; a column **shadows** the type's field of the same name
 * (the field remains valid for what is not a column). The rows stack in `direction`
 * (`column`, the default, or `row`) with `gap`. The node behaves like a `hug` frame on the axis of
 * the rows and `fill` on the other, and the `template` is `hug` on the rows' axis, unless it says
 * otherwise.
 * With no rows, the node is empty. It cannot contain `repeat` or `slot`. Only `name`, `visible`,
 * `opacity`, `width`, `height` and `anchors` apply to the node: the drawing (background, border,
 * corners) belongs to the `template` of each row or to the frame that wraps the `repeat`.
 */
export interface RepeatTemplate extends Omit<TemplateNodeBase, 'direction'> {
  readonly type: 'repeat';
  /** Key of the type's `table` field whose rows repeat (exactly one of `field` and `count`). */
  readonly field?: string;
  /**
   * `formatVersion` 4: the `template` repeats `max(0, floor(count))` times, up to 1000 (above that,
   * 1000 with the warning `repeat limited to 1000 rows: <node name>`). Inside it,
   * `{ "$field": "$index" }` is the
   * row index (0, 1, …), also in the `repeat` by `field`; the innermost `repeat`'s wins.
   */
  readonly count?: Expr<number>;
  readonly direction?: 'column' | 'row';
  /** Space between the rows (px). */
  readonly gap?: Expr<number>;
  /**
   * `formatVersion` 4: `"fill"` makes the `repeat` take the parent's axis (like a `fill` child) and
   * divide the rows' axis equally among them, minus the `gap`s; the `template`'s `fill` (or omitted)
   * size on the rows' axis is the fraction. `"none"` (default): the `repeat` is `hug` on the rows'
   * axis.
   */
  readonly distribute?: 'none' | 'fill';
  /**
   * `formatVersion` 4: the layout of the rows (`row`, `column` or `grid`, complete) in place of
   * `direction` + `gap`; both together are not valid. Without it, nothing changes.
   * `distribute: "fill"` does not combine with `grid`.
   */
  readonly layout?: LayoutSpec;
  /**
   * `formatVersion` 4: wrapping of the `repeat` in a line (`direction: "row"`; in `column`, the
   * columns), with the same meaning as `layout.wrap`, `lineGap`, `maxPerLine` and `maxLines` of a
   * frame (the `repeat` has no `layout`).
   */
  readonly wrap?: Expr<LayoutWrap>;
  readonly lineGap?: Expr<number>;
  readonly maxPerLine?: Expr<number>;
  readonly maxLines?: Expr<number>;
  /** The drawing of one row. */
  readonly template: FrameTemplate;
}

/** How the image fills the box. `fill-width`, `fill-height`, `scale-down`, `none`: `formatVersion` 4. */
export type ImageFit =
  'cover' | 'contain' | 'fill' | 'fill-width' | 'fill-height' | 'scale-down' | 'none';

/** The `ImageFit` values that only exist in `formatVersion` 4. */
export const IMAGE_FITS_V4: readonly ImageFit[] = [
  'fill-width',
  'fill-height',
  'scale-down',
  'none',
];

/**
 * Remote image (`formatVersion` 3). `src` is the image's `https://` URL and is **restricted**: only
 * a literal text or exactly `{ "$field": "<field>" }` (a `string` field of the type, or a `string`
 * column inside a `repeat`). No other expression (`$concat`, `$switch`, `$if`) is valid, so the
 * component does not build the URL with data from other fields and send it to the server of whoever
 * wrote the specialization. `fit` (default `cover`) says how the image fills the box. The node's
 * `fill` is the **background** behind the image. `width`/`height` do not accept `hug`: the layout
 * never depends on the downloaded image. The model never downloads the image; whoever draws
 * decides (the placeholder appears while there is no ready or allowed image).
 */
export interface ImageTemplate extends TemplateNodeBase {
  readonly type: 'image';
  readonly src: string | { readonly $field: string };
  readonly fit?: ImageFit;
}

/**
 * Icon from the library's set (`formatVersion` 4; `icons` of the specialization). `name` is the
 * name in the set (literal or expression); `color` paints the paths without their own color and
 * those that ask for the node's color (`fill`/`stroke` `true`); `strokeWidth` (`viewBox` units)
 * swaps the width of all strokes. The `name` is the icon's (there is no node name). `hug` measures
 * the icon's `viewBox`. Name outside the set: placeholder
 * with the warning `unknown icon: <name>`; a literal name outside the set is a library error.
 */
export interface IconTemplate extends Omit<TemplateNodeBase, 'name'> {
  readonly type: 'icon';
  readonly name: Expr<string>;
  readonly color?: Expr<Color>;
  readonly strokeWidth?: Expr<number>;
  /**
   * Mirrors the icon horizontally when the node's direction is `rtl` (v4). Absent, the icon's `mirror`
   * in the set (`mapping-icons` formatVersion 2) applies, which in turn is `false`.
   */
  readonly mirror?: BoolExpr;
}

export type TemplateNode =
  | FrameTemplate
  | RectTemplate
  | EllipseTemplate
  | TextTemplate
  | PathTemplate
  | SlotTemplate
  | RepeatTemplate
  | ImageTemplate
  | IconTemplate;

// ---------------------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------------------

/**
 * How the instance is sized when it arrives **without a rectangle** (screen from an external
 * JSON, laid out by `layoutScreen` in `layout.ts`): fixed px, `"fill"` (takes the space the
 * parent gives on that axis), `"hug"` (from the content: the measured template, or the slot's
 * children) or, in v4,
 * `"min-content"`/`"max-content"` (the intrinsic measure). Absent axis = px of `size`. Not valid for
 * instances with a rectangle (editor, `*.screen.json`).
 */
export type InstanceSizeSpec = number | 'fill' | 'hug' | IntrinsicSize;

/**
 * `sizing` per axis: the literal value or, in v4, an expression that gives a number ≥ 0, `"fill"`
 * or `"hug"`,
 * evaluated with the instance's values (`$size` and `$lines` do not apply here).
 */
export interface ComponentSizing {
  readonly width?: Expr<InstanceSizeSpec>;
  readonly height?: Expr<InstanceSizeSpec>;
}

/** Anchor points of the drawing in screen pixels (`screen.anchor`). */
export const SCREEN_ANCHORS = [
  'center',
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type ScreenAnchor = (typeof SCREEN_ANCHORS)[number];

/**
 * Drawing in screen pixels (v4, only at the file's root): the template is drawn at the component's
 * `size` in screen pixels, at any zoom, anchored at the `anchor` point of the marking's
 * rectangle (which stays in image pixels). The drawing may go beyond the rectangle.
 */
export interface ScreenSpec {
  readonly anchor?: ScreenAnchor;
}

// The sides and the alignment of the anchor have a single definition, in `../types` (the project
// format, which
// does not import from here): the component file re-exports them.
export {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  type AnchorAlign,
  type AnchorSide,
} from '../anchorSides';

/**
 * How the type prefers to touch the anchor (v4, only at the file's root): the defaults of `side`,
 * `align` and `offset` of a marking that declares an anchor without stating them. All optional:
 * absent ones are `top`, `center` and `{ main: 0, cross: 0 }`. `offset` is in component UNITS (the
 * container's density converts it to pixels when applying); see `componentAnchorDefaults`.
 */
export interface ComponentAnchor {
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main?: number; readonly cross?: number };
}

export interface ComponentFile {
  readonly format: typeof COMPONENT_FORMAT;
  readonly formatVersion: ComponentFormatVersion;
  /** Id of the component (unique in the specialization); the type's `component` points to the file. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Initial size of the instance when created (px). */
  readonly size: { readonly width: number; readonly height: number };
  /** Minimum size (px), so that resizing does not break the drawing. */
  readonly minSize?: { readonly width: number; readonly height: number };
  /** Sizing without a rectangle (see `ComponentSizing`); absent = `size` on both axes. */
  readonly sizing?: ComponentSizing;
  /** Drawing in screen pixels anchored to the marking's rectangle (v4); see `ScreenSpec`. */
  readonly screen?: ScreenSpec;
  /** How the type prefers to touch the anchor (v4); see `ComponentAnchor`. */
  readonly anchor?: ComponentAnchor;
  /**
   * Preview values of the fields (library and new instance): the fields come from the
   * specialization's type; here only the example values.
   */
  readonly preview?: FieldValues;
  /** Root of the drawing: takes the whole rectangle of the instance. */
  readonly template: FrameTemplate;
  /**
   * Tokens of the drawing mode (name → value), set by the catalog when loading the specialization;
   * they never come from the file (the parser refuses the key). See `tokens.ts`.
   */
  readonly resolvedTokens?: Readonly<Record<string, string | number>>;
  /**
   * The tokens of each declared mode (`tokens.modes`), set by the catalog: the drawing picks the
   * table of the marking's effective mode without reloading the component. Absent = only
   * `resolvedTokens`.
   */
  readonly resolvedTokensByMode?: Readonly<
    Record<string, Readonly<Record<string, string | number>>>
  >;
  /** Icon set of the specialization (`icons`), set by the catalog; never comes from the file. */
  readonly resolvedIcons?: IconSet;
}

/** How the specialization's type references the component (new key, spec formatVersion 4). */
export interface ComponentRef {
  /** Path of the file relative to the specialization's, e.g. `components/button.json`. */
  readonly component: string;
}
