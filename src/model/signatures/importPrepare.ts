import type {
  Spec,
  SpecAnnotationType,
  SpecCode,
  SpecCodeCase,
  SpecTypeSource,
} from '../spec';
import type { ImportErrorCode, PlanSignatureImportOptions } from './importTypes';
import type { Signature } from './types';

// Import preparation (stage #1079, decisions 7 and 9): finds or creates the platform's `code` (or
// the `variants` case) and the system's `sources`, checks that the signature is the one for the
// same code and says where it goes in the package. Works on a copy of the specialization. Pure.

export interface Failure {
  readonly ok: false;
  readonly code: ImportErrorCode;
  readonly detail: string;
  readonly hint: string;
}

const failure = (code: ImportErrorCode, detail: string, hint: string): Failure => ({
  ok: false,
  code,
  detail,
  hint,
});

/** What the import writes: the `code` (with the case, if any) or the system's `sources`. */
export interface Prepared {
  readonly ok: true;
  /** The path of the signature in the package. */
  readonly path: string;
  /** Whoever holds `signature`, `params`, `calls`, `formats` and `values`: the `code`, the case or the source. */
  readonly scope: SpecCode | SpecCodeCase | SpecTypeSource;
  readonly code?: SpecCode;
  readonly caseEntry?: SpecCodeCase;
  readonly source?: SpecTypeSource;
  /** The id of the platform or system (the prefix of the warnings and the key of `fieldModels`). */
  readonly id: string;
}

const safe = (text: string): string => text.replace(/[^A-Za-z0-9_-]+/g, '-');

function pickCase(
  code: SpecCode,
  type: SpecAnnotationType,
  variant: string,
): SpecCodeCase | Failure {
  const variants = code.variants;
  if (variants === undefined) {
    return failure(
      'variant-not-found',
      `the code of type "${type.id}" has no variants`,
      'declare variants (the enum field and the case) in the platform code before importing the case signature',
    );
  }
  const field = type.fields.find((f) => f.key === variants.field);
  const options = field?.type === 'enum' ? field.options : [];
  if (!options.includes(variant)) {
    return failure(
      'variant-not-found',
      `"${variant}" is not an option of the variants field "${variants.field}"`,
      `use one of the options: ${options.join(', ')}`,
    );
  }
  variants.cases[variant] ??= {};
  return variants.cases[variant];
}

function mismatch(
  signature: Signature,
  symbol: string,
  path: string | undefined,
): Failure | null {
  const source = signature.source;
  if (source.kind !== 'code') return null;
  if (source.symbol !== symbol) {
    return failure(
      'signature-mismatch',
      `the signature symbol ("${source.symbol}") differs from the code symbol ("${symbol}")`,
      'extract the signature of the right symbol, or fix the code symbol if it is the wrong one',
    );
  }
  if (path !== undefined && source.path !== path) {
    return failure(
      'signature-mismatch',
      `the signature file ("${source.path}") differs from the code path ("${path}")`,
      'extract the signature of the right file, or fix the code path if it is the wrong one',
    );
  }
  return null;
}

function checkCodeTarget(
  spec: Spec,
  options: PlanSignatureImportOptions,
  platform: string,
): Failure | null {
  if (!(spec.platforms ?? []).some((p) => p.id === platform)) {
    return failure(
      'platform-not-declared',
      `the platform "${platform}" is not in the specialization's platforms`,
      'declare the platform in platforms (id, name, language) before importing',
    );
  }
  const source = options.signature.source;
  if (source.kind !== 'code') {
    return failure(
      'signature-mismatch',
      'the signature is a design one, but the target is a code platform',
      'pass system instead of platform, or use a code signature',
    );
  }
  if (source.platform === platform) return null;
  return failure(
    'signature-mismatch',
    `the signature is of platform "${source.platform}", but the target is "${platform}"`,
    'import the signature into its own platform, or extract the signature of the target platform',
  );
}

/** The platform's `code` (created from the signature, if the type has none) and whether it was just created. */
function ensureCode(
  type: SpecAnnotationType,
  signature: Signature,
  platform: string,
): { code: SpecCode; created: boolean } {
  const existing = type.code?.[platform];
  if (existing !== undefined) return { code: existing, created: false };
  const source = signature.source as Extract<Signature['source'], { kind: 'code' }>;
  const code: SpecCode = { symbol: source.symbol, path: source.path };
  type.code = { ...type.code, [platform]: code };
  return { code, created: true };
}

/** The requested `variants` case (or none) and the check of the symbol and the file. */
function pickScope(
  type: SpecAnnotationType,
  options: PlanSignatureImportOptions,
  entry: { code: SpecCode; created: boolean },
): { caseEntry?: SpecCodeCase } | Failure {
  const { code, created } = entry;
  let caseEntry: SpecCodeCase | undefined;
  if (options.variant !== undefined) {
    const picked = pickCase(code, type, options.variant);
    if ('ok' in picked) return picked;
    caseEntry = picked;
  }
  const wrong = created
    ? null
    : mismatch(
        options.signature,
        caseEntry?.symbol ?? code.symbol,
        caseEntry?.path ?? code.path,
      );
  return wrong ?? (caseEntry === undefined ? {} : { caseEntry });
}

function prepareCode(
  spec: Spec,
  type: SpecAnnotationType,
  options: PlanSignatureImportOptions,
  platform: string,
): Prepared | Failure {
  const bad = checkCodeTarget(spec, options, platform);
  if (bad !== null) return bad;
  const entry = ensureCode(type, options.signature, platform);
  const picked = pickScope(type, options, entry);
  if ('ok' in picked) return picked;
  const { code } = entry;
  const scope = picked.caseEntry ?? code;
  const variant = options.variant === undefined ? '' : `.${safe(options.variant)}`;
  const path =
    options.signaturePath ??
    scope.signature ??
    `signatures/${type.id}${variant}.${platform}.json`;
  scope.signature = path;
  return { ok: true, path, scope, code, id: platform, ...picked };
}

function checkDesignTarget(
  options: PlanSignatureImportOptions,
  system: string,
): Failure | null {
  const origin = options.signature.source;
  if (options.variant !== undefined) {
    return failure(
      'variant-not-found',
      'variant only applies to a code target (platform)',
      'remove the variant',
    );
  }
  if (origin.kind === 'design' && origin.system === system) return null;
  return failure(
    'signature-mismatch',
    origin.kind === 'design'
      ? `the signature system ("${origin.system}") differs from the target ("${system}")`
      : 'the signature is a code one, but the target is a design system',
    'pass platform instead of system, or use the system design signature',
  );
}

function prepareDesign(
  type: SpecAnnotationType,
  options: PlanSignatureImportOptions,
  system: string,
): Prepared | Failure {
  const bad = checkDesignTarget(options, system);
  if (bad !== null) return bad;
  const origin = options.signature.source as Extract<
    Signature['source'],
    { kind: 'design' }
  >;
  let source = type.sources?.find((s) => s.system === system);
  if (source === undefined) {
    source = { system, id: origin.id, name: origin.name };
    type.sources = [...(type.sources ?? []), source];
  } else if (source.id !== undefined && source.id !== origin.id) {
    return failure(
      'signature-mismatch',
      `the signature id ("${origin.id}") differs from the type's source id ("${source.id}")`,
      'extract the signature of the right node, or fix the type source id',
    );
  }
  const path =
    options.signaturePath ?? source.signature ?? `signatures/${type.id}.${system}.json`;
  source.signature = path;
  return { ok: true, path, scope: source, source, id: system };
}

/** Prepares the type (already on a copy) to receive the import, or says why it cannot. */
export function prepareImport(
  spec: Spec,
  type: SpecAnnotationType,
  options: PlanSignatureImportOptions,
): Prepared | Failure {
  const target = options.target;
  return 'platform' in target
    ? prepareCode(spec, type, options, target.platform)
    : prepareDesign(type, options, target.system);
}
