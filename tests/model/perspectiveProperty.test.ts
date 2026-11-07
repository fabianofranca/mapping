import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addBackgroundContainer,
  addLayer,
  addPerspective,
  arriveInPrincipal,
  buildPerspective,
  createArrow,
  createMarking,
  dismissArrival,
  moveContainer,
  moveItems,
  moveMarking,
  moveRootsInPerspective,
  perspectiveView,
  projectIndex,
  reconcilePerspectives,
  removeContainer,
  removeLayer,
  removeMarking,
  removePerspective,
  removeRootsFromPerspective,
  sendRootsToPerspective,
  setContainerPlacement,
  setMarkingFloating,
  setMarkingRect,
  setPerspectiveHiddenLayers,
  settleHierarchy,
  validateProject,
  wrapItems,
  type ItemRef,
  type Perspective,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { int, pick, rng, type Rand } from './proposalFuzzSupport';

// Propriedade (v16, checklist da #661): sequências de operações reais do modelo sobre um projeto
// com containers, marcações do canvas, flutuantes, setas e perspectivas. Depois de cada uma o
// projeto é válido (`validateProject`, que inclui as invariantes das perspectivas e das chegadas),
// as perspectivas estão limpas (a reconciliação é idempotente), a vista de cada uma se monta, e
// o assentar não muda mais nada. Semente fixa; operação recusada pelo modelo é pulada.

const SEED = 659_001;
const STEPS = 600;

function grid(r: Rand): number {
  return (int(r, 41) - 8) * 50;
}

function placed(p: Project, id: string, x: number, y: number, size: number): Project {
  const added = addBackgroundContainer(p, {
    id,
    width: size,
    height: size,
    background: '#FFFFFF',
  });
  return setContainerPlacement(added, id, { x, y, scale: 1 });
}

function initial(): Project {
  let p = addLayer(emptyProject(), { id: 'L2', name: 'Dois', color: '#1E88E5' });
  p = placed(p, 'C1', 0, 0, 400);
  p = placed(p, 'C2', 600, 0, 400);
  p = placed(p, 'C3', 1200, 0, 400);
  const inside = { x: 50, y: 50, width: 100, height: 100 };
  for (const [id, containerId] of [
    ['a', 'C1'],
    ['b', 'C2'],
    ['c', 'C3'],
  ] as const) {
    p = createMarking(p, { id, containerId, rect: inside });
  }
  p = createMarking(p, {
    id: 'K1',
    containerId: null,
    rect: { x: -50, y: -50, width: 500, height: 500 },
  });
  p = createMarking(p, {
    id: 'K2',
    containerId: null,
    rect: { x: 0, y: 800, width: 200, height: 100 },
  });
  p = createMarking(p, {
    id: 'F1',
    containerId: null,
    rect: { x: 300, y: 900, width: 100, height: 40 },
    floating: true,
  });
  for (const [id, from, to] of [
    ['r1', 'a', 'b'],
    ['r2', 'b', 'c'],
    ['r3', 'F1', 'b'],
    ['r4', 'K2', 'c'],
  ] as const) {
    p = createArrow(p, { id, from, to });
  }
  const all = buildPerspective(p, { id: 'P1', name: 'Tudo', startFrom: null });
  p = addPerspective(p, all);
  const few = buildPerspective(p, {
    id: 'P2',
    name: 'Poucas',
    startFrom: 'empty',
    hiddenLayers: ['L2'],
  });
  p = addPerspective(p, few);
  return sendRootsToPerspective(p, 'P2', ['C2', 'F1', 'K2'], null);
}

type Op = (r: Rand, p: Project, id: string) => Project;

const roots = (p: Project) => projectIndex(p).roots;
const pickPerspective = (r: Rand, p: Project): Perspective | null =>
  p.perspectives.length === 0 ? null : pick(r, p.perspectives);

const items = (p: Project): ItemRef[] => [
  ...p.containers.map((c) => ({ kind: 'image' as const, id: c.id })),
  ...p.markings.map((m) => ({ kind: 'marking' as const, id: m.id })),
];

function pickItems(r: Rand, p: Project, count: number): ItemRef[] {
  const all = items(p);
  return all.length === 0 ? [] : Array.from({ length: count }, () => pick(r, all));
}

/** Uma raiz criada "numa perspectiva" e levada à Principal pela chegada. */
function arrival(r: Rand, p: Project, id: string): Project {
  const from = pickPerspective(r, p);
  if (!from) return p;
  const floating = int(r, 3) === 0;
  let next: Project;
  if (floating) {
    next = createMarking(p, {
      id,
      containerId: null,
      rect: { x: 50_000, y: 50_000, width: 120, height: 40 },
      floating: true,
    });
  } else {
    next = placed(p, id, 50_000, 50_000, 300);
  }
  const markings = next.markings.filter((m) => m.containerId !== null);
  if (markings.length > 0 && int(r, 2) === 0) {
    next = createArrow(next, { id: `${id}-arrow`, from: id, to: pick(r, markings).id });
  }
  const host: Perspective = {
    ...from,
    items: [...from.items, { root: id, x: grid(r), y: grid(r) }],
  };
  const withHost = {
    ...next,
    perspectives: next.perspectives.map((x) => (x.id === from.id ? host : x)),
  };
  return arriveInPrincipal(withHost, id, host).project;
}

const OPS: readonly Op[] = [
  (r, p) => moveContainer(p, pick(r, p.containers).id, grid(r), grid(r)),
  (r, p) =>
    moveMarking(p, pick(r, p.markings).id, (int(r, 9) - 4) * 25, (int(r, 9) - 4) * 25),
  (r, p) => moveItems(p, pickItems(r, p, 2), (int(r, 9) - 4) * 50, (int(r, 9) - 4) * 50),
  (r, p) => removeMarking(p, pick(r, p.markings).id),
  (r, p) => (int(r, 4) === 0 ? removeContainer(p, pick(r, p.containers).id) : p),
  (r, p, id) => wrapItems(p, { id, items: pickItems(r, p, 1 + int(r, 3)) }),
  (r, p, id) => placed(p, id, grid(r), grid(r), 200 + int(r, 3) * 100),
  (r, p, id) =>
    createMarking(p, {
      id,
      containerId: null,
      rect: {
        x: grid(r),
        y: grid(r),
        width: 50 + int(r, 6) * 50,
        height: 50 + int(r, 6) * 50,
      },
      floating: int(r, 4) === 0,
    }),
  (r, p) => {
    const m = pick(r, p.markings);
    return setMarkingRect(p, m.id, { ...m.rect, width: m.rect.width + int(r, 5) * 25 });
  },
  (r, p) => setMarkingFloating(p, pick(r, p.markings).id, int(r, 2) === 0),
  (r, p) => {
    const target = pickPerspective(r, p);
    const source = pickPerspective(r, p);
    const some = [pick(r, roots(p)), pick(r, roots(p))];
    return target
      ? sendRootsToPerspective(p, target.id, some, int(r, 2) === 0 ? null : source)
      : p;
  },
  (r, p) => {
    const target = pickPerspective(r, p);
    return target ? removeRootsFromPerspective(p, target.id, [pick(r, roots(p))]) : p;
  },
  (r, p) => {
    const target = pickPerspective(r, p);
    const item = target && target.items.length > 0 ? pick(r, target.items) : null;
    if (!target || !item) return p;
    const half = int(r, 3) === 0 ? 0.5 : 0;
    return moveRootsInPerspective(p, target.id, [
      { root: item.root, dx: (int(r, 9) - 4) * 50 + half, dy: (int(r, 9) - 4) * 50 },
    ]);
  },
  (r, p, id) => arrival(r, p, id),
  (r, p) => (p.arrivals.length > 0 ? dismissArrival(p, pick(r, p.arrivals).root) : p),
  (r, p) => {
    const target = pickPerspective(r, p);
    return target
      ? setPerspectiveHiddenLayers(p, target.id, int(r, 2) === 0 ? ['L2'] : [])
      : p;
  },
  (r, p, id) =>
    int(r, 3) === 0 && p.perspectives.length < 5
      ? addPerspective(
          p,
          buildPerspective(p, {
            id,
            name: `Vista ${id}`,
            startFrom: pickPerspective(r, p),
          }),
        )
      : p,
  (r, p) =>
    int(r, 6) === 0 && p.perspectives.length > 1
      ? removePerspective(p, pick(r, p.perspectives).id)
      : p,
  (r, p) => (int(r, 8) === 0 ? removeLayer(p, 'L2') : p),
];

/** Invariantes próprias das perspectivas, além do `validateProject`. */
function problems(p: Project): string[] {
  const out: string[] = [];
  const index = projectIndex(p);
  const names = new Set<string>();
  for (const x of p.perspectives) {
    const key = x.name.trim().toLowerCase();
    if (names.has(key)) out.push(`nome repetido ${x.name}`);
    names.add(key);
    const seen = new Set<string>();
    for (const item of x.items) {
      if (index.rootOf.get(item.root) !== item.root)
        out.push(`${x.id}: ${item.root} não é raiz`);
      if (seen.has(item.root)) out.push(`${x.id}: ${item.root} repetida`);
      seen.add(item.root);
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y))
        out.push('posição inválida');
      if (
        index.markings.has(item.root) &&
        !(Number.isInteger(item.x) && Number.isInteger(item.y))
      ) {
        out.push(`${x.id}: ${item.root} é marcação com posição fracionária`);
      }
    }
    for (const layer of x.hiddenLayers) {
      if (!index.layers.has(layer)) out.push(`${x.id}: camada ${layer} inexistente`);
    }
    out.push(...viewProblems(p, x));
  }
  const arrived = new Set<string>();
  for (const a of p.arrivals) {
    if (index.rootOf.get(a.root) !== a.root) out.push(`chegada ${a.root} não é raiz`);
    if (arrived.has(a.root)) out.push(`chegada ${a.root} repetida`);
    arrived.add(a.root);
  }
  return out;
}

function viewProblems(p: Project, x: Perspective): string[] {
  const view = perspectiveView(p, x);
  const out: string[] = [];
  const containers = new Set(view.containers.map((c) => c.id));
  const markings = new Set(view.markings.map((m) => m.id));
  for (const item of x.items) {
    if (!containers.has(item.root) && !markings.has(item.root))
      out.push(`vista sem ${item.root}`);
  }
  for (const a of view.arrows) {
    if (!markings.has(a.from) || !markings.has(a.to))
      out.push(`seta ${a.id} sem ponta na vista`);
  }
  for (const m of view.markings) {
    if (m.containerId === null && !Object.values(m.rect).every(Number.isInteger)) {
      out.push(`vista: ${m.id} com rect fracionário`);
    }
  }
  return out;
}

describe('perspectivas: propriedade sobre sequências de operações', () => {
  it(`${STEPS} operações reais deixam o projeto válido, limpo e assentado`, () => {
    const r = rng(SEED);
    let p = initial();
    expect(validateProject(p)).toEqual([]);
    expect(problems(p)).toEqual([]);

    let applied = 0;
    let counter = 0;
    const started = performance.now();
    for (let step = 0; step < STEPS; step++) {
      const op = pick(r, OPS);
      const id = `n${++counter}`;
      let next: Project;
      try {
        next = op(r, p, id);
      } catch (error) {
        if (error instanceof ModelError) continue;
        throw error;
      }
      if (next !== p) applied++;
      p = next;
      const issues = validateProject(p);
      if (issues.length > 0 || problems(p).length > 0) {
        throw new Error(
          `passo ${step}: ${JSON.stringify(issues.slice(0, 3))} ${problems(p).slice(0, 3).join('; ')}`,
        );
      }
      expect(reconcilePerspectives(p, p)).toBe(p);
      expect(settleHierarchy(p)).toBe(p);
    }
    const elapsed = performance.now() - started;
    // Quantas operações de fato mudaram o projeto: a sequência precisa exercitar o modelo.
    expect(applied).toBeGreaterThanOrEqual(300);
    expect(elapsed).toBeLessThan(3000);
  });
});
