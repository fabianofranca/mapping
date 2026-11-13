import type {
  Spec,
  SpecAnnotationType,
  SpecCode,
  SpecCodeCase,
  SpecTypeSource,
} from '../spec';
import type { ImportErrorCode, PlanSignatureImportOptions } from './importTypes';
import type { Signature } from './types';

// O preparo da importação (etapa #1079, decisões 7 e 9): acha ou cria o `code` da plataforma (ou
// o caso de `variants`) e a `sources` do sistema, confere que a ficha é a do mesmo código e diz
// onde ela fica no pacote. Trabalha numa cópia da especialização. Puro.

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

/** O que a importação grava: o `code` (com o caso, se for o caso) ou a `sources` do sistema. */
export interface Prepared {
  readonly ok: true;
  /** O caminho da ficha no pacote. */
  readonly path: string;
  /** Quem guarda `signature`, `params`, `calls`, `formats` e `values`: o `code`, o caso ou a source. */
  readonly scope: SpecCode | SpecCodeCase | SpecTypeSource;
  readonly code?: SpecCode;
  readonly caseEntry?: SpecCodeCase;
  readonly source?: SpecTypeSource;
  /** O id da plataforma ou do sistema (o prefixo dos avisos e a chave de `fieldModels`). */
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
      `o code do tipo "${type.id}" não tem variants`,
      'declare variants (o campo enum e o caso) no code da plataforma antes de importar a ficha do caso',
    );
  }
  const field = type.fields.find((f) => f.key === variants.field);
  const options = field?.type === 'enum' ? field.options : [];
  if (!options.includes(variant)) {
    return failure(
      'variant-not-found',
      `"${variant}" não é uma opção do campo "${variants.field}" das variants`,
      `use uma das opções: ${options.join(', ')}`,
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
      `o símbolo da ficha ("${source.symbol}") difere do symbol do code ("${symbol}")`,
      'extraia a ficha do símbolo certo, ou corrija o symbol do code se ele é que está errado',
    );
  }
  if (path !== undefined && source.path !== path) {
    return failure(
      'signature-mismatch',
      `o arquivo da ficha ("${source.path}") difere do path do code ("${path}")`,
      'extraia a ficha do arquivo certo, ou corrija o path do code se ele é que está errado',
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
      `a plataforma "${platform}" não está em platforms da especialização`,
      'declare a plataforma em platforms (id, name, language) antes de importar',
    );
  }
  const source = options.signature.source;
  if (source.kind !== 'code') {
    return failure(
      'signature-mismatch',
      'a ficha é de design, mas o alvo é uma plataforma de código',
      'passe system em vez de platform, ou use uma ficha de código',
    );
  }
  if (source.platform === platform) return null;
  return failure(
    'signature-mismatch',
    `a ficha é da plataforma "${source.platform}", mas o alvo é "${platform}"`,
    'importe a ficha na plataforma dela, ou extraia a ficha da plataforma do alvo',
  );
}

/** O `code` da plataforma (criado da ficha, se o tipo não tem) e se foi criado agora. */
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

/** O caso de `variants` pedido (ou nenhum) e a conferência do símbolo e do arquivo. */
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
      'variant só vale para um alvo de código (platform)',
      'tire o variant',
    );
  }
  if (origin.kind === 'design' && origin.system === system) return null;
  return failure(
    'signature-mismatch',
    origin.kind === 'design'
      ? `o sistema da ficha ("${origin.system}") difere do alvo ("${system}")`
      : 'a ficha é de código, mas o alvo é um sistema de design',
    'passe platform em vez de system, ou use a ficha de design do sistema',
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
      `o id da ficha ("${origin.id}") difere do id da source do tipo ("${source.id}")`,
      'extraia a ficha do nó certo, ou corrija o id da source do tipo',
    );
  }
  const path =
    options.signaturePath ?? source.signature ?? `signatures/${type.id}.${system}.json`;
  source.signature = path;
  return { ok: true, path, scope: source, source, id: system };
}

/** Prepara o tipo (já numa cópia) para receber a importação, ou diz por que não dá. */
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
