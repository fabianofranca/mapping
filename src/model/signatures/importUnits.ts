import type { SpecField, SpecFieldModel } from '../spec';
import { callName } from './codeLink';
import { expansionOf, isPositional, type Models } from './expansion';
import { optionFor } from './importNames';
import type { Signature, SignatureParam } from './types';

export type { Models };

// As unidades do importador (etapa #1079, decisões 5 e 7): o que a ficha tem que pode virar um
// campo (um parâmetro, ou um parâmetro da fábrica ou do `expand` de um parâmetro composto) e a
// regra que diz o que cada uma vira. Puro.

/** Uma unidade de ligação: um parâmetro, ou um argumento da fábrica de um composto. */
export interface Unit {
  /** O que o `params` do `code` diz: o nome, `fábrica.nome` ou `#n`. */
  readonly target: string;
  /** O nome do parâmetro (o da fábrica, nos compostos). */
  readonly name: string;
  /** O parâmetro dono da fábrica (a chave do `calls`). */
  readonly owner?: string;
  /** O símbolo da fábrica. */
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

/** As unidades da ficha, na ordem da fonte. */
export function unitsOf(signature: Signature, models: Models): Unit[] {
  const units: Unit[] = [];
  let position = 0;
  for (const param of signature.params) {
    const target = isPositional(param) ? `#${position++}` : callName(param);
    units.push(...unitsOfParam(param, target, models));
  }
  return units;
}

/** Um parâmetro da ficha achatado (a fábrica vira os seus argumentos), para comparar duas fichas. */
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

/** O que a unidade vira: um campo (com o plano dele), nada de propósito, nada ou pendência. */
export type Resolution =
  | { readonly kind: 'field'; readonly plan: FieldPlan }
  | { readonly kind: 'ignored' | 'none' | 'pending' };

export interface FieldPlan {
  readonly type: 'string' | 'number' | 'enum';
  readonly options?: readonly string[];
  readonly suggestions?: readonly string[];
  /** O molde do valor (`{value}.dp`), para o `formats` do `code`. */
  readonly format?: string;
  /** O `code.values` do campo: opção → texto no código. */
  readonly values?: Readonly<Record<string, string>>;
  /** O `sources[].values` do campo, quando o alvo é um sistema: texto na fonte → opção. */
  readonly sourceValues?: Readonly<Record<string, string>>;
}

/** O que o resolvedor lê da biblioteca: os modelos e o campo de um `like`. */
export interface ResolveContext {
  readonly models: Models;
  /** O campo `<tipo>.<campo>` e o que ele tem no alvo (`code.values` ou `sources[].values`). */
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

/** A regra da decisão 5; o modelo de campo da biblioteca tem precedência. */
export function resolveUnit(unit: Unit, context: ResolveContext): Resolution {
  const { param } = unit;
  if (NO_FIELD_ROLES.has(param.role)) return { kind: 'none' };
  const model =
    context.models[param.type] ??
    (param.value?.kind === 'boolean' ? context.models.boolean : undefined);
  if (model !== undefined) return fromModel(model, param, context);
  return param.role === 'slot' ? { kind: 'none' } : fromKind(param, context.models);
}

/** O padrão literal da ficha no tipo do campo; `undefined` quando não dá. */
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
