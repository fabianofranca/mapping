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
import { DIRECTION_FIELD, evaluate } from './expressions';
import { type ResolvedTokens, substituteTokens } from './tokens';
import { describeValue, isIntrinsicSize, parseSizeSpec } from './layoutValues';

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
 * `$anchor.*` (with no anchor the five stay empty) and `$direction` (default `ltr`).
 */
export interface ReservedValues {
  readonly anchor?: InstanceAnchor | undefined;
  readonly direction?: Direction | undefined;
}

/** The values plus the reserved ones, which shadow a field of the same name (as in `instantiate`). */
function withReserved(values: FieldValues, reserved: ReservedValues): FieldValues {
  return {
    ...values,
    [DIRECTION_FIELD]: reserved.direction ?? 'ltr',
    ...anchorFieldValues(reserved.anchor),
  };
}

/**
 * The component's `sizing`, evaluated with `values`; an axis without `sizing` takes the `size`.
 * A `$token` of an axis becomes the value of `tokens` (the drawing mode's table; without it, the
 * component's `resolvedTokens`) before evaluating: one without a value is an invalid value.
 * With `reserved` (an instance: `fitComponentSize`, Arrange, the screen's layout), the expression also
 * reads `$anchor.*` and `$direction` as the instance's template does; without it, nothing changes.
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
