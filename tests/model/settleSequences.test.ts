import { describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  addPerspective,
  adjustMarkingRect,
  applyAccepted,
  arriveInPrincipal,
  buildPerspective,
  createMarking,
  createProject,
  moveContainer,
  moveItems,
  moveMarking,
  moveRootsInPerspective,
  nudgeItems,
  ModelError,
  removeContainer,
  removeItems,
  removeMarking,
  removePerspective,
  reorderMarking,
  resizeContainer,
  sendRootsToPerspective,
  setMarkingFloating,
  setMarkingRect,
  setMarkingSpace,
  wrapItems,
} from '../../src/model';
import type { ItemRef, Marking, Project, Rect } from '../../src/model';
import type { SettleOptions } from '../../src/model/hierarchySettle';
import { AT, decided, propose } from './proposalFixtures';

// Equivalência por sequências de operações públicas (#882, decisão 5): a cada operação que assenta,
// o que `settleFrom` devolve é IGUAL ao assentar inteiro (`settleHierarchy(next, { before })`) do mesmo
// `next`, perspectivas e marcas "Veio de…" incluídas. A conferência mora em `settleFrom` (substituída
// pelo mock abaixo): toda chamada, de dentro de qualquer operação (a composta chama outras), é
// comparada com a inteira. Os projetos e as sequências vêm de um gerador determinístico (mulberry32);
// a falha mostra a semente, a sequência e o passo, e cada sequência se reproduz sozinha
// (`runSequence(SEED + índice * PASSO)`).

const SEED = 20261109;
const SEQUENCES = 60;
const STEPS = 45;
const SEED_STEP = 104729;

const check = vi.hoisted(() => ({
  context: '',
  calls: 0,
  partial: 0,
  /** Quantas vezes cada operação mudou o projeto (e não foi recusada). */
  changed: {} as Record<string, number>,
}));

vi.mock('../../src/model/hierarchySettle', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/hierarchySettle')>();
  return {
    ...real,
    settleFrom: (before: Project, next: Project, options?: SettleOptions): Project => {
      const got = real.settleFrom(before, next, options);
      if (options?.settle === false) return got;
      const full = real.settleHierarchy(next, { before, ...options });
      check.calls++;
      if (got !== next) check.partial++;
      const why = `settleFrom ≠ assentar inteiro · ${check.context}`;
      expect(got, why).toEqual(full);
      // Nada muda: o mesmo objeto; e o que o inteiro não mexe o recortado também não.
      if (full === next) expect(got, `${why} · identidade`).toBe(next);
      full.markings.forEach((m, i) => {
        if (m === next.markings[i])
          expect(got.markings[i], `${why} · marcação ${m.id}`).toBe(m);
      });
      return got;
    },
  };
});

// ---------------------------------------------------------------------------------------------
// Gerador pseudoaleatório
// ---------------------------------------------------------------------------------------------

interface Rng {
  float(): number;
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const float = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number =>
    hi < lo ? lo : lo + Math.floor(float() * (hi - lo + 1));
  return {
    float,
    int,
    chance: (p) => float() < p,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
  };
}

interface Ctx {
  readonly rng: Rng;
  readonly p: Project;
  /** Contador de ids novos. */
  next(prefix: string): string;
}

type Op = (c: Ctx) => Project;

// ---------------------------------------------------------------------------------------------
// Retângulos e escolhas
// ---------------------------------------------------------------------------------------------

/** Um retângulo no espaço `containerId`: encaixado numa existente do espaço, igual, solto ou sobre um container. */
function rectIn(c: Ctx, containerId: string | null): Rect {
  const { rng, p } = c;
  const container = p.containers.find((x) => x.id === containerId);
  const space = p.markings.filter((m) => m.containerId === containerId && !m.floating);
  const kind = rng.pick(['nested', 'nested', 'equal', 'random', 'over'] as const);
  const base = space.length > 0 ? rng.pick(space).rect : null;
  if (base && kind === 'nested' && base.width > 30 && base.height > 30) {
    const cutX = Math.floor((base.width - 24) / 3);
    const cutY = Math.floor((base.height - 24) / 3);
    const dx = rng.int(0, cutX);
    const dy = rng.int(0, cutY);
    return {
      x: base.x + dx,
      y: base.y + dy,
      width: base.width - dx - rng.int(0, cutX),
      height: base.height - dy - rng.int(0, cutY),
    };
  }
  if (base && kind === 'equal') return { ...base };
  if (containerId === null && kind === 'over' && p.containers.length > 0) {
    const target = rng.pick(p.containers);
    const s = target.placement.scale;
    const x = Math.floor(target.placement.x) - rng.pick([0, 5, 40]);
    const y = Math.floor(target.placement.y) - rng.pick([0, 5, 40]);
    return {
      x,
      y,
      width: Math.ceil(target.width * s) + rng.pick([0, 10, 80]),
      height: Math.ceil(target.height * s) + rng.pick([0, 10, 80]),
    };
  }
  const area = container
    ? { x: 0, y: 0, width: container.width, height: container.height }
    : { x: -100, y: -50, width: 3600, height: 600 };
  const width = rng.int(24, Math.max(24, Math.min(area.width, 160)));
  const height = rng.int(24, Math.max(24, Math.min(area.height, 120)));
  return {
    x: rng.int(area.x, area.x + area.width - width),
    y: rng.int(area.y, area.y + area.height - height),
    width,
    height,
  };
}

const spaceKeys = (p: Project): (string | null)[] => [
  null,
  ...p.containers.map((x) => x.id),
];

function anyMarking(c: Ctx): Marking | null {
  return c.p.markings.length > 0 ? c.rng.pick(c.p.markings) : null;
}

/** Itens da seleção: 1 a 3 marcações (e, às vezes, um container). */
function someItems(c: Ctx): ItemRef[] {
  const items: ItemRef[] = [];
  const count = c.rng.int(1, 3);
  for (let i = 0; i < count && c.p.markings.length > 0; i++) {
    items.push({ kind: 'marking', id: c.rng.pick(c.p.markings).id });
  }
  if (c.p.containers.length > 0 && c.rng.chance(0.2)) {
    items.push({ kind: 'image', id: c.rng.pick(c.p.containers).id });
  }
  return items;
}

const smallDelta = (c: Ctx): number => c.rng.int(-30, 30);

// ---------------------------------------------------------------------------------------------
// Operações públicas do modelo
// ---------------------------------------------------------------------------------------------

const OPS: Record<string, { weight: number; run: Op }> = {
  createMarking: {
    weight: 6,
    run: (c) => {
      const containerId = c.rng.pick(spaceKeys(c.p));
      const floating = containerId === null && c.rng.chance(0.1);
      return createMarking(c.p, {
        id: c.next('M'),
        containerId,
        rect: rectIn(c, containerId),
        floating,
      });
    },
  },
  moveMarking: {
    weight: 5,
    run: (c) => {
      const m = anyMarking(c);
      return m ? moveMarking(c.p, m.id, smallDelta(c), smallDelta(c)) : c.p;
    },
  },
  resizeMarking: {
    weight: 4,
    run: (c) => {
      const m = anyMarking(c);
      if (!m) return c.p;
      const field = c.rng.pick(['x', 'y', 'width', 'height'] as const);
      return adjustMarkingRect(c.p, m.id, field, m.rect[field] + c.rng.int(-20, 20));
    },
  },
  setMarkingRect: {
    weight: 3,
    run: (c) => {
      const m = anyMarking(c);
      return m ? setMarkingRect(c.p, m.id, rectIn(c, m.containerId)) : c.p;
    },
  },
  setMarkingSpace: {
    weight: 3,
    run: (c) => {
      const m = anyMarking(c);
      if (!m) return c.p;
      const containerId = m.floating ? null : c.rng.pick(spaceKeys(c.p));
      return setMarkingSpace(c.p, m.id, containerId, rectIn(c, containerId));
    },
  },
  setMarkingFloating: {
    weight: 2,
    run: (c) => {
      const m = anyMarking(c);
      return m ? setMarkingFloating(c.p, m.id, !m.floating) : c.p;
    },
  },
  removeMarking: {
    weight: 3,
    run: (c) => {
      const m = anyMarking(c);
      return m ? removeMarking(c.p, m.id) : c.p;
    },
  },
  reorderMarking: {
    weight: 4,
    run: (c) => {
      const m = anyMarking(c);
      return m ? reorderMarking(c.p, m.id, c.rng.int(0, 5)) : c.p;
    },
  },
  wrapItems: {
    weight: 3,
    run: (c) => wrapItems(c.p, { id: c.next('W'), items: someItems(c) }),
  },
  moveItems: {
    weight: 3,
    run: (c) => moveItems(c.p, someItems(c), smallDelta(c), smallDelta(c)),
  },
  nudgeItems: {
    weight: 2,
    run: (c) => nudgeItems(c.p, someItems(c), c.rng.int(-9, 9), c.rng.int(-9, 9)),
  },
  removeItems: {
    weight: 2,
    run: (c) => removeItems(c.p, someItems(c)),
  },
  moveContainer: {
    weight: 3,
    run: (c) => {
      if (c.p.containers.length === 0) return c.p;
      const x = c.rng.pick(c.p.containers);
      return moveContainer(
        c.p,
        x.id,
        x.placement.x + c.rng.int(-150, 150),
        x.placement.y + c.rng.int(-80, 80),
      );
    },
  },
  resizeContainer: {
    weight: 2,
    run: (c) => {
      if (c.p.containers.length === 0) return c.p;
      const x = c.rng.pick(c.p.containers);
      return resizeContainer(c.p, x.id, {
        ...x.placement,
        scale: c.rng.pick([0.5, 0.75, 1, 1.5, 2]),
      });
    },
  },
  addContainer: {
    weight: 2,
    run: (c) => {
      const id = c.next('C');
      return addContainer(c.p, {
        id,
        file: `images/${id}.png`,
        width: c.rng.int(80, 300),
        height: c.rng.int(80, 240),
        center: { x: c.rng.int(0, 3500), y: c.rng.int(0, 600) },
      });
    },
  },
  removeContainer: {
    weight: 1,
    run: (c) =>
      c.p.containers.length > 0
        ? removeContainer(c.p, c.rng.pick(c.p.containers).id)
        : c.p,
  },
  applyProposal: {
    weight: 2,
    run: (c) => {
      const m = anyMarking(c);
      if (!m) return c.p;
      const containerId = c.rng.pick(spaceKeys(c.p));
      let after = createMarking(c.p, {
        id: c.next('PM'),
        containerId,
        rect: rectIn(c, containerId),
      });
      after = moveMarking(after, m.id, smallDelta(c), smallDelta(c));
      const proposal = decided(
        propose(c.p, after),
        c.p,
        { level: 'proposal', id: null },
        'accepted',
      );
      const applied = applyAccepted(c.p, proposal, AT);
      return applied.ok ? applied.project : c.p;
    },
  },
  addPerspective: {
    weight: 2,
    run: (c) => {
      const id = c.next('P');
      const from = c.p.perspectives.length > 0 && c.rng.chance(0.4);
      return addPerspective(
        c.p,
        buildPerspective(c.p, {
          id,
          name: `Perspectiva ${id}`,
          startFrom: from
            ? c.rng.pick(c.p.perspectives)
            : c.rng.chance(0.5)
              ? null
              : 'empty',
        }),
      );
    },
  },
  sendRoots: {
    weight: 2,
    run: (c) => {
      if (c.p.perspectives.length === 0) return c.p;
      const roots = [
        ...c.p.containers.map((x) => x.id),
        ...c.p.markings.map((m) => m.id),
      ];
      const rootIds = Array.from({ length: c.rng.int(1, 3) }, () => c.rng.pick(roots));
      return sendRootsToPerspective(c.p, c.rng.pick(c.p.perspectives).id, rootIds, null);
    },
  },
  moveRootsInPerspective: {
    weight: 2,
    run: (c) => {
      const withItems = c.p.perspectives.filter((x) => x.items.length > 0);
      if (withItems.length === 0) return c.p;
      const target = c.rng.pick(withItems);
      const item = c.rng.pick(target.items);
      return moveRootsInPerspective(c.p, target.id, [
        { root: item.root, dx: c.rng.int(-40, 40), dy: c.rng.int(-40, 40) },
      ]);
    },
  },
  arriveInPrincipal: {
    weight: 2,
    run: (c) => {
      const withItems = c.p.perspectives.filter((x) => x.items.length > 0);
      if (withItems.length === 0) return c.p;
      const from = c.rng.pick(withItems);
      return arriveInPrincipal(c.p, c.rng.pick(from.items).root, from).project;
    },
  },
  removePerspective: {
    weight: 1,
    run: (c) =>
      c.p.perspectives.length > 0
        ? removePerspective(c.p, c.rng.pick(c.p.perspectives).id)
        : c.p,
  },
  addArrival: {
    weight: 2,
    // Marca "Veio de…" (v16) posta à mão: o arquivo pode trazê-la; o assentar a limpa se a raiz mexer.
    run: (c) => {
      const roots = [
        ...c.p.containers.map((x) => x.id),
        ...c.p.markings.map((m) => m.id),
      ];
      if (roots.length === 0) return c.p;
      const root = c.rng.pick(roots);
      if (c.p.arrivals.some((a) => a.root === root)) return c.p;
      return {
        ...c.p,
        arrivals: [...c.p.arrivals, { root, from: 'P0', fromName: 'Origem' }],
      };
    },
  },
};

const OP_NAMES = Object.keys(OPS);
const WEIGHTED = OP_NAMES.flatMap((name) =>
  Array.from({ length: (OPS[name] as { weight: number }).weight }, () => name),
);

// ---------------------------------------------------------------------------------------------
// Sequência
// ---------------------------------------------------------------------------------------------

/** Projeto inicial: 3 containers, marcações espalhadas (criadas por `createMarking`) e duas perspectivas. */
function startProject(rng: Rng, seed: number): { p: Project; counter: { n: number } } {
  const counter = { n: 0 };
  const next = (prefix: string): string => `${prefix}${seed}-${counter.n++}`;
  let p = createProject({
    name: 'Sequências',
    now: '2026-11-09T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Camada', color: '#D32F2F' },
  });
  for (let k = 0; k < 3; k++) {
    p = addContainer(p, {
      id: `C${k}`,
      file: `images/c${k}.png`,
      width: rng.int(150, 320),
      height: rng.int(120, 240),
      center: { x: 400 + k * 1000, y: 150 },
    });
  }
  const ctx: Ctx = { rng, p, next };
  for (let i = 0; i < 10; i++) {
    const containerId = rng.pick(spaceKeys(p));
    p = createMarking(p, {
      id: next('S'),
      containerId,
      rect: rectIn({ ...ctx, p }, containerId),
    });
  }
  p = addPerspective(
    p,
    buildPerspective(p, { id: 'P0', name: 'Principal+', startFrom: null }),
  );
  p = addPerspective(
    p,
    buildPerspective(p, { id: 'P1', name: 'Vazia', startFrom: 'empty' }),
  );
  return { p, counter };
}

function runSequence(seed: number): void {
  const rng = makeRng(seed);
  let { p } = startProject(rng, seed);
  let n = 0;
  const next = (prefix: string): string => `${prefix}${seed}x${n++}`;
  for (let step = 0; step < STEPS; step++) {
    const name = rng.pick(WEIGHTED);
    check.context = `semente ${seed} · passo ${step} · ${name}`;
    try {
      const result = (OPS[name] as { run: Op }).run({ rng, p, next });
      if (result !== p) check.changed[name] = (check.changed[name] ?? 0) + 1;
      p = result;
    } catch (error) {
      // Operação recusada pelo modelo (travada, sobreposta, fora do container…): o passo vira nada.
      if (!(error instanceof ModelError)) throw error;
    }
  }
}

describe('assentar recortado: equivalência por sequências de operações públicas (#882)', () => {
  it(`${SEQUENCES} sequências de ${STEPS} operações: cada assentar é igual ao inteiro`, () => {
    check.calls = 0;
    check.partial = 0;
    check.changed = {};
    for (let i = 0; i < SEQUENCES; i++) runSequence(SEED + i * SEED_STEP);
    // O sorteio precisa de fato assentar e mudar coisas, senão não prova nada.
    expect(check.calls).toBeGreaterThan(SEQUENCES * STEPS * 0.4);
    expect(check.partial).toBeGreaterThan(check.calls * 0.1);
    for (const name of OP_NAMES) {
      expect(
        check.changed[name] ?? 0,
        `a operação ${name} nunca mudou o projeto`,
      ).toBeGreaterThan(0);
    }
    console.info(
      `assentar recortado: ${check.calls} assentares conferidos, ${check.partial} mudaram o projeto`,
    );
  });
});
