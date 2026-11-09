// Pequenas peças repetidas em `mcp/` e agora num lugar só (CR do MCP, achado 46).

/** Um id curto ou completo informado como texto solto (sem `mapping://`): letras, dígitos, `.`, `_` e `-`. */
export const BARE_ID = /^[0-9a-zA-Z][0-9a-zA-Z._-]*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ordem de criação: por `createdAt` e, empatando, pelo id. */
export function compareByCreated(
  a: { readonly createdAt: string; readonly id: string },
  b: { readonly createdAt: string; readonly id: string },
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** O motivo de um erro de sistema de arquivos: o `code` (`EPERM`…) ou a mensagem. */
export function failureReason(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  return error instanceof Error ? error.message : String(error);
}

/** Aviso de melhor esforço no stderr (nunca decide o resultado de uma tool). */
export function warnStderr(message: string): void {
  process.stderr.write(`mapping-mcp: aviso: ${message}\n`);
}
