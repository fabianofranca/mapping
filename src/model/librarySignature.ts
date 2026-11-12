import type { Spec, SpecCode, SpecCodeCase } from './spec';
import { paramsOutsideSignature, parseSignatureText, type Signature } from './signatures';

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
  ): void {
    this.problems.push({
      severity,
      file,
      path,
      message,
      ...(missing === undefined ? {} : { missing }),
    });
  }

  /** A ficha citada em `at`: existe e é válida; `null` com o problema já anotado. */
  open(ref: string, at: string): Signature | null {
    const { specPath, resolve, byPath } = this.reader;
    const file = resolve(ref);
    this.referenced.push(file);
    if (this.read.has(file)) return this.read.get(file) ?? null;
    const entry = byPath.get(file);
    let signature: Signature | null = null;
    if (entry === undefined) {
      this.add('error', specPath, at, `arquivo não encontrado: ${file}`, file);
    } else if (entry.text !== undefined) {
      const parsed = parseSignatureText(entry.text);
      if (parsed.ok) signature = parsed.signature;
      else for (const i of parsed.issues) this.add('error', file, i.path, i.message);
    }
    this.read.set(file, signature);
    return signature;
  }

  /** A ficha do `code` é a do mesmo símbolo e arquivo, e os `params` estão nela. */
  code(
    signature: Signature,
    at: string,
    symbol: string,
    path: string | undefined,
    params: Readonly<Record<string, string>> | undefined,
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
    for (const outside of paramsOutsideSignature(signature, { params })) {
      this.add(
        'warning',
        specPath,
        `${at}.params.${outside.field}`,
        `parâmetro fora da ficha: "${outside.name}"`,
      );
    }
  }
}

function checkCase(
  checker: Checker,
  entry: SpecCode,
  kase: SpecCodeCase,
  at: string,
): void {
  if (kase.signature === undefined) return;
  const signature = checker.open(kase.signature, `${at}.signature`);
  if (signature === null) return;
  checker.code(signature, at, kase.symbol ?? entry.symbol, kase.path ?? entry.path, {
    ...kase.params,
  });
}

/** Confere as fichas que a especialização cita (no `code`, nos casos de `variants` e nas `sources`). */
export function checkSignatures(spec: Spec, reader: Reader): SignatureCheck {
  const checker = new Checker(reader);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp = `layers[${li}].annotationTypes[${ti}]`;
      for (const [platform, entry] of Object.entries(type.code ?? {})) {
        const at = `${tp}.code.${platform}`;
        if (entry.signature !== undefined) {
          const signature = checker.open(entry.signature, `${at}.signature`);
          if (signature !== null) {
            checker.code(signature, at, entry.symbol, entry.path, entry.params);
          }
        }
        for (const [value, kase] of Object.entries(entry.variants?.cases ?? {})) {
          checkCase(checker, entry, kase, `${at}.variants.cases.${value}`);
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
