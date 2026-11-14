// Invalid inputs for the model message guard (stage #1263, decision 15): start from
// valid documents (the fixtures and the Material 3 library) and spoil them systematically,
// instead of repeating the loose cases of each model test. Each spoil replaces ONE value of the
// tree (deletes, null, number, text, list, object) or adds an unknown key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Json = unknown;
type Path = (string | number)[];

const FIXTURES = join(__dirname, '../fixtures');
export const readFixture = (path: string): string =>
  readFileSync(join(FIXTURES, path), 'utf8');

/** All the paths of the tree (leaves and inner nodes), in document order. */
export function jsonPaths(value: Json, base: Path = []): Path[] {
  const out: Path[] = [];
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, Json>)) {
      const path = [...base, Array.isArray(value) ? Number(key) : key];
      out.push(path, ...jsonPaths(child, path));
    }
  }
  return out;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parentOf(root: Json, path: Path): Record<string | number, Json> {
  let node = root as Record<string | number, Json>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, Json>;
  return node;
}

const REPLACEMENTS: readonly Json[] = [null, 12345, -1, '', 'x?', [], {}, true];

/** The spoils of a value: replacement by each `REPLACEMENTS`, removal and unknown key. */
export function breakAt(root: Json, path: Path): Json[] {
  const key = path[path.length - 1] as string | number;
  const broken: Json[] = [];
  for (const replacement of REPLACEMENTS) {
    const copy = clone(root);
    parentOf(copy, path)[key] = clone(replacement);
    broken.push(copy);
  }
  const removed = clone(root);
  const parent = parentOf(removed, path);
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else delete parent[key];
  broken.push(removed);
  const target = clone(root);
  const node = parentOf(target, path)[key];
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    (node as Record<string, Json>).__desconhecida = 1;
    broken.push(target);
  }
  return broken;
}

/** The spoiled documents of `root`, at most `limit` paths (evenly spaced). */
export function brokenDocuments(root: Json, limit: number): Json[] {
  const paths = jsonPaths(root);
  const stride = Math.max(1, Math.ceil(paths.length / limit));
  return paths.filter((_, i) => i % stride === 0).flatMap((path) => breakAt(root, path));
}
