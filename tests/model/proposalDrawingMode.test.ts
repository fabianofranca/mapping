import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
  PROPOSAL_DRAWING_MODE_MAP_FORMAT_VERSION,
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
// and the map axis -> entry, written in `formatVersion` 12 only when the proposal uses it.

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

  it('the project mode map becomes the project entity and the proposal writes 12; round trip', () => {
    const proposal = build(
      setProjectDrawingMode(base, { theme: 'dark', contrast: 'high' }),
    );
    expect(PROPOSAL_DRAWING_MODE_MAP_FORMAT_VERSION).toBe(12);
    expect(proposal.formatVersion).toBe(12);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        entityId: 'project',
        kind: 'update',
        field: null,
        from: { drawingMode: null },
        to: { drawingMode: { theme: 'dark', contrast: 'high' } },
      },
    ]);
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
  });

  it('the container mode is the drawingMode field; accepting and applying writes and removes', () => {
    const fixed = setContainerDrawingMode(base, 'c1', { theme: 'dark' });
    const proposal = build(fixed);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'drawingMode', from: null, to: { theme: 'dark' } },
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
    expect(applied.project.containers[0]?.drawingMode).toEqual({ theme: 'dark' });

    const back = build(setContainerDrawingMode(fixed, 'c1', null));
    expect(back.formatVersion).toBe(4);
    expect(PROPOSAL_DRAWING_MODE_FORMAT_VERSION).toBe(6);
    expect(
      usesDrawingMode(buildProposal(fixed, base, { title: 'x', createdAt: AT }).changes),
    ).toBe(true);
  });

  it('a proposal without a mode keeps the version it had, with or without a direction', () => {
    expect(build(base).formatVersion).toBe(4);
  });

  it('version 4 does not accept the project entity with a wrong entityId', () => {
    const proposal = build(setProjectDrawingMode(base, { mode: 'dark' }));
    const json = JSON.parse(serializeProposal(proposal));
    json.changes[0].entityId = 'other';
    expect(parseProposal(json).ok).toBe(false);
  });

  it('a proposal of formatVersion 6 to 11 with a string reads and applies as { mode: s }', () => {
    for (const formatVersion of [6, 8, 11]) {
      const written = JSON.parse(
        serializeProposal(build(setProjectDrawingMode(base, { mode: 'dark' }))),
      );
      written.formatVersion = formatVersion;
      written.changes[0].to.drawingMode = 'dark';
      const parsed = parseProposal(written);
      if (!parsed.ok) throw new Error(parsed.errors.join('; '));
      expect(parsed.proposal.changes[0]!.to).toEqual({ drawingMode: { mode: 'dark' } });
      const tree = reviewTree(parsed.proposal, base);
      const decided = decide(
        parsed.proposal,
        tree,
        { level: 'proposal', id: null },
        'accepted',
        AT,
      );
      if (!decided.ok) throw new Error(decided.reason);
      const applied = applyAccepted(
        base,
        { ...parsed.proposal, decisions: decided.decisions },
        AT,
      );
      if (!applied.ok) throw new Error('blocked');
      expect(applied.project.drawingMode).toEqual({ mode: 'dark' });
    }
  });

  it('a container string in a 6 proposal (field and created value) reads as { mode: s }', () => {
    const fixed = setContainerDrawingMode(base, 'c1', { mode: 'dark' });
    const written = JSON.parse(serializeProposal(build(fixed)));
    written.formatVersion = 6;
    written.changes[0].to = 'dark';
    const parsed = parseProposal(written);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    expect(parsed.proposal.changes[0]!.to).toEqual({ mode: 'dark' });
  });
});
