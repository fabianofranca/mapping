import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DENSITY_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  reviewTree,
  serializeProposal,
  setContainerDensity,
  usesDensity,
} from '../../src/model';

// Density in a proposal (schema v19): the container's `density` field and `formatVersion` 7,
// written only when the proposal uses it (an earlier app refuses 7 instead of dropping the field).

const AT = '2026-11-12T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Test',
    now: AT,
    firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
  }),
  { id: 'c1', width: 100, height: 80, background: '#FFFFFF' },
);
const build = (after: typeof base) =>
  buildProposal(base, after, { title: 'Density', createdAt: AT });

describe('proposal with the container density', () => {
  it('without density the proposal stays on formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDensity(proposal.changes)).toBe(false);
  });

  it("density is the container's density field; the proposal writes 7; round trip", () => {
    const proposal = build(setContainerDensity(base, 'c1', 3));
    expect(proposal.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'density', from: null, to: 3 },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
  });

  it('accepting and applying writes the density; null removes it', () => {
    const fixed = setContainerDensity(base, 'c1', 3);
    const proposal = build(fixed);
    const decided = decide(
      proposal,
      reviewTree(proposal, base),
      { level: 'proposal', id: null },
      'accepted',
      AT,
    );
    if (!decided.ok) throw new Error(decided.reason);
    const applied = applyAccepted(
      base,
      { ...proposal, decisions: decided.decisions },
      AT,
    );
    if (!applied.ok) throw new Error('blocked');
    expect(applied.project.containers[0]?.density).toBe(3);

    const back = buildProposal(fixed, base, { title: 'x', createdAt: AT });
    expect(back.changes).toMatchObject([{ field: 'density', from: 3, to: null }]);
  });

  it('density outside 0.5 to 8 in the proposal is refused on read', () => {
    const json = JSON.parse(serializeProposal(build(setContainerDensity(base, 'c1', 3))));
    json.changes[0].to = 12;
    expect(parseProposal(json).ok).toBe(false);
  });

  it('a container created with density in the proposal carries 7', () => {
    const after = setContainerDensity(
      addBackgroundContainer(base, {
        id: 'c2',
        width: 50,
        height: 50,
        background: '#000000',
      }),
      'c2',
      2,
    );
    const proposal = build(after);
    expect(usesDensity(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
  });
});
