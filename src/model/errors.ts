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
  | 'container-without-file'
  | 'container-has-file'
  | 'aspect-change-not-confirmed'
  | 'image-too-small'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'rect-outside-parent'
  | 'invalid-parent'
  // Espaço da marcação (etapa Marcações espaciais): a flutuante vive só no canvas
  | 'invalid-space'
  | 'invalid-annotation-parent'
  // Setas (v13, ME4): ligam marcações, nunca outra seta nem container
  | 'arrow-endpoint'
  | 'arrow-self'
  | 'invalid-arrow-route'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-id'
  // Trava (etapa 2.5)
  | 'locked'
  // Especializações (docs/SPEC-FORMAT.md)
  | 'spec-layer'
  | 'typed-layer'
  | 'typed-annotation'
  | 'not-typed'
  | 'unknown-type'
  | 'type-not-in-layer'
  // O tipo não se aplica à dona (appliesTo: marcação ou seta, ME4)
  | 'type-not-applicable'
  | 'owner-required'
  // Papel no vínculo (v14)
  | 'unknown-role'
  | 'role-without-owner'
  | 'unknown-field'
  | 'invalid-value'
  | 'unknown-option'
  | 'self-ref'
  | 'ref-not-accepted'
  | 'spec-already-applied'
  | 'spec-not-newer'
  | 'spec-missing-migrations'
  // Repositórios por plataforma (etapa 3b)
  | 'unknown-platform'
  | 'invalid-local-path'
  | 'unknown-doc-repo'
  // Propostas de alteração (etapa 4)
  | 'invalid-source'
  // Componentes (etapa Biblioteca)
  | 'not-arrangeable'
  // Perspectivas (v16): o nome é vazio ou repetido; o id não é de uma raiz
  | 'perspective-name-empty'
  | 'perspective-name-taken'
  | 'not-root';

/**
 * Fatos estruturados que alguns erros carregam (objeto simples e serializável). O modelo guarda
 * fatos (tamanho recebido, mínimo, id de outro container); quem apresenta o erro (UI, MCP) escolhe
 * o texto e troca ids por referências.
 */
export type ModelErrorData = Readonly<Record<string, unknown>>;

/** `data` de `rect-too-small`: o tamanho recebido, o mínimo que valeu e de onde ele veio. */
export type RectTooSmallData = {
  readonly received: { readonly width: number; readonly height: number };
  readonly min: { readonly width: number; readonly height: number };
  /** `marking`: o mínimo de qualquer marcação; `component`: o `minSize` do componente. */
  readonly source: 'marking' | 'component';
};

/** `data` de `image-overlap`: o container com que há sobreposição (o outro, não o que se move). */
export type ImageOverlapData = {
  readonly containerId: string;
};

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message?: string,
    readonly data?: ModelErrorData,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'ModelError';
  }
}

export function fail(
  code: ModelErrorCode,
  message?: string,
  data?: ModelErrorData,
): never {
  throw new ModelError(code, message, data);
}
