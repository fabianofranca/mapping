import type { SpecField, SpecFieldModel } from '../spec';
import { callName } from './codeLink';
import { expansionOf, isPositional, type Models } from './expansion';
import { optionFor } from './importNames';
import type { Signature, SignatureParam } from './types';

export type { Models };

// The importer units (stage #1079, decisions 5 and 7): what the sheet has that can become a
// field (a parameter, or a parameter of the factory or of the `expand` of a composite parameter)
// and the rule that says what each one becomes. Pure.

/** A binding unit: a parameter, or an argument of a composite's factory. */
export interface Unit {
  /** What the `code`'s `params` says: the name, `factory.name` or `#n`. */
  readonly target: string;
  /** The parameter name (the factory's, in composites). */
  readonly name: string;
  /** The parameter that owns the factory (the `calls` key). */
  readonly owner?: string;
  /** The factory symbol. */
  readonly call?: string;
  readonly param: SignatureParam;
}

function expandUnits(
  param: SignatureParam,
  owner: string,
  call: string,
  members: readonly SignatureParam[],
): Unit[] {
  return members.map((member) => ({
    target: `${owner}.${member.name}`,
    name: member.name,
    owner,
    call,
    param: member,
  }));
}

function unitsOfParam(param: SignatureParam, target: string, models: Models): Unit[] {
  const expansion = expansionOf(param, models);
  if (expansion === null) return [{ target, name: param.name, param }];
  return expandUnits(param, callName(param), expansion.call, expansion.members);
}

/** The sheet's units, in source order. */
export function unitsOf(signature: Signature, models: Models): Unit[] {
  const units: Unit[] = [];
  let position = 0;
  for (const param of signature.params) {
    const target = isPositional(param) ? `#${position++}` : callName(param);
    units.push(...unitsOfParam(param, target, models));
  }
  return units;
}

/** A flattened sheet parameter (the factory becomes its arguments), to compare two sheets. */
export interface FlatParam {
  readonly target: string;
  readonly param: SignatureParam;
}

export function flatParams(signature: Signature): FlatParam[] {
  const out: FlatParam[] = [];
  let position = 0;
  for (const param of signature.params) {
    const target = isPositional(param) ? `#${position++}` : callName(param);
    if (param.factory !== undefined && !isPositional(param)) {
      for (const member of param.factory.params)
        out.push({ target: `${target}.${member.name}`, param: member });
    } else out.push({ target, param });
  }
  return out;
}

/** What the unit becomes: a field (with its plan), deliberately nothing, nothing or pending. */
export type Resolution =
  | { readonly kind: 'field'; readonly plan: FieldPlan }
  | { readonly kind: 'ignored' | 'none' | 'pending' };

export interface FieldPlan {
  readonly type: 'string' | 'number' | 'enum';
  readonly options?: readonly string[];
  readonly suggestions?: readonly string[];
  /** The value template (`{value}.dp`), for the `code`'s `formats`. */
  readonly format?: string;
  /** The field's `code.values`: option → text in the code. */
  readonly values?: Readonly<Record<string, string>>;
  /** The field's `sources[].values`, when the target is a system: text in the source → option. */
  readonly sourceValues?: Readonly<Record<string, string>>;
}

/** What the resolver reads from the library: the models and the field of a `like`. */
export interface ResolveContext {
  readonly models: Models;
  /** The `<type>.<field>` field and what it has on the target (`code.values` or `sources[].values`). */
  readonly like: (ref: string) => FieldPlan | undefined;
}

const NO_FIELD_ROLES = new Set(['callback', 'modifier', 'state', 'other']);
const DEFAULT_BOOLEAN = ['true', 'false'];

function booleanPlan(options: readonly string[]): FieldPlan {
  const custom =
    options.length === 2 && (options[0] !== 'true' || options[1] !== 'false');
  return {
    type: 'enum',
    options,
    ...(custom
      ? { values: { [options[0] as string]: 'true', [options[1] as string]: 'false' } }
      : {}),
  };
}

function fromModel(
  model: SpecFieldModel,
  param: SignatureParam,
  context: ResolveContext,
): Resolution {
  if ('ignore' in model) return { kind: 'ignored' };
  if ('like' in model) {
    const plan = context.like(model.like);
    return plan === undefined ? { kind: 'pending' } : { kind: 'field', plan };
  }
  if ('expand' in model) return { kind: 'pending' };
  return { kind: 'field', plan: planOfModel(model, param) };
}

function planOfModel(
  model: Extract<SpecFieldModel, { type: string }>,
  param: SignatureParam,
): FieldPlan {
  if (param.value?.kind === 'boolean' && model.type === 'enum') {
    return booleanPlan(model.options ?? DEFAULT_BOOLEAN);
  }
  const options =
    model.options ?? (model.type === 'enum' ? param.value?.options : undefined);
  return {
    type: model.type,
    ...(options === undefined ? {} : { options }),
    ...(model.format === undefined ? {} : { format: model.format }),
  };
}

function fromKind(param: SignatureParam, models: Models): Resolution {
  const value = param.value;
  switch (value?.kind) {
    case 'text':
      return { kind: 'field', plan: { type: 'string' } };
    case 'boolean':
      return { kind: 'field', plan: booleanPlan(booleanOptions(models)) };
    case 'number':
    case 'integer':
    case 'dimension':
      return { kind: 'field', plan: { type: 'number' } };
    case 'enum':
      return value.options !== undefined && value.options.length > 0
        ? { kind: 'field', plan: { type: 'enum', options: value.options } }
        : { kind: 'pending' };
    default:
      return { kind: 'pending' };
  }
}

function booleanOptions(models: Models): readonly string[] {
  const model = models.boolean;
  return model !== undefined && 'type' in model && model.options !== undefined
    ? model.options
    : DEFAULT_BOOLEAN;
}

/** The rule of decision 5; the library's field model takes precedence. */
export function resolveUnit(unit: Unit, context: ResolveContext): Resolution {
  const { param } = unit;
  if (NO_FIELD_ROLES.has(param.role)) return { kind: 'none' };
  const model =
    context.models[param.type] ??
    (param.value?.kind === 'boolean' ? context.models.boolean : undefined);
  if (model !== undefined) return fromModel(model, param, context);
  return param.role === 'slot' ? { kind: 'none' } : fromKind(param, context.models);
}

/** The sheet's literal default in the field's type; `undefined` when it does not fit. */
export function defaultFor(
  param: SignatureParam,
  plan: FieldPlan,
): string | number | undefined {
  const value = param.value?.default;
  if (value === undefined) return undefined;
  if (plan.type === 'number') return typeof value === 'number' ? value : undefined;
  if (plan.type === 'string') return typeof value === 'string' ? value : undefined;
  return enumDefault(value, plan.options ?? []);
}

function enumDefault(value: string | number | boolean, options: readonly string[]) {
  if (typeof value === 'boolean') return options[value ? 0 : 1];
  return typeof value === 'string' ? optionFor(value, options) : undefined;
}

export type FieldType = SpecField['type'];
