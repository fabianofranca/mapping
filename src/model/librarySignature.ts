import type { Spec, SpecCode, SpecCodeCase } from './spec';
import {
  paramsOutsideSignature,
  parseSignatureText,
  type ExpandModels,
  type Signature,
} from './signatures';
import { templateMessage, type ModelMessageTemplateCode } from './messages';

// A ficha `mapping-signature` no pacote da biblioteca (formatVersion 16; etapa #1079): a que o
// `code` (ou o caso de `variants`) e a `sources` do tipo citam existe, é uma ficha válida e é a
// do mesmo código (o símbolo e o arquivo batem); e o `params` que a ficha não tem vira aviso.
// Pura: recebe os arquivos já lidos; quem coleta os problemas é o validador (`library.ts`).

export interface SignatureProblem {
  readonly severity: 'error' | 'warning';
  /** Arquivo do problema: a especialização ou a ficha. */
  readonly file: string;
  readonly path: string;
  readonly message: string;
  /** Só o arquivo citado que não existe: o caminho, para a mensagem com código do catálogo. */
  readonly missing?: string;
  /** Código do catálogo de mensagens e os dados da tradução, quando o problema tem. */
  readonly code?: ModelMessageTemplateCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface SignatureCheck {
  readonly problems: readonly SignatureProblem[];
  /** Fichas citadas (caminho resolvido): contam como referenciadas. */
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
  /** Fichas já lidas: o problema de dentro da ficha sai uma vez só. */
  private readonly read = new Map<string, Signature | null>();

  constructor(private readonly reader: Reader) {}

  /** Erro na especialização, com código do catálogo. */
  fail(
    path: string,
    code: ModelMessageTemplateCode,
    params: Record<string, string | number> = {},
  ): void {
    this.add('error', this.reader.specPath, path, code, params);
  }

  /** Todo problema de ficha sai com `code` do catálogo; o `message` é o texto pt-BR dele. */
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
   * A ficha citada em `at`: existe e é válida; `null` com o problema já anotado. O que a ficha
   * tem por dentro sai uma vez só; a ficha que falta (ou não pôde ser lida) sai em cada lugar que
   * a cita. `cited: false` só relê a ficha (a da base, vista do caso), sem contar de novo.
   */
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

  /** Lê a ficha; o que ela tem de errado por dentro sai uma vez só. */
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

  /** Os `params` que a ficha não tem viram aviso. */
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

  /** A ficha do `code` é a da mesma plataforma, símbolo e arquivo, e os `params` estão nela. */
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
    if (source.symbol !== symbol) {
      this.add('error', specPath, where, 'library.signatureSymbolMismatch', {
        found: source.symbol,
        expected: symbol,
      });
    }
    if (path !== undefined && source.path !== path) {
      this.add('error', specPath, where, 'library.signaturePathMismatch', {
        found: source.path,
        expected: path,
      });
    }
    this.params(signature, at, params, models);
  }
}

/**
 * O caso de `variants`: com ficha própria, ela vale para o símbolo e o arquivo do caso e para os
 * `params` da base somados aos do caso (é o que `resolveCode` entrega); sem ela, vale a da base, e
 * só os `params` do caso são conferidos (os da base já foram, no `code`).
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
    if (entry.signature === undefined || kase.params === undefined) return;
    const inherited = checker.open(entry.signature, `${at}.signature`, false);
    if (inherited !== null) checker.params(inherited, at, kase.params, models);
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

/** Confere as fichas que a especialização cita (no `code`, nos casos de `variants` e nas `sources`). */
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
