import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PLACEMENT,
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  markingTypeName,
  parseSpec,
  changeType,
  createMarking,
  moveMarking,
  previewProject,
  removeMarking,
  reviewTree,
  type Project,
  type Proposal,
} from '../../src/model';
import {
  proposedDisplay,
  reviewMarks,
  type ReviewView,
} from '../../src/canvas/reviewMarks';
import { visibleBadges } from '../../src/canvas/renderers/review';
import { SPEC_ID, SPEC_JSON, testCatalog } from '../model/componentFixtures';
import { emptyProject, sampleProject } from '../model/fixtures';
import { decided, propose } from '../model/proposalFixtures';
import { richScenario } from '../store/proposalHarness';

// Review marks on the canvas (HANDOFF-PROPOSALS 4): the shape of the line and the badge tell the
// type; rejected: the existing one only in the Current view, the creation (ghost) in both; moved with a ghost in the other position.

function marks(
  p: Proposal,
  base: Project,
  view: ReviewView,
  extra: { conflicts?: string[]; invalid?: string[] } = {},
) {
  const preview = previewProject(base, p).project;
  return reviewMarks({
    proposal: p,
    tree: reviewTree(p, base),
    types: new Map(p.changes.map((c) => [c.id, changeType(c)])),
    conflicts: new Set(extra.conflicts ?? []),
    invalid: new Set(extra.invalid ?? []),
    view,
    current: base,
    drawn: view === 'proposed' ? proposedDisplay(preview, p) : base,
  });
}

describe('reviewMarks', () => {
  it('Proposed: created dashed, moved with a ghost at the old position, changed double', () => {
    const { base, proposal } = richScenario();
    const m = marks(proposal, base, 'proposed');
    expect(m.markings.get('M5')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
    expect(m.images.get('I3')).toEqual({ line: 'created', badges: ['created'] });
    expect(m.markings.get('M4')).toEqual({ line: null, dim: false, badges: ['moved'] });
    expect(m.markings.get('M1')).toEqual({
      line: 'changed',
      dim: false,
      badges: ['changed'],
    });
    expect(m.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        rect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]);
  });

  it('Current: the created one does not appear; the ghost of the moved one is at the new position', () => {
    const { base, proposal } = richScenario();
    const m = marks(proposal, base, 'current');
    expect(m.markings.has('M5')).toBe(false);
    expect(m.images.has('I3')).toBe(false);
    expect(m.ghosts.map((g) => [g.key, g.rect])).toEqual([
      ['moved:M4', { x: 10, y: 10, width: 100, height: 100 }],
    ]);
  });

  it('rejected: dotted and dimmed with ✕ only in the Current view', () => {
    const { base, proposal } = richScenario();
    const rejected = decided(proposal, base, { level: 'item', id: 'M1' }, 'rejected');
    expect(marks(rejected, base, 'proposed').markings.has('M1')).toBe(false);
    expect(marks(rejected, base, 'current').markings.get('M1')).toEqual({
      line: 'rejected',
      dim: true,
      badges: ['rejected'],
    });
    // The rejected creation on an image that exists becomes a ghost with ✕ in both views.
    const added = propose(
      base,
      createMarking(base, {
        id: 'M9',
        containerId: 'I1',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        name: 'New',
      }),
    );
    const noItem = decided(added, base, { level: 'item', id: 'M9' }, 'rejected');
    expect(marks(noItem, base, 'current').ghosts.map((g) => [g.key, g.badges])).toEqual([
      ['rejected:M9', ['rejected']],
    ]);
    expect(marks(noItem, base, 'proposed').ghosts.map((g) => [g.key, g.badges])).toEqual([
      ['rejected:M9', ['rejected']],
    ]);
  });

  it('matrix: created and changed marking by decision state, in each view', () => {
    const base = sampleProject();
    const created = propose(
      base,
      createMarking(base, {
        id: 'M9',
        containerId: 'I1',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        name: 'New',
      }),
    );
    const item = { level: 'item', id: 'M9' } as const;
    const ghostsOf = (m: ReturnType<typeof marks>) =>
      m.ghosts
        .filter((g) => g.key.startsWith('rejected:'))
        .map((g) => [g.key, g.name, g.badges]);
    const rejectedGhost = [['rejected:M9', 'New', ['rejected']]];
    const createdMark = { line: 'created', dim: false, badges: ['created'] };
    const cases = [
      ['pending', created, undefined, createdMark, []],
      ['accepted', decided(created, base, item, 'accepted'), undefined, createdMark, []],
      [
        'rejected',
        decided(created, base, item, 'rejected'),
        undefined,
        undefined,
        rejectedGhost,
      ],
      [
        'invalid',
        created,
        [created.changes[0]!.id],
        { line: 'invalid', dim: false, badges: ['invalid', 'created'] },
        [],
      ],
    ] as const satisfies readonly (readonly [
      string,
      Proposal,
      readonly string[] | undefined,
      unknown,
      unknown,
    ])[];
    for (const [state, proposal, invalid, mark, ghosts] of cases) {
      const proposed = marks(proposal, base, 'proposed', {
        invalid: invalid ? [...invalid] : [],
      });
      expect(proposed.markings.get('M9'), `${state}, Proposed`).toEqual(mark);
      expect(ghostsOf(proposed), `${state}, Proposed`).toEqual(ghosts);
      const current = marks(proposal, base, 'current', {
        invalid: invalid ? [...invalid] : [],
      });
      expect(current.markings.has('M9'), `${state}, Current`).toBe(false);
      expect(ghostsOf(current), `${state}, Current`).toEqual(ghosts);
    }

    // Existing changed: the rejected ghost only exists in the Current (the rejected change
    // stays out of the "how it would look"); pending and accepted never have it.
    const moved = propose(base, moveMarking(base, 'M4', 10, 10));
    const rejectedMove = decided(moved, base, { level: 'item', id: 'M4' }, 'rejected');
    for (const [state, proposal] of [
      ['pending', moved],
      ['accepted', decided(moved, base, { level: 'item', id: 'M4' }, 'accepted')],
    ] as const) {
      for (const view of ['proposed', 'current'] as const)
        expect(ghostsOf(marks(proposal, base, view)), `${state}, ${view}`).toEqual([]);
    }
    expect(ghostsOf(marks(rejectedMove, base, 'proposed'))).toEqual([]);
    expect(marks(rejectedMove, base, 'proposed').markings.has('M4')).toBe(false);
    expect(marks(rejectedMove, base, 'current').markings.get('M4')).toEqual({
      line: 'rejected',
      dim: true,
      badges: ['rejected'],
    });
  });

  it('rejected creation of a component (no name): the ghost carries the type name', () => {
    const spec = parseSpec(SPEC_JSON);
    if (!spec.ok) throw new Error(spec.errors.join('\n'));
    let n = 0;
    let base = applySpecialization(emptyProject(), spec.spec, {
      newId: () => `LS${++n}`,
      packageSpecName: 'test.spec.json',
    });
    base = addBackgroundContainer(base, {
      id: 'B1',
      name: 'Screen',
      width: 400,
      height: 600,
      background: '#FFFFFF',
      center: { x: 500, y: 300 },
    });
    const withText = addComponentMarking(
      base,
      testCatalog(),
      {
        markingId: 'N1',
        annotationId: 'A_N1',
        containerId: 'B1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x: 20, y: 100, width: 100, height: 40 },
      },
      approximateMeasurer,
    );
    const typeName = markingTypeName(withText, 'N1');
    expect(typeName).toBeTruthy();
    const proposal = decided(
      propose(base, withText),
      base,
      { level: 'item', id: 'N1' },
      'rejected',
    );
    for (const view of ['proposed', 'current'] as const) {
      expect(
        marks(proposal, base, view).ghosts.map((g) => [g.key, g.name, g.badges]),
      ).toEqual([['rejected:N1', typeName, ['rejected']]]);
    }
  });

  it('removed: hatching with the name (struck through) in both views', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M3'));
    for (const view of ['proposed', 'current'] as const) {
      const m = marks(p, base, view);
      expect(m.removed).toEqual([
        expect.objectContaining({
          key: 'marking:M3',
          name: 'Lock',
          badges: ['removed'],
          rect: { x: 1300, y: 1250, width: 50, height: 50 },
        }),
      ]);
    }
  });

  it('conflict and invalid set add the alert badge to the type', () => {
    const { base, proposal, ids } = richScenario();
    expect(
      marks(proposal, base, 'proposed', { conflicts: [ids.rect] }).markings.get('M4'),
    ).toEqual({ line: null, dim: false, badges: ['conflict', 'moved'] });
    expect(
      marks(proposal, base, 'proposed', { invalid: [ids.rect] }).markings.get('M4'),
    ).toEqual({ line: 'invalid', dim: false, badges: ['invalid', 'moved'] });
  });

  it('created in Proposed: pending and accepted give the same mark; invalid changes the line and adds the badge', () => {
    const { base, proposal, ids } = richScenario();
    const pending = marks(proposal, base, 'proposed').markings.get('M5');
    const accepted = marks(
      decided(proposal, base, { level: 'item', id: 'M5' }, 'accepted'),
      base,
      'proposed',
    ).markings.get('M5');
    expect(pending).toEqual({ line: 'created', dim: false, badges: ['created'] });
    expect(accepted).toEqual(pending);
    expect(
      marks(proposal, base, 'proposed', { invalid: [ids.marking] }).markings.get('M5'),
    ).toEqual({ line: 'invalid', dim: false, badges: ['invalid', 'created'] });
    // In the Current view the created one has no mark, invalid or not.
    expect(
      marks(proposal, base, 'current', { invalid: [ids.marking] }).markings.has('M5'),
    ).toBe(false);
  });

  it('the "how it would look" draws the new image of the file waiting in proposals/', () => {
    const { base, proposal } = richScenario();
    const preview = previewProject(base, proposal).project;
    const shown = proposedDisplay(preview, proposal);
    expect(shown.containers.find((i) => i.id === 'I3')?.file).toBe(
      // pt-BR kept: shared fixture data (proposalFixtures file name) asserted by tests/model
      'proposals/P1/images/nova.webp',
    );
    // The other images do not change (same object).
    expect(shown.containers.find((i) => i.id === 'I1')).toBe(
      preview.containers.find((i) => i.id === 'I1'),
    );
    // Memoized by the version of the "how it would look".
    expect(proposedDisplay(preview, proposal)).toBe(shown);
  });
});

// Canvas markings (v13): their space is the identity, and the space change is a single change
// (`space`), with the ghost in the space of each side.
describe('reviewMarks: canvas markings', () => {
  /** sampleProject with C1 on the canvas, away from the images (I1 at 0..1000 × 0..750, I2 from 1050). */
  function withCanvasMarking(): Project {
    return createMarking(sampleProject(), {
      id: 'C1',
      containerId: null,
      rect: { x: -3000, y: -3000, width: 400, height: 300 },
      name: 'Group',
    });
  }

  it('created on the canvas and rejected: ghost with the identity position in the Current view', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'C9',
      containerId: null,
      rect: { x: -500, y: -400, width: 120, height: 80 },
      name: 'New',
    });
    const p = propose(base, after);
    const rejected = decided(p, base, { level: 'item', id: 'C9' }, 'rejected');
    const ghosts = marks(rejected, base, 'current').ghosts;
    expect(ghosts).toEqual([
      expect.objectContaining({
        key: 'rejected:C9',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -500, y: -400, width: 120, height: 80 },
        name: 'New',
        badges: ['rejected'],
      }),
    ]);
    // Accepted, it appears as created in the Proposed view.
    expect(marks(p, base, 'proposed').markings.get('C9')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
  });

  it('moved on the canvas: the ghost is in the identity space, at the old position (Proposed) or new (Current)', () => {
    const base = withCanvasMarking();
    const p = propose(base, moveMarking(base, 'C1', 100, 50));
    const proposed = marks(p, base, 'proposed');
    expect(proposed.markings.get('C1')).toEqual({
      line: null,
      dim: false,
      badges: ['moved'],
    });
    expect(proposed.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:C1',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -3000, y: -3000, width: 400, height: 300 },
      }),
    ]);
    expect(marks(p, base, 'current').ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:C1',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -2900, y: -2950, width: 400, height: 300 },
      }),
    ]);
  });

  it('space change (from a container to the canvas): the ghost is in the space of each side', () => {
    const base = sampleProject();
    // M4 (0,0,100×100 in I2, which is at (1050, 0) at scale 1) leaves by 5000 pixels to the left.
    const after = moveMarking(base, 'M4', -5000, 0);
    const moved = after.markings.find((m) => m.id === 'M4');
    expect(moved?.containerId).toBeNull();
    const p = propose(base, after);
    const i2 = base.containers.find((i) => i.id === 'I2');
    const proposed = marks(p, base, 'proposed');
    expect(proposed.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        placement: i2?.placement,
        rect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]);
    expect(marks(p, base, 'current').ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        placement: IDENTITY_PLACEMENT,
        rect: moved?.rect,
      }),
    ]);
  });

  it('removed on the canvas: the hatching uses the identity position', () => {
    const base = withCanvasMarking();
    const p = propose(base, removeMarking(base, 'C1'));
    for (const view of ['proposed', 'current'] as const) {
      expect(marks(p, base, view).removed).toEqual([
        expect.objectContaining({
          key: 'marking:C1',
          name: 'Group',
          placement: IDENTITY_PLACEMENT,
          rect: { x: -3000, y: -3000, width: 400, height: 300 },
        }),
      ]);
    }
  });
});

describe('visible badges', () => {
  const rect = (side: number) => ({ x: 0, y: 0, width: side, height: side });

  it('small marking on screen: only the important ones; smaller than the badge, none', () => {
    expect(visibleBadges(['conflict', 'moved'], rect(200), 1)).toEqual([
      'conflict',
      'moved',
    ]);
    expect(visibleBadges(['conflict', 'moved'], rect(30), 1)).toEqual(['conflict']);
    expect(visibleBadges(['created'], rect(30), 1)).toEqual([]);
    expect(visibleBadges(['changed'], rect(10), 1)).toEqual([]);
    // What counts is the size on screen (zoom).
    expect(visibleBadges(['created'], rect(30), 4)).toEqual(['created']);
  });
});
