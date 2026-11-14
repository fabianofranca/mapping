/**
 * Business-rule error thrown by the pure operations.
 * The `code` is stable and serves as the key for the message translated in the UI.
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
  | 'container-density'
  | 'aspect-change-not-confirmed'
  | 'image-too-small'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'rect-outside-parent'
  | 'invalid-parent'
  // Marking space (Spatial markings stage): the floating one lives only on the canvas
  | 'invalid-space'
  | 'invalid-annotation-parent'
  // Arrows (v13, ME4): they link markings, never another arrow or container
  | 'arrow-endpoint'
  | 'arrow-self'
  | 'invalid-arrow-route'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-id'
  // Lock (stage 2.5)
  | 'locked'
  // Specializations (docs/SPEC-FORMAT.md)
  | 'spec-layer'
  | 'typed-layer'
  | 'typed-annotation'
  | 'not-typed'
  | 'unknown-type'
  | 'type-not-in-layer'
  // The type does not apply to the owner (appliesTo: marking or arrow, ME4)
  | 'type-not-applicable'
  | 'owner-required'
  // Role in the link (v14)
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
  // Repositories per platform (stage 3b)
  | 'unknown-platform'
  | 'invalid-local-path'
  | 'unknown-doc-repo'
  // Change proposals (stage 4)
  | 'invalid-source'
  // Components (Library stage)
  | 'not-arrangeable'
  | 'not-fittable'
  // Marking anchor (v20): `setMarkingAnchor` and `snapToAnchor`
  | 'anchor-missing'
  | 'anchor-self'
  | 'anchor-cycle'
  | 'anchor-other-space'
  | 'not-anchored'
  // Perspectives (v16): the name is empty or repeated; the id is not a root's
  | 'perspective-name-empty'
  | 'perspective-name-taken'
  | 'not-root';

/**
 * Structured facts that some errors carry (a plain, serializable object). The model keeps
 * facts (received size, minimum, id of another container); whoever presents the error (UI, MCP)
 * chooses the text and swaps ids for references.
 */
export type ModelErrorData = Readonly<Record<string, unknown>>;

/** `data` of `rect-too-small`: the received size, the minimum that applied and where it came from. */
export type RectTooSmallData = {
  readonly received: { readonly width: number; readonly height: number };
  readonly min: { readonly width: number; readonly height: number };
  /** `marking`: the minimum of any marking; `component`: the component's `minSize`. */
  readonly source: 'marking' | 'component';
};

/** `data` of `image-overlap`: the container it overlaps with (the other one, not the one being moved). */
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
