/**
 * Erro de regra de negócio lançado pelas operações puras.
 * O `code` é estável e serve de chave para a mensagem traduzida na UI.
 */
export type ModelErrorCode =
  | 'not-found'
  | 'invalid-name'
  | 'invalid-color'
  | 'invalid-index'
  | 'last-layer'
  | 'invalid-dimensions'
  | 'invalid-placement'
  | 'image-overlap'
  | 'duplicate-file'
  | 'aspect-change-not-confirmed'
  | 'image-too-small'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'rect-outside-parent'
  | 'rect-excludes-children'
  | 'invalid-parent'
  | 'invalid-annotation-parent'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-id'
  // Especializações (PLAN.md 13)
  | 'spec-layer'
  | 'typed-layer'
  | 'typed-annotation'
  | 'not-typed'
  | 'unknown-type'
  | 'type-not-in-layer'
  | 'owner-required'
  | 'unknown-field'
  | 'invalid-value'
  | 'unknown-option'
  | 'self-ref'
  | 'ref-not-accepted'
  | 'spec-already-applied'
  | 'spec-not-newer';

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message?: string,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'ModelError';
  }
}

export function fail(code: ModelErrorCode, message?: string): never {
  throw new ModelError(code, message);
}
