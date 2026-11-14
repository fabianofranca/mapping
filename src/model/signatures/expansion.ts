import type { SpecFieldModel } from '../spec';
import type { SignatureParam } from './types';

// The single rule for expanding a composite parameter (stage #1079; CL1, S5-c): the importer
// (`importUnits.ts`, which turns it into fields) and the validator (`codeLink.ts`, which checks the
// `params` of the `code`) ask this function what a parameter expands to, so they never diverge. Pure.

/** The models in the platform's `fieldModels`. */
export type Models = Readonly<Record<string, SpecFieldModel>>;
/** The models as the validator receives them (only `expand` matters). */
export type ExpandModels = Models;

export const isPositional = (param: SignatureParam): boolean => param.label === '_';

export const stripNullable = (type: string): string => type.replace(/\?$/, '');

/** What the parameter expands to: the call symbol and the members (name and parameter). */
export interface Expansion {
  readonly call: string;
  readonly members: readonly SignatureParam[];
}

/**
 * What a parameter expands to, or `null` (it is a single unit). Only a labeled `value` expands:
 * through the `expand` of its type's model or, with no model, through the pattern's factory (the
 * arguments that are `value`). A model that is not `expand` (`like`, `type`, `ignore`) does not
 * expand, even with a factory.

 */
export function expansionOf(param: SignatureParam, models: Models): Expansion | null {
  if (param.role !== 'value' || isPositional(param)) return null;
  const model = models[param.type];
  if (model !== undefined) {
    if (!('expand' in model)) return null;
    return {
      call: model.expand.call ?? stripNullable(param.type),
      members: Object.entries(model.expand.params).map(
        ([name, type]): SignatureParam => ({
          name,
          role: 'value',
          type,
          value: { kind: 'opaque' },
        }),
      ),
    };
  }
  if (param.factory === undefined) return null;
  return {
    call: param.factory.call,
    members: param.factory.params.filter((p) => p.role === 'value'),
  };
}
