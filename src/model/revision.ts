// Revision of `mapping.json` (schema v6): whoever writes (app or MCP) checks that the file on
// disk still has the revision it loaded and writes `revision + 1`. Pure functions, no DOM or Node.

/**
 * Revision written in the text of a `mapping.json`: the file's `revision`, `0` for a file
 * without the field (schema before v6, which the migration also loads as `0`) and `null`
 * if the text is not a JSON object (unreadable, or half-written by another program).
 */
export function readRevision(text: string): number | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const revision: unknown = Reflect.get(raw, 'revision');
    if (revision === undefined) return 0;
    return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
      ? revision
      : null;
  } catch {
    // Text that is not JSON: the caller treats `null` as "changed outside".
    return null;
  }
}
