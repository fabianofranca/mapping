// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  renameMarking,
  prepareRevision,
  reviseProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { diskProposal, openHarness, richScenario, writeOutside } from './proposalHarness';

// Decision guard in the app (stage #644, CP3, decision 8): the agent revised the proposal while
// the person was looking at the old version. Deciding a change that the revision replaced or
// added is refused (`revised`), nothing is written and the session adopts the disk version.

const REVISED_AT = '2026-11-07T10:00:00.000Z';

/** The proposal revised as the MCP would write it: renames M1 and creates the name of M2. */
function revisedOnDisk(project: Project, p: Proposal, drop: readonly string[] = []) {
  const prep = prepareRevision(project, p, drop);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(
    renameMarking(prep.proposed, 'M1', 'Rear door'),
    'M2',
    'New hood',
  );
  const result = reviseProposal(project, p, { drop, at: REVISED_AT, after });
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.proposal, revision: p.revision + 1 };
}

async function openWithRevision(
  drop: (ids: ReturnType<typeof richScenario>['ids']) => string[] = () => [],
) {
  const { proposal, ids } = richScenario();
  const harness = await openHarness({ proposals: [proposal] });
  const project = harness.session.store.committed.peek();
  if (!project) throw new Error('no project');
  const revised = revisedOnDisk(project, proposal, drop(ids));
  // The app read the proposal before; the agent revises it outside, without the app knowing.
  writeOutside(harness.root, revised);
  return { ...harness, proposal, revised, ids };
}

describe('Decision guard on revised content', () => {
  it('accepting the change that the revision replaced: refuses with "revised", nothing is written and the session adopts the disk', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    const changedId = Object.keys(revised.revisions?.[0]?.changed ?? {})[0];
    if (!changedId) throw new Error('the revision replaced nothing');
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: changedId },
      'accepted',
    );
    expect(result).toEqual({ ok: false, error: 'revised' });
    const disk = await diskProposal(root);
    expect(disk.revision).toBe(revised.revision);
    expect(disk.decisions[changedId]).toBeUndefined();
    expect(session.proposals.get('P1')?.revisions).toHaveLength(1);
    expect(ids.name).toBeDefined();

    // Now that the session adopted the disk version (the person sees the mark), the decision holds.
    const again = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: changedId },
      'accepted',
    );
    expect(again.ok).toBe(true);
  });

  it('accepting the item that contains a new change from the revision: refuses', async () => {
    const { session, root, revised } = await openWithRevision();
    const added = revised.revisions?.[0]?.added[0];
    if (!added) throw new Error('the revision added nothing');
    const change = revised.changes.find((c) => c.id === added);
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'item', id: change?.markingId ?? 'M2' },
      'accepted',
    );
    expect(result).toEqual({ ok: false, error: 'revised' });
    expect((await diskProposal(root)).revision).toBe(revised.revision);
  });

  it('accepting a change that the revision did not touch: writes over the disk version', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.rect },
      'accepted',
    );
    expect(result.ok).toBe(true);
    const disk = await diskProposal(root);
    expect(disk.decisions[ids.rect]?.state).toBe('accepted');
    expect(disk.revision).toBe(revised.revision + 1);
    expect(disk.revisions).toHaveLength(1);
  });

  it('a note on a withdrawn change goes to the proposal level, with the origin', async () => {
    const { session, root, ids } = await openWithRevision((i) => [i.rect]);
    const result = await session.proposalActions.addNote(
      'P1',
      { level: 'change', id: ids.rect },
      'I wanted this',
    );
    expect(result.ok).toBe(true);
    const disk = await diskProposal(root);
    const note = disk.notes.find((n) => n.text === 'I wanted this');
    expect(note?.target).toEqual({ level: 'proposal', id: null });
    expect(
      disk.revisions?.[0]?.dropped.find((d) => d.change.id === ids.rect)?.notes,
    ).toContain(note?.id);
  });

  it('Apply accepted on a revised version writes as before', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    // The decision on an untouched change holds; then the agent revises again outside? No:
    // here only what was already accepted on the revised version is applied.
    await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.rect },
      'accepted',
    );
    const applied = await session.proposalActions.applyAccepted('P1');
    expect(applied.ok).toBe(true);
    const disk = await diskProposal(root);
    expect(disk.applied[ids.rect]).toBeDefined();
    expect(disk.revisions).toHaveLength(1);
    expect(disk.revision).toBeGreaterThan(revised.revision);
  });
});
