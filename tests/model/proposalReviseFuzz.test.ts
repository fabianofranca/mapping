import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  buildProposal,
  decide,
  dependentChanges,
  moveMarking,
  parseProposal,
  patchProject,
  prepareRevision,
  removeMarking,
  renameAnnotation,
  renameMarking,
  reorderMarking,
  reviewTree,
  reviseProposal,
  serializeProposal,
  setMarkingRect,
  siblingPosition,
  type Change,
  type DecisionState,
  type Project,
  type Proposal,
} from '../../src/model';
import { emptyProject } from './fixtures';
import {
  CONTAINER,
  create,
  gridRect,
  int,
  pick,
  rng,
  same,
  tryOp,
  unexpressible,
  type Rand,
} from './proposalFuzzSupport';

// Fuzz da revisão da proposta pelo agente (etapa #644, CP1). Cada caso: uma base aleatória
// (container e marcações em grade pequena, com anotações livres), uma proposta aleatória
// (criar, renomear, redimensionar, mover, remover, anotar, reordenar), decisões aleatórias,
// e uma revisão aleatória (`drop` de 0 a 2 ids e um lote de 0 a 3 operações sobre o proposto
// inteiro). Confere: mudança aceita no caminho recusa (`change-frozen`) e a proposta não muda;
// sem aceita, aplicar a revisada ao projeto atual dá o mesmo do lote (valores das entidades,
// pais e ordem entre irmãs; fora o limite conhecido #625, pelo mesmo predicado do fuzz da
// fidelidade); as intocadas ficam byte a byte iguais; a revisada lê de volta. Semente fixa.

const CASES = 1000;
const SEED = 644;
const AT = '2026-11-07T10:00:00.000Z';

/** Uma operação aleatória do modelo; `tag` mantém os ids novos distintos entre as fases. */
function randomOp(p: Project, r: Rand, tag: string, nextId: () => string): Project {
  const kind = int(r, 8);
  if (kind === 0 || p.markings.length === 0) return create(p, r, `${tag}${nextId()}`);
  const m = pick(r, p.markings);
  const inContainer = m.containerId !== null;
  switch (kind) {
    case 1:
      return renameMarking(p, m.id, `nome-${int(r, 4)}`);
    case 2:
      return tryOp(p, () => setMarkingRect(p, m.id, gridRect(r, inContainer)));
    case 3:
      return tryOp(p, () =>
        moveMarking(p, m.id, (int(r, 3) - 1) * 25, (int(r, 3) - 1) * 25),
      );
    case 4:
      return tryOp(p, () => removeMarking(p, m.id));
    case 5:
      return tryOp(p, () =>
        addAnnotation(p, {
          id: `${tag}A${nextId()}`,
          markingId: m.id,
          layerId: 'L1',
          entries: [{ key: 'k', value: `v${int(r, 3)}` }],
        }),
      );
    case 6: {
      if (p.annotations.length === 0) return p;
      const a = pick(r, p.annotations);
      return tryOp(p, () => renameAnnotation(p, a.id, `anot-${int(r, 4)}`));
    }
    default: {
      const { count } = siblingPosition(p, m.id);
      return tryOp(p, () => reorderMarking(p, m.id, int(r, count)));
    }
  }
}

function applyOps(p: Project, r: Rand, tag: string, count: number): Project {
  let n = 0;
  const nextId = () => `${n++}`;
  let out = p;
  for (let i = 0; i < count; i++) out = randomOp(out, r, tag, nextId);
  return out;
}

function baseProject(r: Rand): Project {
  let p: Project = { ...emptyProject(), containers: [CONTAINER] };
  const size = 2 + int(r, 4);
  for (let i = 0; i < size; i++) p = create(p, r, `B${i}`);
  for (const m of p.markings) {
    if (r() < 0.4) {
      p = addAnnotation(p, {
        id: `BA-${m.id}`,
        markingId: m.id,
        layerId: 'L1',
        entries: [{ key: 'k', value: 'base' }],
      });
    }
  }
  return p;
}

/** Decisões aleatórias sobre algumas mudanças (aceitar, rejeitar ou limpar, com as dependências). */
function withDecisions(p: Proposal, base: Project, r: Rand): Proposal {
  let out = p;
  const rounds = int(r, 4);
  for (let i = 0; i < rounds; i++) {
    const c = pick(r, out.changes);
    const state = pick<DecisionState | null>(r, [
      'accepted',
      'rejected',
      'rejected',
      null,
    ]);
    const result = decide(
      out,
      reviewTree(out, base),
      { level: 'change', id: c.id },
      state,
      AT,
    );
    if (result.ok) out = { ...out, decisions: result.decisions };
  }
  return out;
}

const json = (value: unknown) => JSON.stringify(value);

/** JSON com as chaves em ordem (compara valores, não a ordem em que as chaves foram escritas). */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const sorted = <T extends { readonly id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

/** O projeto sem a ordem global dos arrays e sem `updatedAt`. */
function normalized(p: Project): string {
  return canonical({
    ...p,
    project: { ...p.project, updatedAt: '' },
    layers: sorted(p.layers),
    containers: sorted(p.containers),
    markings: sorted(p.markings),
    arrows: sorted(p.arrows),
    annotations: sorted(p.annotations),
  });
}

function withoutAnchor(c: Change | undefined) {
  if (!c) return c;
  const copy: { -readonly [K in keyof Change]: Change[K] } = { ...c };
  delete copy.insertBefore;
  return copy;
}

interface Tally {
  [outcome: string]: number;
}

describe('revisão da proposta: fuzz (#644)', () => {
  it(`${CASES} casos: congelada recusa, fidelidade ao lote e intocadas idênticas`, () => {
    const r = rng(SEED);
    const tally: Tally = {};
    const count = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    const failures: string[] = [];
    const exception: number[] = [];

    for (let n = 0; n < CASES; n++) {
      const base = baseProject(r);
      const proposed0 = applyOps(base, r, 'P', 1 + int(r, 4));
      if (json(proposed0) === json(base)) {
        count('sem-proposta');
        continue;
      }
      const built = buildProposal(base, proposed0, {
        id: 'P1',
        title: 'Fuzz',
        createdAt: AT,
      });
      if (built.changes.length === 0) {
        count('sem-proposta');
        continue;
      }
      const p = withDecisions(built, base, r);
      const before = serializeProposal(p);
      const accepted = (id: string) => p.decisions[id]?.state === 'accepted';
      const ids = p.changes.map((c) => c.id);
      const drop = Array.from({ length: int(r, 3) }, () => pick(r, ids));

      const prep = prepareRevision(base, p, drop);
      let after: Project | undefined;
      if (prep.ok) {
        after = applyOps(prep.proposed, r, 'R', int(r, 4));
        if (json(after) === json(prep.proposed)) after = undefined;
      } else if (prep.error.code === 'change-frozen') {
        const closure = [...drop, ...dependentChanges(p, drop)];
        if (!closure.some(accepted)) failures.push(`${n}: frozen no drop sem aceita`);
      }

      const res = reviseProposal(base, p, { drop, ...(after ? { after } : {}), at: AT });
      if (serializeProposal(p) !== before)
        failures.push(`${n}: a proposta de entrada mudou`);

      if (!res.ok) {
        count(res.error.code);
        if (res.error.code === 'change-frozen') {
          if (!res.error.changeIds.every(accepted))
            failures.push(`${n}: frozen sem aceita`);
        }
        continue;
      }
      count('revisada');
      const { proposal: q, summary } = res;
      if (!after && summary.added.length > 0)
        failures.push(`${n}: só drop e mudança nova`);
      if (summary.changed.length > 0) count('com-trocada');
      if (summary.added.length > 0) count('com-nova');
      if (summary.dropped.length > 0) count('com-retirada');
      const touched = new Set([...summary.changed, ...summary.dropped]);

      // Aceitas e intocadas: byte a byte iguais, com a mesma decisão.
      for (const old of p.changes) {
        if (accepted(old.id) && touched.has(old.id))
          failures.push(`${n}: aceita ${old.id} mexida`);
        if (touched.has(old.id)) continue;
        const now = q.changes.find((c) => c.id === old.id);
        if (json(q.decisions[old.id]) !== json(p.decisions[old.id])) {
          failures.push(`${n}: ${old.id} intocada mudou de decisão`);
        } else if (json(now) !== json(old)) {
          // Só a âncora de uma criação pode mudar (fallback de fidelidade): conta à parte.
          if (json(withoutAnchor(now)) !== json(withoutAnchor(old))) {
            failures.push(`${n}: ${old.id} intocada mudou`);
          } else count('ancora-atualizada');
        }
      }
      for (const id of summary.changed) {
        if (q.decisions[id] !== undefined)
          failures.push(`${n}: trocada ${id} com decisão`);
      }

      // Fidelidade: aplicar as mudanças da revisada dá o mesmo do lote.
      const target = after ?? (prep.ok ? prep.proposed : base);
      const applied = patchProject(base, q.changes);
      const equal =
        applied.problems.length === 0 &&
        normalized(applied.project) === normalized(target) &&
        same(applied.project, target);
      if (!equal) {
        if (applied.problems.length === 0 && unexpressible({ base, after: target })) {
          exception.push(n);
        } else {
          failures.push(`${n}: fidelidade (${applied.problems.length} problemas)`);
        }
      }

      const parsed = parseProposal(JSON.parse(serializeProposal(q)));
      if (!parsed.ok) failures.push(`${n}: não lê de volta: ${parsed.errors[0] ?? ''}`);
    }

    expect(failures.slice(0, 15)).toEqual([]);
    // Semente 644 (1.000 casos): 736 revisadas (51 com trocada, 550 com nova, 559 com retirada),
    // 96 no-changes, 112 change-frozen e 56 sem proposta; nenhuma exceção do #625. A maioria
    // chega a uma revisão de verdade e cada tipo de mudança aparece.
    expect((tally['revisada'] ?? 0) / CASES).toBeGreaterThan(0.5);
    expect(tally['change-frozen']).toBeGreaterThan(0);
    expect(tally['com-trocada']).toBeGreaterThan(0);
    expect(tally['com-nova']).toBeGreaterThan(0);
    expect(tally['com-retirada']).toBeGreaterThan(0);
    expect(exception).toEqual([]);
  });
});

export type { Change };
