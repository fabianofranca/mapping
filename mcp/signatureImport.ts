import {
  parseSignature,
  parseSignatureText,
  planSignatureImport,
  type ImportErrorCode,
  type Signature,
  type Spec,
  type SpecCode,
} from '../src/model';
import { ToolError, type ToolErrorCode } from './errors';
import { packageByPath, readJsonFile, type PackageSource } from './library';
import { mergeOrdered } from './mergeOrdered';
import type { Roots } from './paths';

type Json = Record<string, unknown>;

// `plan_signature_import` (etapa #1079, decisões 1c e 13): da ficha `mapping-signature` (inline ou
// um `.json` dentro das raízes) e do pacote da biblioteca, a prévia da importação e a
// especialização já importada. Somente leitura: não grava nada (quem grava é o agente). O servidor
// só lê JSON; um `signatureFile` que não é `.json` é recusado sem ser aberto.

/** Os erros do importador viram os códigos do servidor, com o mesmo nome (a spec anterior à 16 é `invalid-spec`). */
const CODES = {
  'type-not-found': 'type-not-found',
  'platform-not-declared': 'platform-not-declared',
  'signature-mismatch': 'signature-mismatch',
  'variant-not-found': 'variant-not-found',
  'spec-version': 'invalid-spec',
} as const satisfies Record<ImportErrorCode, ToolErrorCode>;

export interface PlanSignatureImportArgs {
  readonly path: string;
  readonly type: string;
  readonly platform?: string | undefined;
  readonly system?: string | undefined;
  readonly variant?: string | undefined;
  readonly signature?: unknown;
  readonly signatureFile?: string | undefined;
}

function invalid(
  message: string,
  issues: readonly { path: string; message: string }[],
): never {
  throw new ToolError('signature-invalid', message, {
    issues: issues.slice(0, 20),
    hint: 'corrija a ficha (cada problema traz o caminho dentro dela) conforme mapping-docs://SIGNATURE-FORMAT.md e chame de novo',
  });
}

async function readSignature(
  roots: Roots,
  args: PlanSignatureImportArgs,
): Promise<Signature> {
  if ((args.signature === undefined) === (args.signatureFile === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'passe exatamente um entre signature (a ficha inline) e signatureFile (um .json dentro das raízes)',
    );
  }
  const parsed =
    args.signatureFile === undefined
      ? parseSignature(args.signature)
      : parseSignatureText(await readJsonFile(roots, args.signatureFile));
  if (!parsed.ok) invalid('a ficha de assinatura é inválida', parsed.issues);
  return parsed.signature;
}

function target(
  args: PlanSignatureImportArgs,
): { platform: string } | { system: string } {
  if ((args.platform === undefined) === (args.system === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'passe exatamente um entre platform (alvo de código) e system (alvo de design)',
    );
  }
  return args.platform === undefined
    ? { system: args.system as string }
    : { platform: args.platform };
}

/** O tipo `id` da especialização, em qualquer camada. */
function findType(
  spec: Spec,
  id: string,
): Spec['layers'][number]['annotationTypes'][number] | undefined {
  return spec.layers.flatMap((layer) => layer.annotationTypes).find((t) => t.id === id);
}

/** A ficha citada pelo `code` do tipo na plataforma (a do caso, com `variant`). */
function codeSignature(code: SpecCode | undefined, variant?: string): string | undefined {
  if (variant === undefined) return code?.signature;
  return code?.variants?.cases[variant]?.signature;
}

/** O caminho da ficha gravada no pacote para o alvo (o `signature` do `code`, do caso ou da source). */
function recordedPath(spec: Spec, args: PlanSignatureImportArgs): string | undefined {
  const type = findType(spec, args.type);
  if (args.system !== undefined)
    return type?.sources?.find((s) => s.system === args.system)?.signature;
  return codeSignature(type?.code?.[args.platform as string], args.variant);
}

/** A ficha gravada no pacote (a anterior), ou o motivo de não ter podido usá-la. */
interface Previous {
  readonly signature?: Signature;
  readonly problem?: string;
}

/** A ficha gravada no pacote (a anterior), se existe e é válida; senão, o motivo em `problem`. */
async function readPrevious(
  pkg: PackageSource,
  args: PlanSignatureImportArgs,
): Promise<Previous> {
  const ref = recordedPath(pkg.spec, args);
  if (ref === undefined) return {};
  const path = pkg.resolve(ref);
  const text = await pkg.read(path);
  if (text === null)
    return { problem: `a ficha gravada \`${path}\` está ausente do pacote` };
  const parsed = parseSignatureText(text);
  if (parsed.ok) return { signature: parsed.signature };
  return {
    problem: `a ficha gravada \`${path}\` é inválida (${parsed.issues[0]?.message ?? 'sem detalhe'})`,
  };
}

/** Funde o tipo importado no JSON cru do arquivo (mantém a ordem das chaves do arquivo). */
function mergedSpec(rawText: string, typeId: string, imported: unknown): unknown {
  const raw: unknown = JSON.parse(rawText);
  const layers = (raw as { layers?: { annotationTypes?: Json[] }[] }).layers ?? [];
  for (const layer of layers) {
    const types = layer.annotationTypes ?? [];
    const index = types.findIndex((t) => t.id === typeId);
    if (index >= 0) types[index] = mergeOrdered(types[index], imported) as Json;
  }
  return raw;
}

const HINT = (path: string, bump: boolean): string =>
  `nada foi gravado. Grave o \`spec\` no arquivo da especialização do pacote e a ficha (o mesmo JSON passado) em \`${path}\` dentro dele; rode validate_library na pasta${bump ? ' (previous = a versão anterior) e suba a version, porque o contrato mudou' : ''}. Escreva só label, description e ignore à mão; \`migrations\` só se a pessoa pedir (veja suggestedMigrations).`;

export async function planSignatureImportTool(
  roots: Roots,
  args: PlanSignatureImportArgs,
): Promise<Json> {
  const alvo = target(args);
  const signature = await readSignature(roots, args);
  const pkg = await packageByPath(roots, args.path);
  const { signature: previous, problem } = await readPrevious(pkg, args);
  const result = planSignatureImport(pkg.spec, {
    type: args.type,
    target: alvo,
    signature,
    ...(args.variant === undefined ? {} : { variant: args.variant }),
    ...(previous === undefined ? {} : { previous }),
  });
  if (!result.ok) {
    throw new ToolError(CODES[result.code], result.detail, {
      hint: result.hint,
      type: args.type,
    });
  }
  const { plan } = result;
  const rawText = await pkg.read(pkg.specPath);
  if (rawText === null)
    throw new ToolError(
      'path-not-found',
      `arquivo da especialização não encontrado: ${args.path}`,
    );
  return {
    path: args.path,
    type: args.type,
    ...alvo,
    ...(args.variant === undefined ? {} : { variant: args.variant }),
    signaturePath: plan.signaturePath,
    previous: previous !== undefined,
    ...(problem === undefined ? {} : { previousProblem: problem }),
    fields: plan.fields,
    links: plan.links,
    ...(plan.code === undefined ? {} : { code: plan.code }),
    ...(plan.sources === undefined ? {} : { sources: plan.sources }),
    notices: plan.notices,
    unmapped: plan.unmapped,
    changes: plan.changes,
    suggestedMigrations: plan.suggestedMigrations,
    versionBump: plan.versionBump,
    spec: mergedSpec(rawText, args.type, plan.type),
    hint: HINT(plan.signaturePath, plan.versionBump),
  };
}
