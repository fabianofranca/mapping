import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  applyAccepted,
  changeStatus,
  compareProposals,
  createArrow,
  createMarking,
  levelType,
  moveMarking,
  parseProposal,
  previewProject,
  removeArrow,
  removeMarking,
  requiredChanges,
  reviewTree,
  serializeProposal,
  setArrowLocked,
  setArrowName,
  setArrowRoute,
  setArrowStyle,
  validateAccepted,
  validateProject,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose, stateOf } from './proposalFixtures';

// `create-arrow` and `delete-arrow` changes (ME4, formatVersion 3): the arrow is a review item
// like the marking (`markingId` = its id, `imageId` = container of the source marking); no
// field of an arrow that already exists is proposed, and the route (`points`) never comes from a proposal.

/** `sampleProject` (I1: M1 › M2 › M3; I2: M4) with arrow R1 from M1 to M4 and R2 from M2 to M3. */
function withArrows(): Project {
  let p = createArrow(sampleProject(), {
    id: 'R1',
    from: 'M1',
    to: 'M4',
    style: 'elbow',
    name: 'opens',
  });
  p = createArrow(p, { id: 'R2', from: 'M2', to: 'M3' });
  return p;
}

const changesOf = (p: Proposal, entity: Change['entity']) =>
  p.changes.filter((c) => c.entity === entity);

describe('create-arrow and delete-arrow: the change computation', () => {
  it("a created arrow is a change, under the source marking's container", () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
      name: 'Event',
    });
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['arrow', 'R1', 'create'],
      ['arrow', 'R2', 'create'],
      ['annotation', 'AR1', 'create'],
    ]);
    expect(changeOf(p, 'arrow', 'R1')).toMatchObject({
      kind: 'create',
      field: null,
      from: null,
      imageId: 'I1',
      markingId: 'R1',
      to: {
        id: 'R1',
        from: 'M1',
        to: 'M4',
        fromSide: null,
        toSide: null,
        style: 'elbow',
        name: 'opens',
        locked: false,
      },
    });
    // The arrow's annotation uses the usual annotation change, under the same container.
    expect(changeOf(p, 'annotation', 'AR1')).toMatchObject({
      imageId: 'I1',
      markingId: 'R1',
    });
  });

  it("the route never goes in the proposal: the arrow's value has no `points`", () => {
    const base = sampleProject();
    const after = setArrowRoute(withArrows(), 'R2', [{ x: 1250, y: 1500 }]);
    const p = propose(base, after);
    for (const c of changesOf(p, 'arrow')) {
      expect(c.to).not.toHaveProperty('points');
    }
  });

  it('an arrow of a canvas marking appears in the Canvas group (null imageId)', () => {
    const base = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
    });
    const after = createArrow(base, { id: 'R1', from: 'K', to: 'M1' });
    expect(changeOf(propose(base, after), 'arrow', 'R1')).toMatchObject({
      imageId: null,
      markingId: 'R1',
    });
  });

  it('removing the arrow is a removal change, with the previous value', () => {
    const base = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
    });
    const p = propose(base, removeArrow(base, 'R1'));
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['arrow', 'R1', 'remove'],
      ['annotation', 'AR1', 'remove'],
    ]);
    expect(changeOf(p, 'arrow', 'R1')).toMatchObject({
      to: null,
      imageId: 'I1',
      markingId: 'R1',
      from: { id: 'R1', from: 'M1', to: 'M4', style: 'elbow', name: 'opens' },
    });
    expect(changeOf(p, 'annotation', 'AR1')).toMatchObject({
      imageId: 'I1',
      markingId: 'R1',
    });
  });

  it('deleting the end takes the arrow: its removal appears, under the previous source', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    expect(p.changes.map((c) => [c.entity, c.entityId, c.kind])).toEqual([
      ['marking', 'M4', 'remove'],
      ['arrow', 'R1', 'remove'],
      ['annotation', 'A4', 'remove'],
    ]);
    expect(changeOf(p, 'arrow', 'R1').imageId).toBe('I1');
  });

  it('style, name, lock, ends and route of an arrow that already exists do not become a change', () => {
    const base = withArrows();
    let after = setArrowStyle(base, 'R1', 'straight');
    after = setArrowName(after, 'R1', 'other name');
    after = setArrowLocked(after, 'R1', true);
    after = setArrowRoute(after, 'R2', [{ x: 1250, y: 1500 }]);
    expect(propose(base, after).changes).toEqual([]);
  });
});

describe('create-arrow and delete-arrow: reading', () => {
  const base = sampleProject();
  const created = () => propose(base, withArrows());

  it('the file reads back the same (write and read)', () => {
    const p = created();
    const parsed = parseProposal(JSON.parse(serializeProposal(p)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.proposal.changes).toEqual(p.changes);
    expect(parsed.proposal.formatVersion).toBe(4);
  });

  it('an arrow field change is ignored, with a warning; the rest of the proposal stays', () => {
    const p = created();
    const first = changeOf(p, 'arrow', 'R1');
    const edited = {
      ...p,
      changes: [
        ...p.changes,
        {
          id: 'cx',
          kind: 'update',
          entity: 'arrow',
          entityId: 'R1',
          imageId: 'I1',
          markingId: 'R1',
          field: 'style',
          from: 'curve',
          to: 'straight',
        },
      ],
      decisions: { cx: { state: 'accepted', at: AT } },
      notes: [{ id: 'n1', target: { level: 'change', id: 'cx' }, text: 'x', at: AT }],
    };
    const parsed = parseProposal(JSON.parse(JSON.stringify(edited)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.changes.map((c) => c.id)).toEqual(p.changes.map((c) => c.id));
    expect(parsed.proposal.decisions).toEqual({});
    // The note attached to the ignored change moves to the proposal.
    expect(parsed.proposal.notes[0]?.target).toEqual({ level: 'proposal', id: null });
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('arrow');
    expect(first.entity).toBe('arrow');
  });

  it("the arrow's header must point to it: markingId required and equal to the id", () => {
    const p = created();
    const json = (patch: Record<string, unknown>) =>
      parseProposal({
        ...JSON.parse(JSON.stringify(p)),
        changes: JSON.parse(JSON.stringify(p.changes)).map(
          (c: Record<string, unknown>) => (c.entityId === 'R1' ? { ...c, ...patch } : c),
        ),
      });
    expect(json({ markingId: null })).toMatchObject({ ok: false });
    expect(json({ markingId: 'R2' })).toMatchObject({ ok: false });
    expect(json({})).toMatchObject({ ok: true });
  });

  it("the arrow's value is checked: style or end outside the format", () => {
    const p = created();
    const patchTo = (to: Record<string, unknown>) =>
      parseProposal({
        ...JSON.parse(JSON.stringify(p)),
        changes: JSON.parse(JSON.stringify(p.changes)).map(
          (c: Record<string, unknown>) =>
            c.entityId === 'R1' ? { ...c, to: { ...(c.to as object), ...to } } : c,
        ),
      });
    expect(patchTo({ style: 'zigzag' })).toMatchObject({ ok: false });
    expect(patchTo({ from: '' })).toMatchObject({ ok: false });
    expect(patchTo({ fromSide: 'middle' })).toMatchObject({ ok: false });
    // A hand-written `points` does not invalidate the proposal (it is ignored on apply).
    expect(patchTo({ points: [{ x: 1, y: 2 }] })).toMatchObject({ ok: true });
  });
});

describe('create-arrow and delete-arrow: the review tree', () => {
  it('the arrow sits under the source marking when it also changes; otherwise under the container', () => {
    const base = sampleProject();
    // N1 (new, in I1) with an arrow from N1 to M4; R2 leaves M2 (with no change of its own).
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
      name: 'New',
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = createArrow(after, { id: 'R2', from: 'M2', to: 'M3' });
    const p = propose(base, after);
    const tree = reviewTree(p, base);
    const nested = tree.nodes.get('item:R1');
    expect(nested).toMatchObject({ level: 'item', id: 'R1' });
    expect(tree.nodes.get('item:N1')?.children.map((n) => n.id)).toEqual(['R1']);
    // R2's source has no changes: it goes straight under container I1.
    expect(tree.nodes.get('image:I1')?.children.map((n) => n.id)).toEqual(['N1', 'R2']);
    expect(tree.changeIdsOf({ level: 'item', id: 'N1' })).toEqual(
      expect.arrayContaining([
        changeOf(p, 'marking', 'N1').id,
        changeOf(p, 'arrow', 'R1').id,
      ]),
    );
    expect(tree.changeIdsOf({ level: 'item', id: 'R2' })).toEqual([
      changeOf(p, 'arrow', 'R2').id,
    ]);
  });

  it('the arrow of a canvas marking sits under the Canvas group', () => {
    const base = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 100, height: 100 },
    });
    const p = propose(base, createArrow(base, { id: 'R1', from: 'K', to: 'M1' }));
    const tree = reviewTree(p, base);
    expect(tree.nodes.get('canvas:')?.children.map((n) => n.id)).toEqual(['R1']);
  });

  it("the arrow's annotation appears in the arrow's item", () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
    });
    const p = propose(base, after);
    expect(reviewTree(p, base).changeIdsOf({ level: 'item', id: 'R1' })).toEqual([
      changeOf(p, 'arrow', 'R1').id,
      changeOf(p, 'annotation', 'AR1').id,
    ]);
  });

  it("the arrow item's kind: created, removed", () => {
    const base = sampleProject();
    const created = propose(base, withArrows());
    expect(
      levelType(
        'item',
        'R1',
        created.changes.filter((c) => c.markingId === 'R1'),
      ),
    ).toBe('created');
    const removed = propose(withArrows(), removeArrow(withArrows(), 'R1'));
    expect(levelType('item', 'R1', removed.changes)).toBe('removed');
  });
});

describe('create-arrow and delete-arrow: dependencies between the changes', () => {
  /** New N1 in I1 and an arrow from N1 to M4 with an annotation. */
  function proposeNew() {
    const base = sampleProject();
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
      name: 'New',
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = addAnnotation(after, { id: 'AR1', markingId: 'R1', layerId: 'L1' });
    return { base, p: propose(base, after) };
  }

  it('creating the arrow requires creating the new marking that is its end', () => {
    const { p } = proposeNew();
    const marking = changeOf(p, 'marking', 'N1').id;
    const arrow = changeOf(p, 'arrow', 'R1').id;
    const note = changeOf(p, 'annotation', 'AR1').id;
    expect(requiredChanges(p, [arrow])).toEqual([marking]);
    // The arrow's annotation requires the arrow (and, through it, the marking).
    expect(requiredChanges(p, [note])).toEqual([arrow, marking]);
  });

  it("rejecting the marking's creation rejects the arrow and its annotations", () => {
    const { base, p } = proposeNew();
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'arrow', 'R1').id)).toBe('rejected');
    expect(stateOf(next, changeOf(p, 'annotation', 'AR1').id)).toBe('rejected');
  });

  it('accepting the arrow accepts the marking it requires', () => {
    const { base, p } = proposeNew();
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'arrow', 'R1').id },
      'accepted',
    );
    expect(stateOf(next, changeOf(p, 'marking', 'N1').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'annotation', 'AR1').id)).toBeNull();
  });

  it("deleting the marking requires deleting the arrows attached to it; rejecting the arrow's removal rejects the marking's", () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const marking = changeOf(p, 'marking', 'M4').id;
    const arrow = changeOf(p, 'arrow', 'R1').id;
    expect(requiredChanges(p, [marking])).toEqual(expect.arrayContaining([arrow]));
    const accepted = decided(p, base, { level: 'change', id: marking }, 'accepted');
    expect(stateOf(accepted, arrow)).toBe('accepted');
    const rejected = decided(p, base, { level: 'change', id: arrow }, 'rejected');
    expect(stateOf(rejected, marking)).toBe('rejected');
  });
});

describe('create-arrow and delete-arrow: applying', () => {
  const allAccepted = (p: Proposal): Proposal => ({
    ...p,
    decisions: Object.fromEntries(
      p.changes.map((c) => [c.id, { state: 'accepted', at: AT }]),
    ),
  });

  it('accepting everything gives the proposed project, with the arrows and their annotation', () => {
    const base = sampleProject();
    const after = addAnnotation(withArrows(), {
      id: 'AR1',
      markingId: 'R1',
      layerId: 'L1',
      name: 'Event',
    });
    const result = applyAccepted(base, allAccepted(propose(base, after)), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows).toEqual(after.arrows);
    expect(result.project.annotations.map((a) => a.id)).toEqual(
      after.annotations.map((a) => a.id),
    );
    expect(validateProject(result.project)).toEqual([]);
    expect(result.proposal.status).toBe('applied');
  });

  it('the created arrow starts with `points: []`, even if the proposal brings points', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    const tampered: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.entity === 'arrow' && c.entityId === 'R1'
          ? {
              ...c,
              to: { ...(c.to as object), points: [{ x: 5, y: 5 }] } as Change['to'],
            }
          : c,
      ),
    };
    const result = applyAccepted(base, allAccepted(tampered), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.every((a) => a.points.length === 0)).toBe(true);
  });

  it("creation without the optional fields uses the format's defaults", () => {
    const base = sampleProject();
    const p = propose(base, createArrow(base, { id: 'R1', from: 'M1', to: 'M4' }));
    const slim: Proposal = {
      ...p,
      changes: p.changes.map((c) => ({
        ...c,
        to: { id: 'R1', from: 'M1', to: 'M4' },
      })),
    };
    const result = applyAccepted(base, allAccepted(slim), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows).toEqual([
      {
        id: 'R1',
        from: 'M1',
        to: 'M4',
        fromSide: null,
        toSide: null,
        points: [],
        style: 'curve',
        name: null,
        locked: false,
      },
    ]);
  });

  it("accepting only the marking's removal, without the arrow's, blocks (nonexistent end)", () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const onlyMarking: Proposal = {
      ...p,
      decisions: {
        [changeOf(p, 'marking', 'M4').id]: { state: 'accepted', at: AT },
        [changeOf(p, 'annotation', 'A4').id]: { state: 'accepted', at: AT },
      },
    };
    const validation = validateAccepted(base, onlyMarking);
    expect(validation.ok).toBe(false);
    const issue = validation.issues.find((i) => i.code === 'arrow-endpoint-missing');
    expect(issue).toMatchObject({ id: 'R1', otherId: 'M4' });
    // Rejecting the marking's removal resolves it (the arrow stays accepted or not).
    expect(issue?.changeIds).toContain(changeOf(p, 'marking', 'M4').id);
    expect(applyAccepted(base, onlyMarking, AT).ok).toBe(false);
  });

  it("rejecting the marking's creation takes the arrow: applying the rest gives a valid project", () => {
    const base = sampleProject();
    let after = createMarking(base, {
      id: 'N1',
      containerId: 'I1',
      rect: { x: 3000, y: 2000, width: 100, height: 100 },
    });
    after = createArrow(after, { id: 'R1', from: 'N1', to: 'M4' });
    after = createArrow(after, { id: 'R2', from: 'M2', to: 'M3' });
    const p = propose(base, after);
    const rejected = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N1').id },
      'rejected',
    );
    const accepted = decided(
      rejected,
      base,
      { level: 'change', id: changeOf(p, 'arrow', 'R2').id },
      'accepted',
    );
    const result = applyAccepted(base, accepted, AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.project.markings.some((m) => m.id === 'N1')).toBe(false);
  });

  it('deleting the accepted marking takes its arrows', () => {
    const base = withArrows();
    const p = propose(base, removeMarking(base, 'M4'));
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.project.markings.some((m) => m.id === 'M4')).toBe(false);
  });

  it('removing only the arrow: the marking and the other arrows stay', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R1']);
    expect(result.project.markings).toEqual(base.markings);
  });

  it('an arrow that already exists loses its route if an end changes space through the proposal', () => {
    const base = setArrowRoute(withArrows(), 'R2', [{ x: 1250, y: 1500 }]);
    // M3 dragged out of the container: becomes a canvas marking (`space` change).
    const after = moveMarking(base, 'M3', 5000, 0);
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'M3', 'space').kind).toBe('update');
    expect(changesOf(p, 'arrow')).toEqual([]);
    const result = applyAccepted(base, allAccepted(p), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.arrows.find((a) => a.id === 'R2')?.points).toEqual([]);
    // The one that did not change space stays as it was.
    expect(result.project.arrows.find((a) => a.id === 'R1')).toEqual(
      base.arrows.find((a) => a.id === 'R1'),
    );
  });

  it('the Proposed view (previewProject) includes the proposed arrows, minus the rejected ones', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    expect(previewProject(base, p).project.arrows.map((a) => a.id)).toEqual(['R1', 'R2']);
    const r1 = changeOf(p, 'arrow', 'R1').id;
    const noR1: Proposal = {
      ...p,
      decisions: { [r1]: { state: 'rejected', at: AT } },
    };
    expect(previewProject(base, noR1).project.arrows.map((a) => a.id)).toEqual(['R2']);
  });
});

describe('create-arrow and delete-arrow: status in the current project', () => {
  it('removing the arrow is not a conflict if only the route changed; it is if another field changed', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const c = changeOf(p, 'arrow', 'R2');
    expect(changeStatus(p, c, base).conflict).toBe(false);
    // The person drew the route afterwards: the route is theirs alone, with no conflict.
    const routed = setArrowRoute(base, 'R2', [{ x: 1250, y: 1500 }]);
    expect(changeStatus(p, c, routed).conflict).toBe(false);
    // But renaming the arrow changes what the proposal saw.
    expect(changeStatus(p, c, setArrowName(base, 'R2', 'other')).conflict).toBe(true);
    // And an arrow that disappeared is a conflict.
    expect(changeStatus(p, c, removeArrow(base, 'R2')).conflict).toBe(true);
  });

  it('removing a locked arrow brings the locked-item notice; accepting is allowed', () => {
    const base = withArrows();
    const p = propose(base, removeArrow(base, 'R2'));
    const c = changeOf(p, 'arrow', 'R2');
    expect(changeStatus(p, c, base).locked).toBe(false);
    const locked = setArrowLocked(base, 'R2', true);
    expect(changeStatus(p, c, locked).locked).toBe(true);
    // The review is a deliberate decision: applying removes the arrow even if locked.
    const accepted: Proposal = {
      ...p,
      decisions: { [c.id]: { state: 'accepted', at: AT } },
    };
    const result = applyAccepted(locked, accepted, AT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.arrows.map((a) => a.id)).toEqual(['R1']);
  });

  it('creating an arrow with an id that already exists is a conflict', () => {
    const base = sampleProject();
    const p = propose(base, withArrows());
    const c = changeOf(p, 'arrow', 'R1');
    expect(changeStatus(p, c, base).conflict).toBe(false);
    expect(changeStatus(p, c, withArrows()).conflict).toBe(true);
  });
});

describe('create-arrow: comparison between proposals', () => {
  const only = (p: Project, id: string, style?: 'straight') =>
    createArrow(p, { id, from: 'M1', to: 'M4', ...(style ? { style } : {}) });

  it('the same arrow with another generated id is the same change; another style is different', () => {
    const base = sampleProject();
    const previous = propose(base, only(base, 'RA'), { id: 'P1' });
    const same = propose(base, only(base, 'RB'), { id: 'P2' });
    const different = propose(base, only(base, 'RC', 'straight'), { id: 'P3' });
    const idOf = previous.changes[0]!.id;
    expect(compareProposals(previous, same).get(idOf)).toBe('same');
    expect(compareProposals(previous, different).get(idOf)).toBe('different');
    // The new one creates no arrow: it is absent.
    const none = propose(base, base, { id: 'P4' });
    expect(compareProposals(previous, none).get(idOf)).toBe('missing');
  });

  it('the arrow that links markings created in the proposal is found by the readable path', () => {
    const base = sampleProject();
    const build = (markingId: string, arrowId: string) => {
      const m = createMarking(base, {
        id: markingId,
        containerId: 'I1',
        rect: { x: 3000, y: 2000, width: 100, height: 100 },
        name: 'New',
      });
      return createArrow(m, { id: arrowId, from: markingId, to: 'M4' });
    };
    const previous = propose(base, build('N1', 'RA'), { id: 'P1' });
    const next = propose(base, build('N9', 'RB'), { id: 'P2' });
    const result = compareProposals(previous, next);
    expect(result.get(changeOf(previous, 'marking', 'N1').id)).toBe('same');
    expect(result.get(changeOf(previous, 'arrow', 'RA').id)).toBe('same');
  });
});
