// Small pieces that were repeated across `mcp/` and now live in one place (MCP code review, finding 46).

/** A short or full id given as loose text (without `mapping://`): letters, digits, `.`, `_` and `-`. */
export const BARE_ID = /^[0-9a-zA-Z][0-9a-zA-Z._-]*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Creation order: by `createdAt` and, on a tie, by id. */
export function compareByCreated(
  a: { readonly createdAt: string; readonly id: string },
  b: { readonly createdAt: string; readonly id: string },
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The reason for a file system error: the `code` (`EPERM`…) or the message. */
export function failureReason(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  return error instanceof Error ? error.message : String(error);
}

/** Best-effort warning on stderr (never decides the result of a tool). */
export function warnStderr(message: string): void {
  process.stderr.write(`mapping-mcp: warning: ${message}\n`);
}
