import { memoByProject } from './projectIndex';
import { findSpecType } from './specLookup';
import type { Project } from './types';

// Tipo estrutural (etapa #747, CF8; `structural: true` na especialização, `formatVersion` 15): o
// tipo agrupa e não desenha. A marcação dele não mostra o cabeçalho com o nome e, como as que
// têm desenho, só mostra o contorno com o mouse ou selecionada.

const NONE: ReadonlySet<string> = new Set();

/**
 * Marcações com alguma anotação tipada própria cujo tipo é estrutural. Memoizado por versão do
 * projeto (o objeto imutável).
 */
export const structuralMarkingIds: (p: Project) => ReadonlySet<string> = memoByProject(
  (p) => {
    const ids = new Set<string>();
    for (const annotation of p.annotations) {
      if (annotation.type === null || annotation.values === null) continue;
      if (findSpecType(p, annotation.type)?.type.structural === true) {
        ids.add(annotation.markingId);
      }
    }
    return ids.size === 0 ? NONE : ids;
  },
);
