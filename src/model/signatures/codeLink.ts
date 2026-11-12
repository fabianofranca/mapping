import { paramTarget } from '../codeParams';
import type { SpecFieldModel } from '../spec';
import type { Signature, SignatureParam, SignatureRole } from './types';

/** O nome que se escreve na chamada: o rótulo externo do Swift, ou o nome. */
export const callName = (param: SignatureParam): string =>
  param.label !== undefined && param.label !== '_' ? param.label : param.name;

// A ficha cruzada com o `code` de uma plataforma (etapa #1079): o que a ficha tem e o `code` não
// liga a campo (`unmappedParams`, o `unmapped` do `get_code_hints`) e o que o `code` liga e a ficha
// não tem (`paramsOutsideSignature`, o aviso "parâmetro fora da ficha"). Puro, sem navegador.

/** O que o `code` precisa ter para o cruzamento: os `params` e o `ignore`. */
export interface CodeLinks {
  readonly params?: Readonly<Record<string, string>> | undefined;
  readonly ignore?: readonly string[] | undefined;
}

/** Um parâmetro da ficha sem campo: o que o agente precisa saber para escrever a chamada. */
export interface UnmappedParam {
  readonly name: string;
  readonly role: SignatureRole;
  readonly type: string;
  readonly required: boolean;
  readonly default?: string;
}

/** Os parâmetros sem rótulo externo (`_`, Swift), na ordem: o `#n` do `params` é o n-ésimo. */
function positionalParams(signature: Signature): SignatureParam[] {
  return signature.params.filter((param) => param.label === '_');
}

/**
 * Os parâmetros da ficha que o `code` não liga a nenhum campo e não deixa de fora (`ignore`), na
 * ordem da ficha. Um parâmetro com algum campo ligado por caminho (`colors.containerColor`) conta
 * como ligado: o que sobra da fábrica não entra.
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

/** Os modelos do `fieldModels` da plataforma; o validador lê só o `expand`. */
export type ExpandModels = Readonly<Record<string, SpecFieldModel>>;

/** O membro é um dos parâmetros que o `expand` do modelo do tipo do parâmetro dono expande. */
function expandsTo(model: SpecFieldModel | undefined, member: string): boolean {
  return model !== undefined && 'expand' in model && member in model.expand.params;
}

/** Um `params` do `code` que a ficha não tem: o campo e o valor escrito. */
export interface OutsideParam {
  readonly field: string;
  readonly name: string;
}

/**
 * Os `params` do `code` que apontam para um parâmetro que a ficha não tem (o parâmetro saiu do
 * código, ou o nome está errado): um nome, o argumento de uma fábrica ou um posicional além dos
 * parâmetros sem rótulo da ficha. Fábrica que a ficha não descreve não é conferida.
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
    const target = paramTarget(value);
    let found: boolean;
    if (target.kind === 'name') found = byName.has(target.name);
    else if (target.kind === 'position') found = target.position < positions;
    else {
      const owner = byName.get(target.call);
      found =
        owner !== undefined &&
        (owner.factory === undefined ||
          owner.factory.params.some((param) => param.name === target.name) ||
          expandsTo(models?.[owner.type], target.name));
    }
    if (!found) outside.push({ field, name: value });
  }
  return outside;
}
