// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  prepareRevision,
  renameMarking,
  reviseProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { openHarness, richScenario, writeOutside } from './proposalHarness';

// New-revision notice (stage #644, CP3): an already known proposal that gained a revision
// outside warns `revised` (with the counts) instead of `changed`.

const REVISED_AT = '2026-11-07T10:00:00.000Z';

function revisedOnDisk(project: Project, p: Proposal) {
  const prep = prepareRevision(project, p, []);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(prep.proposed, 'M1', 'Rear door');
  const result = reviseProposal(project, p, { drop: [], at: REVISED_AT, after });
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.proposal, revision: p.revision + 1 };
}

describe('new-revision notice', () => {
  it('scan: a new revision warns `revised` with the counts, instead of `changed`', async () => {
    const { proposal } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    const project = session.store.committed.peek();
    if (!project) throw new Error('no project');
    writeOutside(root, revisedOnDisk(project, proposal));
    await session.proposals.scan();
    const kinds = session.proposals.notices.value.map((n) => n.kind);
    expect(kinds).toEqual(['revised']);
    expect(session.proposals.notices.value[0]?.revision).toEqual({
      changed: 1,
      added: 0,
      dropped: 0,
    });
    session.proposals.dismissNotice('P1', 'revised');
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('scan: a change without a new revision stays `changed`', async () => {
    const { proposal } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    writeOutside(root, { ...proposal, title: 'Other title', revision: 5 });
    await session.proposals.scan();
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);
    expect(session.proposals.notices.value[0]?.revision).toBeUndefined();
  });

  it('adoption at write time (deciding another change) also warns `revised`', async () => {
    const { proposal, ids } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    const project = session.store.committed.peek();
    if (!project) throw new Error('no project');
    writeOutside(root, revisedOnDisk(project, proposal));
    await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.rect },
      'accepted',
    );
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['revised']);
  });
});
