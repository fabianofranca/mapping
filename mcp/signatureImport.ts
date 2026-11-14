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

// `plan_signature_import` (stage #1079, decisions 1c and 13): from the `mapping-signature` sheet (inline or
// a `.json` inside the roots) and the library package, the import preview and the
// already-imported specialization. Read-only: it writes nothing (whoever writes is the agent). The server
// only reads JSON; a `signatureFile` that is not `.json` is refused without being opened.

/** The importer's errors become the server's codes, with the same name (a spec before 16 is `invalid-spec`). */
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
    hint: 'fix the sheet (each problem carries its path inside it) according to mapping-docs://SIGNATURE-FORMAT.md and call again',
  });
}

async function readSignature(
  roots: Roots,
  args: PlanSignatureImportArgs,
): Promise<Signature> {
  if ((args.signature === undefined) === (args.signatureFile === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'pass exactly one of signature (the inline sheet) and signatureFile (a .json inside the roots)',
    );
  }
  const parsed =
    args.signatureFile === undefined
      ? parseSignature(args.signature)
      : parseSignatureText(await readJsonFile(roots, args.signatureFile));
  if (!parsed.ok) invalid('the signature sheet is invalid', parsed.issues);
  return parsed.signature;
}

function target(
  args: PlanSignatureImportArgs,
): { platform: string } | { system: string } {
  if ((args.platform === undefined) === (args.system === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'pass exactly one of platform (code target) and system (design target)',
    );
  }
  return args.platform === undefined
    ? { system: args.system as string }
    : { platform: args.platform };
}

/** The type `id` of the specialization, in any layer. */
function findType(
  spec: Spec,
  id: string,
): Spec['layers'][number]['annotationTypes'][number] | undefined {
  return spec.layers.flatMap((layer) => layer.annotationTypes).find((t) => t.id === id);
}

/** The sheet cited by the type's `code` on the platform (the case's, with `variant`). */
function codeSignature(code: SpecCode | undefined, variant?: string): string | undefined {
  if (variant === undefined) return code?.signature;
  return code?.variants?.cases[variant]?.signature;
}

/** The path of the sheet saved in the package for the target (the `code`'s `signature`, the case's or the source's). */
function recordedPath(spec: Spec, args: PlanSignatureImportArgs): string | undefined {
  const type = findType(spec, args.type);
  if (args.system !== undefined)
    return type?.sources?.find((s) => s.system === args.system)?.signature;
  return codeSignature(type?.code?.[args.platform as string], args.variant);
}

/** The sheet saved in the package (the previous one), or the reason it could not be used. */
interface Previous {
  readonly signature?: Signature;
  readonly problem?: string;
}

/** The sheet saved in the package (the previous one), if it exists and is valid; otherwise, the reason in `problem`. */
async function readPrevious(
  pkg: PackageSource,
  args: PlanSignatureImportArgs,
): Promise<Previous> {
  const ref = recordedPath(pkg.spec, args);
  if (ref === undefined) return {};
  const path = pkg.resolve(ref);
  const text = await pkg.read(path);
  if (text === null)
    return { problem: `the saved sheet \`${path}\` is missing from the package` };
  const parsed = parseSignatureText(text);
  if (parsed.ok) return { signature: parsed.signature };
  return {
    problem: `the saved sheet \`${path}\` is invalid (${parsed.issues[0]?.message ?? 'no detail'})`,
  };
}

/** Merges the imported type into the file's raw JSON (keeps the file's key order). */
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
  `nothing was written. Write the \`spec\` to the package's specialization file and the sheet (the same JSON passed) to \`${path}\` inside it; run validate_library on the folder${bump ? ' (previous = the earlier version) and raise the version, because the contract changed' : ''}. Write only label, description and ignore by hand; \`migrations\` only if the person asks (see suggestedMigrations).`;

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
    throw new ToolError('path-not-found', `specialization file not found: ${args.path}`);
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
