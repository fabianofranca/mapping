// Merges the new value into the raw JSON keeping the file's key order (`zod` reorders the root's
// keys): the raw keys stay where they are, the new ones go to the end, the ones that left drop out.
// Lists merge by position. Serves `plan_signature_import`, which returns the specialization in the file.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function mergeOrdered(raw: unknown, next: unknown): unknown {
  if (Array.isArray(next)) {
    const old = Array.isArray(raw) ? raw : [];
    return next.map((item, index) => mergeOrdered(old[index], item));
  }
  if (!isObject(next)) return next;
  const old = isObject(raw) ? raw : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(old)) {
    if (Object.hasOwn(next, key)) out[key] = mergeOrdered(old[key], next[key]);
  }
  for (const key of Object.keys(next)) {
    if (!Object.hasOwn(out, key)) out[key] = next[key];
  }
  return out;
}
