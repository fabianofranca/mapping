import type { Spec, SpecCode, SpecCodeCase } from './spec';
import {
  paramsOutsideSignature,
  parseSignatureText,
  type ExpandModels,
  type Signature,
} from './signatures';
import type { ModelMessageTemplateCode } from './messages';

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

  private add(
    severity: 'error' | 'warning',
    file: string,
    path: string,
    message: string,
    missing?: string,
    coding?: { code: ModelMessageTemplateCode; params: Record<string, string | number> },
  ): void {
    this.problems.push({
      severity,
      file,
      path,
      message,
      ...(missing === undefined ? {} : { missing }),
      ...(coding ?? {}),
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
        const missing = entry === undefined;
        const message = missing
          ? `arquivo não encontrado: ${file}`
          : `arquivo não pôde ser lido: ${file}`;
        this.add('error', specPath, at, message, missing ? file : undefined);
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
    else for (const i of parsed.issues) this.add('error', file, i.path, i.message);
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
        `parâmetro fora da ficha: "${outside.name}"`,
        undefined,
        { code: 'library.paramOutsideSignature', params: { name: outside.name } },
      );
    }
  }

  /** A ficha do `code` é a do mesmo símbolo e arquivo, e os `params` estão nela. */
  code(
    signature: Signature,
    at: string,
    symbol: string,
    path: string | undefined,
    params: Readonly<Record<string, string>> | undefined,
    models?: ExpandModels,
  ): void {
    const { specPath } = this.reader;
    const source = signature.source;
    if (source.kind !== 'code') {
      this.add(
        'error',
        specPath,
        `${at}.signature`,
        'a ficha do code precisa ser de código',
      );
      return;
    }
    if (source.symbol !== symbol) {
      this.add(
        'error',
        specPath,
        `${at}.signature`,
        `o símbolo da ficha ("${source.symbol}") difere do symbol do code ("${symbol}")`,
      );
    }
    if (path !== undefined && source.path !== path) {
      this.add(
        'error',
        specPath,
        `${at}.signature`,
        `o arquivo da ficha ("${source.path}") difere do path do code ("${path}")`,
      );
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
            checker.code(signature, at, entry.symbol, entry.path, entry.params, models);
          }
        }
        for (const [value, kase] of Object.entries(entry.variants?.cases ?? {})) {
          checkCase(checker, entry, kase, `${at}.variants.cases.${value}`, models);
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
          checker.problems.push({
            severity: 'error',
            file: reader.specPath,
            path: `${at}.signature`,
            message: `a ficha precisa ser de design do sistema "${source.system}"`,
          });
        }
      });
    });
  });
  return { problems: checker.problems, referenced: checker.referenced };
}
