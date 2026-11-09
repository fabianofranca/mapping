import { canContain, equalRectRanks, pickParent, type Entry } from './settleParent';
import type { SpaceEntry } from './settlePositions';
import type { Marking, Rect } from './types';

// Assentar só o que uma operação tocou dentro de um espaço (#882, fase 2). O pai de uma marcação só
// depende de quem a contém, dos postos de retângulos iguais e do pai atual; nada disso muda para quem
// não cabe (inclusive igual) em nenhum retângulo que mudou. Então se revê só quem cabe num deles, em
// vez do espaço inteiro, com a mesma regra do assentar inteiro (`settleParent.ts`). Puro.

/** Até quantos retângulos mudados e marcações a rever o recorte aguenta sem desistir. */
export const LOCAL_RECTS = 8;
const LOCAL_DIRTY = 24;

/** O que mudou num espaço. */
export interface Dirty {
  /** Retângulos (de antes e de depois) de marcações novas, apagadas ou trocadas. */
  readonly rects: Rect[];
  /** Posições das marcações do espaço que a operação criou ou trocou (sempre a rever). */
  readonly seeds: number[];
}

/** Chamada por posição com a caixa `x, y, x2, y2` da marcação; `false` interrompe a varredura. */
type Visitor = (i: number, x: number, y: number, x2: number, y2: number) => boolean;

/**
 * Visita as marcações do espaço: as da entrada, menos as posições de `skip` (crescentes: as que a
 * operação mexeu, de caixa desatualizada), e as `extras` (as mexidas que ficaram no espaço).
 */
function visitSpace(
  list: readonly Marking[],
  entry: SpaceEntry,
  skip: readonly number[],
  extras: readonly number[],
  visit: Visitor,
): boolean {
  const { positions, boxes } = entry;
  let s = 0;
  for (let t = 0; t < entry.count; t++) {
    const i = positions[t] as number;
    while (s < skip.length && (skip[s] as number) < i) s++;
    if (s < skip.length && skip[s] === i) continue;
    const q = t * 4;
    if (
      !visit(
        i,
        boxes[q] as number,
        boxes[q + 1] as number,
        boxes[q + 2] as number,
        boxes[q + 3] as number,
      )
    ) {
      return false;
    }
  }
  for (const i of extras) {
    const r = (list[i] as Marking).rect;
    if (!visit(i, r.x, r.y, r.x + r.width, r.y + r.height)) return false;
  }
  return true;
}

/** Caixas `[x, y, x2, y2, ...]` dos retângulos. */
function boxesOf(rects: readonly Rect[]): number[] {
  return rects.flatMap((r) => [r.x, r.y, r.x + r.width, r.y + r.height]);
}

/** O retângulo `(x, y, x2, y2)` contém (inclusive igual) a caixa que começa em `box[q]`? */
function coversBox(
  box: readonly number[],
  q: number,
  x: number,
  y: number,
  x2: number,
  y2: number,
): boolean {
  return (
    x <= (box[q] as number) &&
    y <= (box[q + 1] as number) &&
    x2 >= (box[q + 2] as number) &&
    y2 >= (box[q + 3] as number)
  );
}

/** O retângulo `(x, y, x2, y2)` cabe (inclusive igual) em alguma das caixas `[x, y, x2, y2, ...]`? */
function insideAny(
  box: readonly number[],
  x: number,
  y: number,
  x2: number,
  y2: number,
): boolean {
  for (let q = 0; q < box.length; q += 4) {
    if (
      x >= (box[q] as number) &&
      y >= (box[q + 1] as number) &&
      x2 <= (box[q + 2] as number) &&
      y2 <= (box[q + 3] as number)
    ) {
      return true;
    }
  }
  return false;
}

interface Scan {
  /** As marcações a rever. */
  readonly entries: readonly Entry[];
  /** Para cada uma, as do espaço que a contêm (por geometria; o posto decide depois). */
  readonly candidates: readonly (readonly Entry[])[];
}

/**
 * Uma varredura acha as marcações a rever (as que cabem num dos retângulos que mudaram) e, para as
 * sementes, quem as contém. Se achou outras a rever (a nova contém antigas), uma segunda varredura acha
 * quem contém essas. `null` se são demais.
 */
function scan(
  list: readonly Marking[],
  entry: SpaceEntry,
  dirty: Dirty,
  skip: readonly number[],
): Scan | null {
  const seeds = dirty.seeds;
  const box = boxesOf(dirty.rects);
  const seedBox = boxesOf(seeds.map((i) => (list[i] as Marking).rect));
  const entries: Entry[] = [];
  const seeded: Entry[][] = seeds.map(() => []);
  const complete = visitSpace(list, entry, skip, seeds, (i, x, y, x2, y2) => {
    if (insideAny(box, x, y, x2, y2)) {
      if (entries.length >= LOCAL_DIRTY) return false;
      entries.push({ m: list[i] as Marking, i });
    }
    for (let k = 0; k < seeds.length; k++) {
      if (seeds[k] !== i && coversBox(seedBox, k * 4, x, y, x2, y2)) {
        (seeded[k] as Entry[]).push({ m: list[i] as Marking, i });
      }
    }
    return true;
  });
  if (!complete) return null;
  const seedAt = new Map(seeds.map((i, k) => [i, seeded[k] as Entry[]]));
  const others = entries.filter((e) => !seedAt.has(e.i));
  const found = candidatesOf(list, entry, skip, seeds, others);
  const candidates = entries.map((e) => seedAt.get(e.i) ?? (found.shift() as Entry[]));
  return { entries, candidates };
}

/** Para cada marcação de `dirty`, as do espaço que a contêm. */
function candidatesOf(
  list: readonly Marking[],
  entry: SpaceEntry,
  skip: readonly number[],
  extras: readonly number[],
  dirty: readonly Entry[],
): Entry[][] {
  if (dirty.length === 0) return [];
  const out: Entry[][] = dirty.map(() => []);
  const dirtyBox = boxesOf(dirty.map((d) => d.m.rect));
  visitSpace(list, entry, skip, extras, (i, x, y, x2, y2) => {
    for (let k = 0; k < dirty.length; k++) {
      if ((dirty[k] as Entry).i !== i && coversBox(dirtyBox, k * 4, x, y, x2, y2)) {
        (out[k] as Entry[]).push({ m: list[i] as Marking, i });
      }
    }
    return true;
  });
  return out;
}

/**
 * Os pais novos (como marcações já com o `parentId` novo) das marcações do espaço que cabem em algum dos
 * `dirty.rects`, ou `null` quando são muitas demais: o espaço é então assentado inteiro. `entry` é o que
 * se sabe do espaço e `skip`, as posições (crescentes) mexidas pela operação, de caixa desatualizada.
 */
export function localParents(
  list: readonly Marking[],
  entry: SpaceEntry,
  dirty: Dirty,
  skip: readonly number[],
): Entry[] | null {
  if (dirty.rects.length > LOCAL_RECTS) return null;
  const found = scan(list, entry, dirty, skip);
  if (found === null) return null;
  const { entries, candidates } = found;
  const involved = new Map<number, Entry>();
  for (const e of [...entries, ...candidates.flat()]) involved.set(e.i, e);
  const ranks = new Map<string, number>();
  equalRectRanks(
    [...involved.values()].sort((a, b) => a.i - b.i),
    ranks,
  );
  const rankOf = (id: string) => ranks.get(id) ?? -1;
  const patches: Entry[] = [];
  entries.forEach((d, k) => {
    const own = rankOf(d.m.id);
    const valid = (candidates[k] as Entry[]).filter((c) =>
      canContain(c.m.rect, rankOf(c.m.id), d.m.rect, own),
    );
    const parentId = pickParent(valid, d.m.parentId, rankOf);
    if (parentId !== d.m.parentId) patches.push({ m: { ...d.m, parentId }, i: d.i });
  });
  return patches;
}
