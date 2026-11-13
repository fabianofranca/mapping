import type {
  Spec,
  SpecAnnotationType,
  SpecCode,
  SpecField,
  SpecMigrationStep,
  SpecNoticeKind,
  SpecTypeSource,
} from '../spec';
import type { UnmappedParam } from './codeLink';
import type { Signature } from './types';

// Os tipos do importador `planSignatureImport` (etapa #1079, decisões 7, 8, 9 e 12). Só tipos.

/** O alvo da importação: uma plataforma de código ou um sistema de design. */
export type SignatureTarget = { readonly platform: string } | { readonly system: string };

export interface PlanSignatureImportOptions {
  /** Id do tipo de anotação. */
  readonly type: string;
  readonly target: SignatureTarget;
  /** Valor do campo `enum` de `code.<plataforma>.variants`: a ficha é a do caso (decisão 9). */
  readonly variant?: string;
  readonly signature: Signature;
  /** A ficha gravada no pacote, para a sincronização (decisão 12). */
  readonly previous?: Signature;
  /** Onde a ficha fica no pacote; o padrão é `signatures/<tipo>[.<caso>].<plataforma ou sistema>.json`. */
  readonly signaturePath?: string;
}

export type ImportErrorCode =
  | 'type-not-found'
  | 'platform-not-declared'
  | 'signature-mismatch'
  | 'variant-not-found'
  | 'spec-version';

/** Como o parâmetro ficou ligado ao campo: já citado, pelo nome ou campo novo (decisão 7). */
export type ImportLinkVia = 'params' | 'name' | 'new';

export interface ImportLink {
  /** O que o `params` diz: o nome, `fábrica.nome` ou `#n`. */
  readonly param: string;
  readonly field: string;
  readonly via: ImportLinkVia;
}

/** Aviso que o importador escreveu (todos levam `ref` = o caminho da ficha). */
export interface ImportNotice {
  /** `type` ou a chave do campo. */
  readonly at: 'type' | { readonly field: string };
  readonly kind: SpecNoticeKind;
  readonly message: string;
  readonly ref: string;
}

export type ImportChangeKind = 'added' | 'removed' | 'changed' | 'renamed';

/** Uma diferença entre a ficha gravada e a nova, por parâmetro (`fábrica.nome` nos compostos). */
export interface ImportChange {
  readonly kind: ImportChangeKind;
  readonly param: string;
  /** `changed`: o que mudou. */
  readonly aspect?: 'type' | 'default' | 'kind' | 'options' | 'required';
  readonly from?: string;
  readonly to?: string;
}

export interface SignatureImportPlan {
  /** A especialização inteira, já importada. */
  readonly spec: Spec;
  /** O tipo importado (campos, `code` ou `sources` e avisos). */
  readonly type: SpecAnnotationType;
  /** Onde a ficha precisa ficar no pacote (o `signature` do `code` ou da `sources`). */
  readonly signaturePath: string;
  /** Os campos que a importação criou, em JSON pronto. */
  readonly fields: readonly SpecField[];
  readonly links: readonly ImportLink[];
  /** O `code` da plataforma resultante (alvo de código). */
  readonly code?: SpecCode;
  /** As `sources` do tipo resultantes (alvo de design). */
  readonly sources?: readonly SpecTypeSource[];
  readonly notices: readonly ImportNotice[];
  /** Os parâmetros da ficha sem campo (o `unmapped` do `get_code_hints`). */
  readonly unmapped: readonly UnmappedParam[];
  readonly changes: readonly ImportChange[];
  readonly suggestedMigrations: readonly SpecMigrationStep[];
  /** O contrato mudou (campo ou opção nova): o agente sobe a `version`. */
  readonly versionBump: boolean;
}

export type PlanSignatureImportResult =
  | { readonly ok: true; readonly plan: SignatureImportPlan }
  | {
      readonly ok: false;
      readonly code: ImportErrorCode;
      readonly detail: string;
      readonly hint: string;
    };
