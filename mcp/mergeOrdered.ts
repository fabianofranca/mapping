// Funde o valor novo no JSON cru mantendo a ordem das chaves do arquivo (o `zod` reordena as da
// raiz): as chaves do cru ficam onde estão, as novas vão para o fim, as que saíram caem. Listas se
// fundem por posição. Serve a `plan_signature_import`, que devolve a especialização no arquivo.

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
