/** Erro esperado de uma tool: vira uma resposta `isError` com o código e os detalhes, sem derrubar o servidor. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
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
