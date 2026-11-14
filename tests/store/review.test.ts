import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAnnotation,
  addContainer,
  addLayer,
  deserialize,
  moveContainer,
  removeAnnotation,
  removeEntry,
  removeContainer,
  renameMarking,
  replaceContainer,
  reviewKey,
  serialize,
  setMarkingRect,
  updateEntry,
  type Project,
  type Proposal,
} from '../../src/model';
import { fieldChangeIndex } from '../../src/store/derived';
import { locale } from '../../src/store/settings';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { AT, decided, propose } from '../model/proposalFixtures';
import {
  NEW_IMAGE_PATH,
  diskProposal,
  openHarness,
  richScenario,
  writeOutside,
  type Harness,
} from './proposalHarness';

// pt-BR kept: shared fixture data asserted by tests/components (sampleProject names 'Porta dianteira' and 'images/frente.jpg', and the proposal image path 'images/nova.webp' of proposalHarness)
beforeEach(() => localStorage.clear());
afterEach(() => {
  clearReportedErrors();
  locale.value = 'en-US';
});

async function projectOnDisk(h: Harness): Promise<Project> {
  await h.session.flush();
  const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('invalid mapping.json');
  return parsed.project;
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('valor ausente');
  return value;
}

describe('opening the review', () => {
  it('locks the project (read-only) until leaving, and starts at the first pending one', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    expect(session.actions.renameProject('New')).toEqual({ ok: true, value: undefined });

    const opened = review.open('P1');
    expect(opened).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(review.proposalId.value).toBe('P1');
    expect(review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(review.view.value).toBe('proposed');
    expect(session.store.reviewing.value).toBe(true);
    // Every project edit is refused, including gestures and undo.
    expect(session.actions.renameProject('Other')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(session.actions.renameMarking('M1', 'x')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(session.actions.beginGesture()).toEqual({ ok: false, error: 'reviewing' });
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.undo()).toBe(false);
    expect(await session.addImages([new File(['1x1'], 'a.png')])).toMatchObject({
      added: [],
      failed: ['a.png'],
    });
    expect(
      await session.replaceImage('I1', new File(['1x1'], 'a.png'), () =>
        Promise.resolve(true),
      ),
    ).toBe('failed');

    review.close();
    expect(session.store.reviewing.value).toBe(false);
    expect(review.proposalId.value).toBeNull();
    expect(session.actions.renameProject('Afterwards')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(session.store.undo()).toBe(true);
    void ids;
  });

  it('does not open a nonexistent or withdrawn proposal; the superseded one opens', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({
      proposals: [
        { ...proposal, id: 'W', status: 'withdrawn' },
        { ...proposal, id: 'S', status: 'superseded' },
      ],
    });
    expect(review.open('nada')).toEqual({ ok: false, error: 'unknown-proposal' });
    expect(review.open('W')).toEqual({ ok: false, error: 'withdrawn' });
    expect(review.open('S').ok).toBe(true);
  });
});

describe('decidir', () => {
  it('writes immediately, with the three states in the levels and the "partial" one', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const d = review.derived;
    expect(d.counts.value).toMatchObject({ total: 5, undecided: 5, acceptedPending: 0 });
    expect(d.levels.value.get('proposal:')?.state).toBe('undecided');

    const result = await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(result.ok).toBe(true);
    expect((await diskProposal(root)).decisions[ids.name]?.state).toBe('accepted');
    expect((await diskProposal(root)).revision).toBe(1);
    expect(d.counts.value).toMatchObject({
      undecided: 4,
      accepted: 1,
      acceptedPending: 1,
    });
    expect(d.levels.value.get('proposal:')).toMatchObject({
      state: 'partial',
      accepted: 1,
    });
    expect(d.levels.value.get('item:M1')?.state).toBe('accepted');
    expect(d.levels.value.get('item:M4')?.state).toBe('undecided');

    await review.decide({ level: 'image', id: 'I3' }, 'rejected');
    expect(d.levels.value.get('image:I3')?.state).toBe('rejected');
    expect(d.levels.value.get('item:M5')?.state).toBe('rejected');
    expect(d.pendingIds.value).toEqual([ids.rect]);

    // Clearing the decision goes back to "no decision".
    await review.decide({ level: 'change', id: ids.name }, null);
    expect(d.levels.value.get('item:M1')?.state).toBe('undecided');
  });

  it('accepting an annotation accepts the creation of the marking and of the image; rejecting the image rejects what depends on it', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const accepted = await review.decide(
      { level: 'change', id: ids.annotation },
      'accepted',
    );
    if (!accepted.ok) throw new Error(accepted.error);
    expect(accepted.changed).toEqual([ids.annotation]);
    expect([...accepted.cascaded].sort()).toEqual([ids.image, ids.marking].sort());

    const rejected = await review.decide({ level: 'change', id: ids.image }, 'rejected');
    if (!rejected.ok) throw new Error(rejected.error);
    expect([...rejected.cascaded].sort()).toEqual([ids.annotation, ids.marking].sort());
  });

  it('the batch has "Undo": rewrites the previous decisions in a single write', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    const before = await diskProposal(root);

    const batch = await review.decideVisible('rejected');
    expect(batch?.ok).toBe(true);
    const afterBatch = await diskProposal(root);
    expect(afterBatch.revision).toBe(before.revision + 1);
    expect(Object.values(afterBatch.decisions).every((d) => d.state === 'rejected')).toBe(
      true,
    );
    const undo = must(review.undoable.value);
    expect(undo.changed.length).toBe(5);
    expect(undo.previous).toEqual(before.decisions);

    expect(await review.undoLastDecision()).toBe(true);
    const restored = await diskProposal(root);
    expect(restored.decisions).toEqual(before.decisions);
    // A single write to undo the whole batch.
    expect(restored.revision).toBe(afterBatch.revision + 1);
    expect(review.undoable.value).toBeNull();
    expect(await review.undoLastDecision()).toBe(false);
  });

  it('with active filters, the batch applies only to what the list shows', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    review.setFilters({ types: ['created'] });
    expect(review.derived.visibleIds.value).toEqual([
      ids.image,
      ids.marking,
      ids.annotation,
    ]);
    await review.decideVisible('accepted');
    expect(Object.keys((await diskProposal(root)).decisions).sort()).toEqual(
      [ids.image, ids.marking, ids.annotation].sort(),
    );
    review.setFilters({ types: ['moved'], decision: 'undecided' });
    expect(review.derived.visibleIds.value).toEqual([ids.rect]);
    review.setFilters({ types: ['removed'] });
    expect(await review.decideVisible('accepted')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
  });

  it('the "Undo" does not apply if someone decided afterwards', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    const stale = must(review.undoable.value);
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    expect(
      await session.proposalActions.restoreDecisions(
        'P1',
        stale.previous,
        stale.decisions,
      ),
    ).toEqual({ ok: false, error: 'stale' });
  });

  it('a superseded or withdrawn proposal does not receive decisions', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({
      proposals: [{ ...proposal, status: 'superseded' }],
    });
    review.open('P1');
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'not-open',
    });
    expect(session.proposals.get('P1')?.revision).toBe(0);
  });

  it('the decision is redone over the disk version when the agent touched the file', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    // The agent replaces the proposal while the user reviews.
    writeOutside(root, { ...proposal, status: 'superseded', revision: 5 });
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'not-open',
    });
    expect(review.derived.proposal.value?.status).toBe('superseded');
    expect((await diskProposal(root)).decisions).toEqual({});
  });
});

describe('notas', () => {
  it('creates, edits and removes at any level, and groups by target', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const created = await review.addNote(
      { level: 'change', id: ids.rect },
      'The old position was right.',
    );
    if (!created?.ok) throw new Error('nota recusada');
    const noteId = must(created.noteId);
    await review.addNote({ level: 'proposal', id: null }, 'Revise as telas novas.');
    await review.addNote({ level: 'item', id: 'M1' }, 'Name in English, please.');
    await review.addNote({ level: 'image', id: 'I3' }, 'Low-resolution image.');
    await review.addNote({ level: 'project', id: null }, 'Camadas ok.');

    expect(
      review.derived.notes.value.get(reviewKey({ level: 'change', id: ids.rect })),
    ).toHaveLength(1);
    expect((await diskProposal(root)).notes).toHaveLength(5);

    await review.editNote(noteId, 'Keep the old position.');
    expect((await diskProposal(root)).notes.find((n) => n.id === noteId)?.text).toBe(
      'Keep the old position.',
    );
    await review.removeNote(noteId);
    expect((await diskProposal(root)).notes).toHaveLength(4);
    // Empty text on edit removes it.
    const item = must(
      (await diskProposal(root)).notes.find((n) => n.target.level === 'item'),
    );
    await review.editNote(item.id, '   ');
    expect((await diskProposal(root)).notes.some((n) => n.id === item.id)).toBe(false);
  });

  it('refuses an empty note and a target that does not exist', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(await review.addNote({ level: 'proposal', id: null }, '  ')).toEqual({
      ok: false,
      error: 'empty-note',
    });
    expect(await review.addNote({ level: 'change', id: 'zzz' }, 'x')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
    expect(await review.addNote({ level: 'item', id: 'M99' }, 'x')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
    expect(await review.editNote('nada', 'x')).toEqual({
      ok: false,
      error: 'unknown-note',
    });
  });
});

describe('conflitos', () => {
  it('are recomputed against the current project on open; the new ones only appear on the first opening after the edit', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    expect(review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    expect(review.derived.conflictIds.value.size).toBe(0);
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    review.close();

    // Outside the review the user edits the marking that the proposal renames.
    session.actions.renameMarking('M1', 'Door (hand-edited)');
    const reopened = review.open('P1');
    expect(reopened).toEqual({ ok: true, resumed: 'full', newConflicts: 1 });
    expect([...review.derived.conflictIds.value]).toEqual([ids.name]);
    expect([...review.newConflicts.value]).toEqual([ids.name]);
    const situation = must(review.derived.situation.value.get(ids.name));
    expect(situation.conflict).toBe(true);
    expect(situation.current).toBe('Door (hand-edited)');
    expect(review.derived.counts.value.conflicts).toBe(1);
    // The decision already made on the others stays.
    expect(review.derived.proposal.value?.decisions[ids.rect]?.state).toBe('rejected');
    review.close();

    // On the next opening the conflict is already known.
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'full', newConflicts: 0 });
    expect(review.newConflicts.value.size).toBe(0);
    expect(review.derived.conflictIds.value.size).toBe(1);
  });

  it('the project reloaded outside during the review recomputes the conflicts without losing decisions', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.conflictIds.value.size).toBe(0);

    // The MCP (or another editor) changes the marking name in mapping.json.
    const external = renameMarking(base, 'M1', 'Other name');
    root.put('mapping.json', serialize({ ...external, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    expect([...review.derived.conflictIds.value]).toEqual([ids.name]);
    expect(review.derived.proposal.value?.decisions[ids.name]?.state).toBe('accepted');
    expect(session.store.reviewing.value).toBe(true);
  });

  // Finding 11 of the 2026-10-11 report: "The project changed since your last session" without a
  // change. The same proposal (same id) opened in another copy of the project (the folder
  // unzipped from the same zip) erased this copy's known conflicts.
  it('reopening without a change never marks a new conflict, even after opening the same proposal in another copy of the project', async () => {
    const { proposal } = richScenario();
    // Copy A: the name of M1 was hand-edited before reviewing → the name change conflicts.
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    const a = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'copy-a',
    });
    expect(a.review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(a.review.derived.conflictIds.value.size).toBe(1);
    a.review.close();

    // Copy B: the same proposal in a folder with the project without the edit (no conflict).
    const b = await openHarness({ proposals: [proposal], copyId: 'copy-b' });
    expect(b.review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    expect(b.review.derived.conflictIds.value.size).toBe(0);
    b.review.close();

    // Back to copy A, without touching anything: the conflict was already known.
    const again = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'copy-a',
    });
    expect(again.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(again.review.newConflicts.value.size).toBe(0);
  });

  // pt-BR kept: the object of the test is switching the locale (pt-BR to en-US)
  it('switching the language between sessions does not change the known conflicts (pt-BR)', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    locale.value = 'pt-BR';
    const first = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(first.review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    first.review.select({ level: 'item', id: 'M4' });
    first.review.close();

    locale.value = 'en-US';
    const second = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(second.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(second.review.selected.value).toEqual({ level: 'item', id: 'M4' });
    expect(second.review.derived.conflictIds.value.size).toBe(1);
  });

  it('another tab with the old state in memory does not make an already seen conflict come back as new', async () => {
    const { proposal } = richScenario();
    // Yesterday: the review opened with no conflict.
    const yesterday = await openHarness({ proposals: [proposal], copyId: 'c' });
    yesterday.review.open('P1');
    yesterday.review.close();

    // The name of M1 changes outside; two tabs open the project (both read yesterday's state).
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    const tabA = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    const tabB = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(tabA.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 1,
    });
    tabA.review.close();
    // The other tab opens the same review later: the conflict was already shown.
    expect(tabB.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
  });

  // Phase 8.2 (P6): a conflict that arises during the review (external reload) appears as
  // new right away; once decided, it becomes known on close; with no decision, it is new again on the
  // next opening. (Replaces the test that pinned "already known on the next opening".)
  it('a conflict that appears during the review is new right away; only the decided one becomes known on close', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    // Outside, the name of M1 changes and image I2 is deleted: the name change and the
    // position change of M4 (which is in I2) start to conflict.
    let external = renameMarking(base, 'M1', 'Other name');
    external = removeContainer(external, 'I2');
    root.put('mapping.json', serialize({ ...external, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name, ids.rect]));
    // Live: both are new.
    expect(review.newConflicts.value).toEqual(new Set([ids.name, ids.rect]));
    // The person decides one of them (proof that they saw it) and closes.
    await review.decide({ level: 'change', id: ids.name }, 'rejected');
    review.close();
    // On reopening, the decided one is known and the one left without a decision comes back as new.
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'full', newConflicts: 1 });
    expect([...review.newConflicts.value]).toEqual([ids.rect]);
  });
});

// AC1 (#641): the X on the list notices. State of the open review; nothing is written.
describe('X on the review list notices', () => {
  async function withNewConflict() {
    const { proposal, ids, base } = richScenario();
    const h = await openHarness({ proposals: [proposal] });
    h.review.open('P1');
    h.review.close();
    return { ...h, proposal, ids, base };
  }

  it('dismissing the new-conflicts notice hides it; a new conflict afterwards brings it back', async () => {
    const { session, root, review, ids, base } = await withNewConflict();
    root.put(
      'mapping.json',
      serialize({ ...renameMarking(base, 'M1', 'Other name'), revision: 4 }),
    );
    expect(await session.sync()).toBe('reloaded');
    review.open('P1');
    expect(review.staleNotice.value).toEqual(new Set([ids.name]));
    review.dismissStaleNotice();
    expect(review.staleNotice.value.size).toBe(0);
    // The dismissed conflict stays new for the rest (the rule does not change).
    expect(review.newConflicts.value).toEqual(new Set([ids.name]));
    // Recarga externa com outro conflito: o aviso volta.
    root.put(
      'mapping.json',
      serialize({
        ...removeContainer(renameMarking(base, 'M1', 'Other name'), 'I2'),
        revision: 5,
      }),
    );
    expect(await session.sync()).toBe('reloaded');
    expect(review.staleNotice.value).toEqual(new Set([ids.name, ids.rect]));
  });

  it('dismissing the superseded notice hides it', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({
      proposals: [{ ...proposal, status: 'superseded' }],
    });
    review.open('P1');
    expect(review.supersededDismissed.value).toBe(false);
    review.dismissSupersededNotice();
    expect(review.supersededDismissed.value).toBe(true);
  });

  it('closing and reopening the review resets both', async () => {
    const { proposal: sp } = richScenario();
    const h = await openHarness({ proposals: [{ ...sp, status: 'superseded' }] });
    h.review.open('P1');
    h.review.dismissSupersededNotice();
    h.review.close();
    expect(h.review.supersededDismissed.value).toBe(false);
    h.review.open('P1');
    expect(h.review.supersededDismissed.value).toBe(false);
  });

  it('after leaving and coming back the conflict is already known: the notice does not come back', async () => {
    const { session, root, review, ids, base } = await withNewConflict();
    root.put(
      'mapping.json',
      serialize({ ...renameMarking(base, 'M1', 'Other name'), revision: 4 }),
    );
    expect(await session.sync()).toBe('reloaded');
    review.open('P1');
    review.dismissStaleNotice();
    review.close();
    review.open('P1');
    expect(ids.name).toBeTruthy();
    expect(review.staleNotice.value.size).toBe(0);
  });

  it('does not change the project, mapping.json or the review memory', async () => {
    const { proposal } = richScenario();
    const h = await openHarness({ proposals: [{ ...proposal, status: 'superseded' }] });
    h.review.open('P1');
    const before = {
      project: h.session.store.project.peek(),
      disk: await h.root.read('mapping.json'),
      memory: localStorage.getItem(
        [...Object.keys(localStorage)].find((k) => k.includes('review')) ?? '',
      ),
    };
    h.review.dismissStaleNotice();
    h.review.dismissSupersededNotice();
    await h.session.flush();
    expect(h.session.store.project.peek()).toBe(before.project);
    expect(await h.root.read('mapping.json')).toBe(before.disk);
    expect(
      localStorage.getItem(
        [...Object.keys(localStorage)].find((k) => k.includes('review')) ?? '',
      ),
    ).toBe(before.memory);
  });
});

// Gate return of 8.2 (finding 7): while the apply is in progress, the review does not
// re-evaluate (`derived.hold()`). The snapshot is tied to the proposal and goes away on release: a real conflict
// that arises during the wait appears on release, and another proposal opened in the
// meantime sees its own live values.
describe('apply in progress: the review holds the re-evaluation', () => {
  it('a real conflict that arises during the hold appears on release, as new', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.derived.conflictIds.value.size).toBe(0);
    const release = review.derived.hold();
    root.put(
      'mapping.json',
      serialize({ ...renameMarking(base, 'M1', 'Other name'), revision: 4 }),
    );
    expect(await session.sync()).toBe('reloaded');
    // Held: the previous snapshot.
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    release();
    // Solto: o conflito real, ao vivo e novo.
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    expect(review.derived.situation.value.get(ids.name)?.conflict).toBe(true);
    expect(review.newConflicts.value).toEqual(new Set([ids.name]));
  });

  it('the snapshot belongs to the proposal: holding A, closing and opening B shows the live values of B', async () => {
    const { proposal: a, ids, base } = richScenario('P1');
    const edited = renameMarking(base, 'M1', 'Top');
    const b = propose(
      edited,
      setMarkingRect(edited, 'M4', { x: 20, y: 20, width: 50, height: 50 }),
      { id: 'P2', title: 'Mover M4' },
    );
    const { session, root, review } = await openHarness({
      project: edited,
      proposals: [a, b],
    });
    review.open('P1');
    // A has the name conflict (the project already has another name).
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    const release = review.derived.hold();
    review.close();

    expect(review.open('P2').ok).toBe(true);
    // B: the live values, not A's snapshot.
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    expect([...review.derived.situation.value.keys()]).toEqual(
      b.changes.map((c) => c.id),
    );
    expect(review.derived.validation.value?.ok).toBe(true);
    review.close();

    // Outside, the name goes back to the one of proposal A: live, A has no conflict anymore.
    root.put('mapping.json', serialize({ ...base, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    // A, ainda segurada: o retrato dela volta.
    review.open('P1');
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    release();
    expect(review.derived.conflictIds.value.size).toBe(0);
  });
});

// Phase 8.2 (P2/R3, P3, P5, O5): the resume and the "seen" per copy (`ProjectStorage.copyId`),
// in a versioned blob (`mapping.reviewResume` v2) with `seen` separate from `resume`.
describe('resume per copy and v2 blob', () => {
  const RESUME_KEY = 'mapping.reviewResume';
  const blob = () => JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
  const v1Entry = {
    selected: { level: 'item', id: 'M4' },
    view: 'current',
    filters: {
      types: [],
      imageId: null,
      layerId: null,
      decision: 'undecided',
      onlyConflicts: false,
    },
    knownConflicts: [],
  };

  it('two folders with the same name are two copies: position, filters, known conflicts and "seen" independent (O5)', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    // Copy A (`projects/shop`): with a conflict, selected M4 and filtered the pending ones.
    const a = await openHarness({
      project: edited,
      proposals: [proposal],
      folderName: 'shop',
      copyId: 'shop-1',
    });
    expect(a.review.open('P1')).toMatchObject({ resumed: 'none', newConflicts: 0 });
    a.review.select({ level: 'item', id: 'M4' });
    a.review.setFilters({ decision: 'undecided' });
    a.review.close();

    // Copy B (`backup/shop`, freshly unzipped): the proposal is new and the review starts
    // from scratch; the conflict that A already knew does not exist here and nothing is inherited.
    const b = await openHarness({
      proposals: [proposal],
      folderName: 'shop',
      copyId: 'shop-2',
    });
    expect(b.review.derived.freshIds.value).toEqual(['P1']);
    expect(b.review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(b.review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(b.review.filters.value.decision).toBe('all');
    // The edit happens in B afterwards: the conflict is new in B, and A is not affected.
    b.review.close();
    b.session.actions.renameMarking('M1', 'Top');
    expect(b.review.open('P1')).toMatchObject({ resumed: 'full', newConflicts: 1 });
    b.review.close();

    // The same copy with another folder name (renamed on disk) is still the same one.
    const again = await openHarness({
      project: edited,
      proposals: [proposal],
      folderName: 'shop-renamed',
      copyId: 'shop-1',
    });
    expect(again.review.derived.freshIds.value).toEqual([]);
    expect(again.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(again.review.selected.value).toEqual({ level: 'item', id: 'M4' });
    expect(again.review.filters.value.decision).toBe('undecided');
  });

  it('the key is `copyId|proposalId` and the blob has `v: 2`, `seen` and `resume`', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal], copyId: 'copy-x' });
    review.open('P1');
    review.select({ level: 'item', id: 'M4' });
    review.close();
    const stored = blob();
    expect(stored.v).toBe(2);
    expect(stored.seen).toEqual(['copy-x|P1']);
    expect(Object.keys(stored.resume)).toEqual(['copy-x|P1']);
    for (const key of [...stored.seen, ...Object.keys(stored.resume)]) {
      expect(key).toMatch(/^[^|]+\|[A-Za-z0-9._-]+$/);
    }
    expect(stored.resume['copy-x|P1']).toMatchObject({
      selected: { level: 'item', id: 'M4' },
      view: 'proposed',
      knownConflicts: [],
    });
  });

  it('resume: a blob without `onlyRevised` counts as off and with `true` comes back on (stage #644)', async () => {
    const { proposal } = richScenario();
    const seed = (onlyRevised?: boolean) =>
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({
          v: 2,
          seen: ['copy-r|P1'],
          resume: {
            'copy-r|P1': {
              ...v1Entry,
              filters: {
                ...v1Entry.filters,
                ...(onlyRevised === undefined ? {} : { onlyRevised }),
              },
            },
          },
        }),
      );
    seed();
    const old = await openHarness({ proposals: [proposal], copyId: 'copy-r' });
    expect(old.review.open('P1')).toMatchObject({ resumed: 'full' });
    expect(old.review.filters.value.decision).toBe('undecided');
    expect(old.review.filters.value.onlyRevised).toBe(false);
    old.review.close();
    seed(true);
    const on = await openHarness({ proposals: [proposal], copyId: 'copy-r' });
    expect(on.review.open('P1')).toMatchObject({ resumed: 'full' });
    expect(on.review.filters.value.onlyRevised).toBe(true);
  });

  it('without copyId the scope is empty (key `|P1`) and Diagnostics records it', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal], copyId: null });
    review.open('P1');
    review.close();
    expect(Object.keys(blob().resume)).toEqual(['|P1']);
    expect(reportedErrors.value.map((e) => e.context)).toContain('review.scope');
  });

  it('the v1 blob (no version, with legacy and copy entries) is discarded: nothing resumed, everything "New", and rewritten as v2', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    // pt-BR kept: shared fixture data asserted by tests/components (the harness folder name 'projeto')
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ P1: v1Entry, 'folder:projeto|P1': v1Entry }),
    );
    const { review } = await openHarness({ project: edited, proposals: [proposal] });
    expect(review.derived.freshIds.value).toEqual(['P1']);
    // The first opening in this copy does not mark a new conflict (there is nothing to compare with).
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(review.view.value).toBe('proposed');
    expect(review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(review.filters.value.decision).toBe('all');
    // The resume write is grouped per frame; closing the review writes it right away.
    review.close();
    const stored = blob();
    expect(stored.v).toBe(2);
    expect(Object.keys(stored.resume)).toHaveLength(1);
    expect(stored.resume.P1).toBeUndefined();
    expect(stored.resume['folder:projeto|P1']).toBeUndefined();
  });

  it('an unknown blob version is also discarded', async () => {
    const { proposal } = richScenario();
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ v: 3, seen: ['x|P1'], resume: {}, extra: true }),
    );
    const { review } = await openHarness({ proposals: [proposal], copyId: 'x' });
    expect(review.derived.freshIds.value).toEqual(['P1']);
    expect(review.open('P1')).toMatchObject({ resumed: 'none' });
    review.close();
    expect(blob()).toMatchObject({ v: 2, seen: ['x|P1'] });
  });

  it('the resume keeps only the 12 most recent proposals of the copy; "seen" has no limit (P3)', async () => {
    const proposals: Proposal[] = [];
    for (let i = 1; i <= 13; i++) {
      proposals.push({
        ...richScenario(`P${i}`).proposal,
        createdAt: `2026-10-${String(i).padStart(2, '0')}T12:00:00.000Z`,
      });
    }
    const { review } = await openHarness({ proposals, copyId: 'c' });
    for (let i = 1; i <= 13; i++) {
      review.open(`P${i}`);
      review.select({ level: 'item', id: 'M4' });
      review.close();
    }
    const stored = blob();
    expect(Object.keys(stored.resume)).toHaveLength(12);
    expect(stored.resume['c|P1']).toBeUndefined();
    expect(Object.keys(stored.resume)[0]).toBe('c|P2');
    expect(Object.keys(stored.resume).at(-1)).toBe('c|P13');
    expect(stored.seen).toHaveLength(13);
    // The first one stays seen: the resume eviction does not give it back to "New".
    expect(review.derived.freshIds.value).toEqual([]);
    expect(review.open('P1')).toMatchObject({ resumed: 'none' });
    review.close();
    // Another session of the same copy reads the same.
    const again = await openHarness({ proposals, copyId: 'c' });
    expect(again.review.derived.freshIds.value).toEqual([]);
    // Another copy has its own limit: this one's entries are not touched.
    const other = await openHarness({ proposals: [proposals[0]!], copyId: 'd' });
    other.review.open('P1');
    other.review.close();
    expect(Object.keys(blob().resume)).toHaveLength(13);
  });

  it('with localStorage blocked, opening does not throw and the proposal stops being "New" in the session', async () => {
    const { proposal } = richScenario();
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const { review } = await openHarness({ proposals: [proposal] });
      expect(review.derived.freshIds.value).toEqual(['P1']);
      expect(review.open('P1')).toMatchObject({ ok: true, resumed: 'none' });
      review.select({ level: 'item', id: 'M4' });
      review.close();
      expect(review.derived.freshIds.value).toEqual([]);
      expect(review.derived.rows.value[0]?.fresh).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('what another tab marked as seen enters this one on the next write or opening (accepted limit, D4)', async () => {
    const p1 = richScenario('P1').proposal;
    const p2 = { ...richScenario('P2').proposal, createdAt: '2026-10-10T12:00:00.000Z' };
    const tabB = await openHarness({ proposals: [p1, p2], copyId: 'c' });
    const tabA = await openHarness({ proposals: [p1, p2], copyId: 'c' });
    expect(tabB.review.derived.freshIds.value).toEqual(['P2', 'P1']);
    tabA.review.open('P1');
    tabA.review.close();
    // With no event between tabs: B still counts P1 as new...
    expect(tabB.review.derived.freshIds.value).toEqual(['P2', 'P1']);
    // ...until its next opening (or write), which re-reads the blob.
    tabB.review.open('P2');
    expect(tabB.review.derived.freshIds.value).toEqual([]);
  });

  it('selecting and navigating do not reassign `seen` nor recompute the rows of the Proposals window (E2)', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const seen = review.seen.value;
    const rows = review.derived.rows.value;
    review.select({ level: 'item', id: 'M4' });
    review.setView('current');
    review.step('pending', 1);
    review.setFilters({ decision: 'undecided' });
    expect(review.seen.value).toBe(seen);
    expect(review.derived.rows.value).toBe(rows);
  });

  it('the layer filter created by the proposal survives resuming, in any view (P9)', async () => {
    const base = sampleProject();
    const after = addLayer(base, { id: 'L3', name: 'Eventos', color: '#00AA00' });
    const proposal = propose(base, after, { id: 'P1' });
    const { review } = await openHarness({ proposals: [proposal], copyId: 'c' });
    review.open('P1');
    review.setFilters({ layerId: 'L3' });
    review.setView('current');
    review.close();
    expect(review.open('P1')).toMatchObject({ resumed: 'full' });
    expect(review.view.value).toBe('current');
    expect(review.filters.value.layerId).toBe('L3');
    review.close();
    // A layer that exists neither in the current nor in the preview leaves the filter.
    const stored = blob();
    stored.resume['c|P1'].filters.layerId = 'LX';
    localStorage.setItem(RESUME_KEY, JSON.stringify(stored));
    review.open('P1');
    expect(review.filters.value.layerId).toBeNull();
  });

  it('deciding without an open review is refused without throwing; the proposal deleted outside closes without writing resume (P11)', async () => {
    const { proposal, ids } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'unknown-proposal',
    });
    review.open('P1');
    review.select({ level: 'item', id: 'M4' });
    localStorage.removeItem(RESUME_KEY);
    root.dirs.get('proposals')?.dirs.delete('P1');
    await session.sync();
    expect(review.proposalId.value).toBeNull();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });
});

describe('resume the review', () => {
  it('goes back to the last item, with the same filters and the same view, per device', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal], copyId: 'c' });
    first.review.open('P1');
    first.review.select({ level: 'item', id: 'M5' });
    first.review.setView('current');
    first.review.setFilters({
      types: ['created', 'moved'],
      decision: 'undecided',
      onlyConflicts: false,
    });
    first.review.close();
    expect(first.review.proposalId.value).toBeNull();
    expect(first.session.store.reviewing.value).toBe(false);

    // "Close the app": another session, another review state, the same localStorage and the
    // same copy of the project.
    const second = await openHarness({ proposals: [proposal], copyId: 'c' });
    expect(second.review.seen.value.has('P1')).toBe(true);
    const reopened = second.review.open('P1');
    expect(reopened).toMatchObject({ ok: true, resumed: 'full' });
    expect(second.review.selected.value).toEqual({ level: 'item', id: 'M5' });
    expect(second.review.view.value).toBe('current');
    expect(second.review.filters.value).toMatchObject({
      types: ['created', 'moved'],
      decision: 'undecided',
    });
    void ids;
  });

  it('falls back to the first pending one if the last item no longer exists or there is no stored state', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal], copyId: 'c' });
    first.review.open('P1');
    first.review.select({ level: 'item', id: 'M5' });
    first.review.setFilters({ imageId: 'I3' });
    first.review.close();

    // The proposal changed outside: the item and the filter image are gone.
    const smaller = {
      ...proposal,
      changes: proposal.changes.filter((c) => c.id === ids.name || c.id === ids.rect),
    };
    const second = await openHarness({ proposals: [smaller], copyId: 'c' });
    second.review.open('P1');
    expect(second.review.selected.value).toEqual({ level: 'change', id: ids.name });
    expect(second.review.filters.value.imageId).toBeNull();
    second.review.close();
  });

  it('without localStorage or with corrupted text, opens at the first pending one', async () => {
    const { proposal, ids } = richScenario();
    localStorage.setItem('mapping.reviewResume', '{ corrompido');
    const a = await openHarness({ proposals: [proposal] });
    expect(a.review.open('P1').ok).toBe(true);
    expect(a.review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    a.review.close();

    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const b = await openHarness({ proposals: [proposal] });
      expect(b.review.open('P1')).toMatchObject({ ok: true, resumed: 'none' });
      b.review.select({ level: 'item', id: 'M5' });
      b.review.close();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
    void ids;
  });

  it('the decisions, the accepted ones not yet applied and the notes survive closing and reopening the app', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal] });
    first.review.open('P1');
    await first.review.decide({ level: 'change', id: ids.name }, 'accepted');
    await first.review.decide({ level: 'change', id: ids.rect }, 'rejected');
    await first.review.addNote({ level: 'change', id: ids.rect }, 'Do not touch.');
    first.review.close();
    await first.session.close();

    // Reopens the folder: the proposals come from disk.
    const files: Record<string, string> = {};
    const text = await first.root.read('proposals/P1/proposal.json');
    files['proposals/P1/proposal.json'] = text ?? '';
    const second = await openHarness({ files });
    second.review.open('P1');
    const d = second.review.derived;
    expect(d.counts.value).toMatchObject({
      accepted: 1,
      rejected: 1,
      undecided: 3,
      acceptedPending: 1,
    });
    expect(
      d.notes.value.get(reviewKey({ level: 'change', id: ids.rect }))?.[0]?.text,
    ).toBe('Do not touch.');
  });
});

describe('new and superseded proposal', () => {
  it('"New" until someone opens, decides or annotates; the badge counts the new ones', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({
      proposals: [
        proposal,
        { ...richScenario('P2').proposal, createdAt: '2026-10-10T12:00:00.000Z' },
      ],
    });
    const d = review.derived;
    expect(d.rows.value.map((r) => r.proposal.id)).toEqual(['P2', 'P1']);
    expect(d.freshIds.value).toEqual(['P2', 'P1']);
    review.open('P2');
    expect(d.freshIds.value).toEqual(['P1']);
    expect(d.rows.value.find((r) => r.proposal.id === 'P2')?.fresh).toBe(false);
  });

  it('shows what was left behind and compares with the new one (same, different, not present)', async () => {
    const base = sampleProject();
    const old = propose(
      base,
      setMarkingRect(renameMarking(base, 'M1', 'Door A'), 'M4', {
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      }),
      { id: 'OLD', title: 'v1' },
    );
    const nova = propose(
      base,
      setMarkingRect(renameMarking(base, 'M1', 'Door B'), 'M2', {
        x: 1210,
        y: 1210,
        width: 400,
        height: 200,
      }),
      { id: 'NEW', title: 'v2', supersedes: 'OLD' },
    );
    const nameOld = must(old.changes.find((c) => c.field === 'name')).id;
    const rectOld = must(old.changes.find((c) => c.field === 'rect')).id;
    const { review } = await openHarness({
      proposals: [
        {
          ...old,
          status: 'superseded',
          decisions: { [nameOld]: { state: 'accepted', at: '2026-10-09T13:00:00.000Z' } },
        },
        nova,
      ],
    });
    expect(review.open('OLD').ok).toBe(true);
    const sup = must(review.derived.supersession.value);
    expect(sup.by?.id).toBe('NEW');
    expect(sup.leftBehind).toEqual({
      undecided: [rectOld],
      acceptedPending: [nameOld],
      rejected: [],
    });
    expect(sup.comparison?.get(nameOld)).toBe('different');
    expect(sup.comparison?.get(rectOld)).toBe('missing');
    const row = must(review.derived.rows.value.find((r) => r.proposal.id === 'OLD'));
    expect(row.supersededBy?.id).toBe('NEW');
    expect(row.leftBehind?.undecided).toEqual([rectOld]);
    expect(
      review.derived.rows.value.find((r) => r.proposal.id === 'NEW')?.supersededBy,
    ).toBeNull();
    // The accepted ones of the superseded proposal can still be applied.
    expect(review.derived.canApply.value).toBe(true);
  });

  // Finding 13 (app part): the applied proposal does not change status when superseded
  // (it is history); the row derives "superseded by" from the new one's `supersedes`.
  it('the applied proposal stays applied and the row knows who superseded it (title and id)', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const applied: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Only the fix',
    };
    const { review, root } = await openHarness({ proposals: [applied, next] });
    const row = must(review.derived.rows.value.find((r) => r.proposal.id === 'P1'));
    expect(row.proposal.status).toBe('applied');
    expect(row.supersededBy).toMatchObject({ id: 'P2', title: 'Only the fix' });
    expect(row.leftBehind).toBeNull();
    // Nothing is written: the old one's file stays `applied`.
    expect((await diskProposal(root)).status).toBe('applied');
  });

  it('the proposal deleted outside closes the review', async () => {
    const { proposal } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    root.dirs.get('proposals')?.dirs.delete('P1');
    await session.sync();
    expect(review.proposalId.value).toBeNull();
    expect(session.store.reviewing.value).toBe(false);
  });
});

describe('navigation through pending items and conflicts', () => {
  it('N / Shift+N cycle through the pending ones that pass the filters', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    review.select({ level: 'change', id: ids.name });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.marking });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.image });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.annotation });
    review.setFilters({ types: ['moved'] });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('conflict', 1)).toBeNull();
  });
});

describe('aplicar aceitas', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };

  it('one undo entry, image moved and proposal updated; undo and redo carry the proposal along', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    const { review, session, root } = h;
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(review.derived.canApply.value).toBe(true);
    expect(review.derived.counts.value.acceptedPending).toBe(5);
    const undoBefore = session.store.canUndo.value;

    const result = await review.apply();
    expect(result).toMatchObject({ ok: true, applied: 5, files: 1 });

    // Project: everything applied, in a single entry.
    const project = must(session.store.project.value);
    expect(project.containers.map((i) => i.id)).toContain('I3');
    expect(project.markings.find((m) => m.id === 'M1')?.name).toBe('Porta dianteira');
    expect(project.annotations.some((a) => a.id === 'A9')).toBe(true);
    expect(undoBefore).toBe(false);
    expect(session.store.canUndo.value).toBe(true);
    expect((await projectOnDisk(h)).containers.map((i) => i.id)).toContain('I3');
    // Image moved: the one in images/ exists and the one in the proposal is gone.
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    // Proposta: aplicada, com a data, e fechada.
    const applied = await diskProposal(root);
    expect(Object.keys(applied.applied).sort()).toEqual(Object.values(ids).sort());
    expect(applied.status).toBe('applied');
    expect(review.derived.counts.value).toMatchObject({ applied: 5, acceptedPending: 0 });
    expect(review.derived.canApply.value).toBe(false);

    // A single undo brings everything back: project, image and proposal.
    expect(session.store.undo()).toBe(true);
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
    await session.proposals.settled();
    await h.session.flush();
    const undone = await diskProposal(root);
    expect(undone.applied).toEqual({});
    expect(undone.status).toBe('open');
    expect(Object.keys(undone.decisions)).toHaveLength(5);
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(await root.read('images/nova.webp')).toBeNull();
    expect(review.derived.counts.value.acceptedPending).toBe(5);
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.canRedo.value).toBe(true);

    // Redo applies again.
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    await h.session.flush();
    const redone = await diskProposal(root);
    expect(Object.keys(redone.applied)).toHaveLength(5);
    expect(redone.status).toBe('applied');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
  });

  it('partial application: what has no decision stays pending, and a new application takes effect on the rest', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    const { review, session, root } = h;
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    const first = await review.apply();
    expect(first).toMatchObject({ ok: true, applied: 1, files: 0 });
    let disk = await diskProposal(root);
    expect(Object.keys(disk.applied)).toEqual([ids.name]);
    expect(disk.status).toBe('open');
    expect(review.derived.counts.value).toMatchObject({
      applied: 1,
      undecided: 3,
      acceptedPending: 0,
    });
    // A imagem continua esperando na proposta.
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');

    // Changes already applied do not change decision.
    expect(
      await review.decide({ level: 'change', id: ids.name }, 'rejected'),
    ).toMatchObject({ ok: true, changed: [] });
    expect((await diskProposal(root)).decisions[ids.name]?.state).toBe('accepted');

    await review.decide({ level: 'image', id: 'I3' }, 'accepted');
    const second = await review.apply();
    expect(second).toMatchObject({ ok: true, applied: 3, files: 1 });
    disk = await diskProposal(root);
    expect(disk.status).toBe('applied');
    expect(Object.keys(disk.applied).sort()).toEqual(
      [ids.name, ids.image, ids.marking, ids.annotation].sort(),
    );
    expect(session.store.project.value?.markings.find((m) => m.id === 'M4')?.rect.x).toBe(
      0,
    );

    // Undoing only the second application leaves the first one.
    session.store.undo();
    await session.proposals.settled();
    disk = await diskProposal(root);
    expect(Object.keys(disk.applied)).toEqual([ids.name]);
    expect(disk.status).toBe('open');
  });

  it('deciding after undoing discards the "redo", which would leave project and proposal out of sync', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    h.review.open('P1');
    await h.review.decide({ level: 'change', id: ids.name }, 'accepted');
    await h.review.apply();
    h.session.store.undo();
    await h.session.proposals.settled();
    expect(h.session.store.canRedo.value).toBe(true);
    await h.review.decide({ level: 'change', id: ids.name }, 'rejected');
    expect(h.session.store.canRedo.value).toBe(false);
  });

  it('an invalid set blocks Apply and points to the changes involved', async () => {
    // A placement that puts I2 over I1 (the tampered proposal) leaves the images overlapping.
    const base = sampleProject();
    const honest = propose(base, moveContainer(base, 'I2', 5000, 5000), { id: 'P1' });
    const overlap = must(honest.changes.find((c) => c.field === 'placement'));
    const i1 = must(base.containers.find((c) => c.id === 'I1'));
    const proposal: Proposal = {
      ...honest,
      changes: honest.changes.map((c) =>
        c.id === overlap.id ? { ...c, to: { ...i1.placement } } : c,
      ),
    };
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: overlap.id }, 'accepted');

    expect(review.derived.canApply.value).toBe(false);
    expect(review.derived.validation.value?.ok).toBe(false);
    expect(review.derived.invalid.value.changeIds.has(overlap.id)).toBe(true);
    const projectBefore = session.store.project.value;
    const result = await review.apply();
    expect(result).toMatchObject({ ok: false, error: 'blocked' });
    expect(result && !result.ok ? result.issues?.length : 0).toBeGreaterThan(0);
    expect(session.store.project.value).toBe(projectBefore);
    expect((await diskProposal(root)).applied).toEqual({});

    // Rejeitar a que causa o problema resolve.
    await review.decide({ level: 'change', id: overlap.id }, 'rejected');
    expect(review.derived.validation.value?.ok).toBe(true);
  });

  it('an image that is not in proposals/<id>/ is not applied, and nothing changes', async () => {
    const { proposal, ids } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.annotation }, 'accepted');
    const before = session.store.project.value;
    const result = await review.apply();
    expect(result).toEqual({ ok: false, error: 'image-missing', path: NEW_IMAGE_PATH });
    expect(session.store.project.value).toBe(before);
    expect((await diskProposal(root)).applied).toEqual({});
    expect(await root.read('images/nova.webp')).toBeNull();
  });

  it('does not overwrite the file of a project image (swap with the same name)', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/frente.jpg',
      width: 800,
      height: 800,
    });
    const proposal = propose(base, after, { id: 'P1' });
    const change = must(proposal.changes.find((c) => c.field === 'file'));
    const { review, session, root } = await openHarness({
      proposals: [proposal],
      files: {
        'proposals/P1/images/frente.jpg': 'NEW FILE',
        'images/frente.jpg': 'ORIGINAL',
      },
    });
    review.open('P1');
    await review.decide({ level: 'change', id: change.id }, 'accepted');
    const before = session.store.project.value;
    const result = await review.apply();
    expect(result).toMatchObject({
      ok: false,
      error: 'image-exists',
      path: 'images/frente.jpg',
    });
    expect(await root.read('images/frente.jpg')).toBe('ORIGINAL');
    expect(session.store.project.value).toBe(before);
  });

  it.each([
    ['a loose file in images/', 'images/nova.webp'],
    ['a file that only differs in case', 'images/NOVA.webp'],
  ])('target occupied by %s: image-exists, sem gravar nada', async (_name, occupied) => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({
      proposals: [proposal],
      files: { [NEW_IMAGE_PATH]: 'WEBP', [occupied]: 'USER FILE' },
    });
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'accepted');
    const before = session.store.project.value;
    const result = await review.apply();
    expect(result).toMatchObject({
      ok: false,
      error: 'image-exists',
      path: 'images/nova.webp',
    });
    expect(await root.read(occupied)).toBe('USER FILE');
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(session.store.project.value).toBe(before);
    expect((await diskProposal(root)).applied).toEqual({});
  });

  it('target that the session trash holds (deleted image, undo possible): image-exists', async () => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({
      proposals: [proposal],
      files: { [NEW_IMAGE_PATH]: 'WEBP', 'images/nova.webp': 'OLD FILE' },
      project: addContainer(sampleProject(), {
        id: 'IX',
        file: 'images/nova.webp',
        width: 100,
        height: 100,
      }),
    });
    session.actions.removeContainer('IX');
    await session.flush();
    expect(await root.read('images/nova.webp')).toBeNull();
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'accepted');
    const result = await review.apply();
    expect(result).toMatchObject({ ok: false, error: 'image-exists' });
    expect(await root.read('images/nova.webp')).toBeNull();
    review.close();
    session.store.undo();
    await session.flush();
    expect(await root.read('images/nova.webp')).toBe('OLD FILE');
  });

  it('nothing accepted: applying creates no undo entry nor writes the proposal', async () => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const result = await review.apply();
    expect(result).toMatchObject({ ok: true, applied: 0, files: 0 });
    expect(session.store.canUndo.value).toBe(false);
    expect((await diskProposal(root)).revision).toBe(0);
  });

  it('everything rejected: applying closes the proposal as applied, without touching the project', async () => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'rejected');
    const before = session.store.project.value;
    expect(await review.apply()).toMatchObject({ ok: true, applied: 0 });
    expect(session.store.project.value).toBe(before);
    expect((await diskProposal(root)).status).toBe('applied');
  });
});

describe('como ficaria', () => {
  it('the preview has the current one plus what was neither rejected nor applied', async () => {
    const { proposal, ids } = richScenario();
    const { review, session } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    const preview = must(review.derived.preview.value);
    expect(preview.project.containers.map((i) => i.id)).toContain('I3');
    expect(preview.project.markings.find((m) => m.id === 'M1')?.name).toBe(
      'Porta dianteira',
    );
    // The rejected one stays as in the current project.
    expect(preview.project.markings.find((m) => m.id === 'M4')?.rect).toEqual(
      session.store.project.value?.markings.find((m) => m.id === 'M4')?.rect,
    );
    expect(preview.problems).toEqual([]);
  });

  it('the derived state is memoized: deciding does not redo the levels or the conflicts', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const tree = review.derived.tree.value;
    const conflicts = review.derived.conflictIds.value;
    const types = review.derived.levelTypes.value;
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.tree.value).toBe(tree);
    expect(review.derived.conflictIds.value).toBe(conflicts);
    expect(review.derived.levelTypes.value).toBe(types);
    expect(review.derived.levelTypes.value.get('item:M5')).toBe('created');
    expect(review.derived.levelTypes.value.get('item:M4')).toBe('moved');
    expect(review.derived.levelTypes.value.get('item:M1')).toBe('changed');
    // The new image is created; the one with only a moved marking is "changed".
    expect(review.derived.levelTypes.value.get('image:I3')).toBe('created');
    expect(review.derived.levelTypes.value.get('image:I2')).toBe('changed');
  });

  it('the item kind is that of the marking: an annotation created on an item that already exists changes it', async () => {
    const base = sampleProject();
    let after = addAnnotation(base, {
      id: 'A9',
      markingId: 'M4',
      layerId: 'L1',
      name: 'x',
    });
    after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
    const { review } = await openHarness({ proposals: [propose(base, after)] });
    review.open('P1');
    // The position changes, but it is not the only thing: "changed", not "moved" nor "created".
    expect(review.derived.levelTypes.value.get('item:M4')).toBe('changed');
  });
});

// New layer in the proposal: the layer filter and the Project group.
describe('Project group and layers', () => {
  it('the changes outside the images stay in the Project group and filter by layer', async () => {
    const base = sampleProject();
    const after = addLayer(base, { id: 'L3', name: 'Eventos', color: '#00AA00' });
    const proposal: Proposal = propose(base, after, { id: 'P1' });
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const level = review.derived.levels.value.get('project:');
    expect(level?.total).toBe(1);
    review.setFilters({ layerId: 'L3' });
    expect(review.derived.visibleIds.value).toHaveLength(1);
    review.setFilters({ layerId: 'L1' });
    expect(review.derived.visibleIds.value).toHaveLength(0);
  });
});

// Phase 9.2: deleting a closed proposal. The project undo stays valid (the link
// of the application leaves the history), the resume of that proposal leaves the blob and the open review
// refuses.
describe('delete proposal (phase 9.2)', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };
  const RESUME_KEY = 'mapping.reviewResume';

  /** Applies everything of P1 (closes the review): the proposal becomes "applied" and the project changes. */
  async function appliedHarness(
    options: { copyId?: string; others?: readonly Proposal[] } = {},
  ) {
    const { proposal } = richScenario();
    const h = await openHarness({
      proposals: [proposal, ...(options.others ?? [])],
      files,
      ...(options.copyId === undefined ? {} : { copyId: options.copyId }),
    });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    h.review.close();
    return h;
  }

  it('in the review of P2, the second undo does not undo the application of P1 (R12.20b/c)', async () => {
    const { after } = richScenario();
    const p2 = propose(after, renameMarking(after, 'M5', 'Button 2'), { id: 'P2' });
    const h = await appliedHarness({ others: [p2] });
    const { session, review, root } = h;
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');

    review.open('P2');
    await review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await review.apply()).toMatchObject({ ok: true });
    expect((await diskProposal(root, 'P2')).status).toBe('applied');

    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    expect((await diskProposal(root, 'P2')).status).toBe('open');
    expect(review.proposalId.value).toBe('P2');

    // The second one does nothing: the entry belongs to P1, and the open review is P2's.
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.undo()).toBe(false);
    await session.proposals.settled();
    expect((await diskProposal(root, 'P1')).status).toBe('applied');
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
    expect(review.proposalId.value).toBe('P2');
  });

  it('deletes the applied one from disk and from the list; undoing and redoing the project afterwards neither error nor leave an orphan cited file', async () => {
    const h = await appliedHarness();
    const { session, review, root } = h;
    expect((await diskProposal(root)).status).toBe('applied');

    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });

    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    expect(session.proposals.list.value).toEqual([]);
    expect(review.derived.rows.value).toEqual([]);
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);
    // The application entry stays in the history, now only the project's.
    expect(session.store.canUndo.value).toBe(true);

    clearReportedErrors();
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
    const undone = await projectOnDisk(h);
    expect(undone.containers.map((i) => i.id)).not.toContain('I3');
    // No resurrected proposal, nor image returned to proposals/P1/.
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    // The file copied to images/ follows the session's normal cleanup: the mapping.json
    // written no longer cites it, so it left.
    expect(await root.read('images/nova.webp')).toBeNull();

    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    const redone = await projectOnDisk(h);
    expect(redone.containers.map((i) => i.id)).toContain('I3');
    // mapping.json cites images/nova.webp and the file is there (restored from the trash).
    expect(redone.containers.find((i) => i.id === 'I3')?.file).toBe('images/nova.webp');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(reportedErrors.value).toEqual([]);
  });

  it('the pending redo of an application undone before deleting also stays with the project only', async () => {
    const h = await appliedHarness();
    const { session, review, root } = h;
    // Undoes the application (the proposal goes back to "open"): it cannot be deleted like this.
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    expect((await diskProposal(root)).status).toBe('open');
    expect(await review.removeProposal('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    // Redo applies again; now the proposal is applied and can be deleted.
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    expect((await diskProposal(root)).status).toBe('applied');
    // Undoes again and deletes with the entry in "redo": redo only touches the project.
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    writeOutside(root, { ...(await diskProposal(root)), status: 'withdrawn' });
    await session.proposals.scan();
    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });
    clearReportedErrors();
    expect(session.store.canRedo.value).toBe(true);
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    await session.flush();
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(reportedErrors.value).toEqual([]);
  });

  it('the resume entry and the "seen" of that proposal leave the blob; those of the others stay', async () => {
    const p2 = richScenario('P2').proposal;
    const h = await appliedHarness({ copyId: 'copy-9', others: [p2] });
    const { review } = h;
    review.open('P2');
    review.select({ level: 'item', id: 'M4' });
    review.close();
    const before = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
    expect(before.seen).toEqual(['copy-9|P1', 'copy-9|P2']);
    expect(Object.keys(before.resume).sort()).toEqual(['copy-9|P1', 'copy-9|P2']);

    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });

    const after = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
    expect(after.seen).toEqual(['copy-9|P2']);
    expect(Object.keys(after.resume)).toEqual(['copy-9|P2']);
    expect(review.seen.value.has('P1')).toBe(false);
    expect(review.seen.value.has('P2')).toBe(true);
  });

  it('with localStorage blocked, deleting does not throw', async () => {
    const h = await appliedHarness();
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(await h.review.removeProposal('P1')).toMatchObject({ ok: true });
      expect(h.session.proposals.list.value).toEqual([]);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('refuses during the review and in a read-only project, without deleting anything', async () => {
    const closed: Proposal = { ...richScenario('P1').proposal, status: 'withdrawn' };
    const open = richScenario('P2').proposal;
    const { review, session, root } = await openHarness({ proposals: [closed, open] });

    review.open('P2');
    expect(await review.removeProposal('P1')).toEqual({ ok: false, error: 'reviewing' });
    expect(await session.proposalActions.removeProposal('P1')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    review.close();

    session.store.load(must(session.store.project.value), { readOnly: true });
    expect(await review.removeProposal('P1')).toEqual({ ok: false, error: 'read-only' });
    expect(await root.read('proposals/P1/proposal.json')).not.toBeNull();
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('an open proposal is not deleted', async () => {
    const { review, root } = await openHarness({ proposals: [richScenario().proposal] });
    expect(await review.removeProposal('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await root.read('proposals/P1/proposal.json')).not.toBeNull();
  });
});

// Phase 9.5: the "changes by entity and field" index of the Details in the review.
describe('changes by entity and field (phase 9.5)', () => {
  it('groups by entity: whole creation/removal and changes by field', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const index = review.derived.fieldIndex.value;
    // Field change: the name of M1 and the position of M4.
    expect(index.entities.get('M1')?.whole).toBeNull();
    expect(index.entities.get('M1')?.fields.get('name')?.id).toBe(ids.name);
    expect(index.entities.get('M4')?.fields.get('rect')?.id).toBe(ids.rect);
    // Creation: the whole entity, without fields.
    expect(index.entities.get('M5')?.whole?.id).toBe(ids.marking);
    expect(index.entities.get('M5')?.fields.size).toBe(0);
    expect(index.entities.get('I3')?.whole?.id).toBe(ids.image);
    expect(index.entities.get('A9')?.entity).toBe('annotation');
    // Annotations by marking in which they appear.
    expect(index.annotationsOf.get('M5')?.map((c) => c.id)).toEqual([ids.annotation]);
    expect(index.leaving.size).toBe(0);
  });

  it('pairs and fields of the annotation, the removal and the marking swap (the ones that leave)', () => {
    const base = sampleProject();
    let after = updateEntry(base, 'A1', 'E1', { key: 'tipo', value: 'risco' });
    after = removeEntry(after, 'A1', 'E2');
    after = removeAnnotation(after, 'A2');
    after = {
      ...after,
      annotations: after.annotations.map((a) =>
        a.id === 'A3' ? { ...a, markingId: 'M1' } : a,
      ),
    };
    const p = propose(base, after);
    const index = fieldChangeIndex(p.changes);
    const a1 = index.entities.get('A1');
    expect([...(a1?.fields.keys() ?? [])].sort()).toEqual(['entries.E1', 'entries.E2']);
    expect(a1?.fields.get('entries.E2')?.to).toBeNull();
    expect(index.entities.get('A2')?.whole?.kind).toBe('remove');
    // A2 leaves M1 (removed); A3 leaves M2 (goes to M1, where it appears).
    expect(index.leaving.get('M1')?.map((c) => c.entityId)).toEqual(['A2']);
    expect(index.leaving.get('M2')?.map((c) => c.entityId)).toEqual(['A3']);
    expect(
      index.annotationsOf
        .get('M1')
        ?.map((c) => c.entityId)
        .sort(),
    ).toEqual(['A1', 'A1', 'A2', 'A3']);
    // Project group (layer) enters; specialization and repository have no panel.
    expect(index.entities.has('L1')).toBe(false);
  });

  it('memoized by the proposal: deciding does not redo the index; another proposal does', async () => {
    const { proposal, ids } = richScenario();
    const other = richScenario('P2').proposal;
    const { review } = await openHarness({ proposals: [proposal, other] });
    review.open('P1');
    const index = review.derived.fieldIndex.value;
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    await review.decide({ level: 'item', id: 'M4' }, 'rejected');
    expect(review.derived.fieldIndex.value).toBe(index);
    review.close();
    review.open('P2');
    expect(review.derived.fieldIndex.value).not.toBe(index);
    expect(review.derived.fieldIndex.value.entities.get('M1')?.fields.has('name')).toBe(
      true,
    );
  });

  it('the "preview" without the decisions keeps the rejected creation', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.marking }, 'rejected');
    expect(
      must(review.derived.preview.value).project.markings.some((m) => m.id === 'M5'),
    ).toBe(false);
    const full = must(review.derived.fullPreview.value);
    expect(full.markings.some((m) => m.id === 'M5')).toBe(true);
    // Memoized by the changes: deciding again does not redo it.
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.fullPreview.value).toBe(full);
  });
});

describe('focus request on the marker (Details, phase 9.6)', () => {
  it('holds for the change it names; going to another, closing or leaving the review discards it', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.markRequest.value).toBeNull();

    review.select({ level: 'change', id: ids.name });
    review.requestMark(ids.name);
    const first = must(review.markRequest.value);
    expect(first.changeId).toBe(ids.name);
    // Selecting the same change again (the click that requested it) does not discard the request.
    review.select({ level: 'change', id: ids.name });
    expect(review.markRequest.value).toBe(first);
    // Two consecutive requests for the same change are told apart.
    review.requestMark(ids.name);
    expect(must(review.markRequest.value).seq).toBeGreaterThan(first.seq);

    // Quem cumpre limpa.
    review.clearMarkRequest();
    expect(review.markRequest.value).toBeNull();

    // Going to another change discards what was left pending.
    review.requestMark(ids.name);
    review.select({ level: 'change', id: ids.rect });
    expect(review.markRequest.value).toBeNull();

    // Leaving the review also.
    review.requestMark(ids.rect);
    review.close();
    expect(review.markRequest.value).toBeNull();
  });
});

describe('suggested-note request (reject through the marker, phase 10.1)', () => {
  it('holds for the change it names; clearing, going to another or leaving the review discards it', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.noteRequest.value).toBeNull();

    review.select({ level: 'change', id: ids.name });
    review.requestNote(ids.name);
    const first = must(review.noteRequest.value);
    expect(first.changeId).toBe(ids.name);
    // Selecting the same change again (the click that requested it) does not discard it.
    review.select({ level: 'change', id: ids.name });
    expect(review.noteRequest.value).toBe(first);
    review.requestNote(ids.name);
    expect(must(review.noteRequest.value).seq).toBeGreaterThan(first.seq);

    review.clearNoteRequest();
    expect(review.noteRequest.value).toBeNull();

    review.requestNote(ids.name);
    review.select({ level: 'change', id: ids.rect });
    expect(review.noteRequest.value).toBeNull();

    review.requestNote(ids.rect);
    review.close();
    expect(review.noteRequest.value).toBeNull();
  });
});

describe('decideMany of the review (stage #950, item 6)', () => {
  it('decides several targets in one write and a single Undo gives them back', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const targets = [ids.name, ids.rect].map((id) => ({ level: 'change' as const, id }));
    const result = await review.decideMany(targets, 'rejected');
    expect(result?.ok).toBe(true);
    for (const id of [ids.name, ids.rect]) {
      expect(review.derived.proposal.value?.decisions[id]?.state).toBe('rejected');
    }
    expect(await review.undoLastDecision()).toBe(true);
    for (const id of [ids.name, ids.rect]) {
      expect(review.derived.proposal.value?.decisions[id]).toBeUndefined();
    }
    expect(await review.decideMany([], 'accepted')).toMatchObject({ ok: false });
  });
});

// Item 35 (CR of the canvas and of the store): holding the arrow changes the selection on each key; the
// resume blob is written grouped, at most once per frame, and the closed review writes it right away.
describe('resume: grouped write (item 35)', () => {
  const RESUME_KEY = 'mapping.reviewResume';

  it('10 selection changes write the blob at most once per frame and closing writes the last state', async () => {
    const { proposal } = richScenario();
    const h = await openHarness({ proposals: [proposal], copyId: 'copy-35' });
    h.review.open('P1');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const ids = proposal.changes.map((c) => c.id);
    for (let i = 0; i < 10; i++) {
      h.review.select({ level: 'change', id: ids[i % ids.length] ?? '' });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const count = () =>
      writes.mock.calls.filter(([key]) => String(key).includes(RESUME_KEY)).length;
    expect(count()).toBeLessThanOrEqual(1);

    h.review.select({ level: 'change', id: ids[2] ?? '' });
    h.review.close();
    const stored = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
    expect(stored.resume['copy-35|P1'].selected).toEqual({
      level: 'change',
      id: ids[2],
    });
    writes.mockRestore();
  });
});
