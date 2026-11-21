import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION,
  PROPOSAL_PAGES_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  reviewTree,
  serializeProposal,
  setContainerClass,
  usesContainerClasses,
} from '../../src/model';

// Container classes in a proposal (schema v23, decision 13 of #1901): the container's `classes`
// field (the whole map) and `formatVersion` 11, written only when the proposal uses it (an earlier
// app refuses 11 instead of dropping the field or the created container's `classes`).

const AT = '2026-11-21T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Test',
    now: AT,
    firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
  }),
  { id: 'c1', width: 100, height: 80, background: '#FFFFFF' },
);
const build = (after: typeof base) =>
  buildProposal(base, after, { title: 'Classes', createdAt: AT });

describe('proposal with the container classes', () => {
  it('the new format version is the next free one after pages (10)', () => {
    expect(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION).toBe(11);
    expect(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION).toBeGreaterThan(
      PROPOSAL_PAGES_FORMAT_VERSION,
    );
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(11);
  });

  it('without classes the proposal keeps its version (4)', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesContainerClasses(proposal.changes)).toBe(false);
  });

  it('classes is the container field, the proposal writes 11 and the round trip reads it', () => {
    const proposal = build(setContainerClass(base, 'c1', 'platform', 'android'));
    expect(proposal.formatVersion).toBe(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'classes', from: null, to: { platform: 'android' } },
    ]);
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
  });

  it('accepting and applying writes the map; the last set going away removes the key', () => {
    const fixed = setContainerClass(base, 'c1', 'platform', 'android');
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
    expect(applied.project.containers[0]?.classes).toEqual({ platform: 'android' });

    const back = buildProposal(fixed, base, { title: 'x', createdAt: AT });
    expect(back.changes).toMatchObject([
      { field: 'classes', from: { platform: 'android' }, to: null },
    ]);
    const undone = decide(
      back,
      reviewTree(back, fixed),
      { level: 'proposal', id: null },
      'accepted',
      AT,
    );
    if (!undone.ok) throw new Error(undone.reason);
    const reapplied = applyAccepted(fixed, { ...back, decisions: undone.decisions }, AT);
    if (!reapplied.ok) throw new Error('blocked');
    expect('classes' in (reapplied.project.containers[0] ?? {})).toBe(false);
  });

  it('a map that is not set id → class id is refused on read', () => {
    const json = JSON.parse(
      serializeProposal(build(setContainerClass(base, 'c1', 'platform', 'android'))),
    );
    for (const bad of [{ Platform: 'android' }, { platform: 3 }, { platform: '' }, 'x']) {
      json.changes[0].to = bad;
      expect(parseProposal(json).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('a container created with classes carries 11 and brings them when applied', () => {
    const after = addBackgroundContainer(base, {
      id: 'c2',
      width: 50,
      height: 50,
      background: '#000000',
      classes: { platform: 'ios' },
    });
    const proposal = build(after);
    expect(usesContainerClasses(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION);
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
    expect(applied.project.containers.find((c) => c.id === 'c2')?.classes).toEqual({
      platform: 'ios',
    });
  });

  it('a revision never lowers the version; pages and classes together stay at the newest', () => {
    expect(
      proposalFormatVersionFor(
        build(base).changes,
        5,
        PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION,
      ),
    ).toBe(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION);
    expect(
      proposalFormatVersionFor(
        build(setContainerClass(base, 'c1', 'platform', 'android')).changes,
        5,
        PROPOSAL_PAGES_FORMAT_VERSION,
      ),
    ).toBe(PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION);
  });
});
