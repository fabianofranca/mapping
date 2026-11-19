/**
 * Component engine (MC2, decisions 9 and 10 of #898): the evaluated `sizing` and the size fitted to the
 * content. An axis's `sizing` is a literal (px, `"fill"` or `"hug"`) or, in v4, an expression
 * evaluated with the instance's values (`$switch` by style, `$if` by field…); a value that is not
 * px ≥ 0, `fill`, `hug`, `min-content` or `max-content` falls back to that axis's `size` with the warning
 * `invalid value in sizing.<axis>`.
 * Pure functions, no DOM.
 */
import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type {
  ComponentFile,
  Expr,
  FieldValues,
  InstanceSizeSpec,
  IntrinsicSize,
} from './componentFormat';
import { MIN_STORED_MARKING_SIZE } from '../geometry';
import { evaluate } from './expressions';
import { type InstantiateOptions, instantiate, measureComponent } from './instantiate';
import {
  describeValue,
  intrinsicModeOf,
  isIntrinsicSize,
  parseSizeSpec,
} from './layoutValues';

export type SizingAxis = 'width' | 'height';

/** Where the axis value came from: the `size` (no `sizing`, or an invalid value), the literal or the expression. */
export type SizingSource = 'size' | 'literal' | 'expression';

export interface ResolvedAxis {
  readonly spec: InstanceSizeSpec;
  readonly source: SizingSource;
}

export interface ResolvedSizing {
  readonly width: ResolvedAxis;
  readonly height: ResolvedAxis;
  /** One warning per axis with an invalid value, in the order `width`, `height`. */
  readonly messages: readonly ModelMessage[];
}

function plainSpec(value: unknown): InstanceSizeSpec | undefined {
  const spec = parseSizeSpec(value);
  // `sizing` has no percentage (`"50%"`): it is an invalid value.
  const known = spec === 'fill' || spec === 'hug' || isIntrinsicSize(spec);
  return typeof spec === 'string' && !known ? undefined : spec;
}

/** The component's `sizing`, evaluated with `values`; an axis without `sizing` takes the `size`. */
export function resolveSizing(
  component: ComponentFile,
  values: FieldValues,
): ResolvedSizing {
  const messages: ModelMessage[] = [];
  const axis = (name: SizingAxis): ResolvedAxis => {
    const raw: Expr<InstanceSizeSpec> | undefined = component.sizing?.[name];
    const size: ResolvedAxis = { spec: component.size[name], source: 'size' };
    if (raw === undefined) return size;
    if (typeof raw !== 'object') return { spec: raw, source: 'literal' };
    const value = evaluate<unknown>(raw as Expr<unknown>, values, undefined);
    const spec = plainSpec(value);
    if (spec !== undefined) return { spec, source: 'expression' };
    messages.push(
      templateMessage('engine.invalidValue', {
        label: `sizing.${name}`,
        value: describeValue(value),
      }),
    );
    return size;
  };
  const width = axis('width');
  const height = axis('height');
  return { width, height, messages };
}

export interface FitOptions {
  readonly base?: { readonly width: number; readonly height: number };
  /** Axes that follow the `sizing` (default: those where the evaluated `sizing` says `hug` or px by expression). */
  readonly auto?: Partial<Record<SizingAxis, boolean>>;
  /**
   * Limit of the width measured on the `hug` axis (the space to the edge of the image or parent): if the content
   * asks for more, the width is the limit and the height is measured again for that width (the text wraps).
   * It is only a measuring limit: it does not change the component's `size` or the root's limits.
   */
  readonly maxWidth?: number;
}

/** The px that the axis gives by expression (a literal px does not count); `undefined` if it gives none. */
export function expressionPx(axis: ResolvedAxis): number | undefined {
  return axis.source === 'expression' && typeof axis.spec === 'number'
    ? axis.spec
    : undefined;
}

/**
 * The axes that the evaluated `sizing` makes follow the content (`hug`, `min-content` or `max-content`)
 * or the expression (px).
 */
export function followedAxes(resolved: ResolvedSizing): Record<SizingAxis, boolean> {
  const follows = (a: ResolvedAxis): boolean =>
    a.spec === 'hug' || isIntrinsicSize(a.spec) || expressionPx(a) !== undefined;
  return { width: follows(resolved.width), height: follows(resolved.height) };
}

/**
 * Does an axis of the evaluated `sizing` depend on the content (`hug`, `min-content` or `max-content`)? An axis
 * that follows an expression's px does not: the size is the field's, not the children's. A component with a slot
 * born with such an axis has no children to measure yet.
 */
export function sizingFollowsContent(
  component: ComponentFile,
  values: FieldValues,
): boolean {
  const resolved = resolveSizing(component, values);
  return [resolved.width, resolved.height].some(
    (axis) => axis.spec === 'hug' || isIntrinsicSize(axis.spec),
  );
}

/** Rounds up, without letting floating-point noise raise a px. */
const ceilFit = (value: number): number => Math.ceil(value - 1e-6);

type AxisKind = 'hug' | 'px' | 'keep';

/** What the axis does in the fit: the expression's px applies, it measures the content (`auto` on) or stays as it is. */
function axisKind(axis: ResolvedAxis, auto: boolean | undefined): AxisKind {
  if (!auto) return 'keep';
  return expressionPx(axis) === undefined ? 'hug' : 'px';
}

/**
 * The size the component has with the content of `values`, by the evaluated `sizing`: the `hug` axis is
 * measured (integer rounded up, between the root's limits) and the px-by-expression axis takes the px, both
 * never below `minSize` or `MIN_STORED_MARKING_SIZE`, as in Arrange; the
 * others stay at `base` (default: the `size`). It is the fit's measuring function (decision 10) and the one MC3's
 * `fitMarking` uses. With no axis that depends on the content, returns `undefined`.
 */
export function fitComponentSize(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
  fit: FitOptions = {},
): { width: number; height: number; messages: readonly ModelMessage[] } | undefined {
  const resolved = resolveSizing(component, values);
  const auto = { ...followedAxes(resolved), ...fit.auto };
  const kinds = {
    width: axisKind(resolved.width, auto.width),
    height: axisKind(resolved.height, auto.height),
  };
  if (kinds.width === 'keep' && kinds.height === 'keep') return undefined;
  const base = fit.base ?? component.size;
  const given = (name: SizingAxis): number =>
    kinds[name] === 'px' ? (expressionPx(resolved[name]) as number) : base[name];
  const hug = { width: kinds.width === 'hug', height: kinds.height === 'hug' };
  const modes = {
    width: intrinsicOf(resolved.width),
    height: intrinsicOf(resolved.height),
  };
  const measured = measureHug(
    component,
    values,
    { hug, modes },
    given,
    options,
    fit.maxWidth,
  );
  const floor = (name: SizingAxis, value: number): number =>
    kinds[name] === 'keep'
      ? value
      : Math.max(value, component.minSize?.[name] ?? 0, MIN_STORED_MARKING_SIZE);
  const size = {
    width: floor('width', axisSize(hug.width, given('width'), measured?.width)),
    height: floor('height', axisSize(hug.height, given('height'), measured?.height)),
  };
  const checked = checkDrawing(component, values, options, size, hug, fit.maxWidth);
  return {
    ...checked,
    messages: [...resolved.messages, ...(measured?.messages ?? [])],
  };
}

/** How many times the fit grows the `hug` axes after checking the drawing (decision 5 of #2089). */
const DRAWING_CHECKS = 3;

/** The root's `max` on the axis (an expression evaluated with the values), `Infinity` if there is none. */
function rootMax(
  component: ComponentFile,
  values: FieldValues,
  name: SizingAxis,
  edge: number | undefined,
): number {
  const expr =
    name === 'width' ? component.template.maxWidth : component.template.maxHeight;
  const limit = expr === undefined ? Infinity : evaluate<number>(expr, values, Infinity);
  const max = typeof limit === 'number' && Number.isFinite(limit) ? limit : Infinity;
  return name === 'width' && edge !== undefined ? Math.min(max, edge) : max;
}

/**
 * Checks the drawing at the fitted size: the measure and the drawing can disagree by a fraction (a line that
 * gets a width limit measures wider), and the marking would be left short (`component-overflow`). While the
 * instance reports a shortfall, each `hug` axis grows by `ceilFit` of the largest one, up to
 * `DRAWING_CHECKS` times and never past the root's `max` nor the fit's `maxWidth`. An axis that is
 * not `hug` (px by expression, kept) does not change. If the growth does not remove the shortfall, the
 * measured size stays.
 */
function checkDrawing(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
  start: { width: number; height: number },
  hug: Record<SizingAxis, boolean>,
  maxWidth: number | undefined,
): { width: number; height: number } {
  if (!hug.width && !hug.height) return start;
  let size = start;
  for (let attempt = 0; attempt <= DRAWING_CHECKS; attempt++) {
    const missing = Math.max(
      0,
      ...Object.values(
        instantiate(component, values, { x: 0, y: 0, ...size }, options).shortfalls ?? {},
      ),
    );
    if (missing <= 0) return size;
    const next = grown(component, values, size, hug, ceilFit(missing), maxWidth);
    if (next.width === size.width && next.height === size.height) break;
    size = next;
  }
  // The growth did not settle (the image edge or the root's `max` stops it, or the shortfall is not the fit's):
  // the measured size stays, as before the check.
  return start;
}

/** The final size of the axis: the measured one (integer rounded up) on `hug`, otherwise the given one. */
function axisSize(hug: boolean, given: number, measured: number | undefined): number {
  return hug && measured !== undefined ? ceilFit(measured) : given;
}

/** The intrinsic measure the `sizing` asks for on the axis (`min-content`/`max-content`); none = `hug`. */
function intrinsicOf(axis: ResolvedAxis): IntrinsicSize | null {
  return intrinsicModeOf(axis.spec);
}

/** The measured axes (`hug`) and, among them, those that ask for the intrinsic measure instead of `hug`. */
interface MeasuredAxes {
  readonly hug: Record<SizingAxis, boolean>;
  readonly modes: Record<SizingAxis, IntrinsicSize | null>;
}

/**
 * Measures the component on the `hug` axes (an axis that is not `hug` takes the `given`); with no `hug` axis, it does not measure.
 * `min-content`/`max-content` measure the root without a limiting space: the measure's `maxWidth` only applies on `hug`.
 */
function measureHug(
  component: ComponentFile,
  values: FieldValues,
  { hug, modes }: MeasuredAxes,
  given: (name: SizingAxis) => number,
  options: InstantiateOptions,
  maxWidth?: number,
): { width: number; height: number; messages: readonly ModelMessage[] } | undefined {
  if (!hug.width && !hug.height) return undefined;
  const height = hug.height ? modes.height : given('height');
  const free = measureComponent(
    component,
    values,
    { width: hug.width ? modes.width : given('width'), height },
    options,
  );
  if (
    !hug.width ||
    modes.width !== null ||
    maxWidth === undefined ||
    ceilFit(free.width) <= maxWidth
  ) {
    return free;
  }
  // The requested width does not fit: measure the height for the remaining width, but never below the largest
  // unbreakable piece (the `wrap: none` label of a segment does not exceed the track for lack of space).
  const unbreakable = measureComponent(
    component,
    values,
    { width: 'min-content', height },
    options,
  ).width;
  const limited = measureComponent(
    component,
    values,
    { width: Math.max(maxWidth, ceilFit(unbreakable)), height },
    options,
  );
  return { ...limited, messages: [...free.messages, ...limited.messages] };
}

/** The size with each `hug` axis `grow` larger, capped by the root's `max` (and the fit's `maxWidth`). */
function grown(
  component: ComponentFile,
  values: FieldValues,
  size: { width: number; height: number },
  hug: Record<SizingAxis, boolean>,
  grow: number,
  maxWidth: number | undefined,
): { width: number; height: number } {
  const axis = (name: SizingAxis): number => {
    if (!hug[name]) return size[name];
    const max = rootMax(component, values, name, name === 'width' ? maxWidth : undefined);
    return Math.min(size[name] + grow, Math.max(size[name], max));
  };
  return { width: axis('width'), height: axis('height') };
}
