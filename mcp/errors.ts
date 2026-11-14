import type { ModelErrorCode } from '../src/model';

/**
 * Registry of the server's own error codes (the ones that appear in `new ToolError('…'`).
 * Every code here is documented in `docs/AGENT-GUIDE.md` ("Errors") or `docs/MCP.md`, and
 * every code here is used in `mcp/**` (`tests/mcp/errorCodes.test.ts`). Some repeat the
 * name of a `ModelErrorCode` (`not-found`, `invalid-name`…): the name is the contract with
 * agents and does not change; the documentation explains the contexts.
 */
export const MCP_ERROR_CODES = [
  'alias-unavailable',
  'already-exists',
  'ambiguous-image',
  'ambiguous-layer',
  'ambiguous-project',
  'ambiguous-ref',
  'ambiguous-type',
  'anchor-not-found',
  'arrow',
  'cancelled',
  'canvas-marking',
  'change-frozen',
  'change-not-found',
  'container-without-file',
  'duplicate-alias',
  'empty-message',
  'encode-failed',
  'file-too-large',
  'image-exists',
  'image-file-missing',
  'image-too-large',
  'invalid-alias',
  'invalid-anchor',
  'invalid-arguments',
  'invalid-base64',
  'invalid-image',
  'invalid-image-source',
  'invalid-library',
  'invalid-name',
  'invalid-path',
  'invalid-project',
  'invalid-proposal',
  'invalid-ref',
  'invalid-ref-value',
  'invalid-spec',
  'invalid-thread',
  'invalid-title',
  'invalid-value',
  'layer-required',
  'marking-outside-image',
  'message-too-long',
  'missing-query',
  'nested-project',
  'no-changes',
  'not-a-file',
  'not-found',
  'not-open',
  'nothing-to-change',
  'outside-roots',
  'package-too-large',
  'path-not-found',
  'platform-not-declared',
  'project-mismatch',
  'project-not-found',
  'proposal-applied',
  'proposal-not-applicable',
  'proposal-not-found',
  'read-only',
  'revise-unsupported',
  'revision-conflict',
  'root-required',
  'signature-invalid',
  'signature-mismatch',
  'spec-already-applied',
  'spec-missing-migrations',
  'spec-unavailable',
  'stale-thread',
  'thread-not-found',
  'thread-resolved',
  'type-not-found',
  'unknown-alias',
  'unknown-field',
  'unknown-platform',
  'unknown-root',
  'unknown-type',
  'unsupported-image',
  'variant-not-found',
  'wrong-kind',
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

/** Code of a tool failure: one of the server's or a model rule's (`modelErrors.ts`). */
export type ToolErrorCode = McpErrorCode | ModelErrorCode;

/** Expected error of a tool: becomes an `isError` response with the code and details, without bringing the server down. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ToolError';
  }

  toJSON(): { error: Record<string, unknown> } {
    return { error: { code: this.code, message: this.message, ...this.details } };
  }
}
