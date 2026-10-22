import type { ModelErrorCode } from '../src/model';

/**
 * Registro dos códigos de erro próprios do servidor (os que aparecem em `new ToolError('…'`).
 * Todo código daqui está documentado em `docs/AGENT-GUIDE.md` ("Erros") ou `docs/MCP.md`, e
 * todo código daqui é usado em `mcp/**` (`tests/mcp/errorCodes.test.ts`). Alguns repetem o
 * nome de um `ModelErrorCode` (`not-found`, `invalid-name`…): o nome é o contrato com os
 * agentes e não muda; a documentação explica os contextos.
 */
export const MCP_ERROR_CODES = [
  'alias-unavailable',
  'already-exists',
  'ambiguous-image',
  'ambiguous-layer',
  'ambiguous-project',
  'ambiguous-ref',
  'ambiguous-type',
  'arrow',
  'container-without-file',
  'duplicate-alias',
  'encode-failed',
  'file-too-large',
  'image-exists',
  'image-file-missing',
  'image-too-large',
  'invalid-alias',
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
  'invalid-title',
  'invalid-value',
  'layer-required',
  'marking-outside-image',
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
  'project-mismatch',
  'project-not-found',
  'proposal-not-found',
  'read-only',
  'revision-conflict',
  'root-required',
  'spec-already-applied',
  'spec-missing-migrations',
  'spec-unavailable',
  'unknown-alias',
  'unknown-field',
  'unknown-platform',
  'unknown-root',
  'unknown-type',
  'unsupported-image',
  'wrong-kind',
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

/** Código de uma falha de tool: um do servidor ou uma regra do modelo (`modelErrors.ts`). */
export type ToolErrorCode = McpErrorCode | ModelErrorCode;

/** Erro esperado de uma tool: vira uma resposta `isError` com o código e os detalhes, sem derrubar o servidor. */
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
