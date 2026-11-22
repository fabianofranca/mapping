// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  createMarking,
  prepareRevision,
  renameMarking,
  reviseProposal,
  type Proposal,
} from '../../src/model';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { diskProposal, openHarness, writeOutside } from './proposalHarness';

// Accept on the canvas (stage #1932, QR1, decisions 6 and 7): `quickAccept` decides the whole
// proposal accepted and applies it in one `proposal.json` write and one project undo entry; Ctrl+Z
// also clears the decisions the quick accept wrote, so the proposal is open and undecided again.

const base = sampleProject();

function creation(): Proposal {
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 50 },
    name: 'Button',
  });
  after = addAnnotation(after, { id: 'A9', markingId: 'M9', layerId: 'L1' });
  return propose(base, after, { id: 'P1' });
}

const hasMarking = (h: Awaited<ReturnType<typeof openHarness>>, id: string) =>
  h.session.store.project.peek()?.markings.some((m) => m.id === id) ?? false;

describe('quickAccept', () => {
  it('accepts and applies everything in one write, with one undo entry', async () => {
    const proposal = creation();
    const h = await openHarness({ proposals: [proposal] });
    const before = await diskProposal(h.root);
    const result = await h.session.proposalActions.quickAccept('P1');
    expect(result).toMatchObject({ ok: true, applied: proposal.changes.length });
    expect(hasMarking(h, 'M9')).toBe(true);

    const disk = await diskProposal(h.root);
    expect(disk.revision).toBe(before.revision + 1);
    expect(disk.status).toBe('applied');
    for (const c of proposal.changes) {
      expect(disk.decisions[c.id]?.state).toBe('accepted');
      expect(disk.applied[c.id]).toBeDefined();
    }

    // One entry: a single undo takes the marking and its annotation out.
    expect(h.session.store.undo()).toBe(true);
    await h.session.proposals.settled();
    expect(hasMarking(h, 'M9')).toBe(false);
    expect(h.session.store.project.peek()?.annotations.some((a) => a.id === 'A9')).toBe(
      false,
    );
  });

  it('undo returns the proposal open and undecided; redo writes decisions and applied again', async () => {
    const proposal = creation();
    const h = await openHarness({ proposals: [proposal] });
    expect((await h.session.proposalActions.quickAccept('P1')).ok).toBe(true);
    const accepted = await diskProposal(h.root);

    expect(h.session.store.undo()).toBe(true);
    await h.session.proposals.settled();
    const undone = await diskProposal(h.root);
    expect(undone.status).toBe('open');
    expect(undone.decisions).toEqual({});
    expect(undone.applied).toEqual({});
    expect(hasMarking(h, 'M9')).toBe(false);

    expect(h.session.store.redo()).toBe(true);
    await h.session.proposals.settled();
    const redone = await diskProposal(h.root);
    expect(redone.status).toBe('applied');
    expect(redone.decisions).toEqual(accepted.decisions);
    expect(Object.keys(redone.applied).sort()).toEqual(
      Object.keys(accepted.applied).sort(),
    );
    expect(hasMarking(h, 'M9')).toBe(true);
  });

  it('undo keeps the decisions when they are no longer the ones the quick accept wrote', async () => {
    const proposal = creation();
    const h = await openHarness({ proposals: [proposal] });
    expect((await h.session.proposalActions.quickAccept('P1')).ok).toBe(true);
    // Someone else rewrote the decisions (another `at`) before the undo.
    const current = await diskProposal(h.root);
    const changedAt = Object.fromEntries(
      Object.entries(current.decisions).map(([id, d]) => [
        id,
        { ...d, at: '2026-12-01T00:00:00.000Z' },
      ]),
    );
    writeOutside(h.root, {
      ...current,
      decisions: changedAt,
      revision: current.revision + 1,
    });

    expect(h.session.store.undo()).toBe(true);
    await h.session.proposals.settled();
    const undone = await diskProposal(h.root);
    expect(undone.applied).toEqual({});
    expect(undone.decisions).toEqual(changedAt);
  });

  it('refuses a proposal that is not open, writing nothing', async () => {
    const h = await openHarness({ proposals: [{ ...creation(), status: 'withdrawn' }] });
    const before = await diskProposal(h.root);
    const result = await h.session.proposalActions.quickAccept('P1');
    expect(result).toMatchObject({ ok: false, error: 'not-open' });
    expect((await diskProposal(h.root)).revision).toBe(before.revision);
    expect(hasMarking(h, 'M9')).toBe(false);
  });

  it('refuses with "revised" when the agent revised it after what the person sees, writing nothing', async () => {
    const original = propose(base, renameMarking(base, 'M1', 'Porta dianteira'), {
      id: 'P1',
    });
    const h = await openHarness({ proposals: [original] });
    const project = h.session.store.committed.peek();
    if (!project) throw new Error('no project');
    const prep = prepareRevision(project, original, []);
    if (!prep.ok) throw new Error(prep.error.code);
    const revision = reviseProposal(project, original, {
      drop: [],
      at: '2026-11-07T10:00:00.000Z',
      after: renameMarking(prep.proposed, 'M1', 'Porta traseira'),
    });
    if (!revision.ok) throw new Error(revision.error.code);
    const revised = { ...revision.proposal, revision: original.revision + 1 };
    // The agent revises outside; the app still shows the old version.
    writeOutside(h.root, revised);

    const result = await h.session.proposalActions.quickAccept('P1');
    expect(result).toMatchObject({ ok: false, error: 'revised' });
    const disk = await diskProposal(h.root);
    expect(disk.revision).toBe(revised.revision);
    expect(disk.decisions).toEqual({});
    expect(disk.applied).toEqual({});
    expect(
      h.session.store.project.peek()?.markings.find((m) => m.id === 'M1')?.name,
    ).toBe('Porta');

    // With the revised version in view, the same click goes through.
    expect((await h.session.proposalActions.quickAccept('P1')).ok).toBe(true);
  });
});
