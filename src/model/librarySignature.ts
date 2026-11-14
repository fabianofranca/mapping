import type { Spec, SpecCode, SpecCodeCase } from './spec';
import {
  paramsOutsideSignature,
  parseSignatureText,
  type ExpandModels,
  type Signature,
} from './signatures';
import { templateMessage, type ModelMessageTemplateCode } from './messages';

// The `mapping-signature` sheet in the library package (formatVersion 16; stage #1079): the one
// that the type's `code` (or `variants` case) and `sources` cite exists, is a valid sheet and
// has the same code (symbol and file match); and the `params` the sheet does not have becomes a
// warning. Pure: receives the files already read; the validator (`library.ts`) collects the
// problems.

export interface SignatureProblem {
  readonly severity: 'error' | 'warning';
  /** File of the problem: the specialization or the sheet. */
  readonly file: string;
  readonly path: string;
  readonly message: string;
  /** Only the cited file that does not exist: the path, for the catalog message with a code. */
  readonly missing?: string;
  /** Code from the message catalog and the translation data, when the problem has them. */
  readonly code?: ModelMessageTemplateCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface SignatureCheck {
  readonly problems: readonly SignatureProblem[];
  /** Cited sheets (resolved path): count as referenced. */
  readonly referenced: readonly string[];
}

interface Reader {
  readonly specPath: string;
  readonly resolve: (ref: string) => string;
  readonly byPath: ReadonlyMap<string, { readonly text?: string | undefined }>;
}

class Checker {
  readonly problems: SignatureProblem[] = [];
  readonly referenced: string[] = [];
  /** Sheets already read: a problem inside a sheet is reported only once. */
  private readonly read = new Map<string, Signature | null>();

  constructor(private readonly reader: Reader) {}

  /** Error in the specialization, with a catalog code. */
  fail(
    path: string,
    code: ModelMessageTemplateCode,
    params: Record<string, string | number> = {},
  ): void {
    this.add('error', this.reader.specPath, path, code, params);
  }

  /** Every sheet problem is reported with a catalog `code`; the `message` is its English text. */
  private add(
    severity: 'error' | 'warning',
    file: string,
    path: string,
    code: ModelMessageTemplateCode,
    params: Record<string, string | number> = {},
    missing?: string,
  ): void {
    this.problems.push({
      severity,
      file,
      path,
      message: templateMessage(code, params).text,
      ...(missing === undefined ? {} : { missing }),
      code,
      params,
    });
  }

  /**
   * The sheet cited at `at`: exists and is valid; `null` with the problem already recorded. What
   * is wrong inside the sheet is reported only once; a sheet that is missing (or could not be
   * read) is reported at every place that cites it. `cited: false` only rereads the sheet (the
   * base's, seen from the case), without counting again.
  open(ref: string, at: string, cited = true): Signature | null {
    const { specPath, resolve, byPath } = this.reader;
    const file = resolve(ref);
    if (cited) this.referenced.push(file);
    const entry = byPath.get(file);
    if (entry?.text === undefined) {
      if (cited) {
        if (entry === undefined) {
          this.add('error', specPath, at, 'library.fileNotFound', { path: file }, file);
        } else {
          this.add('error', specPath, at, 'library.signatureNotRead', { path: file });
        }
      }
      return null;
    }
    return this.parse(file, entry.text);
  }

  /** Reads the sheet; what is wrong inside it is reported only once. */
  private parse(file: string, text: string): Signature | null {
    if (this.read.has(file)) return this.read.get(file) ?? null;
    const parsed = parseSignatureText(text);
    let signature: Signature | null = null;
    if (parsed.ok) signature = parsed.signature;
    else {
      for (const i of parsed.issues)
        this.add('error', file, i.path, 'library.signatureInvalid', {
          reason: i.message,
        });
    }
    this.read.set(file, signature);
    return signature;
  }

  /** The `params` that the sheet does not have become a warning. */
  params(
    signature: Signature,
    at: string,
    params: Readonly<Record<string, string>> | undefined,
    models?: ExpandModels,
  ): void {
    for (const outside of paramsOutsideSignature(signature, { params }, models)) {
      this.add(
        'warning',
        this.reader.specPath,
        `${at}.params.${outside.field}`,
        'library.paramOutsideSignature',
        { name: outside.name },
      );
    }
  }

  /**
   * The sheet's symbol and file are those of the `code` (or the case); `where` says where each
   * error points.
   */
  identity(
    source: Extract<Signature['source'], { kind: 'code' }>,
    expected: { symbol?: string | undefined; path?: string | undefined },
    where: { symbol: string; path: string },
  ): void {
    const { specPath } = this.reader;
    if (expected.symbol !== undefined && source.symbol !== expected.symbol) {
      this.add('error', specPath, where.symbol, 'library.signatureSymbolMismatch', {
        found: source.symbol,
        expected: expected.symbol,
      });
    }
    if (expected.path !== undefined && source.path !== expected.path) {
      this.add('error', specPath, where.path, 'library.signaturePathMismatch', {
        found: source.path,
        expected: expected.path,
      });
    }
  }

  /**
   * The `code`'s sheet is that of the same platform, symbol and file, and the `params` are in it.
   */
  code(
    signature: Signature,
    at: string,
    platform: string,
    symbol: string,
    path: string | undefined,
    params: Readonly<Record<string, string>> | undefined,
    models?: ExpandModels,
  ): void {
    const { specPath } = this.reader;
    const source = signature.source;
    const where = `${at}.signature`;
    if (source.kind !== 'code') {
      this.add('error', specPath, where, 'library.signatureNotCode');
      return;
    }
    if (source.platform !== platform) {
      this.add('error', specPath, where, 'library.signaturePlatformMismatch', {
        found: source.platform,
        expected: platform,
      });
    }
    this.identity(source, { symbol, path }, { symbol: where, path: where });
    this.params(signature, at, params, models);
  }
}

/**
 * The `variants` case: with its own sheet, it applies to the case's symbol and file and to the
 * base's `params` plus the case's (which is what `resolveCode` delivers); without it, the
 * base's sheet applies, and only the case's `params` are checked (the base's already were, in
 * the `code`).
 */
function checkCase(
  checker: Checker,
  platform: string,
  entry: SpecCode,
  kase: SpecCodeCase,
  at: string,
  models?: ExpandModels,
): void {
  if (kase.signature === undefined) {
    if (entry.signature === undefined) return;
    const inherited = checker.open(entry.signature, `${at}.signature`, false);
    if (inherited === null) return;
    // The symbol and file that the case swaps must be those of the inherited sheet: `resolveCode`
    // pairs them.
    if (inherited.source.kind === 'code') {
      checker.identity(inherited.source, kase, {
        symbol: `${at}.symbol`,
        path: `${at}.path`,
      });
    }
    if (kase.params !== undefined) checker.params(inherited, at, kase.params, models);
    return;
  }
  const signature = checker.open(kase.signature, `${at}.signature`);
  if (signature === null) return;
  checker.code(
    signature,
    at,
    platform,
    kase.symbol ?? entry.symbol,
    kase.path ?? entry.path,
    { ...entry.params, ...kase.params },
    models,
  );
}

/**
 * Checks the sheets the specialization cites (in `code`, in the `variants` cases and in the
 * `sources`).
 */
export function checkSignatures(spec: Spec, reader: Reader): SignatureCheck {
  const checker = new Checker(reader);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp = `layers[${li}].annotationTypes[${ti}]`;
      for (const [platform, entry] of Object.entries(type.code ?? {})) {
        const at = `${tp}.code.${platform}`;
        const models = spec.fieldModels?.[platform];
        if (entry.signature !== undefined) {
          const signature = checker.open(entry.signature, `${at}.signature`);
          if (signature !== null) {
            checker.code(
              signature,
              at,
              platform,
              entry.symbol,
              entry.path,
              entry.params,
              models,
            );
          }
        }
        for (const [value, kase] of Object.entries(entry.variants?.cases ?? {})) {
          checkCase(
            checker,
            platform,
            entry,
            kase,
            `${at}.variants.cases.${value}`,
            models,
          );
        }
      }
      (type.sources ?? []).forEach((source, si) => {
        if (source.signature === undefined) return;
        const at = `${tp}.sources[${si}]`;
        const signature = checker.open(source.signature, `${at}.signature`);
        if (signature === null) return;
        if (
          signature.source.kind !== 'design' ||
          signature.source.system !== source.system
        ) {
          checker.fail(`${at}.signature`, 'library.signatureNotDesign', {
            system: source.system,
          });
        }
      });
    });
  });
  return { problems: checker.problems, referenced: checker.referenced };
}
