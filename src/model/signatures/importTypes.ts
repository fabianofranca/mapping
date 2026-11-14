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

// The types of the `planSignatureImport` importer (stage #1079, decisions 7, 8, 9 and 12). Types only.

/** The import target: a code platform or a design system. */
export type SignatureTarget = { readonly platform: string } | { readonly system: string };

export interface PlanSignatureImportOptions {
  /** The annotation type's id. */
  readonly type: string;
  readonly target: SignatureTarget;
  /** Value of the `enum` field of `code.<platform>.variants`: the sheet is the case's (decision 9). */
  readonly variant?: string;
  readonly signature: Signature;
  /** The sheet stored in the package, for synchronization (decision 12). */
  readonly previous?: Signature;
  /** Where the sheet lives in the package; the default is `signatures/<type>[.<case>].<platform or system>.json`. */
  readonly signaturePath?: string;
}

export type ImportErrorCode =
  | 'type-not-found'
  | 'platform-not-declared'
  | 'signature-mismatch'
  | 'variant-not-found'
  | 'spec-version';

/** How the parameter got linked to the field: already cited, by name or a new field (decision 7). */
export type ImportLinkVia = 'params' | 'name' | 'new';

export interface ImportLink {
  /** What the `params` says: the name, `factory.name` or `#n`. */
  readonly param: string;
  readonly field: string;
  readonly via: ImportLinkVia;
}

/** A notice the importer wrote (all carry `ref` = the sheet's path). */
export interface ImportNotice {
  /** `type` or the field's key. */
  readonly at: 'type' | { readonly field: string };
  readonly kind: SpecNoticeKind;
  readonly message: string;
  readonly ref: string;
}

export type ImportChangeKind = 'added' | 'removed' | 'changed' | 'renamed';

/** A difference between the stored sheet and the new one, per parameter (`factory.name` for composites). */
export interface ImportChange {
  readonly kind: ImportChangeKind;
  readonly param: string;
  /** `changed`: what changed. */
  readonly aspect?: 'type' | 'default' | 'kind' | 'options' | 'required';
  readonly from?: string;
  readonly to?: string;
}

export interface SignatureImportPlan {
  /** The whole specialization, already imported. */
  readonly spec: Spec;
  /** The imported type (fields, `code` or `sources`, and notices). */
  readonly type: SpecAnnotationType;
  /** Where the sheet must live in the package (the `signature` of the `code` or the `sources`). */
  readonly signaturePath: string;
  /** The fields the import created, as ready-made JSON. */
  readonly fields: readonly SpecField[];
  readonly links: readonly ImportLink[];
  /** The resulting platform `code` (code target). */
  readonly code?: SpecCode;
  /** The resulting `sources` of the type (design target). */
  readonly sources?: readonly SpecTypeSource[];
  readonly notices: readonly ImportNotice[];
  /** The sheet's parameters without a field (the `unmapped` of `get_code_hints`). */
  readonly unmapped: readonly UnmappedParam[];
  readonly changes: readonly ImportChange[];
  readonly suggestedMigrations: readonly SpecMigrationStep[];
  /** The contract changed (new field or option): the agent bumps the `version`. */
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
