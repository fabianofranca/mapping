import type { SpecFieldModel } from '../spec';
import type { SignatureParam } from './types';

// A regra única da expansão de um parâmetro composto (etapa #1079; CL1, S5-c): o importador
// (`importUnits.ts`, que vira campos) e o validador (`codeLink.ts`, que confere o `params` do
// `code`) perguntam a esta função o que um parâmetro expande, para nunca divergirem. Pura.

/** Os modelos do `fieldModels` da plataforma. */
export type Models = Readonly<Record<string, SpecFieldModel>>;
/** Os modelos como o validador os recebe (só o `expand` interessa). */
export type ExpandModels = Models;

export const isPositional = (param: SignatureParam): boolean => param.label === '_';

export const stripNullable = (type: string): string => type.replace(/\?$/, '');

/** O que o parâmetro expande: o símbolo da chamada e os membros (nome e parâmetro). */
export interface Expansion {
  readonly call: string;
  readonly members: readonly SignatureParam[];
}

/**
 * O que um parâmetro expande, ou `null` (ele é uma unidade só). Só um `value` com rótulo expande:
 * pelo `expand` do modelo do tipo dele, ou, sem modelo, pela fábrica do padrão (os argumentos que
 * são `value`). Um modelo que não é `expand` (`like`, `type`, `ignore`) não expande, mesmo com
 * fábrica.
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
