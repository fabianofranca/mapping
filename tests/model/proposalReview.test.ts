import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  addNote,
  addTypedAnnotation,
  changeStatus,
  changeStatuses,
  createMarking,
  decide,
  editNote,
  moveContainer,
  moveMarking,
  notesOf,
  parseProposalText,
  removeContainer,
  removeMarking,
  removeNote,
  renameMarking,
  replaceContainer,
  reviewProgress,
  reviewTree,
  serializeProposal,
  setAnnotationParent,
  setFieldValue,
  setImageLocked,
  setMarkingLocked,
  setMarkingRect,
  summarizeDecisions,
  supersedeProposal,
  withdrawProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, LATER, changeOf, decided, propose, stateOf } from './proposalFixtures';
import { cadastroProject, layerOf } from './specFixtures';

/**
 * On top of `sampleProject`: the new image I3 with the markings N1 › N2 (created), the
 * annotation B1 on N2, B2 (L1) and B3 (L2, linked to B2) on N1, and the new name of M4.
 */
function creations(): { base: Project; after: Project; p: Proposal } {
  const base = sampleProject();
  let after = addContainer(base, {
    id: 'I3',
    file: 'images/new.png',
    width: 1000,
    height: 1000,
  });
  after = createMarking(after, {
    id: 'N1',
    containerId: 'I3',
    rect: { x: 100, y: 100, width: 500, height: 500 },
  });
  after = createMarking(after, {
    id: 'N2',
    containerId: 'I3',
    rect: { x: 200, y: 200, width: 100, height: 100 },
  });
  after = addAnnotation(after, { id: 'B1', markingId: 'N2', layerId: 'L1' });
  after = addAnnotation(after, { id: 'B2', markingId: 'N1', layerId: 'L1' });
  after = addAnnotation(after, { id: 'B3', markingId: 'N1', layerId: 'L2' });
  after = setAnnotationParent(after, 'B3', 'B2');
  after = renameMarking(after, 'M4', 'Headlight');
  return { base, after, p: propose(base, after) };
}

describe('review levels', () => {
  it('Project, images and items nested by the hierarchy, with the annotations on the item', () => {
    const { base, p } = creations();
    const tree = reviewTree(p, base);
    const shape = (n: (typeof tree)['root']): unknown => ({
      [`${n.level}:${n.id ?? ''}`]: [
        ...n.changeIds.map((id) => {
          const c = p.changes.find((x) => x.id === id);
          return `${c?.entity}:${c?.entityId}`;
        }),
        ...n.children.map(shape),
      ],
    });
    expect(shape(tree.root)).toEqual({
      'proposal:': [
        {
          'image:I3': [
            'image:I3',
            {
              'item:N1': [
                'marking:N1',
                'annotation:B2',
                'annotation:B3',
                { 'item:N2': ['marking:N2', 'annotation:B1'] },
              ],
            },
          ],
        },
        {
          'image:I2': [{ 'item:M4': ['marking:M4'] }],
        },
      ],
    });
    expect(tree.changeIdsOf({ level: 'item', id: 'N1' })).toHaveLength(5);
    expect(tree.changeIdsOf({ level: 'image', id: 'I3' })).toHaveLength(6);
    expect(tree.changeIdsOf({ level: 'proposal', id: null })).toHaveLength(7);
    expect(tree.changeIdsOf({ level: 'project', id: null })).toEqual([]);
    expect(tree.changeIdsOf({ level: 'item', id: 'nothing' })).toEqual([]);
  });

  it('deciding a level applies to everything below; the one above shows "partial" with the counts', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'image', id: 'I3' }, 'accepted');
    const tree = reviewTree(next, base);
    const of = (level: 'proposal' | 'image' | 'item', id: string | null) =>
      summarizeDecisions(next, tree.changeIdsOf({ level, id }));
    expect(of('image', 'I3')).toMatchObject({ state: 'accepted', accepted: 6 });
    expect(of('image', 'I2').state).toBe('undecided');
    expect(of('proposal', null)).toMatchObject({
      state: 'partial',
      accepted: 6,
      rejected: 0,
      undecided: 1,
    });
    // A lower level overrides the higher one.
    const b1 = changeOf(next, 'annotation', 'B1').id;
    next = decided(next, base, { level: 'change', id: b1 }, 'rejected');
    expect(
      summarizeDecisions(next, tree.changeIdsOf({ level: 'image', id: 'I3' })),
    ).toMatchObject({ state: 'partial', accepted: 5, rejected: 1, undecided: 0 });
    next = decided(next, base, { level: 'proposal', id: null }, 'rejected');
    expect(
      summarizeDecisions(next, tree.changeIdsOf({ level: 'proposal', id: null })).state,
    ).toBe('rejected');
  });
});

describe('dependencies', () => {
  it('1. accepting a change inside a created item accepts the creation of it and of its ancestors', () => {
    const { base, p } = creations();
    const b1 = changeOf(p, 'annotation', 'B1').id;
    const result = decide(
      p,
      reviewTree(p, base),
      { level: 'change', id: b1 },
      'accepted',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    const accepted = (entity: 'image' | 'marking', id: string) =>
      result.decisions[changeOf(p, entity, id).id]?.state;
    expect(accepted('marking', 'N2')).toBe('accepted');
    expect(accepted('marking', 'N1')).toBe('accepted');
    expect(accepted('image', 'I3')).toBe('accepted');
    expect(result.changed).toEqual([b1]);
    expect(result.cascaded).toHaveLength(3);
    // What is not a requirement stays undecided.
    expect(result.decisions[changeOf(p, 'annotation', 'B2').id]).toBeUndefined();
  });

  it('2. rejecting the creation of an item rejects what depends on it (children, annotations, linked ones)', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    const n1 = changeOf(p, 'marking', 'N1').id;
    const result = decide(
      next,
      reviewTree(next, base),
      { level: 'change', id: n1 },
      'rejected',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    next = { ...next, decisions: result.decisions };
    for (const [entity, id] of [
      ['marking', 'N1'],
      ['marking', 'N2'],
      ['annotation', 'B1'],
      ['annotation', 'B2'],
      ['annotation', 'B3'],
    ] as const) {
      expect(stateOf(next, changeOf(p, entity, id).id), id).toBe('rejected');
    }
    // The image (a requirement, not a dependent) stays accepted.
    expect(stateOf(next, changeOf(p, 'image', 'I3').id)).toBe('accepted');
    expect(result.cascaded).toHaveLength(4);
  });

  it('2. … including the references that point to it', () => {
    const base = cadastroProject();
    let after = createMarking(base, {
      id: 'MX',
      containerId: 'I1',
      rect: { x: 100, y: 1500, width: 300, height: 100 },
    });
    after = addAnnotation(after, {
      id: 'AX',
      markingId: 'MX',
      layerId: 'LM',
      entries: [{ id: 'EX', key: 'cpf', value: 'string' }],
    });
    after = setFieldValue(after, 'AIN', 'dado', { annotationId: 'AX', entryId: 'EX' });
    const p = propose(base, after);
    const ref = changeOf(p, 'annotation', 'AIN', 'values.dado').id;
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'MX').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'annotation', 'AX').id)).toBe('rejected');
    expect(stateOf(next, ref)).toBe('rejected');
    // And accepting the reference brings back the cited annotation and its marking.
    const back = decided(next, base, { level: 'change', id: ref }, 'accepted');
    expect(stateOf(back, changeOf(p, 'annotation', 'AX').id)).toBe('accepted');
    expect(stateOf(back, changeOf(p, 'marking', 'MX').id)).toBe('accepted');
  });

  it('3. accepting the removal of an item accepts the removal of what the cascade removes (and counts how many)', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    const m1 = changeOf(p, 'marking', 'M1').id;
    const result = decide(
      p,
      reviewTree(p, base),
      { level: 'change', id: m1 },
      'accepted',
      AT,
    );
    if (!result.ok) throw new Error(result.reason);
    // M2 and M3 (descendants) and A1, A2 and A3 (annotations of M1 and M2).
    expect(result.cascaded).toHaveLength(5);
    expect(Object.values(result.decisions).every((d) => d.state === 'accepted')).toBe(
      true,
    );
  });

  it('4. rejecting the removal of something in the cascade rejects the removal of whoever causes it', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M1'));
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    next = decided(
      next,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'A3').id },
      'rejected',
    );
    expect(stateOf(next, changeOf(p, 'marking', 'M2').id)).toBe('rejected');
    expect(stateOf(next, changeOf(p, 'marking', 'M1').id)).toBe('rejected');
    // The other removals in the cascade stay accepted.
    expect(stateOf(next, changeOf(p, 'marking', 'M3').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'annotation', 'A1').id)).toBe('accepted');
  });

  it('clearing the decision of a creation removes the acceptance of what depended on it', () => {
    const { base, p } = creations();
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    next = decided(
      next,
      base,
      { level: 'change', id: changeOf(p, 'marking', 'N2').id },
      null,
    );
    expect(stateOf(next, changeOf(p, 'marking', 'N2').id)).toBeNull();
    expect(stateOf(next, changeOf(p, 'annotation', 'B1').id)).toBeNull();
    expect(stateOf(next, changeOf(p, 'marking', 'N1').id)).toBe('accepted');
  });

  it('applied changes do not change and only an open proposal accepts decisions', () => {
    const { base, p } = creations();
    const i3 = changeOf(p, 'image', 'I3').id;
    const applied: Proposal = {
      ...p,
      decisions: { [i3]: { state: 'accepted', at: AT } },
      applied: { [i3]: { at: AT } },
    };
    const result = decide(
      applied,
      reviewTree(applied, base),
      { level: 'image', id: 'I3' },
      'rejected',
      LATER,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.decisions[i3]).toEqual({ state: 'accepted', at: AT });
    const tree = reviewTree(p, base);
    expect(
      decide(supersedeProposal(p), tree, { level: 'proposal', id: null }, 'accepted', AT),
    ).toEqual({
      ok: false,
      reason: 'not-open',
    });
    expect(decide(p, tree, { level: 'item', id: 'nothing' }, 'accepted', AT)).toEqual({
      ok: false,
      reason: 'unknown-target',
    });
  });
});

describe('conflicts', () => {
  it('a change whose from does not match the current one becomes a conflict, with the current value', () => {
    const base = sampleProject();
    const p = propose(
      base,
      renameMarking(moveMarking(base, 'M4', 10, 10), 'M1', 'Front door'),
    );
    // External change after the proposal: M4 was moved by hand.
    const edited = setMarkingRect(base, 'M4', { x: 50, y: 50, width: 100, height: 100 });
    const rect = changeOf(p, 'marking', 'M4', 'rect');
    expect(changeStatus(p, rect, edited)).toMatchObject({
      conflict: true,
      current: { x: 50, y: 50, width: 100, height: 100 },
    });
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'name'), edited).conflict).toBe(
      false,
    );
    expect(changeStatus(p, rect, base).conflict).toBe(false);
  });

  it('creation of an existing id, removal of an edited or vanished item and change of a vanished item', () => {
    const base = sampleProject();
    const created = propose(
      base,
      createMarking(base, {
        id: 'M9',
        containerId: 'I2',
        rect: { x: 300, y: 300, width: 50, height: 50 },
      }),
    );
    const taken = createMarking(base, {
      id: 'M9',
      containerId: 'I2',
      rect: { x: 600, y: 600, width: 50, height: 50 },
    });
    expect(changeStatus(created, created.changes[0]!, taken).conflict).toBe(true);

    const removed = propose(base, removeMarking(base, 'M4'));
    const removal = changeOf(removed, 'marking', 'M4');
    expect(
      changeStatus(removed, removal, renameMarking(base, 'M4', 'Other')).conflict,
    ).toBe(true);
    // Confirming the position ("to review") is not a change: it does not become a conflict.
    expect(changeStatus(removed, removal, base).conflict).toBe(false);
    expect(changeStatus(removed, removal, removeContainer(base, 'I2'))).toMatchObject({
      conflict: true,
      current: undefined,
    });

    const renamed = propose(base, renameMarking(base, 'M4', 'Headlight'));
    expect(
      changeStatus(renamed, renamed.changes[0]!, removeContainer(base, 'I2')).conflict,
    ).toBe(true);
  });

  it('removing an image read from disk does not become a conflict (parentId derived on both sides)', () => {
    const base = sampleProject();
    const removed = propose(base, removeContainer(base, 'I1'));
    const removal = changeOf(removed, 'image', 'I1');
    expect(changeStatus(removed, removal, base).conflict).toBe(false);
    const parsed = parseProposalText(serializeProposal(removed));
    if (!parsed.ok) throw new Error('proposal not read');
    const reread = parsed.proposal;
    expect(changeStatus(reread, changeOf(reread, 'image', 'I1'), base).conflict).toBe(
      false,
    );
    // A really different value is still a conflict.
    const moved = setImageLocked(base, 'I1', true);
    expect(changeStatus(reread, changeOf(reread, 'image', 'I1'), moved).conflict).toBe(
      true,
    );
  });

  it('changing something created by the same proposal is not a conflict, and the decisions of the others stay', () => {
    const { base, p } = creations();
    const accepted = decided(p, base, { level: 'image', id: 'I2' }, 'accepted');
    const statuses = changeStatuses(accepted, renameMarking(base, 'M4', 'Other'));
    const m4 = changeOf(p, 'marking', 'M4', 'name').id;
    expect(statuses.get(m4)).toMatchObject({
      conflict: true,
      decision: 'accepted',
      current: 'Other',
    });
    expect([...statuses.values()].filter((s) => s.conflict)).toHaveLength(1);
  });
});

describe('locked item warning', () => {
  it('geometry and removal of a locked marking (its own or by the ancestor)', () => {
    const base = setMarkingLocked(sampleProject(), 'M1', true);
    let after = setMarkingLocked(base, 'M1', false);
    after = moveMarking(after, 'M1', 10, 10);
    after = renameMarking(after, 'M2', 'Handle');
    const p = propose(base, after);
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'rect'), base).locked).toBe(true);
    // The child has its geometry locked by the parent's lock.
    expect(changeStatus(p, changeOf(p, 'marking', 'M2', 'rect'), base).locked).toBe(true);
    expect(changeStatus(p, changeOf(p, 'marking', 'M2', 'name'), base).locked).toBe(
      false,
    );
    expect(changeStatus(p, changeOf(p, 'marking', 'M1', 'locked'), base).locked).toBe(
      false,
    );

    const removal = propose(
      base,
      removeMarking(setMarkingLocked(base, 'M1', false), 'M1'),
    );
    expect(changeStatus(removal, changeOf(removal, 'marking', 'M1'), base).locked).toBe(
      true,
    );
    expect(changeStatus(removal, changeOf(removal, 'marking', 'M2'), base).locked).toBe(
      false,
    );
  });

  it('locked image: move, remove and replace with another size', () => {
    const base = setImageLocked(sampleProject(), 'I2', true);
    const free = setImageLocked(base, 'I2', false);
    const moved = propose(
      base,
      setImageLocked(moveContainer(free, 'I2', 5000, 0), 'I2', true),
    );
    expect(
      changeStatus(moved, changeOf(moved, 'image', 'I2', 'placement'), base).locked,
    ).toBe(true);
    const replaced = propose(
      base,
      setImageLocked(
        replaceContainer(free, 'I2', {
          file: 'images/f2.jpg',
          width: 2000,
          height: 2000,
        }),
        'I2',
        true,
      ),
    );
    expect(
      changeStatus(replaced, changeOf(replaced, 'image', 'I2', 'file'), base).locked,
    ).toBe(true);
    const removed = propose(base, removeContainer(free, 'I2'));
    expect(changeStatus(removed, changeOf(removed, 'image', 'I2'), base).locked).toBe(
      true,
    );
    expect(changeStatus(removed, changeOf(removed, 'image', 'I2'), free).locked).toBe(
      false,
    );
  });
});

describe('progress, notes and proposal state', () => {
  it('counts the accepted ones awaiting application and says when the review has finished', () => {
    const { base, p } = creations();
    expect(reviewProgress(p)).toMatchObject({ total: 7, undecided: 7, complete: false });
    let next = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    expect(reviewProgress(next)).toMatchObject({
      accepted: 7,
      acceptedPending: 7,
      complete: false,
    });
    next = {
      ...next,
      applied: Object.fromEntries(next.changes.map((c) => [c.id, { at: AT }])),
    };
    expect(reviewProgress(next)).toMatchObject({
      applied: 7,
      acceptedPending: 0,
      complete: true,
    });
  });

  it('notes at any level; editing with empty text removes', () => {
    const { p } = creations();
    let next = addNote(p, { level: 'item', id: 'N1' }, 'The name is wrong.', AT, 'n1');
    next = addNote(next, { level: 'proposal', id: null }, 'Screen 3 is missing.', AT, 'n2');
    expect(notesOf(next, { level: 'item', id: 'N1' }).map((n) => n.text)).toEqual([
      'The name is wrong.',
    ]);
    next = editNote(next, 'n1', 'The name and the position.', LATER);
    expect(next.notes[0]).toMatchObject({ text: 'The name and the position.', at: LATER });
    expect(editNote(next, 'n1', '  ', LATER).notes.map((n) => n.id)).toEqual(['n2']);
    expect(removeNote(next, 'n2').notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('withdrawing and superseding only apply to the open proposal', () => {
    const { p } = creations();
    expect(withdrawProposal(p).status).toBe('withdrawn');
    expect(supersedeProposal(p).status).toBe('superseded');
    expect(withdrawProposal(supersedeProposal(p)).status).toBe('superseded');
  });

  it('a typed annotation created on a new marking depends on both', () => {
    const base = cadastroProject();
    let after = createMarking(base, {
      id: 'MB',
      containerId: 'I1',
      rect: { x: 100, y: 850, width: 800, height: 100 },
    });
    after = addTypedAnnotation(after, {
      id: 'AB2',
      markingId: 'MB',
      layerId: layerOf(after, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'button' },
    });
    after = addTypedAnnotation(after, {
      id: 'AOC2',
      markingId: 'MB',
      layerId: layerOf(after, 'sdui', 'eventos'),
      type: { specId: 'sdui', typeId: 'onClick' },
      parentAnnotationId: 'AB2',
    });
    const p = propose(base, after);
    const next = decided(
      p,
      base,
      { level: 'change', id: changeOf(p, 'annotation', 'AOC2').id },
      'accepted',
    );
    expect(stateOf(next, changeOf(p, 'annotation', 'AB2').id)).toBe('accepted');
    expect(stateOf(next, changeOf(p, 'marking', 'MB').id)).toBe('accepted');
  });
});
