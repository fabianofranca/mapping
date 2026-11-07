import { area, containsRect, containsRectApprox, imageCanvasRect } from './geometry';
import { settleHierarchy } from './hierarchySettle';
import { insertAnchors, placeCreatedMarkings } from './proposalOrder';
import type { Marking, Project, Rect } from './types';

// Âncora que respeita o desempate (etapa #549, decisão 3). O aplicador (`patchProject`) monta o
// array na ordem da base, com cada criada antes da âncora dela (ou no fim), e assenta: nos
// empates, a relação atual vale (o `parentId` da base nas que já existiam, o do proposto nas
// criadas), e o array só decide empate novo. A âncora de cada criada é escolhida para esses
// empates novos saírem como no projeto proposto; `simulateApplied` refaz o mesmo array e o
// mesmo assentar do aplicador, para o `position` emitido ser só o que falta.

/** `a` precisa vir antes de `b` no array aplicado (ao menos uma delas é criada). */
type Before = readonly [string, string];

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/**
 * O projeto que `patchProject` daria com todas as mudanças, só no que importa ao pertencimento e
 * à ordem: as marcações que ficam na ordem da base, com a geometria do proposto e o pai da base;
 * as criadas (com o pai do proposto) antes da âncora; os containers com o pai da base. Assentado.
 */
export function simulateApplied(
  base: Project,
  after: Project,
  anchors: ReadonlyMap<string, string>,
): Project {
  const afterById = new Map(after.markings.map((m) => [m.id, m]));
  const baseIds = new Set(base.markings.map((m) => m.id));
  const kept = base.markings.flatMap((m) => {
    const next = afterById.get(m.id);
    return next ? [{ ...next, parentId: m.parentId }] : [];
  });
  const created = after.markings.filter((m) => !baseIds.has(m.id));
  const baseContainers = new Map(base.containers.map((c) => [c.id, c]));
  // Só o pertencimento e a ordem importam aqui: sem perspectivas, não há o que reconciliar.
  return settleHierarchy({
    ...after,
    perspectives: [],
    arrivals: [],
    containers: after.containers.map((c) => ({
      ...c,
      parentId: baseContainers.get(c.id)?.parentId ?? null,
    })),
    markings: placeCreatedMarkings([...kept, ...created], anchors),
    arrows: [],
  });
}

/** O que o aplicador sabe de cada marcação antes de assentar: o pai da base, ou o do proposto. */
class Ties {
  readonly out: Before[] = [];
  private readonly basePar: ReadonlyMap<string, string | null>;
  private readonly afterById: ReadonlyMap<string, Marking>;

  constructor(base: Project, after: Project) {
    this.basePar = new Map(base.markings.map((m) => [m.id, m.parentId]));
    this.afterById = new Map(after.markings.map((m) => [m.id, m]));
  }

  isCreated(id: string): boolean {
    return !this.basePar.has(id);
  }

  /** O `parentId` com que a marcação chega ao assentar do aplicador. */
  pre(id: string): string | null {
    return this.isCreated(id)
      ? (this.afterById.get(id)?.parentId ?? null)
      : (this.basePar.get(id) ?? null);
  }

  /** Registra `a` antes de `b`, se uma delas é criada (entre as da base, a ordem é a da base). */
  before(a: string, b: string): void {
    if (a !== b && (this.isCreated(a) || this.isCreated(b))) this.out.push([a, b]);
  }
}

/** Grupo de retângulos iguais, de fora para dentro pelos `parentId` do proposto. */
function chainOf(bucket: readonly Marking[]): Marking[] {
  const ids = new Set(bucket.map((m) => m.id));
  const done = new Set<string>();
  const pending = [...bucket];
  const out: Marking[] = [];
  while (pending.length > 0) {
    const free = pending.findIndex(
      (m) => m.parentId === null || !ids.has(m.parentId) || done.has(m.parentId),
    );
    const [next] = pending.splice(Math.max(free, 0), 1) as [Marking];
    done.add(next.id);
    out.push(next);
  }
  return out;
}

/**
 * Retângulos iguais: o aplicador põe na ordem de fora para dentro primeiro quem não espera um
 * pai do grupo, e entre as livres decide o array. Para a cadeia sair a do proposto, cada uma
 * vem antes das outras livres no mesmo passo.
 */
function chainTies(ties: Ties, bucket: readonly Marking[]): void {
  if (bucket.length < 2 || !bucket.some((m) => ties.isCreated(m.id))) return;
  const ids = new Set(bucket.map((m) => m.id));
  const done = new Set<string>();
  for (const m of chainOf(bucket)) {
    for (const other of bucket) {
      if (done.has(other.id) || other.id === m.id) continue;
      const parent = ties.pre(other.id);
      if (parent === null || !ids.has(parent) || done.has(parent)) {
        ties.before(m.id, other.id);
      }
    }
    done.add(m.id);
  }
}

function groupBy<T>(list: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const group = out.get(k);
    if (group) group.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** As candidatas de menor área, por grupo de retângulos iguais. */
function leastBuckets(candidates: readonly Marking[]): Marking[][] {
  let least = Infinity;
  for (const c of candidates) least = Math.min(least, area(c.rect));
  const ofLeast = candidates.filter((c) => area(c.rect) === least);
  return [...groupBy(ofLeast, (c) => rectKey(c.rect)).values()];
}

/**
 * Candidatas de mesma área a pai: de cada grupo de retângulos iguais conta a de dentro; se o
 * pai atual é uma delas, ele fica (e a âncora não muda isso); senão, ganha a do grupo que tem o
 * maior índice no array. O pai do proposto precisa vir depois de todas as dos outros grupos.
 */
function areaTies(
  ties: Ties,
  candidates: readonly Marking[],
  parentId: string | null,
  current: string | null,
): void {
  const buckets = leastBuckets(candidates);
  if (parentId === null || buckets.length < 2) return;
  if (buckets.some((b) => chainOf(b).at(-1)?.id === current)) return;
  for (const bucket of buckets) {
    if (bucket.some((m) => m.id === parentId)) continue;
    for (const m of bucket) ties.before(m.id, parentId);
  }
}

/** Os empates de um espaço: os grupos de retângulos iguais e as candidatas de mesma área. */
function spaceTies(ties: Ties, group: readonly Marking[]): void {
  for (const bucket of groupBy(group, (m) => rectKey(m.rect)).values()) {
    chainTies(ties, bucket);
  }
  for (const m of group) {
    const candidates = group.filter(
      (c) => area(c.rect) > area(m.rect) && containsRect(c.rect, m.rect),
    );
    areaTies(ties, candidates, m.parentId, ties.pre(m.id));
  }
}

/** As restrições de ordem que os empates do proposto impõem às criadas. */
function tieConstraints(base: Project, after: Project): Before[] {
  const ties = new Ties(base, after);
  const placed = after.markings.filter((m) => !m.floating);
  const bySpace = groupBy(placed, (m) => m.containerId ?? '');
  for (const group of bySpace.values()) spaceTies(ties, group);
  // O pai do container: a menor marcação do canvas que o contém, com o mesmo desempate.
  const baseContainers = new Map(base.containers.map((c) => [c.id, c.parentId]));
  const canvas = placed.filter((m) => m.containerId === null);
  for (const c of after.containers) {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvas.filter((m) => containsRectApprox(m.rect, rect));
    areaTies(ties, candidates, c.parentId, baseContainers.get(c.id) ?? null);
  }
  return ties.out;
}

/** Limites da casa de cada criada (antes da marcação da base de índice `casa`; o fim é `n`). */
function bounds(
  constraints: readonly Before[],
  index: ReadonlyMap<string, number>,
  n: number,
): { lo: Map<string, number>; hi: Map<string, number> } {
  const lo = new Map<string, number>();
  const hi = new Map<string, number>();
  for (const [a, b] of constraints) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib === undefined) lo.set(b, Math.max(lo.get(b) ?? 0, ia + 1));
    if (ia === undefined && ib !== undefined) hi.set(a, Math.min(hi.get(a) ?? n, ib));
  }
  return { lo, hi };
}

/**
 * Entre duas criadas `a` antes de `b`: na mesma casa elas entram na ordem do proposto, então
 * `b` precisa da casa de `a` (se vem depois no proposto) ou da seguinte. `up` sobe a casa de
 * `b`; senão, desce a de `a`. Devolve `false` se nada mudou.
 */
function fix(
  slot: Map<string, number>,
  order: ReadonlyMap<string, number>,
  [a, b]: Before,
  up: boolean,
): boolean {
  const gap = (order.get(a) as number) < (order.get(b) as number) ? 0 : 1;
  const sa = slot.get(a) as number;
  const sb = slot.get(b) as number;
  if (sb >= sa + gap) return false;
  if (up) slot.set(b, sa + gap);
  else slot.set(a, sb - gap);
  return true;
}

interface Slots {
  readonly start: ReadonlyMap<string, number>;
  readonly lo: ReadonlyMap<string, number>;
  readonly hi: ReadonlyMap<string, number>;
  readonly order: ReadonlyMap<string, number>;
  readonly pairs: readonly Before[];
  readonly n: number;
}

/** As casas a partir das de partida, só subindo (ou só descendo); `null` se saem dos limites. */
function solve(s: Slots, up: boolean): Map<string, number> | null {
  const slot = new Map(s.start);
  // Cada volta move ao menos uma casa uma vez, e nenhuma sai de `-k … n + k` (k criadas).
  const rounds = (s.n + 2 * s.order.size + 1) * s.order.size;
  for (let round = 0; round <= rounds; round++) {
    if (!s.pairs.some((pair) => fix(slot, s.order, pair, up))) break;
  }
  for (const [id, at] of slot) {
    if (at < (s.lo.get(id) ?? 0) || at > (s.hi.get(id) ?? s.n)) return null;
  }
  return slot;
}

/**
 * A âncora de cada marcação criada (`insertBefore`): a de sempre (a primeira da base depois dela
 * no proposto), deslocada o mínimo para os empates novos do aplicador saírem como no proposto.
 * A casa `k` é "antes da k-ésima marcação da base que fica"; `n`, o fim. Sem solução, fica a de
 * sempre.
 */
export function proposalAnchors(base: Project, after: Project): Map<string, string> {
  const baseIds = new Set(base.markings.map((m) => m.id));
  const defaults = insertAnchors(baseIds, after.markings);
  const constraints = tieConstraints(base, after);
  if (constraints.length === 0) return defaults;
  const afterIds = new Set(after.markings.map((m) => m.id));
  const survivors = base.markings.filter((m) => afterIds.has(m.id));
  const index = new Map(survivors.map((m, i) => [m.id, i]));
  const n = survivors.length;
  const created = after.markings.filter((m) => !baseIds.has(m.id));
  const { lo, hi } = bounds(constraints, index, n);
  const clamp = (id: string, at: number) =>
    Math.max(lo.get(id) ?? 0, Math.min(hi.get(id) ?? n, at));
  const start = new Map(
    created.map((m) => {
      const anchor = defaults.get(m.id);
      return [
        m.id,
        clamp(m.id, anchor === undefined ? n : (index.get(anchor) as number)),
      ];
    }),
  );
  const order = new Map(created.map((m, i) => [m.id, i]));
  const pairs = constraints.filter(([a, b]) => order.has(a) && order.has(b));
  const slots: Slots = { start, lo, hi, order, pairs, n };
  // Por último, as que têm restrição entre criadas a partir do limite de baixo.
  const paired = new Set(pairs.flat());
  const low = new Map(
    [...start].map(([id, at]) => [id, paired.has(id) ? (lo.get(id) ?? 0) : at]),
  );
  const slot =
    solve(slots, true) ?? solve(slots, false) ?? solve({ ...slots, start: low }, true);
  if (slot === null) return defaults;
  return new Map(
    created.flatMap((m) => {
      const at = slot.get(m.id) as number;
      return at < n ? [[m.id, (survivors[at] as Marking).id] as const] : [];
    }),
  );
}
