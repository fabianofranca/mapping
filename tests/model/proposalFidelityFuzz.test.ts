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
// um muda o aplicado). Semente fixa: o mesmo resultado em toda execução.

const BATCHES = Number(process.env.BATCHES ?? 2000);
const SEED = Number(process.env.SEED ?? 549);

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

describe('proposta: o aplicado é igual ao proposto (fuzz, #549)', () => {
  it(`${BATCHES} lotes: mesmos pais e mesma ordem entre irmãs, sem position redundante`, () => {
    const divergent: number[] = [];
    const unstable: number[] = [];
    const redundant: number[] = [];
    const all = cases();
    for (const { batch, base, after, changes } of all) {
      if (settleHierarchy(after) !== after) unstable.push(batch);
      const applied = patchProject(base, changes);
      const expected = shape(after);
      if (
        applied.problems.length > 0 ||
        JSON.stringify(shape(applied.project)) !== JSON.stringify(expected)
      ) {
        divergent.push(batch);
        continue;
      }
      for (const c of changes.filter(isPosition)) {
        const without = patchProject(
          base,
          changes.filter((x) => x !== c),
        );
        if (JSON.stringify(shape(without.project)) === JSON.stringify(expected)) {
          redundant.push(batch);
          break;
        }
      }
    }
    const parentDiv = divergent.filter((b) => {
      const c = all[b] as Case;
      const a = patchProject(c.base, c.changes).project;
      return (
        JSON.stringify(shape(a).markings) !== JSON.stringify(shape(c.after).markings) ||
        JSON.stringify(shape(a).containers) !== JSON.stringify(shape(c.after).containers)
      );
    });
    const withPos = divergent.filter((b) => (all[b] as Case).changes.some(isPosition));
    console.log(
      'DIV',
      divergent.length,
      'parents',
      parentDiv.length,
      'withPos',
      withPos.length,
      'parentNoPos',
      parentDiv.filter((b) => !withPos.includes(b)).length,
      'redundant',
      redundant.length,
      'unstable',
      unstable.length,
    );
    const dump = (b: number) => {
      const c = all[b] as Case;
      const a = patchProject(c.base, c.changes).project;
      const f = (p: Project) =>
        p.markings
          .map(
            (m) =>
              `${m.id}:${m.containerId ?? 'cv'}:${m.rect.x},${m.rect.y},${m.rect.width}x${m.rect.height}^${m.parentId ?? '-'}`,
          )
          .join('  ');
      console.log(
        `#${b}\nBASE  ${f(c.base)} C^${c.base.containers[0]?.parentId}\nAFTER ${f(c.after)} C^${c.after.containers[0]?.parentId}\nAPPL  ${f(a)} C^${a.containers[0]?.parentId}\nCH ${c.changes.map((x) => `${x.kind}:${x.entityId}:${x.field ?? ''}${x.field === 'position' ? '=' + String(x.to) : ''}${x.insertBefore ? '<' + x.insertBefore : ''}`).join(' ')}`,
      );
    };
    const involvesCreated = (b: number) => { const c = all[b] as Case; const ids = new Set(c.base.markings.map((m) => m.id)); const a = new Map(patchProject(c.base, c.changes).project.markings.map((m) => [m.id, m.parentId])); return c.after.markings.some((m) => a.get(m.id) !== m.parentId && [m.id, m.parentId, a.get(m.id)].some((x) => x != null && !ids.has(x))); };
    const oneShot = (b: number) => { const c = all[b] as Case; const bp = new Map(c.base.markings.map((m) => [m.id, m.parentId])); const bc = new Map(c.base.containers.map((x) => [x.id, x.parentId])); const r = settleHierarchy({ ...c.after, markings: c.after.markings.map((m) => (bp.has(m.id) ? { ...m, parentId: bp.get(m.id) ?? null } : m)), containers: c.after.containers.map((x) => ({ ...x, parentId: bc.get(x.id) ?? null })) }); return JSON.stringify(shape(r).markings) === JSON.stringify(shape(c.after).markings) && JSON.stringify(shape(r).containers) === JSON.stringify(shape(c.after).containers); };
    const unexpressible = (b: number) => { const c = all[b] as Case; const ids = new Set(c.base.markings.map((m) => m.id)); const surv = c.base.markings.filter((m) => c.after.markings.some((x) => x.id === m.id)); const created = c.after.markings.filter((m) => !ids.has(m.id)); const want = JSON.stringify([shape(c.after).markings, shape(c.after).containers]); const total = (surv.length + 1) ** created.length; if (total > 50000) return false; for (let k = 0; k < total; k++) { const anchors = new Map<string, string>(); let r = k; for (const m of created) { const at = r % (surv.length + 1); r = Math.floor(r / (surv.length + 1)); if (at < surv.length) anchors.set(m.id, (surv[at] as { id: string }).id); } const a = simulateApplied(c.base, c.after, anchors); if (JSON.stringify([shape(a).markings, shape(a).containers]) === want) return false; } return true; };
    console.log('EXPRESSIBLE-DIVERGENT', divergent.filter((b) => !unexpressible(b)).join(','));
    console.log('ONESHOTOK-BUT-DIVERGENT', divergent.filter(oneShot).join(','));
    console.log('CREATEDINV', divergent.filter(involvesCreated).join(','));
    for (const b of (process.env.DUMP ?? '').split(',').filter(Boolean)) dump(Number(b));
    console.log(
      'PARENTNOPOS',
      parentDiv
        .filter((b) => !withPos.includes(b))
        .slice(0, 5)
        .join(','),
      'ORDERONLY',
      divergent
        .filter((b) => !parentDiv.includes(b))
        .slice(0, 5)
        .join(','),
    );
    expect({ unstable, divergent, redundant }).toEqual({
      unstable: [],
      divergent: [],
      redundant: [],
    });
  });
});
