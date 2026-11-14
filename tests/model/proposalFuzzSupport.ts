import {
  createMarking,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { simulateApplied } from '../../src/model/proposalAnchors';

// Helpers of the proposal fuzz tests (fidelity, #549; revision, #644): deterministic generator,
// small grid of rectangles (to force ties), the shape of the project (parents and order among
// siblings) and the predicate of the known limit #625.

/** Deterministic pseudorandom generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;
export const int = (r: Rand, n: number) => Math.floor(r() * n);
export const pick = <T>(r: Rand, list: readonly T[]): T => list[int(r, list.length)] as T;

/** An interval [a, b) of the grid `0, step, …, steps·step`. */
function span(r: Rand, steps: number, step: number): [number, number] {
  const a = int(r, steps);
  const b = a + 1 + int(r, steps - a);
  return [a * step, (b - a) * step];
}

/** Rectangle on the container grid (100×100, step 25) or the canvas grid (200×200, step 50). */
export function gridRect(r: Rand, inContainer: boolean): Rect {
  const [steps, step] = inContainer ? [4, 25] : [4, 50];
  const [x, width] = span(r, steps, step);
  const [y, height] = span(r, steps, step);
  return { x, y, width, height };
}

export const CONTAINER: ProjectContainer = {
  id: 'C',
  name: null,
  file: null,
  width: 100,
  height: 100,
  placement: { x: 0, y: 0, scale: 1 },
  parentId: null,
  markingColor: null,
  locked: false,
  source: null,
  background: '#FFFFFF',
};

/** Applies the operation; if the model refuses it, returns the project as it was. */
export function tryOp(p: Project, op: () => Project): Project {
  try {
    return op();
  } catch {
    return p;
  }
}

export function create(p: Project, r: Rand, id: string): Project {
  const inContainer = r() < 0.7;
  return tryOp(p, () =>
    createMarking(p, {
      id,
      containerId: inContainer ? 'C' : null,
      rect: gridRect(r, inContainer),
    }),
  );
}

const byId = (entries: [string, string | null][]) =>
  Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));

/** Parents of the markings and containers, and the siblings (same space and same parent) in order. */
export function shape(p: Project) {
  const groups = new Map<string, string[]>();
  for (const m of p.markings) {
    const key = `${m.containerId ?? ''}|${m.parentId ?? ''}|${String(m.floating)}`;
    groups.set(key, [...(groups.get(key) ?? []), m.id]);
  }
  return {
    markings: byId(p.markings.map((m) => [m.id, m.parentId])),
    containers: byId(p.containers.map((c) => [c.id, c.parentId])),
    siblings: Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export const same = (a: Project, b: Project) =>
  JSON.stringify(shape(a)) === JSON.stringify(shape(b));

export const sameParents = (a: Project, b: Project) => {
  const [sa, sb] = [shape(a), shape(b)];
  return (
    JSON.stringify([sa.markings, sa.containers]) ===
    JSON.stringify([sb.markings, sb.containers])
  );
};

/**
 * No anchor reproduces the proposed parents: the tie was decided by a step of the batch that the
 * proposal does not record (the "Guarantee" exception in docs/PROPOSAL-FORMAT.md, limit #625). Proof
 * by brute force: every choice of `insertBefore` of the created ones, in the array and in the
 * applier's settle.
 */
export function unexpressible({
  base,
  after,
}: {
  readonly base: Project;
  readonly after: Project;
}): boolean {
  const afterIds = new Set(after.markings.map((m) => m.id));
  const baseIds = new Set(base.markings.map((m) => m.id));
  const slots = base.markings.filter((m) => afterIds.has(m.id)).map((m) => m.id);
  const created = after.markings.filter((m) => !baseIds.has(m.id)).map((m) => m.id);
  const total = (slots.length + 1) ** created.length;
  if (total > 100_000) throw new Error('case too large for brute force');
  for (let k = 0; k < total; k++) {
    const anchors = new Map<string, string>();
    let rest = k;
    for (const id of created) {
      const at = rest % (slots.length + 1);
      rest = Math.floor(rest / (slots.length + 1));
      if (at < slots.length) anchors.set(id, slots[at] as string);
    }
    if (sameParents(simulateApplied(base, after, anchors), after)) return false;
  }
  return true;
}
