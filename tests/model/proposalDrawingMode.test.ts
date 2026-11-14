import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  reviewTree,
  serializeProposal,
  setContainerDrawingMode,
  setProjectDrawingMode,
  usesDrawingMode,
} from '../../src/model';

// Phase CF6: the drawing mode in a proposal (`project` entity, the container's `drawingMode` field)
// and `formatVersion` 6, written only when the proposal uses it.

const AT = '2026-11-07T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Test',
    now: AT,
    firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
  }),
  {
    id: 'c1',
    width: 100,
    height: 80,
    background: '#FFFFFF',
  },
);
const build = (after: typeof base) =>
  buildProposal(base, after, { title: 'Mode', createdAt: AT });

describe('proposal with the drawing mode', () => {
  it('without mode the proposal stays on formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDrawingMode(proposal.changes)).toBe(false);
  });

  it('the project mode becomes the project entity and the proposal writes 6; round trip', () => {
    const proposal = build(setProjectDrawingMode(base, 'dark'));
    expect(proposal.formatVersion).toBe(PROPOSAL_DRAWING_MODE_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        entityId: 'project',
        kind: 'update',
        field: null,
        from: { drawingMode: null },
        to: { drawingMode: 'dark' },
      },
    ]);
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
  });

  it('the container mode is the drawingMode field; accepting and applying writes and removes', () => {
    const fixed = setContainerDrawingMode(base, 'c1', 'dark');
    const proposal = build(fixed);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'drawingMode', from: null, to: 'dark' },
    ]);
    const tree = reviewTree(proposal, base);
    const decided = decide(
      proposal,
      tree,
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
    expect(applied.project.containers[0]?.drawingMode).toBe('dark');

    const back = build(setContainerDrawingMode(fixed, 'c1', null));
    expect(back.formatVersion).toBe(4);
    expect(
      usesDrawingMode(buildProposal(fixed, base, { title: 'x', createdAt: AT }).changes),
    ).toBe(true);
  });

  it('version 4 does not accept the project entity with a wrong entityId', () => {
    const proposal = build(setProjectDrawingMode(base, 'dark'));
    const json = JSON.parse(serializeProposal(proposal));
    json.changes[0].entityId = 'other';
    expect(parseProposal(json).ok).toBe(false);
  });
});
