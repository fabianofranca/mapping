// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  prepareRevision,
  renameMarking,
  reviseProposal,
  type Proposal,
} from '../../src/model';
import { sampleProject } from '../model/fixtures';
import { openHarness, richScenario } from './proposalHarness';

// Derived state of the "Revised" mark (stage #644, CP3): `revisedIds`, `revisionSummary`,
// `counts.revised` and the "Revised only" filter.

const REVISED_AT = '2026-11-07T10:00:00.000Z';

function revised(p: Proposal): Proposal {
  const project = sampleProject();
  const prep = prepareRevision(project, p, []);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(prep.proposed, 'M1', 'Rear door');
  const result = reviseProposal(project, p, { drop: [], at: REVISED_AT, after });
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.proposal, revision: p.revision + 1 };
}

describe('derived state of the review', () => {
  it('exposes revisedIds, revisionSummary, counts.revised and the Revised only filter', async () => {
    const { proposal } = richScenario();
    const rev = revised(proposal);
    const { review } = await openHarness({ proposals: [rev] });
    review.open('P1');
    const d = review.derived;
    const marked = Object.keys(rev.revisions?.[0]?.changed ?? {});
    expect(marked.length).toBeGreaterThan(0);
    expect([...d.revisedIds.value]).toEqual(marked);
    expect(d.counts.value.revised).toBe(marked.length);
    expect(d.revisionSummary.value).toMatchObject({ at: REVISED_AT, changed: 1 });
    review.setFilters({ onlyRevised: true });
    expect(d.visibleIds.value).toEqual(marked);
    review.setFilters({ onlyRevised: false });
    expect(d.visibleIds.value.length).toBe(rev.changes.length);
  });

  it('without a revision: empty set, null summary and zero count', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.derived.revisedIds.value.size).toBe(0);
    expect(review.derived.revisionSummary.value).toBeNull();
    expect(review.derived.counts.value.revised).toBe(0);
  });
});
