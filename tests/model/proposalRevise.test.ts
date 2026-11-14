import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addNote,
  createMarking,
  parseProposal,
  patchProject,
  prepareRevision,
  removeMarking,
  renameMarking,
  reorderMarking,
  reviseProposal,
  serializeProposal,
  type Change,
  type Project,
  type Proposal,
  type ReviseArgs,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { CONTAINER, shape } from './proposalFuzzSupport';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Proposal revision by the agent (stage #644, CP1): `prepareRevision` closes the `drop` and builds the
// whole proposed project; the batch (here, the model's pure operations) runs over it; `reviseProposal`
// classifies each change (untouched, replaced, new or dropped) by the net effect of the
// result on the current project. Rules: docs/PROPOSAL-FORMAT.md, "Agent revision".

const AT2 = '2026-11-07T10:00:00.000Z';

/** Prepares, applies the batch to the proposed project and revises; without `mutate`, only the `drop`. */
function revise(
  project: Project,
  p: Proposal,
  drop: readonly string[] = [],
  mutate?: (proposed: Project) => Project,
) {
  const prep = prepareRevision(project, p, drop);
  if (!prep.ok) throw new Error(`prepareRevision: ${prep.error.code}`);
  const args: ReviseArgs = {
    drop,
    at: AT2,
    ...(mutate ? { after: mutate(prep.proposed) } : {}),
  };
  return { prep, result: reviseProposal(project, p, args), after: args.after };
}

/** The result expected as a success (fails with the code if it is a refusal). */
function okOf(r: ReturnType<typeof reviseProposal>) {
  if (!r.ok) throw new Error(`refused: ${r.error.code} ${r.error.changeIds.join(',')}`);
  return r;
}

function errorOf(r: ReturnType<typeof reviseProposal>) {
  if (r.ok) throw new Error('expected a refusal');
  return r.error;
}

const sorted = <T extends { readonly id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

/** The project without the global order of the arrays and without `updatedAt`. */
function normalized(p: Project) {
  return {
    ...p,
    project: { ...p.project, updatedAt: '' },
    layers: sorted(p.layers),
    containers: sorted(p.containers),
    markings: sorted(p.markings),
    arrows: sorted(p.arrows),
    annotations: sorted(p.annotations),
  };
}

/** Fidelity: applying the revised one to the current project gives the batch's `after`. */
function expectFidelity(project: Project, revised: Proposal, after: Project) {
  const applied = patchProject(project, revised.changes);
  expect(applied.problems).toEqual([]);
  expect(normalized(applied.project)).toEqual(normalized(after));
  expect(shape(applied.project)).toEqual(shape(after));
}

const json = (value: unknown) => JSON.stringify(value);

/** New change of `base` with a marking N1 on I2 (and, optionally, an annotation). */
function withNewMarking(base: Project, annotated: boolean): Project {
  const created = createMarking(base, {
    id: 'N1',
    containerId: 'I2',
    rect: { x: 500, y: 500, width: 100, height: 100 },
  });
  return annotated
    ? addAnnotation(created, { id: 'A9', markingId: 'N1', layerId: 'L1' })
    : created;
}

describe('reviseProposal: classification of the changes', () => {
  it('replaces the name of an item whose change was rejected: replaced, without a decision', () => {
    const base = sampleProject();
    let p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const old = changeOf(p, 'marking', 'M4', 'name');
    p = decided(p, base, { level: 'change', id: old.id }, 'rejected');
    p = addNote(p, { level: 'change', id: old.id }, 'I prefer another name', AT, 'n1');

    const { result, after } = revise(base, p, [], (x) =>
      renameMarking(x, 'M4', 'Lantern'),
    );
    const r = okOf(result);

    const swapped = changeOf(r.proposal, 'marking', 'M4', 'name');
    expect(swapped).toEqual({ ...old, to: 'Lantern' });
    expect(r.proposal.decisions[old.id]).toBeUndefined();
    expect(r.proposal.notes).toEqual(p.notes);
    expect(r.summary).toEqual({ changed: [old.id], added: [], dropped: [] });
    expect(r.proposal.formatVersion).toBe(5);
    expect(r.proposal.revisions).toEqual([
      {
        at: AT2,
        baseRevision: base.revision,
        operations: [],
        changed: { [old.id]: { to: 'Headlight', state: 'rejected' } },
        added: [],
        dropped: [],
      },
    ]);
    expectFidelity(base, r.proposal, after as Project);
  });

  it('drops the rejected creation with the annotations; the note goes to the proposal', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const marking = changeOf(p, 'marking', 'N1');
    const annotation = changeOf(p, 'annotation', 'A9');
    p = decided(p, base, { level: 'change', id: marking.id }, 'rejected');
    p = addNote(p, { level: 'change', id: marking.id }, 'Not needed', AT, 'n1');
    p = addNote(p, { level: 'proposal', id: null }, 'General', AT, 'n2');

    const { result } = revise(base, p, [marking.id]);
    const r = okOf(result);

    expect(r.proposal.changes).toEqual([]);
    expect(r.proposal.decisions).toEqual({});
    expect(r.summary.dropped).toEqual([marking.id, annotation.id]);
    expect(r.proposal.notes).toEqual([
      { id: 'n1', target: { level: 'proposal', id: null }, text: 'Not needed', at: AT },
      p.notes[1],
    ]);
    const revision = r.proposal.revisions?.[0];
    expect(revision?.dropped).toEqual([
      { change: marking, state: 'rejected', notes: ['n1'] },
      { change: annotation, state: 'rejected', notes: [] },
    ]);
  });

  it('adds an annotation to a created and accepted item: new; the accepted one stays identical', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const marking = changeOf(p, 'marking', 'N1');
    p = decided(p, base, { level: 'change', id: marking.id }, 'accepted');
    p = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'A9').id },
      'accepted',
    );

    const { result, after } = revise(base, p, [], (x) =>
      addAnnotation(x, { id: 'A10', markingId: 'N1', layerId: 'L2' }),
    );
    const r = okOf(result);

    const added = changeOf(r.proposal, 'annotation', 'A10');
    expect(added.kind).toBe('create');
    expect(added.from).toBeNull();
    expect(r.proposal.decisions[added.id]).toBeUndefined();
    expect(r.summary).toEqual({ changed: [], added: [added.id], dropped: [] });
    for (const old of p.changes) {
      const now = r.proposal.changes.find((c) => c.id === old.id) as Change;
      expect(json(now)).toBe(json(old));
      expect(json(r.proposal.decisions[old.id])).toBe(json(p.decisions[old.id]));
    }
    expectFidelity(base, r.proposal, after as Project);
  });

  it('refuses to replace a created and accepted item: change-frozen with the id of the creation', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, false));
    const marking = changeOf(p, 'marking', 'N1');
    p = decided(p, base, { level: 'change', id: marking.id }, 'accepted');

    const { result } = revise(base, p, [], (x) => renameMarking(x, 'N1', 'Other'));
    const error = errorOf(result);

    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toEqual([marking.id]);
  });

  it('the batch returns the value to from: the change is dropped', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M1', 'Portal'));
    const old = changeOf(p, 'marking', 'M1', 'name');

    const { result } = revise(base, p, [], (x) => // pt-BR kept: shared fixture data (sampleProject marking name) asserted by other tests\n      renameMarking(x, 'M1', 'Porta'));
    const r = okOf(result);

    expect(r.proposal.changes).toEqual([]);
    expect(r.summary).toEqual({ changed: [], added: [], dropped: [old.id] });
    expect(r.proposal.revisions?.[0]?.dropped).toEqual([
      { change: old, state: null, notes: [] },
    ]);
  });

  it('new creation in a group of siblings with position: applying gives the same as the batch', () => {
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    ['A', 'B', 'K'].forEach((id, i) => {
      base = createMarking(base, {
        id,
        containerId: 'C',
        rect: { x: i * 30, y: 0, width: 20, height: 20 },
      });
    });
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'C',
      rect: { x: 0, y: 50, width: 20, height: 20 },
    });
    after = reorderMarking(reorderMarking(after, 'N1', 0), 'K', 1);
    const p = propose(base, after);
    expect(p.changes.some((c) => c.field === 'position')).toBe(true);

    const { result, after: revised } = revise(base, p, [], (x) =>
      reorderMarking(
        createMarking(x, {
          id: 'N2',
          containerId: 'C',
          rect: { x: 30, y: 50, width: 20, height: 20 },
        }),
        'N2',
        1,
      ),
    );
    const r = okOf(result);

    expect(r.summary.added.length).toBeGreaterThan(0);
    expectFidelity(base, r.proposal, revised as Project);
  });

  it('anchor that needs to change: replaced; accepted: change-frozen', () => {
    // Fuzz case (seed 644, case 327): the creation of P0 enters before B2; the batch removes B2 and
    // reorders B1, and the anchor of P0 becomes B3. The place in the array is part of the creation's effect.
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    const rects = {
      B0: [50, 25, 25, 25],
      B1: [75, 25, 25, 25],
      B2: [0, 50, 50, 50],
      B3: [50, 50, 50, 50],
    };
    for (const [id, [x, y, width, height]] of Object.entries(rects) as [
      string,
      number[],
    ][]) {
      base = createMarking(base, {
        id,
        containerId: 'C',
        rect: {
          x: x as number,
          y: y as number,
          width: width as number,
          height: height as number,
        },
      });
    }
    const proposed = reorderMarking(
      createMarking(base, {
        id: 'P0',
        containerId: 'C',
        rect: { x: 0, y: 75, width: 75, height: 25 },
      }),
      'P0',
      2,
    );
    const p = propose(base, proposed);
    const creation = changeOf(p, 'marking', 'P0');
    expect(creation.insertBefore).toBe('B2');
    const batch = (x: Project) => reorderMarking(removeMarking(x, 'B2'), 'B1', 0);

    const { result, after } = revise(base, p, [], batch);
    const r = okOf(result);
    const moved = changeOf(r.proposal, 'marking', 'P0');
    expect(moved).toEqual({ ...creation, insertBefore: 'B3' });
    expect(r.summary.changed).toEqual([creation.id]);
    expect(r.proposal.revisions?.[0]?.changed).toEqual({
      [creation.id]: { to: creation.to, state: null },
    });
    expectFidelity(base, r.proposal, after as Project);

    const accepted = decided(p, base, { level: 'change', id: creation.id }, 'accepted');
    const frozen = errorOf(revise(base, accepted, [], batch).result);
    expect(frozen.code).toBe('change-frozen');
    expect(frozen.changeIds).toEqual([creation.id]);
  });

  it('the numbering of new ids never reuses a dropped id', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const first = okOf(
      revise(base, p, ['c1'], (x) => renameMarking(x, 'M1', 'Portal')).result,
    );
    expect(first.summary).toEqual({ changed: [], added: ['c2'], dropped: ['c1'] });

    const second = okOf(
      revise(base, first.proposal, ['c2'], (x) => renameMarking(x, 'M2', 'Handle'))
        .result,
    );
    expect(second.summary.added).toEqual(['c3']);
    expect(second.proposal.revisions).toHaveLength(2);
    expect(second.proposal.revisions?.[0]).toEqual(first.proposal.revisions?.[0]);
  });
});

describe('prepareRevision and reviseProposal: refusals', () => {
  it('drop of an id that does not exist: change-not-found', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const prep = prepareRevision(base, p, ['c99']);
    expect(prep.ok).toBe(false);
    if (prep.ok) return;
    expect(prep.error.code).toBe('change-not-found');
    expect(prep.error.changeIds).toEqual(['c99']);
    expect(errorOf(reviseProposal(base, p, { drop: ['c99'], at: AT2 })).code).toBe(
      'change-not-found',
    );
  });

  it('revision without effect: no-changes (without a batch and with a batch that changes nothing)', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    expect(errorOf(reviseProposal(base, p, { at: AT2 })).code).toBe('no-changes');
    expect(errorOf(reviseProposal(base, p, { drop: [], at: AT2 })).code).toBe(
      'no-changes',
    );

    const { result } = revise(base, p, [], (x) => x);
    expect(errorOf(result).code).toBe('no-changes');
    const rewrite = revise(base, p, [], (x) => renameMarking(x, 'M4', 'Headlight'));
    expect(errorOf(rewrite.result).code).toBe('no-changes');
  });

  it('proposal with applied (proposal-applied) or that is not open (not-open)', () => {
    const base = sampleProject();
    const p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const applied: Proposal = {
      ...p,
      decisions: { c1: { state: 'accepted', at: AT } },
      applied: { c1: { at: AT } },
    };
    const a = errorOf(reviseProposal(base, applied, { at: AT2 }));
    expect(a.code).toBe('proposal-applied');
    expect(a.changeIds).toEqual(['c1']);

    const closed = errorOf(
      reviseProposal(base, { ...p, status: 'withdrawn' }, { at: AT2 }),
    );
    expect(closed.code).toBe('not-open');
    // not-open comes before proposal-applied.
    expect(
      errorOf(reviseProposal(base, { ...applied, status: 'applied' }, { at: AT2 })).code,
    ).toBe('not-open');
  });

  it('drop of an accepted change: change-frozen', () => {
    const base = sampleProject();
    let p = propose(base, renameMarking(base, 'M4', 'Headlight'));
    p = decided(p, base, { level: 'change', id: 'c1' }, 'accepted');
    const prep = prepareRevision(base, p, ['c1']);
    expect(prep.ok).toBe(false);
    if (prep.ok) return;
    expect(prep.error.code).toBe('change-frozen');
    expect(prep.error.changeIds).toEqual(['c1']);
  });

  it('drop of the creation accepted by closure (the accepted one depends on it): change-frozen', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    const annotation = changeOf(p, 'annotation', 'A9');
    // Accepting the annotation accepts the creation; dropping the creation drops the accepted annotation.
    p = decided(p, base, { level: 'change', id: annotation.id }, 'accepted');
    const error = errorOf(
      reviseProposal(base, p, { drop: [changeOf(p, 'marking', 'N1').id], at: AT2 }),
    );
    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toContain(annotation.id);
  });

  it('drop of a cascade removal drops the removal of whoever causes it', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    const a3 = changeOf(p, 'annotation', 'A3');
    const m2 = changeOf(p, 'marking', 'M2');
    const m1 = changeOf(p, 'marking', 'M1');

    const { prep, result } = revise(base, p, [a3.id]);
    expect(prep.ok && prep.dropped).toEqual(
      p.changes.filter((c) => [a3.id, m2.id, m1.id].includes(c.id)).map((c) => c.id),
    );
    const r = okOf(result);
    expect(r.summary.dropped).toEqual(prep.ok ? prep.dropped : []);
    // M3 is still removed (child of M2, which now stays): its removal does not depend on the cause.
    expect(r.proposal.changes.some((c) => c.entityId === 'M3')).toBe(true);
    expect(r.proposal.changes.some((c) => c.entityId === 'M1')).toBe(false);
  });

  it('proposal that no longer applies: proposal-not-applicable with the ids', () => {
    const base = sampleProject();
    const created = propose(base, withNewMarking(base, false));
    const exists = withNewMarking(base, false);
    const e = errorOf(reviseProposal(exists, created, { at: AT2 }));
    expect(e.code).toBe('proposal-not-applicable');
    expect(e.changeIds).toEqual([changeOf(created, 'marking', 'N1').id]);
    expect(e.problems?.map((i) => i.code)).toContain('entity-exists');

    const renamed = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const gone = errorOf(reviseProposal(removeMarking(base, 'M4'), renamed, { at: AT2 }));
    expect(gone.code).toBe('proposal-not-applicable');
    expect(gone.changeIds).toEqual(['c1']);
    expect(gone.problems?.map((i) => i.code)).toContain('entity-missing');
  });
});

describe('revised proposal: format', () => {
  it('reads back: parseProposal of the serialization, formatVersion 5', () => {
    const base = sampleProject();
    let p = propose(base, withNewMarking(base, true));
    p = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    const { result } = revise(base, p, [changeOf(p, 'annotation', 'A9').id], (x) =>
      renameMarking(x, 'N1', 'New'),
    );
    const r = okOf(result);

    const parsed = parseProposal(JSON.parse(serializeProposal(r.proposal)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.formatVersion).toBe(5);
    expect(parsed.proposal.revisions).toEqual(r.proposal.revisions);
    expect(parsed.proposal.revision).toBe(p.revision);
  });
});
