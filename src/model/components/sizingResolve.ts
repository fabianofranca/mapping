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
  Expr,
  FieldValues,
  InstanceSizeSpec,
} from './componentFormat';
import { evaluate } from './expressions';
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
 * The component's `sizing`, evaluated with `values`; an axis without `sizing` takes the `size`.
 * A `$token` of an axis becomes the value of `tokens` (the drawing mode's table; without it, the
 * component's `resolvedTokens`) before evaluating: one without a value is an invalid value.
 */
export function resolveSizing(
  component: ComponentFile,
  values: FieldValues,
  tokens: ResolvedTokens | undefined = component.resolvedTokens,
): ResolvedSizing {
  const messages: ModelMessage[] = [];
  const axis = (name: SizingAxis): ResolvedAxis => {
    const raw: Expr<InstanceSizeSpec> | undefined = component.sizing?.[name];
    const size: ResolvedAxis = { spec: component.size[name], source: 'size' };
    if (raw === undefined) return size;
    if (typeof raw !== 'object') return { spec: raw, source: 'literal' };
    const resolved = substituteTokens(raw, tokens ?? {}) as Expr<unknown> | undefined;
    const value =
      resolved === undefined ? undefined : evaluate<unknown>(resolved, values, undefined);
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
