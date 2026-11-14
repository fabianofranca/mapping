import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_ANCHOR_FORMAT_VERSION,
  PROPOSAL_DIRECTION_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createMarking,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  proposalUsesAnchor,
  removeMarking,
  reviewTree,
  serializeProposal,
  setContainerDirection,
  setMarkingAnchor,
  snapToAnchor,
  type Project,
  type Proposal,
} from '../../src/model';

// Anchor in a proposal (schema v20, R3): the marking's `anchor` field (anchor value or `null`) and
// the `anchor` of a created marking's value; `formatVersion` 9, written only when the proposal
// uses it (an earlier app refuses 9 instead of discarding the anchor of a created marking). The
// `snap_to_anchor` is the usual Position (`rect`).

const AT = '2026-11-13T10:00:00.000Z';
const T = { x: 40, y: 40, width: 20, height: 20 };
const B = { x: 100, y: 5, width: 10, height: 10 };
const base = createMarking(
  createMarking(
    addBackgroundContainer(
      createProject({
        name: 'Test',
        now: AT,
        firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
      }),
      { id: 'c1', width: 200, height: 160, background: '#FFFFFF' },
    ),
    { id: 'T', containerId: 'c1', rect: T },
  ),
  { id: 'B', containerId: 'c1', rect: B },
);
const build = (after: Project, from: Project = base): Proposal =>
  buildProposal(from, after, { title: 'Anchor', createdAt: AT });

function accept(from: Project, proposal: Proposal, only?: string): Project {
  const tree = reviewTree(proposal, from);
  const target = only
    ? { level: 'change' as const, id: only }
    : { level: 'proposal' as const, id: null };
  const decided = decide(proposal, tree, target, 'accepted', AT);
  if (!decided.ok) throw new Error(decided.reason);
  const applied = applyAccepted(from, { ...proposal, decisions: decided.decisions }, AT);
  if (!applied.ok) throw new Error('blocked');
  return applied.project;
}

const markingOf = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;

describe("proposal with the marking's anchor", () => {
  it('with no anchor the proposal stays at formatVersion 4 and 9 is a readable version', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(proposalUsesAnchor(proposal.changes)).toBe(false);
    expect(PROPOSAL_ANCHOR_FORMAT_VERSION).toBe(9);
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(9);
  });

  it("anchoring is the marking's anchor field (from null); writes 9; round trip; accepting writes", () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const proposal = build(anchored);
    expect(proposal.formatVersion).toBe(PROPOSAL_ANCHOR_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'marking',
        entityId: 'B',
        field: 'anchor',
        from: null,
        to: { to: 'T', side: 'top' },
      },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
    expect(markingOf(accept(base, proposal), 'B').anchor).toEqual({
      to: 'T',
      side: 'top',
    });
  });

  it('removing the anchor is anchor null and also raises the version', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    const proposal = build(base, anchored);
    expect(proposal.changes).toMatchObject([
      { field: 'anchor', from: { to: 'T' }, to: null },
    ]);
    expect(proposal.formatVersion).toBe(9);
    expect(markingOf(accept(anchored, proposal), 'B').anchor ?? null).toBeNull();
  });

  it('a marking created with anchor carries the anchor in the value and 9', () => {
    const after = setMarkingAnchor(
      createMarking(base, {
        id: 'N',
        containerId: 'c1',
        rect: { x: 100, y: 100, width: 10, height: 10 },
      }),
      'N',
      { to: 'T', align: 'end' },
    );
    const proposal = build(after);
    expect(proposalUsesAnchor(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(9);
    const applied = accept(base, proposal);
    expect(markingOf(applied, 'N').anchor).toEqual({ to: 'T', align: 'end' });
  });

  it('an anchor created in the same proposal requires the creation of the target (accepting only the anchor accepts both)', () => {
    const withTarget = createMarking(base, {
      id: 'T2',
      containerId: 'c1',
      rect: { x: 120, y: 100, width: 20, height: 20 },
    });
    const proposal = build(setMarkingAnchor(withTarget, 'B', { to: 'T2' }), base);
    const anchorChange = proposal.changes.find((c) => c.field === 'anchor')!;
    const applied = accept(base, proposal, anchorChange.id);
    expect(markingOf(applied, 'B').anchor).toEqual({ to: 'T2' });
    expect(applied.markings.some((m) => m.id === 'T2')).toBe(true);
  });

  it('deleting the anchor appears as the anchor null change of the anchored one', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    const proposal = build(removeMarking(anchored, 'T'), anchored);
    expect(
      proposal.changes.map((c) => `${c.kind}:${c.entityId}:${c.field ?? ''}`).sort(),
    ).toEqual(['remove:T:', 'update:B:anchor']);
    const applied = accept(anchored, proposal);
    expect(applied.markings.map((m) => m.id)).toEqual(['B']);
    expect(markingOf(applied, 'B').anchor ?? null).toBeNull();
  });

  it('anchor + snap_to_anchor: the anchor and the Position are two changes and only one can be accepted', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const snapped = snapToAnchor(anchored, 'B').project;
    const proposal = build(snapped);
    const fields = proposal.changes.map((c) => c.field).sort();
    expect(fields).toEqual(['anchor', 'rect']);
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const onlyRect = accept(base, proposal, rect.id);
    expect(markingOf(onlyRect, 'B').rect).toEqual(markingOf(snapped, 'B').rect);
    expect(markingOf(onlyRect, 'B').anchor ?? null).toBeNull();
    const onlyAnchor = accept(base, proposal, anchor.id);
    expect(markingOf(onlyAnchor, 'B').rect).toEqual(B);
    expect(markingOf(onlyAnchor, 'B').anchor).toEqual({ to: 'T', side: 'top' });
  });

  it('an invalid anchor (unknown side, empty to) is refused on read', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'top' });
    const json = JSON.parse(serializeProposal(build(anchored)));
    json.changes[0].to.side = 'diagonal';
    expect(parseProposal(json).ok).toBe(false);
  });

  it('the version is monotonic: 9 does not go down and direction alone stays 8', () => {
    const direction = build(setContainerDirection(base, 'c1', 'rtl'));
    expect(direction.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposalFormatVersionFor(direction.changes, 5, 9)).toBe(9);
    expect(proposalFormatVersionFor([], 5, 9)).toBe(9);
    const both = build(
      setMarkingAnchor(setContainerDirection(base, 'c1', 'rtl'), 'B', { to: 'T' }),
    );
    expect(both.formatVersion).toBe(9);
  });
});
