import { describe, expect, it } from 'vitest';
import {
  computeChanges,
  createMarking,
  patchProject,
  reorderMarking,
  removeMarking,
  setMarkingRect,
  settleHierarchy,
  siblingPosition,
  wrapItems,
  type Change,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { simulateApplied } from '../../src/model/proposalAnchors';
import { emptyProject } from './fixtures';

// Fuzz da fidelidade da proposta (etapa #549, decisão 6): sobre uma base aleatória, um lote de
// operações (criar, envolver, reordenar, mover ou redimensionar e remover) com retângulos de uma
// grade pequena, para forçar empates de retângulo e de área. `computeChanges` seguido de
// `patchProject` precisa dar os mesmos pais (marcações e containers) e a mesma ordem entre irmãs
// do projeto proposto, sem `problems`, e nenhum `position` pode ser redundante (tirar qualquer
// um muda o aplicado). A exceção é o lote em que nenhuma âncora daria os pais do proposto (um
// empate decidido por um passo do lote que a proposta não registra; "Garantia" em
// docs/PROPOSAL-FORMAT.md): o teste prova isso por força bruta e fixa os lotes. Semente fixa: o
// mesmo resultado em toda execução.

const BATCHES = 2000;
const SEED = 549;

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const int = (r: Rand, n: number) => Math.floor(r() * n);
const pick = <T>(r: Rand, list: readonly T[]): T => list[int(r, list.length)] as T;

/** Um intervalo [a, b) da grade `0, step, …, steps·step`. */
function span(r: Rand, steps: number, step: number): [number, number] {
  const a = int(r, steps);
  const b = a + 1 + int(r, steps - a);
  return [a * step, (b - a) * step];
}

/** Retângulo na grade do container (100×100, passo 25) ou do canvas (200×200, passo 50). */
function gridRect(r: Rand, inContainer: boolean): Rect {
  const [steps, step] = inContainer ? [4, 25] : [4, 50];
  const [x, width] = span(r, steps, step);
  const [y, height] = span(r, steps, step);
  return { x, y, width, height };
}

const CONTAINER: ProjectContainer = {
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

function tryOp(p: Project, op: () => Project): Project {
  try {
    return op();
  } catch {
    return p;
  }
}

function create(p: Project, r: Rand, id: string): Project {
  const inContainer = r() < 0.7;
  return tryOp(p, () =>
    createMarking(p, {
      id,
      containerId: inContainer ? 'C' : null,
      rect: gridRect(r, inContainer),
    }),
  );
}

function randomOp(p: Project, r: Rand, nextId: () => string): Project {
  const kind = int(r, 5);
  if (kind === 0 || p.markings.length === 0) return create(p, r, nextId());
  const m = pick(r, p.markings);
  if (kind === 1) {
    const items = [m, ...p.markings.filter(() => r() < 0.3)];
    const refs = [...new Set(items.map((x) => x.id))].map((id) => ({
      kind: 'marking' as const,
      id,
    }));
    return tryOp(p, () => wrapItems(p, { id: nextId(), items: refs }, { settle: true }));
  }
  if (kind === 2) {
    const { count } = siblingPosition(p, m.id);
    return tryOp(p, () => reorderMarking(p, m.id, int(r, count)));
  }
  if (kind === 3) {
    return tryOp(p, () => setMarkingRect(p, m.id, gridRect(r, m.containerId !== null)));
  }
  return tryOp(p, () => removeMarking(p, m.id));
}

const byId = (entries: [string, string | null][]) =>
  Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));

/** Pais das marcações e dos containers, e as irmãs (mesmo espaço e mesmo pai) em ordem. */
function shape(p: Project) {
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

interface Case {
  readonly batch: number;
  readonly base: Project;
  readonly after: Project;
  readonly changes: readonly Change[];
}

function cases(): Case[] {
  const r = rng(SEED);
  const out: Case[] = [];
  for (let batch = 0; batch < BATCHES; batch++) {
    let n = 0;
    const nextId = () => `N${n++}`;
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    const size = 3 + int(r, 5);
    for (let i = 0; i < size; i++) base = create(base, r, nextId());
    let after = base;
    const ops = 1 + int(r, 5);
    for (let i = 0; i < ops; i++) after = randomOp(after, r, nextId);
    out.push({ batch, base, after, changes: computeChanges(base, after) });
  }
  return out;
}

const isPosition = (c: Change) => c.entity === 'marking' && c.field === 'position';
const same = (a: Project, b: Project) =>
  JSON.stringify(shape(a)) === JSON.stringify(shape(b));
const sameParents = (a: Project, b: Project) => {
  const [sa, sb] = [shape(a), shape(b)];
  return (
    JSON.stringify([sa.markings, sa.containers]) ===
    JSON.stringify([sb.markings, sb.containers])
  );
};

/**
 * Nenhuma âncora reproduz os pais do proposto: o empate foi decidido por um passo do lote que a
 * proposta não registra (a exceção da "Garantia" em docs/PROPOSAL-FORMAT.md). Prova por força
 * bruta: toda escolha de `insertBefore` das criadas, no array e no assentar do aplicador.
 */
function unexpressible({ base, after }: Case): boolean {
  const afterIds = new Set(after.markings.map((m) => m.id));
  const baseIds = new Set(base.markings.map((m) => m.id));
  const slots = base.markings.filter((m) => afterIds.has(m.id)).map((m) => m.id);
  const created = after.markings.filter((m) => !baseIds.has(m.id)).map((m) => m.id);
  const total = (slots.length + 1) ** created.length;
  if (total > 100_000) throw new Error('caso grande demais para a força bruta');
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

/** Algum `position` sai sem mudar o aplicado (seria redundante)? */
function hasRedundantPosition({ base, after, changes }: Case): boolean {
  return changes.filter(isPosition).some((c) =>
    same(
      patchProject(
        base,
        changes.filter((x) => x !== c),
      ).project,
      after,
    ),
  );
}

describe('proposta: o aplicado é igual ao proposto (fuzz, #549)', () => {
  it(`${BATCHES} lotes: mesmos pais e mesma ordem entre irmãs, sem position redundante`, () => {
    const unstable: number[] = [];
    const divergent: number[] = [];
    const redundant: number[] = [];
    // A exceção da Garantia: divergem, e nenhuma âncora daria os pais do proposto.
    const exception: number[] = [];
    for (const c of cases()) {
      if (settleHierarchy(c.after) !== c.after) unstable.push(c.batch);
      const applied = patchProject(c.base, c.changes);
      if (applied.problems.length > 0) divergent.push(c.batch);
      else if (!same(applied.project, c.after)) {
        if (unexpressible(c)) exception.push(c.batch);
        else divergent.push(c.batch);
      } else if (hasRedundantPosition(c)) redundant.push(c.batch);
    }
    expect({ unstable, divergent, redundant }).toEqual({
      unstable: [],
      divergent: [],
      redundant: [],
    });
    // Antes da correção (semente 549): 6 lotes divergentes e 6 com position redundante.
    // Sobram os dois da exceção (cerca de 1 lote em 1.000).
    expect(exception).toEqual([182, 300]);
  });
});
