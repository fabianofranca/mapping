// Entradas inválidas para a guarda de mensagens do modelo (etapa #1263, decisão 15): parte de
// documentos válidos (as fixtures e a biblioteca Material 3) e os estraga de forma sistemática,
// em vez de repetir os casos soltos de cada teste de modelo. Cada estrago troca UM valor da
// árvore (apaga, nulo, número, texto, lista, objeto) ou acrescenta uma chave desconhecida.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Json = unknown;
type Path = (string | number)[];

const FIXTURES = join(__dirname, '../fixtures');
export const readFixture = (path: string): string =>
  readFileSync(join(FIXTURES, path), 'utf8');

/** Todos os caminhos da árvore (folhas e nós internos), na ordem do documento. */
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

/** Os estragos de um valor: troca por cada `REPLACEMENTS`, remoção e chave desconhecida. */
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

/** Os documentos estragados de `root`, no máximo `limit` caminhos (espaçados de modo uniforme). */
export function brokenDocuments(root: Json, limit: number): Json[] {
  const paths = jsonPaths(root);
  const stride = Math.max(1, Math.ceil(paths.length / limit));
  return paths.filter((_, i) => i % stride === 0).flatMap((path) => breakAt(root, path));
}
