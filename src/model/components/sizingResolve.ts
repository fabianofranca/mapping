/**
 * The evaluated `sizing` of a component (decisions 9 and 10 of #898), apart from the fit in `sizing.ts` so that
 * the engine (`instantiate.ts`, which sizes the `component` node with it) does not import the fit, which
 * imports the engine.
 * Pure functions, no DOM.
 */
import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type {
  ComponentFile,
  Direction,
  Expr,
  FieldValues,
  InstanceSizeSpec,
} from './componentFormat';
import { type InstanceAnchor, anchorFieldValues } from './anchor';
import { type InstanceContainer, containerFieldValues } from './container';
import { DIRECTION_FIELD, evaluate } from './expressions';
import { type ResolvedTokens, substituteTokens } from './tokens';
import { describeValue, isIntrinsicSize, parseSizeSpec } from './layoutValues';
import { numericValue } from './gridPlan';

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

/**
 * The reserved values of an instance, which `sizing` reads like the template does (decision 6 of #1893):
 * `$anchor.*` (with no anchor the five stay empty), `$container.*` (with no container they stay empty, decision 17
 * of #1901: unlike `$size`, the container is known before measuring) and `$direction` (default `ltr`).
 */
export interface ReservedValues {
  readonly anchor?: InstanceAnchor | undefined;
  readonly container?: InstanceContainer | undefined;
  readonly direction?: Direction | undefined;
}

/** The values plus the reserved ones, which shadow a field of the same name (as in `instantiate`). */
function withReserved(values: FieldValues, reserved: ReservedValues): FieldValues {
  return {
    ...values,
    [DIRECTION_FIELD]: reserved.direction ?? 'ltr',
    ...anchorFieldValues(reserved.anchor),
    ...containerFieldValues(reserved.container),
  };
}

/**
 * The component's `sizing`, evaluated with `values`; an axis without `sizing` takes the `size`.
 * A `$token` of an axis becomes the value of `tokens` (the drawing mode's table; without it, the
 * component's `resolvedTokens`) before evaluating: one without a value is an invalid value.
 * With `reserved` (an instance: `fitComponentSize`, Arrange, the screen's layout), the expression also
 * reads `$anchor.*`, `$container.*` and `$direction` as the instance's template does; without it, nothing changes.
 */
export function resolveSizing(
  component: ComponentFile,
  values: FieldValues,
  tokens: ResolvedTokens | undefined = component.resolvedTokens,
  reserved?: ReservedValues,
): ResolvedSizing {
  const messages: ModelMessage[] = [];
  const scope = reserved === undefined ? values : withReserved(values, reserved);
  const axis = (name: SizingAxis): ResolvedAxis => {
    const raw: Expr<InstanceSizeSpec> | undefined = component.sizing?.[name];
    const size: ResolvedAxis = { spec: component.size[name], source: 'size' };
    if (raw === undefined) return size;
    if (typeof raw !== 'object') return { spec: raw, source: 'literal' };
    const resolved = substituteTokens(raw, tokens ?? {}) as Expr<unknown> | undefined;
    const value =
      resolved === undefined ? undefined : evaluate<unknown>(resolved, scope, undefined);
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

/** The root `weight` of an instance evaluated: the weight (`undefined` = not weighted) and its warnings. */
export interface ResolvedWeight {
  readonly weight: number | undefined;
  readonly messages: readonly ModelMessage[];
}

/**
 * The component's root `weight` (v4), evaluated with `values` and the same options as `resolveSizing`
 * (tokens, `$anchor.*`, `$container.*` and `$direction`). No value, `null`, a blank text or no
 * `weight` key: not weighted and no warning. A result that is not a finite number greater than 0: not weighted, with the
 * warning `invalid value in weight: <value>`.
 */
export function resolveWeight(
  component: ComponentFile,
  values: FieldValues,
  tokens: ResolvedTokens | undefined = component.resolvedTokens,
  reserved?: ReservedValues,
): ResolvedWeight {
  const raw = component.weight as Expr<unknown> | undefined;
  if (raw === undefined) return { weight: undefined, messages: [] };
  const scope = reserved === undefined ? values : withReserved(values, reserved);
  const resolved = substituteTokens(raw, tokens ?? {}) as Expr<unknown> | undefined;
  const value =
    resolved === undefined ? undefined : evaluate<unknown>(resolved, scope, undefined);
  if (isEmptyWeight(value)) return { weight: undefined, messages: [] };
  const n = numericValue(value);
  if (Number.isFinite(n) && n > 0) return { weight: n, messages: [] };
  return {
    weight: undefined,
    messages: [
      templateMessage('engine.invalidValue', {
        label: 'weight',
        value: describeValue(value),
      }),
    ],
  };
}

/** No value, `null` or a blank text: the weight is empty (not weighted, no warning). */
function isEmptyWeight(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/** The floor and ceiling of a weighted child's main axis (the component's own limits, before the marking minimum). */
export interface WeightLimits {
  readonly min: number;
  readonly max: number;
}

/**
 * The limits a weighted component keeps on `axis`: the floor is the larger of its `minSize` and the
 * root template's `minWidth`/`minHeight` (evaluated with the instance's values, a negative or invalid
 * result counts as none); the ceiling is the root's `maxWidth`/`maxHeight` (`Infinity` without one).
 */
export function resolveWeightLimits(
  component: ComponentFile,
  values: FieldValues,
  axis: SizingAxis,
  tokens: ResolvedTokens | undefined = component.resolvedTokens,
  reserved?: ReservedValues,
): WeightLimits {
  const scope = reserved === undefined ? values : withReserved(values, reserved);
  const limit = (expr: Expr<number> | undefined): number | undefined => {
    if (expr === undefined) return undefined;
    const resolved = substituteTokens(expr, tokens ?? {}) as Expr<unknown>;
    const n = numericValue(evaluate<unknown>(resolved, scope, Number.NaN));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const root = component.template;
  const wide = axis === 'width';
  return {
    min: Math.max(
      component.minSize?.[axis] ?? 0,
      limit(wide ? root.minWidth : root.minHeight) ?? 0,
    ),
    max: limit(wide ? root.maxWidth : root.maxHeight) ?? Infinity,
  };
}
