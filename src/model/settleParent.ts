import { area, containsRect } from './geometry';
import type { Marking, Rect } from './types';

// Escolha do pai por geometria dentro de um espaço (regras em `hierarchySettle.ts`): quem pode ser
// pai de quem, o posto das marcações de retângulo igual (desempate estável, etapa #549) e o pai entre
// as candidatas. Funções puras, usadas pelo assentar do espaço inteiro e pelo recortado.

/** Marcação de um espaço com o índice dela no array `markings`. */
export interface Entry {
  readonly m: Marking;
  readonly i: number;
}

/**
 * Pode `outer` (posto `ro`) ser o pai de `inner` (posto `ri`)? Contém e é maior, ou é igual e
 * vem antes na ordem dos retângulos iguais (`equalRectRanks`). Uma ordem estrita: nunca há ciclo.
 */
export function canContain(outer: Rect, ro: number, inner: Rect, ri: number): boolean {
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
export function equalRectRanks(
  group: readonly Entry[],
  ranks: Map<string, number>,
): void {
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
export function pickParent(
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
