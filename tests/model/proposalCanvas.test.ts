import { describe, expect, it } from 'vitest';
import {
  CANVAS_FILTER,
  NO_FILTERS,
  applyAccepted,
  changeStatus,
  changeTarget,
  compareProposals,
  createMarking,
  filterChanges,
  imageCanvasRect,
  moveMarking,
  parseProposal,
  previewProject,
  reviewKey,
  reviewTree,
  serializeProposal,
  settleHierarchy,
  validateProject,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Canvas marking in the proposal (ME1): the review's Canvas level, the composite `space`
// change, the always-derived parent (settle after applying) and the "Canvas › …" path.

/** The sample project with a canvas marking (`C1`) around container I2. */
function withCanvasMarking(): Project {
  const base = sampleProject();
  const i2 = base.containers.find((c) => c.id === 'I2')!;
  const around = imageCanvasRect(i2, i2.placement);
  return settleHierarchy(
    createMarking(base, {
      id: 'C1',
      containerId: null,
      rect: {
        x: around.x - 20,
        y: around.y - 20,
        width: around.width + 40,
        height: around.height + 40,
      },
      name: 'Group',
    }),
  );
}

/** M4 (of I2) dragged out of any container: becomes a canvas marking. */
function leaving(): { base: Project; after: Project } {
  const base = withCanvasMarking();
  const after = moveMarking(base, 'M4', -3000, 0);
  return { base, after };
}

describe('space change', () => {
  it('a marking that leaves the container becomes ONE `space` change (no separate `rect`)', () => {
    const { base, after } = leaving();
    const moved = after.markings.find((m) => m.id === 'M4')!;
    expect(moved.containerId).toBeNull();
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([['M4', 'space']]);
    expect(changeOf(p, 'marking', 'M4', 'space')).toMatchObject({
      from: { containerId: 'I2', rect: { x: 0, y: 0, width: 100, height: 100 } },
      to: { containerId: null, rect: moved.rect },
      // The header points to the space after: with no container, it is the Canvas group.
      imageId: null,
      markingId: 'M4',
    });
  });

  it('accepting `space` converts the space, rebuilds the parent and the result is the proposed project', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    const accepted = decided(p, base, { level: 'item', id: 'M4' }, 'accepted');
    const result = applyAccepted(base, accepted, AT);
    if (!result.ok) throw new Error('bloqueada');
    const m4 = result.project.markings.find((m) => m.id === 'M4')!;
    expect(m4.containerId).toBeNull();
    expect(m4.parentId).toBeNull();
    expect(validateProject(result.project)).toEqual([]);
    expect(result.project).toEqual(after);
  });

  it('rejecting `space` keeps everything as it was', () => {
    const { base, after } = leaving();
    const p = decided(
      propose(base, after),
      base,
      { level: 'item', id: 'M4' },
      'rejected',
    );
    const result = applyAccepted(base, p, AT);
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project).toBe(base);
    expect(result.applied).toEqual([]);
  });

  it('a conflicting `space` is detected by the current value (container and rect together)', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    const change = changeOf(p, 'marking', 'M4', 'space');
    expect(changeStatus(p, change, base).conflict).toBe(false);
    expect(changeStatus(p, change, after).conflict).toBe(true);
  });

  it("the parent always comes from the settle: accepting only a child's rect rebuilds the parent", () => {
    const base = sampleProject();
    // M3 (child of M2) goes outside M2 and stays inside M1.
    const p = propose(base, moveMarking(base, 'M3', 0, 200));
    expect(p.changes.map((c) => c.field)).toEqual(['rect']);
    const accepted = decided(
      p,
      base,
      { level: 'change', id: p.changes[0]!.id },
      'accepted',
    );
    const result = applyAccepted(base, accepted, AT);
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project.markings.find((m) => m.id === 'M3')?.parentId).toBe('M1');
  });
});

describe('floating comparado', () => {
  it('changing the floating state together with the space: `space` and `floating`', () => {
    const base = withCanvasMarking();
    const after = settleHierarchy({
      ...base,
      markings: base.markings.map((m) => (m.id === 'C1' ? { ...m, floating: true } : m)),
    });
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'C1', 'floating')).toMatchObject({
      from: false,
      to: true,
    });
    const result = applyAccepted(
      base,
      decided(p, base, { level: 'item', id: 'C1' }, 'accepted'),
      AT,
    );
    if (!result.ok) throw new Error('bloqueada');
    expect(result.project.markings.find((m) => m.id === 'C1')?.floating).toBe(true);
    // A floating marking is nobody's parent.
    expect(result.project.containers.find((c) => c.id === 'I2')?.parentId).toBeNull();
  });
});

describe("the review's Canvas level", () => {
  function proposalWithCanvas() {
    const { base, after } = leaving();
    let next = createMarking(after, {
      id: 'C2',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
      name: 'Note',
    });
    next = settleHierarchy({
      ...next,
      containers: next.containers,
    });
    return { base, proposal: propose(base, next) };
  }

  it("the canvas markings' changes go in the Canvas group, a sibling of the images", () => {
    const { base, proposal } = proposalWithCanvas();
    const tree = reviewTree(proposal, base);
    const canvas = tree.nodes.get(reviewKey({ level: 'canvas', id: null }));
    expect(canvas?.children.map((n) => n.id).sort()).toEqual(['C2', 'M4']);
    expect(tree.root.children.map((n) => n.level)).toEqual(['canvas']);
    expect(tree.changeIdsOf({ level: 'canvas', id: null })).toHaveLength(2);
    // It is not the Project group.
    expect(tree.changeIdsOf({ level: 'project', id: null })).toEqual([]);
  });

  it('Canvas comes after Project and before the images', () => {
    const { base, after } = leaving();
    let next = createMarking(after, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
    });
    next = {
      ...next,
      layers: next.layers.map((l, i) => (i === 0 ? { ...l, name: 'Other' } : l)),
    };
    const tree = reviewTree(propose(base, next), base);
    expect(tree.root.children.map((n) => n.level)).toEqual([
      'project',
      'canvas',
      'image',
    ]);
  });

  it('with no canvas marking the Canvas node exists, empty', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M4', 10, 10));
    const tree = reviewTree(p, base);
    expect(tree.nodes.get(reviewKey({ level: 'canvas', id: null }))?.changeIds).toEqual(
      [],
    );
    expect(tree.root.children.map((n) => n.level)).toEqual(['image']);
  });

  it('deciding the Canvas group decides its changes', () => {
    const { base, proposal } = proposalWithCanvas();
    const decidedP = decided(proposal, base, { level: 'canvas', id: null }, 'accepted');
    expect(Object.keys(decidedP.decisions)).toHaveLength(proposal.changes.length);
  });

  it("the Canvas filter only leaves the canvas markings' changes", () => {
    const { base, proposal } = proposalWithCanvas();
    const next = settleHierarchy(base);
    const filtered = filterChanges(
      proposal,
      next,
      { ...NO_FILTERS, imageId: CANVAS_FILTER },
      new Set(),
    );
    expect(filtered.map((c) => c.entityId).sort()).toEqual(['C2', 'M4']);
    expect(
      filterChanges(proposal, next, { ...NO_FILTERS, imageId: 'I2' }, new Set()),
    ).toEqual([]);
  });

  it("the target of a canvas marking change is the item; the project's, the Project group", () => {
    const { proposal } = proposalWithCanvas();
    const c = proposal.changes[0] as Change;
    expect(changeTarget(c)).toEqual({ level: 'item', id: c.markingId });
    expect(
      changeTarget({ ...c, imageId: null, markingId: null, entity: 'layer' }),
    ).toEqual({
      level: 'project',
      id: null,
    });
  });

  it('the preview ("how it would look") settles the containment', () => {
    const { base, after } = leaving();
    const p = propose(base, after);
    expect(previewProject(base, p).project).toEqual(after);
  });

  it('serializes and rereads: the `canvas` level is a valid note target', () => {
    const { base, proposal } = proposalWithCanvas();
    const withNote: Proposal = {
      ...proposal,
      notes: [
        { id: 'n1', target: { level: 'canvas', id: null }, text: 'Revisar.', at: AT },
      ],
    };
    void base;
    const read = parseProposal(JSON.parse(serializeProposal(withNote)));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.notes[0]?.target).toEqual({ level: 'canvas', id: null });
  });
});

describe('readable path in the proposal comparison', () => {
  it('canvas markings created in two proposals match by "Canvas › parent › name"', () => {
    const base = sampleProject();
    const make = (id: string) =>
      createMarking(base, {
        id,
        containerId: null,
        rect: { x: 5000, y: 5000, width: 100, height: 100 },
        name: 'Note',
      });
    const first = propose(base, make('X1'), { id: 'P1' });
    const second = propose(base, make('X2'), { id: 'P2' });
    expect(compareProposals(first, second).get('c1')).toBe('same');
    const other = propose(
      base,
      createMarking(base, {
        id: 'X3',
        containerId: null,
        rect: { x: 5000, y: 5000, width: 100, height: 100 },
        name: 'Other',
      }),
      { id: 'P3' },
    );
    expect(compareProposals(first, other).get('c1')).toBe('missing');
  });
});

describe('proposta antiga com `parentId`', () => {
  it('the `parentId` change is discarded on read, with a warning', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M4', 10, 10));
    const json = JSON.parse(
      serializeProposal(decided(p, base, { level: 'change', id: 'c1' }, 'accepted')),
    );
    json.formatVersion = 2;
    json.changes.push({
      id: 'c9',
      kind: 'update',
      entity: 'marking',
      entityId: 'M3',
      imageId: 'I1',
      markingId: 'M3',
      field: 'parentId',
      from: 'M2',
      to: 'M1',
    });
    json.decisions.c9 = { ...json.decisions.c1 };
    json.notes = [
      { id: 'n1', target: { level: 'change', id: 'c9' }, text: 'Parent.', at: AT },
    ];
    const read = parseProposal(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.changes.map((c) => c.id)).toEqual(['c1']);
    expect(Object.keys(read.proposal.decisions)).toEqual(['c1']);
    expect(read.proposal.notes[0]?.target).toEqual({ level: 'proposal', id: null });
    expect(read.warnings.join(' ')).toContain('parentId');
  });

  it('an old marking creation (without `floating`) is read as non-floating', () => {
    const base = sampleProject();
    const p = propose(
      base,
      createMarking(base, {
        id: 'N1',
        containerId: 'I2',
        rect: { x: 300, y: 300, width: 100, height: 100 },
      }),
    );
    const json = JSON.parse(serializeProposal(p));
    delete json.changes[0].to.floating;
    json.formatVersion = 2;
    const read = parseProposal(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.proposal.changes[0]?.to).toMatchObject({ id: 'N1', floating: false });
    expect(read.warnings).toEqual([]);
  });
});
