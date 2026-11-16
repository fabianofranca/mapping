import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addContainer,
  createArrow,
  createMarking,
  createPage,
  createProject,
  deletePage,
  moveContainer,
  moveMarking,
  moveRootsToPage,
  setMarkingSpace,
  validateProject,
  type InvariantCode,
  type Project,
} from '../../src/model';

// Property (decision 20 of #883): after every geometry operation, with several pages, no parent
// and no arrow crosses a page. Deterministic generator (mulberry32), like `settleEquivalence`.

const SEED = 20261116;
const CASES = 60;
const STEPS = 40;
const SEED_STEP = 7919;

function makeRng(seed: number) {
  let state = seed >>> 0;
  const float = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number =>
    lo + Math.floor(float() * (hi - lo + 1));
  return {
    float,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
  };
}
type Rng = ReturnType<typeof makeRng>;

const GUARDED: readonly InvariantCode[] = [
  'page-required',
  'page-missing',
  'page-parent-mismatch',
  'arrow-cross-page',
  'anchor-other-space',
  'page-duplicate-name',
  'pages-empty',
];

function start(rng: Rng): Project {
  let p = createProject({ name: 'Property', firstPage: { id: 'PG0', name: 'Page 0' } });
  const pages = rng.int(2, 3);
  for (let i = 1; i < pages; i++) p = createPage(p, { id: `PG${i}`, name: `Page ${i}` });
  for (let i = 0; i < 6; i++) {
    p = addContainer(p, {
      id: `I${i}`,
      file: `i${i}.png`,
      width: 400,
      height: 400,
      pageId: `PG${rng.int(0, pages - 1)}`,
    });
    p = createMarking(p, {
      id: `S${i}`,
      containerId: `I${i}`,
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
  }
  return p;
}

type Op = (p: Project, rng: Rng, n: number) => Project;

const ops: readonly Op[] = [
  (p, rng) => {
    const c = rng.pick(p.containers);
    return moveContainer(p, c.id, rng.int(-1500, 3000), rng.int(-500, 1500));
  },
  (p, rng, n) =>
    createMarking(p, {
      id: `K${n}`,
      containerId: null,
      rect: {
        x: rng.int(-500, 2500),
        y: rng.int(-500, 1500),
        width: rng.int(50, 900),
        height: rng.int(50, 900),
      },
      pageId: rng.pick(p.pages).id,
    }),
  (p, rng, n) => {
    const c = rng.pick(p.containers);
    return createMarking(p, {
      id: `M${n}`,
      containerId: c.id,
      rect: {
        x: rng.int(0, 200),
        y: rng.int(0, 200),
        width: rng.int(10, 150),
        height: rng.int(10, 150),
      },
    });
  },
  (p, rng) => {
    const m = rng.pick(p.markings);
    return moveMarking(p, m.id, rng.int(-300, 300), rng.int(-300, 300));
  },
  (p, rng) => {
    const roots = p.containers.filter((c) => c.parentId === null);
    const c = rng.pick(roots);
    return moveRootsToPage(p, [c.id], rng.pick(p.pages).id);
  },
  (p, rng) => {
    const m = rng.pick(p.markings);
    const c = rng.pick(p.containers);
    return setMarkingSpace(p, m.id, c.id, { x: 5, y: 5, width: 20, height: 20 });
  },
  (p, rng) => {
    const m = rng.pick(p.markings);
    return setMarkingSpace(p, m.id, null, {
      x: rng.int(-500, 2500),
      y: rng.int(-500, 1500),
      width: 60,
      height: 60,
    });
  },
  (p, rng, n) => {
    const a = rng.pick(p.markings);
    const b = rng.pick(p.markings);
    return createArrow(p, { id: `A${n}`, from: a.id, to: b.id });
  },
  (p, rng) => {
    if (p.pages.length < 2 || rng.float() > 0.3) return p;
    const [gone, to] = [rng.pick(p.pages), rng.pick(p.pages)];
    return deletePage(p, gone.id, { moveTo: to.id });
  },
];

describe('pages: no parent and no arrow crosses a page (decision 20)', () => {
  it.each(Array.from({ length: CASES }, (_, i) => i))('case %i', (index) => {
    const seed = SEED + index * SEED_STEP;
    const rng = makeRng(seed);
    let p = start(rng);
    let applied = 0;
    for (let step = 0; step < STEPS; step++) {
      const opIndex = rng.int(0, ops.length - 1);
      const op = ops[opIndex] as Op;
      let next: Project;
      try {
        next = op(p, rng, step);
      } catch (e) {
        if (e instanceof ModelError) continue; // refused: the project stays as it was
        throw e;
      }
      applied++;
      p = next;
      const issues = validateProject(p).filter((i) => GUARDED.includes(i.code));
      expect(issues, `seed ${seed}, step ${step}, op ${opIndex}`).toEqual([]);
    }
    expect(applied).toBeGreaterThan(0);
  });
});
