import { projectIndex, type ProjectIndex } from './projectIndex';
import type { Marking, Project } from './types';

// Fim do assentar: a âncora exige o mesmo espaço (`anchor-other-space`). Quando a geometria
// deixa a ancorada e o alvo em espaços diferentes, a relação é solta (`anchor: null`). Não
// mexe em `parentId` (a âncora não entra no pertencimento) e devolve o mesmo projeto quando
// nada é solto.

/** Ids de quem está ancorado num alvo de outro espaço, olhando `ids` e as ancoradas neles. */
function stranded(
  p: Project,
  ids: Iterable<string>,
  was: ProjectIndex | null,
): Set<string> {
  const index = projectIndex(p);
  const out = new Set<string>();
  const check = (id: string): void => {
    const m = index.markings.get(id);
    const to = m?.anchor?.to;
    if (m === undefined || to === undefined) return;
    const target = index.markings.get(to);
    if (target !== undefined && target.containerId !== m.containerId) out.add(id);
  };
  for (const id of ids) {
    check(id);
    for (const f of was?.anchoredBy.get(id) ?? []) check(f.id);
  }
  return out;
}

/**
 * Solta a âncora de quem ficou noutro espaço que o alvo. `touched` são as posições (em
 * `p.markings`) das marcações que a operação mexeu; `null` confere o projeto inteiro (só as
 * ancoradas). Com `touched`, o índice de `before` dá as ancoradas de cada alvo mexido, e o de `p`
 * só é montado quando alguma marcação mexida tem relação de âncora.
 */
export function releaseStrandedAnchors(
  p: Project,
  touched: readonly number[] | null,
  before: Project,
): Project {
  let ids: Iterable<string>;
  let was: ProjectIndex | null = null;
  if (touched === null) {
    ids = projectIndex(p).anchorOf.keys();
  } else {
    const idx = projectIndex(before);
    const list: string[] = [];
    for (const i of touched) {
      const m = p.markings[i];
      if (m === undefined) continue;
      if (m.anchor != null || idx.anchorOf.has(m.id) || idx.anchoredBy.has(m.id)) {
        list.push(m.id);
      }
    }
    if (list.length === 0) return p;
    ids = list;
    was = idx;
  }
  const out = stranded(p, ids, was);
  if (out.size === 0) return p;
  const markings = p.markings.map((m): Marking =>
    out.has(m.id) ? { ...m, anchor: null } : m,
  );
  return { ...p, markings };
}
