import { findSpecType } from './specLookup';
import type { Project } from './types';

// Tipo estrutural (etapa #747, CF8; `structural: true` na especialização, `formatVersion` 15): o
// tipo agrupa e não desenha. A marcação dele não mostra o cabeçalho com o nome e, como as que
// têm desenho, só mostra o contorno com o mouse ou selecionada.

const cache = new WeakMap<Project, ReadonlySet<string>>();
const NONE: ReadonlySet<string> = new Set();

/**
 * Marcações com alguma anotação tipada própria cujo tipo é estrutural. Memoizado por versão do
 * projeto (o objeto imutável).
 */
export function structuralMarkingIds(p: Project): ReadonlySet<string> {
  const hit = cache.get(p);
  if (hit !== undefined) return hit;
  const ids = new Set<string>();
  for (const annotation of p.annotations) {
    if (annotation.type === null || annotation.values === null) continue;
    if (findSpecType(p, annotation.type)?.type.structural === true) {
      ids.add(annotation.markingId);
    }
  }
  const result = ids.size === 0 ? NONE : ids;
  cache.set(p, result);
  return result;
}

/** A marcação tem anotação de tipo estrutural? */
export function isStructuralMarking(p: Project, markingId: string): boolean {
  return structuralMarkingIds(p).has(markingId);
}
