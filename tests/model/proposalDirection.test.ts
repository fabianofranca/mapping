import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DENSITY_FORMAT_VERSION,
  PROPOSAL_DIRECTION_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  reviewTree,
  serializeProposal,
  setContainerDensity,
  setContainerDirection,
  setProjectDirection,
  setProjectDrawingMode,
  proposalUsesDirection,
  type Project,
  type Proposal,
} from '../../src/model';

// Direction in a proposal (schema v20): the `direction` field of the container and the project, and
// `formatVersion` 8, written only when the proposal uses it (an earlier app refuses 8 instead of
// dropping the field).

const AT = '2026-11-13T10:00:00.000Z';
const base = addBackgroundContainer(
  createProject({
    name: 'Test',
    now: AT,
    firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
  }),
  { id: 'c1', width: 100, height: 80, background: '#FFFFFF' },
);
const build = (after: Project, from: Project = base): Proposal =>
  buildProposal(from, after, { title: 'Direction', createdAt: AT });

function accept(from: Project, proposal: Proposal): Project {
  const decided = decide(
    proposal,
    reviewTree(proposal, from),
    { level: 'proposal', id: null },
    'accepted',
    AT,
  );
  if (!decided.ok) throw new Error(decided.reason);
  const applied = applyAccepted(from, { ...proposal, decisions: decided.decisions }, AT);
  if (!applied.ok) throw new Error('blocked');
  return applied.project;
}

describe('proposal with the reading direction', () => {
  it('without direction the proposal stays on formatVersion 4', () => {
    const proposal = build(base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(proposalUsesDirection(proposal.changes)).toBe(false);
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(PROPOSAL_DIRECTION_FORMAT_VERSION).toBe(8);
  });

  it('the container direction is the direction field; the proposal writes 8; round trip', () => {
    const proposal = build(setContainerDirection(base, 'c1', 'rtl'));
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      { entity: 'image', field: 'direction', from: null, to: 'rtl' },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
  });

  it('accepting and applying writes the container direction; going back to following the project removes it', () => {
    const fixed = setContainerDirection(base, 'c1', 'rtl');
    expect(accept(base, build(fixed)).containers[0]?.direction).toBe('rtl');
    const back = build(base, fixed);
    expect(back.changes).toMatchObject([{ field: 'direction', from: 'rtl', to: null }]);
    expect(back.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(accept(fixed, back).containers[0]?.direction ?? null).toBeNull();
  });

  it('the project direction is a field of the project entity; applying it writes and removes it', () => {
    const rtl = setProjectDirection(base, 'rtl');
    const proposal = build(rtl);
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        entityId: 'project',
        kind: 'update',
        field: null,
        from: { drawingMode: null },
        to: { drawingMode: null, direction: 'rtl' },
      },
    ]);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
    expect(accept(base, proposal).direction).toBe('rtl');
    const back = build(base, rtl);
    expect(proposalUsesDirection(back.changes)).toBe(true);
    expect(accept(rtl, back).direction).toBeUndefined();
  });

  it('changing only the drawing mode in an rtl project does not lose the direction', () => {
    const rtl = setProjectDirection(base, 'rtl');
    const proposal = build(setProjectDrawingMode(rtl, 'dark'), rtl);
    expect(proposal.changes).toMatchObject([
      {
        entity: 'project',
        from: { drawingMode: null, direction: 'rtl' },
        to: { drawingMode: 'dark', direction: 'rtl' },
      },
    ]);
    const applied = accept(rtl, proposal);
    expect(applied.drawingMode).toBe('dark');
    expect(applied.direction).toBe('rtl');
  });

  it('old project proposal (without direction in from or to) keeps the current direction', () => {
    const rtl = setProjectDirection(base, 'rtl');
    const proposal = build(setProjectDrawingMode(base, 'dark'), base);
    expect(proposal.changes).toMatchObject([
      { entity: 'project', from: { drawingMode: null }, to: { drawingMode: 'dark' } },
    ]);
    expect(proposal.changes[0]?.to).not.toHaveProperty('direction');
    const applied = accept(rtl, proposal);
    expect(applied.drawingMode).toBe('dark');
    expect(applied.direction).toBe('rtl');
  });

  it('direction outside ltr/rtl (container or project) is refused on read', () => {
    const container = JSON.parse(
      serializeProposal(build(setContainerDirection(base, 'c1', 'rtl'))),
    );
    container.changes[0].to = 'up';
    expect(parseProposal(container).ok).toBe(false);
    const project = JSON.parse(
      serializeProposal(build(setProjectDirection(base, 'rtl'))),
    );
    project.changes[0].to.direction = 'up';
    expect(parseProposal(project).ok).toBe(false);
  });

  it('a container created with direction in the proposal carries 8', () => {
    const after = setContainerDirection(
      addBackgroundContainer(base, {
        id: 'c2',
        width: 50,
        height: 50,
        background: '#000000',
      }),
      'c2',
      'rtl',
    );
    const proposal = build(after);
    expect(proposalUsesDirection(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(PROPOSAL_DIRECTION_FORMAT_VERSION);
    expect(accept(base, proposal).containers.find((c) => c.id === 'c2')?.direction).toBe(
      'rtl',
    );
  });

  it('the chosen version is monotonic: 8 does not go down and density alone stays 7', () => {
    const density = build(setContainerDensity(base, 'c1', 2));
    expect(density.formatVersion).toBe(PROPOSAL_DENSITY_FORMAT_VERSION);
    expect(proposalFormatVersionFor(density.changes, 5, 8)).toBe(8);
    expect(proposalFormatVersionFor(density.changes, 5, 7)).toBe(7);
    const both = build(
      setContainerDirection(setContainerDensity(base, 'c1', 2), 'c1', 'rtl'),
    );
    expect(both.formatVersion).toBe(8);
    expect(proposalFormatVersionFor([], 5, 8)).toBe(8);
    expect(proposalFormatVersionFor([], 5)).toBe(5);
  });
});
