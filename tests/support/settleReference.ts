import {
  IDENTITY_PLACEMENT,
  area,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
} from '../../src/model/geometry';
import { clearArrowRoutes } from '../../src/model/hierarchySettle';
import { reconcilePerspectives } from '../../src/model/perspectiveReconcile';
import { projectIndex } from '../../src/model/projectIndex';
import type {
  Marking,
  Placement,
  Project,
  ProjectContainer,
  Rect,
} from '../../src/model/types';
import type { Size } from '../../src/model/geometry';

/**
 * REFERÊNCIA CONGELADA DA EQUIVALÊNCIA (#882, decisão 1). Cópia literal do assentar de
 * `src/model/hierarchySettle.ts` como era antes do índice espacial (commit c0365b0): varre o espaço
 * inteiro para cada marcação (O(k²)). NÃO SE EDITA: o teste de equivalência
 * (`tests/model/settleEquivalence.test.ts`) compara a implementação nova com ela, e é isso que
 * prova que a otimização não mudou nenhum resultado, empate incluído. Só `settleIf`/`settleFrom`
 * e as funções públicas de consulta ficam fora; `clearArrowRoutes` é importada porque não mudou.
 */

interface SettleOptions {
  readonly settle?: boolean;
  readonly minSizeOf?: (markingId: string) => Size | null;
  readonly before?: Project;
}

interface Space {
  readonly containerId: string | null;
  readonly placement: Placement;
  readonly bounds: Rect | null;
}

const CANVAS_SPACE: Space = {
  containerId: null,
  placement: IDENTITY_PLACEMENT,
  bounds: null,
};

function containerSpace(container: ProjectContainer): Space {
  return {
    containerId: container.id,
    placement: container.placement,
    bounds: imagePixelRect(container),
  };
}

function containerContaining(p: Project, canvas: Rect): ProjectContainer | null {
  for (const c of p.containers) {
    if (containsRectApprox(imageCanvasRect(c, c.placement), canvas)) return c;
  }
  return null;
}

/** Marcação de um espaço com o índice dela no array `markings`. */
interface Entry {
  readonly m: Marking;
  readonly i: number;
}

/**
 * Pode `outer` (posto `ro`) ser o pai de `inner` (posto `ri`)? Contém e é maior, ou é igual e
 * vem antes na ordem dos retângulos iguais (`equalRectRanks`). Uma ordem estrita: nunca há ciclo.
 */
function canContain(outer: Rect, ro: number, inner: Rect, ri: number): boolean {
  if (!containsRect(outer, inner)) return false;
  const ao = area(outer);
  const ai = area(inner);
  return ao > ai || (ao === ai && ro < ri);
}

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/** O pai atual de `e` é uma das marcações de `ids` que ainda não foi posta na ordem? */
function waitsForParent(e: Entry, ids: ReadonlySet<string>, done: ReadonlySet<string>) {
  const parent = e.m.parentId;
  return parent !== null && ids.has(parent) && !done.has(parent);
}

/**
 * Ordem de fora para dentro de um grupo de retângulos iguais (em ordem de array): a ordenação
 * topológica dos `parentId` atuais dentro do grupo (o pai antes do filho) e, entre as livres
 * ao mesmo tempo, a que vem antes no array. Quem não tem pai no grupo (nova, ou que chegou
 * agora ao retângulo) entra pelo array, como antes. `parentId` em ciclo (arquivo inválido) é
 * quebrado pela primeira do array. Total e sem ciclo.
 */
function chainOrder(bucket: readonly Entry[]): Entry[] {
  const ids = new Set(bucket.map((e) => e.m.id));
  const done = new Set<string>();
  const pending = [...bucket];
  const out: Entry[] = [];
  while (pending.length > 0) {
    const free = pending.findIndex((e) => !waitsForParent(e, ids, done));
    const [next] = pending.splice(Math.max(free, 0), 1) as [Entry];
    done.add(next.m.id);
    out.push(next);
  }
  return out;
}

/**
 * Posto de cada marcação de um espaço: o índice no array, salvo nos grupos de retângulos
 * iguais, onde as do grupo trocam de lugar entre si na ordem de `chainOrder`. Assim
 * reordenar irmãs (que só troca índices) não muda quem é a de fora.
 */
function equalRectRanks(group: readonly Entry[], ranks: Map<string, number>): void {
  const buckets = new Map<string, Entry[]>();
  for (const e of group) {
    ranks.set(e.m.id, e.i);
    const key = rectKey(e.m.rect);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    chainOrder(bucket).forEach((e, k) => ranks.set(e.m.id, (bucket[k] as Entry).i));
  }
}

/**
 * As candidatas de menor área, com só a de dentro (maior posto) de cada grupo de retângulos
 * iguais.
 */
function innermostOfLeast(
  candidates: readonly Entry[],
  rankOf: (id: string) => number,
): Entry[] {
  let least = Infinity;
  for (const c of candidates) least = Math.min(least, area(c.m.rect));
  const innermost = new Map<string, Entry>();
  for (const c of candidates) {
    if (area(c.m.rect) !== least) continue;
    const key = rectKey(c.m.rect);
    const seen = innermost.get(key);
    if (!seen || rankOf(c.m.id) > rankOf(seen.m.id)) innermost.set(key, c);
  }
  return [...innermost.values()];
}

/**
 * Entre as candidatas que contêm (todas válidas pela geometria), o pai: das de menor área
 * (`innermostOfLeast`), o pai atual, se é uma delas; senão, a de maior posto (a que vem
 * depois no array).
 */
function pickParent(
  candidates: readonly Entry[],
  current: string | null,
  rankOf: (id: string) => number,
): string | null {
  let best: Entry | null = null;
  for (const c of innermostOfLeast(candidates, rankOf)) {
    if (c.m.id === current) return current;
    if (best === null || rankOf(c.m.id) > rankOf(best.m.id)) best = c;
  }
  return best?.m.id ?? null;
}

/**
 * O pai que o assentar escolheria entre as marcações `candidates` do espaço `containerId`
 * (todas já válidas pela geometria: contêm o que se quer pôr dentro): das de menor área, a de
 * dentro de cada cadeia de retângulos iguais (`equalRectRanks`), e o `current`, se é uma delas.
 * O Envolver usa isto para achar o pai atual do conjunto pela cadeia, nunca pelo array.
 */
export function referenceEnclosingAmong(
  p: Project,
  containerId: string | null,
  candidates: ReadonlySet<string>,
  current: string | null,
): string | null {
  const group: Entry[] = [];
  p.markings.forEach((m, i) => {
    if (!m.floating && m.containerId === containerId) group.push({ m, i });
  });
  const ranks = new Map<string, number>();
  equalRectRanks(group, ranks);
  const inside = group.filter((e) => candidates.has(e.m.id));
  return pickParent(inside, current, (id) => ranks.get(id) ?? -1);
}

/** O espaço e o `rect` que a geometria dá à marcação; ela mesma se nada muda. */
function settleSpace(
  p: Project,
  m: Marking,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = projectIndex(p).containers.get(m.containerId);
    // Container inexistente: projeto inválido; o reparo resolve, o assentar não inventa.
    if (!own) return m;
    if (!m.floating && containsRect(imagePixelRect(own), m.rect)) return m;
    canvas = toCanvasRect(own.placement, m.rect);
  }
  const target = m.floating ? null : containerContaining(p, canvas);
  if (target === null && m.containerId === null) return m;
  const min = options?.minSizeOf?.(m.id) ?? null;
  const space = target ? containerSpace(target) : CANVAS_SPACE;
  return {
    ...m,
    containerId: space.containerId,
    rect: fromCanvasRect(space.placement, canvas, space.bounds, min),
  };
}

/** O assentar da geometria e do pertencimento, sem as perspectivas. */
function referenceSettleGeometry(p: Project, options?: SettleOptions): Project {
  let changed = false;
  // Marcações que trocaram de espaço: a seta presa a elas perde os pontos de passagem.
  const movedSpace = new Set<string>();
  const placed = p.markings.map((m) => {
    const next = settleSpace(p, m, options);
    if (next !== m) {
      changed = true;
      if (next.containerId !== m.containerId) movedSpace.add(m.id);
    }
    return next;
  });

  // Marcações por espaço, com o índice no array; o posto resolve o empate de retângulo igual.
  const bySpace = new Map<string | null, Entry[]>();
  placed.forEach((m, i) => {
    if (m.floating) return;
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });
  const ranks = new Map<string, number>();
  for (const group of bySpace.values()) equalRectRanks(group, ranks);
  const rankOf = (id: string) => ranks.get(id) ?? -1;

  const markings = placed.map((m) => {
    const group = m.floating ? [] : (bySpace.get(m.containerId) ?? []);
    const own = rankOf(m.id);
    const candidates = group.filter((c) =>
      canContain(c.m.rect, rankOf(c.m.id), m.rect, own),
    );
    const parentId = pickParent(candidates, m.parentId, rankOf);
    if (parentId === m.parentId) return m;
    changed = true;
    return { ...m, parentId };
  });

  // Pai de um container: a menor marcação do canvas (não flutuante) que contém o retângulo dele.
  const canvasGroup = bySpace.get(null) ?? [];
  const containers = p.containers.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvasGroup.filter((e) => containsRectApprox(e.m.rect, rect));
    const parentId = pickParent(candidates, c.parentId, rankOf);
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });

  // Seta (v13): fora da árvore de pertencimento, o assentar a ignora, salvo numa coisa: se uma
  // ponta mudou de espaço, os `points` (que ficam no espaço das pontas) voltam à rota padrão.
  return changed ? clearArrowRoutes({ ...p, markings, containers }, movedSpace) : p;
}

/** O assentar inteiro de antes: a geometria e depois as perspectivas (`settleHierarchy`). */
export function referenceSettleHierarchy(p: Project, options?: SettleOptions): Project {
  return reconcilePerspectives(options?.before ?? p, referenceSettleGeometry(p, options));
}
