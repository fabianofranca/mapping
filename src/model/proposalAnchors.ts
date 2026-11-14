import { area, containsRect, containsRectApprox, imageCanvasRect } from './geometry';
import { settleHierarchy } from './hierarchySettle';
import { insertAnchors, placeCreatedMarkings } from './proposalOrder';
import type { Marking, Project, Rect } from './types';

// Anchor that respects the tie-break (stage #549, decision 3). The applier (`patchProject`)
// builds the array in the base's order, with each created marking before its anchor (or at the
// end), and settles: in ties, the current relation holds (the base's `parentId` for those that
// already existed, the proposed one for the created ones), and the array only decides a new
// tie. Each created marking's anchor is chosen so that these new ties come out as in the
// proposed project; `simulateApplied` redoes the same array and the same settle as the
// applier, so the emitted `position` is only what is missing.

/** `a` must come before `b` in the applied array (at least one of them is created). */
type Before = readonly [string, string];

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/**
 * The project that `patchProject` would give with all the changes, only in what matters to
 * membership and order: the markings that stay, in the base's order, with the proposed
 * geometry and the base's parent; the created ones (with the proposed parent) before the
 * anchor; the containers with the base's parent. Settled.
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
  // Only membership and order matter here: without perspectives, there is nothing to reconcile.
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

/** What the applier knows about each marking before settling: the base's parent, or the proposed one. */
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

  /** The `parentId` with which the marking reaches the applier's settle. */
  pre(id: string): string | null {
    return this.isCreated(id)
      ? (this.afterById.get(id)?.parentId ?? null)
      : (this.basePar.get(id) ?? null);
  }

  /** Records `a` before `b`, if one of them is created (among the base's, the order is the base's). */
  before(a: string, b: string): void {
    if (a !== b && (this.isCreated(a) || this.isCreated(b))) this.out.push([a, b]);
  }
}

/** A group of equal rectangles, from the outside in by the proposed `parentId`s. */
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
 * Equal rectangles: the applier places, in outside-in order, first whoever is not waiting for
 * a parent from the group, and among the free ones the array decides. For the chain to come
 * out as the proposed one, each one comes before the other free ones in the same step.
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

/** The smallest-area candidates, per group of equal rectangles. */
function leastBuckets(candidates: readonly Marking[]): Marking[][] {
  let least = Infinity;
  for (const c of candidates) least = Math.min(least, area(c.rect));
  const ofLeast = candidates.filter((c) => area(c.rect) === least);
  return [...groupBy(ofLeast, (c) => rectKey(c.rect)).values()];
}

/**
 * Parent candidates of the same area: from each group of equal rectangles the inner one
 * counts; if the current parent is one of them, it stays (and the anchor does not change
 * that); otherwise, the one from the group with the highest index in the array wins. The
 * proposed parent must come after all those of the other groups.
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

/** The ties of a space: the groups of equal rectangles and the candidates of the same area. */
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

/** The ordering constraints that the proposed ties impose on the created markings. */
function tieConstraints(base: Project, after: Project): Before[] {
  const ties = new Ties(base, after);
  const placed = after.markings.filter((m) => !m.floating);
  const bySpace = groupBy(placed, (m) => m.containerId ?? '');
  for (const group of bySpace.values()) spaceTies(ties, group);
  // The container's parent: the smallest canvas marking that contains it, with the same tie-break.
  const baseContainers = new Map(base.containers.map((c) => [c.id, c.parentId]));
  const canvas = placed.filter((m) => m.containerId === null);
  for (const c of after.containers) {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvas.filter((m) => containsRectApprox(m.rect, rect));
    areaTies(ties, candidates, c.parentId, baseContainers.get(c.id) ?? null);
  }
  return ties.out;
}

/** Bounds of each created marking's slot (before the base marking of index `slot`; the end is `n`). */
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
 * Between two created markings, `a` before `b`: in the same slot they enter in the proposed
 * order, so `b` needs `a`'s slot (if it comes later in the proposal) or the next one. `up`
 * raises `b`'s slot; otherwise, it lowers `a`'s. Returns `false` if nothing changed.
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

/** The slots from the starting ones, only rising (or only falling); `null` if they leave the bounds. */
function solve(s: Slots, up: boolean): Map<string, number> | null {
  const slot = new Map(s.start);
  // Each round moves at least one slot once, and none leaves `-k … n + k` (k created).
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
 * The anchor of each created marking (`insertBefore`): the usual one (the first base marking
 * after it in the proposal), shifted the minimum so the applier's new ties come out as in the
 * proposal. Slot `k` is "before the k-th base marking that stays"; `n`, the end. With no
 * solution, the usual one stays.
 */
export function proposalAnchors(base: Project, after: Project): Map<string, string> {
  const baseIds = new Set(base.markings.map((m) => m.id));
  const defaults = insertAnchors(baseIds, after.markings);
  // Without a created marking there is no anchor to tie: the map of defaults is already the final one.
  if (defaults.size === 0 && after.markings.every((m) => baseIds.has(m.id))) {
    return defaults;
  }
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
  // Lastly, those with a constraint between created markings, starting from the lower bound.
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
