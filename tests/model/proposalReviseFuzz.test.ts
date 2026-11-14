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

// Fuzz of the proposal revision by the agent (stage #644, CP1). Each case: a random base
// (container and markings on a small grid, with free annotations), a random proposal
// (create, rename, resize, move, remove, annotate, reorder), random decisions,
// and a random revision (`drop` of 0 to 2 ids and a batch of 0 to 3 operations over the whole
// proposed project). Checks: an accepted change in the way refuses (`change-frozen`) and the proposal does not change;
// without an accepted one, applying the revised one to the current project gives the same as the batch (entity values,
// parents and order among siblings; except the known limit #625, by the same predicate as the
// fidelity fuzz); the untouched ones stay byte for byte equal (a creation whose anchor needs to change is
// replaced, or refused if accepted); the revised one reads back. Fixed seed.

const CASES = 1000;
const SEED = 644;
const AT = '2026-11-07T10:00:00.000Z';

/** A random model operation; `tag` keeps the new ids distinct between the phases. */
function randomOp(p: Project, r: Rand, tag: string, nextId: () => string): Project {
  const kind = int(r, 8);
  if (kind === 0 || p.markings.length === 0) return create(p, r, `${tag}${nextId()}`);
  const m = pick(r, p.markings);
  const inContainer = m.containerId !== null;
  switch (kind) {
    case 1:
      return renameMarking(p, m.id, `name-${int(r, 4)}`);
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
      return tryOp(p, () => renameAnnotation(p, a.id, `annot-${int(r, 4)}`));
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

/** Random decisions on some changes (accept, reject or clear, with the dependencies). */
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

/** JSON with the keys in order (compares values, not the order in which the keys were written). */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const sorted = <T extends { readonly id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

/** The project without the global order of the arrays and without `updatedAt`. */
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

interface Tally {
  [outcome: string]: number;
}

/**
 * Refusal by classification: without decisions the same revision passes, and the refused ids are
 * exactly the accepted ones it would replace or drop (including through the anchor of a creation).
 */
function frozenCheck(
  base: Project,
  p: Proposal,
  drop: readonly string[],
  after: Project | undefined,
  ids: readonly string[],
): { readonly problem?: string; readonly byAnchor: boolean } {
  const clear = reviseProposal(
    base,
    { ...p, decisions: {} },
    { drop, ...(after ? { after } : {}), at: AT },
  );
  if (!clear.ok) {
    return {
      problem: `frozen but without decisions refuses (${clear.error.code})`,
      byAnchor: false,
    };
  }
  const hit = [...clear.summary.changed, ...clear.summary.dropped].filter(
    (id) => p.decisions[id]?.state === 'accepted',
  );
  const anchor = clear.summary.changed.some((id) => {
    const was = p.changes.find((c) => c.id === id);
    const now = clear.proposal.changes.find((c) => c.id === id);
    return (
      was && now && json(was.to) === json(now.to) && was.insertBefore !== now.insertBefore
    );
  });
  const same = json([...hit].sort()) === json([...ids].sort());
  return { ...(same ? {} : { problem: 'frozen ids' }), byAnchor: anchor };
}

describe('proposal revision: fuzz (#644)', () => {
  it(`${CASES} cases: frozen refuses, fidelity to the batch and untouched ones identical`, () => {
    const r = rng(SEED);
    const tally: Tally = {};
    const count = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    const failures: string[] = [];
    const exception: number[] = [];

    for (let n = 0; n < CASES; n++) {
      const base = baseProject(r);
      const proposed0 = applyOps(base, r, 'P', 1 + int(r, 4));
      if (json(proposed0) === json(base)) {
        count('no-proposal');
        continue;
      }
      const built = buildProposal(base, proposed0, {
        id: 'P1',
        title: 'Fuzz',
        createdAt: AT,
      });
      if (built.changes.length === 0) {
        count('no-proposal');
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
        if (!closure.some(accepted)) failures.push(`${n}: frozen on drop without an accepted one`);
      }

      const res = reviseProposal(base, p, { drop, ...(after ? { after } : {}), at: AT });
      if (serializeProposal(p) !== before)
        failures.push(`${n}: the input proposal changed`);

      if (!res.ok) {
        count(res.error.code);
        if (res.error.code === 'change-frozen') {
          if (!res.error.changeIds.every(accepted))
            failures.push(`${n}: frozen without an accepted one`);
          if (prep.ok) {
            const check = frozenCheck(base, p, drop, after, res.error.changeIds);
            if (check.problem) failures.push(`${n}: ${check.problem}`);
            if (check.byAnchor) count('frozen-by-anchor');
          }
        }
        continue;
      }
      count('revised');
      const { proposal: q, summary } = res;
      if (!after && summary.added.length > 0)
        failures.push(`${n}: only drop and a new change`);
      if (summary.changed.length > 0) count('with-replaced');
      for (const id of summary.changed) {
        const was = p.changes.find((c) => c.id === id);
        const now = q.changes.find((c) => c.id === id);
        if (was && now && json(was.to) === json(now.to)) count('replaced-only-by-anchor');
      }
      if (summary.added.length > 0) count('with-new');
      if (summary.dropped.length > 0) count('with-dropped');
      const touched = new Set([...summary.changed, ...summary.dropped]);

      // Accepted and untouched: byte for byte equal, with the same decision.
      for (const old of p.changes) {
        if (accepted(old.id) && touched.has(old.id))
          failures.push(`${n}: accepted ${old.id} touched`);
        if (touched.has(old.id)) continue;
        const now = q.changes.find((c) => c.id === old.id);
        if (json(q.decisions[old.id]) !== json(p.decisions[old.id])) {
          failures.push(`${n}: ${old.id} untouched changed decision`);
        } else if (json(now) !== json(old)) {
          failures.push(`${n}: ${old.id} untouched changed`);
        }
      }
      for (const id of summary.changed) {
        if (q.decisions[id] !== undefined)
          failures.push(`${n}: replaced ${id} with a decision`);
      }

      // Fidelity: applying the changes of the revised one gives the same as the batch.
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
          failures.push(`${n}: fidelity (${applied.problems.length} problems)`);
        }
      }

      const parsed = parseProposal(JSON.parse(serializeProposal(q)));
      if (!parsed.ok) failures.push(`${n}: does not read back: ${parsed.errors[0] ?? ''}`);
    }

    expect(failures.slice(0, 15)).toEqual([]);
    // Seed 644 (1,000 cases): 734 revised (52 with replaced, 548 with new, 557 with dropped),
    // 96 no-changes, 114 change-frozen and 56 without a proposal; no exception of #625. The anchor that
    // needs to change appears in 3 cases: 1 replaced only by the anchor and 2 change-frozen refusals. Most
    // reach a real revision and every type of change appears.
    expect((tally['revised'] ?? 0) / CASES).toBeGreaterThan(0.5);
    expect(tally['change-frozen']).toBeGreaterThan(0);
    expect(tally['with-replaced']).toBeGreaterThan(0);
    expect(tally['with-new']).toBeGreaterThan(0);
    expect(tally['with-dropped']).toBeGreaterThan(0);
    expect(tally['replaced-only-by-anchor']).toBeGreaterThan(0);
    expect(tally['frozen-by-anchor']).toBeGreaterThan(0);
    expect(exception).toEqual([]);
  });
});

export type { Change };
