import { paramTarget } from '../codeParams';
import { expansionOf, isPositional, type ExpandModels } from './expansion';
import type { Signature, SignatureParam, SignatureRole } from './types';

export type { ExpandModels };

/** The name written in the call: Swift's external label, or the name. */
export const callName = (param: SignatureParam): string =>
  param.label !== undefined && param.label !== '_' ? param.label : param.name;

// The signature crossed with a platform's `code` (stage #1079): what the signature has and the
// `code` does not link to a field (`unmappedParams`, the `unmapped` of `get_code_hints`) and what
// the `code` links and the signature does not have (`paramsOutsideSignature`, the "parameter
// outside the signature" warning). Pure, no browser.

/** What the `code` needs to have for the crossing: the `params` and the `ignore`. */
export interface CodeLinks {
  readonly params?: Readonly<Record<string, string>> | undefined;
  readonly ignore?: readonly string[] | undefined;
  /** Slot id → the parameter that receives it (`code.slots`; the importer also passes the linked by name). */
  readonly slots?: Readonly<Record<string, string>> | undefined;
}

/** A signature parameter without a field: what the agent needs to know to write the call. */
export interface UnmappedParam {
  readonly name: string;
  readonly role: SignatureRole;
  readonly type: string;
  readonly required: boolean;
  readonly default?: string;
}

/** The parameters without an external label (`_`, Swift), in order: the `#n` of `params` is the nth. */
function positionalParams(signature: Signature): SignatureParam[] {
  return signature.params.filter(isPositional);
}

/**
 * The signature parameters that the `code` does not link to any field and does not leave out
 * (`ignore`), in signature order. A parameter with some field linked by path
 * (`colors.containerColor`) counts as linked: what is left over from the factory does not count.
 */
export function unmappedParams(signature: Signature, code: CodeLinks): UnmappedParam[] {
  const mapped = new Set<string>();
  const positions = positionalParams(signature);
  for (const value of Object.values(code.params ?? {})) {
    const target = paramTarget(value);
    if (target.kind === 'name') mapped.add(target.name);
    else if (target.kind === 'path') mapped.add(target.call);
    else {
      const positional = positions[target.position];
      if (positional !== undefined) mapped.add(positional.name);
    }
  }
  for (const name of Object.values(code.slots ?? {})) mapped.add(name);
  const ignored = new Set(code.ignore ?? []);
  return signature.params
    .filter(
      (param) =>
        !mapped.has(param.name) &&
        !mapped.has(callName(param)) &&
        !ignored.has(param.name) &&
        !ignored.has(callName(param)),
    )
    .map((param) => ({
      name: param.name,
      role: param.role,
      type: param.type,
      required: param.required === true,
      ...(param.default === undefined ? {} : { default: param.default }),
    }));
}

/** A `params` of the `code` that the signature does not have: the field and the written value. */
export interface OutsideParam {
  readonly field: string;
  readonly name: string;
}

/**
 * The `params` of the `code` that point to a parameter the signature does not have (the parameter
 * left the code, or the name is wrong): a name, a factory's argument or a positional beyond the
 * signature's parameters without a label. A factory the signature does not describe is not checked.
 */
export function paramsOutsideSignature(
  signature: Signature,
  code: Pick<CodeLinks, 'params'>,
  models?: ExpandModels,
): OutsideParam[] {
  const byName = new Map<string, SignatureParam>();
  for (const param of signature.params) {
    byName.set(param.name, param);
    byName.set(callName(param), param);
  }
  const positions = positionalParams(signature).length;
  const outside: OutsideParam[] = [];
  for (const [field, value] of Object.entries(code.params ?? {})) {
    if (!targetExists(paramTarget(value), byName, positions, models))
      outside.push({ field, name: value });
  }
  return outside;
}

/**
 * The target of a `params` exists in the signature: a name, a positional or a factory's argument.
 * A factory's argument is checked against what the owning parameter expands (`expansionOf`, the
 * same rule as the importer); an owner that expands nothing and describes no factory is not checked.
 */
function targetExists(
  target: ReturnType<typeof paramTarget>,
  byName: ReadonlyMap<string, SignatureParam>,
  positions: number,
  models: ExpandModels | undefined,
): boolean {
  if (target.kind === 'name') return byName.has(target.name);
  if (target.kind === 'position') return target.position < positions;
  const owner = byName.get(target.call);
  if (owner === undefined) return false;
  const expansion = expansionOf(owner, models ?? {});
  if (expansion !== null) return expansion.members.some((m) => m.name === target.name);
  return owner.factory === undefined;
}

/**
 * The `params` that a `variants` case inherits from the base and that its own sheet lacks: the base's
 * entries whose key the case does not redeclare and that `paramsOutsideSignature` flags against the
 * case's sheet (a name, a factory argument its factory or field model does not expand, a positional beyond
 * the sheet). The same test as the validator's, so the validator and the generated code never disagree: a case
 * with its own sheet leaves these out of the resolved `code` (`resolveCode`), and its own `params` stay.
 */
export function inheritedOutsideCase(
  base: Pick<CodeLinks, 'params'>,
  kase: Pick<CodeLinks, 'params'>,
  sheet: Signature,
  models?: ExpandModels,
): OutsideParam[] {
  const own = kase.params ?? {};
  const inherited = Object.entries(base.params ?? {}).filter(
    ([field]) => !Object.hasOwn(own, field),
  );
  return paramsOutsideSignature(sheet, { params: Object.fromEntries(inherited) }, models);
}

/**
 * The `slots` entries (slot id → parameter) whose parameter the sheet lacks with `role: slot`, compared by
 * `name` and by `callName`: the test of the validator's "parameter outside the signature" warning for `code.slots`.
 */
export function slotsOutsideSignature(
  signature: Signature,
  slots: Readonly<Record<string, string>> | undefined,
): { readonly id: string; readonly name: string }[] {
  const named = new Set<string>();
  for (const param of signature.params) {
    if (param.role !== 'slot') continue;
    named.add(param.name);
    named.add(callName(param));
  }
  return Object.entries(slots ?? {})
    .filter(([, name]) => !named.has(name))
    .map(([id, name]) => ({ id, name }));
}
