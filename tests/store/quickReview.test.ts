// @vitest-environment node
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addPerspective,
  appendMessage,
  createMarking,
  createPage,
  openThread,
  prepareRevision,
  renameMarking,
  reviseProposal,
  serializeThread,
  setMarkingRect,
  threadFilePath,
  type Proposal,
  type Thread,
  type ThreadAuthor,
} from '../../src/model';
import {
  createQuickReview,
  dismissQuick,
  showQuickAgain,
} from '../../src/store/quickReview';
import type { ToolWindowId } from '../../src/store/toolWindows';
import { createEditorUi } from '../../src/store/ui';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { diskProposal, openHarness, writeOutside } from './proposalHarness';

// The quick review state (stage #1932, QR1, decisions 1, 3, 4, 5 and 8): which proposal the canvas
// shows as a ghost, why it does not, what blocks Accept, and Reject on this device.

afterEach(() => clearReportedErrors());

const base = sampleProject();
const AGENT: ThreadAuthor = { kind: 'agent', name: 'Claude Code', email: null };
const HUMAN: ThreadAuthor = {
  kind: 'human',
  name: 'Marina Alves',
  email: 'marina@example.com',
};
const T = (n: number) => `2026-11-19T10:0${n}:00.000Z`;

function creation(id = 'P1', markingId = 'M9'): Proposal {
  let after = createMarking(base, {
    id: markingId,
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 50 },
    name: 'Button',
  });
  after = addAnnotation(after, { id: `A-${id}`, markingId, layerId: 'L1' });
  return propose(base, after, { id });
}

/** A conversation whose messages link the given proposals, in order (`null`: a message without one). */
function conversation(links: readonly (string | null)[], id = 'T1'): Thread {
  let thread = openThread({
    id,
    anchor: { kind: 'point', containerId: 'I1', x: 10, y: 10 },
    author: HUMAN,
    text: 'put a button here',
    at: T(0),
    messageId: 'm0',
  });
  links.forEach((proposal, i) => {
    thread = appendMessage(thread, {
      id: `m${i + 1}`,
      author: AGENT,
      at: T(i + 1),
      text: 'here it is',
      proposal,
    });
  });
  return thread;
}

async function open(
  options: {
    proposals?: readonly Proposal[];
    thread?: Thread;
    conversation?: boolean;
  } = {},
) {
  const thread = options.thread ?? conversation(['P1']);
  const h = await openHarness({
    proposals: options.proposals ?? [creation()],
    files: { [threadFilePath(thread.id, false)]: serializeThread(thread) },
  });
  const ui = createEditorUi();
  if (options.conversation !== false)
    ui.conversation.value = { kind: 'thread', id: thread.id };
  const windows = signal<ReadonlySet<ToolWindowId>>(
    new Set<ToolWindowId>(['conversation']),
  );
  const reviewOpen = signal<string | null>(null);
  const quick = createQuickReview({ session: h.session, ui, reviewOpen, windows });
  return { ...h, ui, windows, reviewOpen, quick };
}

describe('QuickReviewState.current: which proposal', () => {
  it('is the view of the proposal the latest message with a proposal links', async () => {
    const { quick, session } = await open();
    const view = quick.current.value;
    expect(view).not.toBeNull();
    expect(view?.proposal.id).toBe('P1');
    expect(view?.threadId).toBe('T1');
    expect(view?.spaceId).toBe('I1');
    expect(view?.created).toEqual(['M9']);
    expect(view?.changed).toEqual([]);
    expect(view?.revised).toBe(0);
    expect(view?.blocked).toBeNull();
    expect(view?.preview.markings.some((m) => m.id === 'M9')).toBe(true);
    expect(session.store.committed.peek()?.markings.some((m) => m.id === 'M9')).toBe(
      false,
    );
  });

  it('takes the latest linked proposal, not an older one, and none when that one is not eligible', async () => {
    const withdrawn = { ...creation('P2', 'M8'), status: 'withdrawn' as const };
    const { quick } = await open({
      proposals: [creation('P1'), withdrawn],
      thread: conversation(['P1', null, 'P2']),
    });
    expect(quick.current.value).toBeNull();
  });

  it('follows the latest linked proposal when a newer one is eligible', async () => {
    const { quick } = await open({
      proposals: [creation('P1'), creation('P2', 'M8')],
      thread: conversation(['P1', 'P2']),
    });
    expect(quick.current.value?.proposal.id).toBe('P2');
    expect(quick.current.value?.created).toEqual(['M8']);
  });

  it('is null without the Conversation window, a thread conversation or a linked proposal', async () => {
    const closed = await open();
    closed.windows.value = new Set<ToolWindowId>();
    expect(closed.quick.current.value).toBeNull();
    closed.windows.value = new Set<ToolWindowId>(['conversation']);
    expect(closed.quick.current.value).not.toBeNull();

    const none = await open({ conversation: false });
    expect(none.quick.current.value).toBeNull();
    none.ui.conversation.value = {
      kind: 'new',
      anchor: { kind: 'point', containerId: 'I1', x: 1, y: 1 },
    };
    expect(none.quick.current.value).toBeNull();

    const unlinked = await open({ thread: conversation([null]) });
    expect(unlinked.quick.current.value).toBeNull();
  });

  it('is null for a proposal that is not eligible (a removal is not a quick review)', async () => {
    const removal = propose(
      base,
      { ...base, markings: base.markings.slice(1) },
      { id: 'P1' },
    );
    const { quick } = await open({ proposals: [removal] });
    expect(quick.current.value).toBeNull();
  });
});

describe('QuickReviewState.current: where it shows (decision 3)', () => {
  it('is off while a review is open, in view mode and in a read-only project', async () => {
    const h = await open();
    expect(h.quick.current.value).not.toBeNull();
    h.reviewOpen.value = 'P1';
    expect(h.quick.current.value).toBeNull();
    h.reviewOpen.value = null;
    h.ui.viewMode.value = true;
    expect(h.quick.current.value).toBeNull();
    h.ui.viewMode.value = false;
    const project = h.session.store.committed.peek();
    if (!project) throw new Error('no project');
    h.session.store.load(project, { readOnly: true });
    expect(h.quick.current.value).toBeNull();
  });

  it('is off in a perspective other than Main', async () => {
    const h = await open();
    h.session.store.apply((p) =>
      addPerspective(p, { id: 'PE1', name: 'Mine', hiddenLayers: [], items: [] }),
    );
    expect(h.session.perspective.open('PE1')).toBe(true);
    expect(h.quick.current.value).toBeNull();
    h.session.perspective.open(null);
    expect(h.quick.current.value).not.toBeNull();
  });

  it('is off when the space is not on the open page', async () => {
    const h = await open();
    const first = h.session.page.id.peek();
    h.session.store.apply((p) => createPage(p, { id: 'PG2', name: 'Two' }));
    expect(h.session.page.open('PG2')).toBe(true);
    expect(h.quick.current.value).toBeNull();
    expect(h.session.page.open(first)).toBe(true);
    expect(h.quick.current.value).not.toBeNull();
  });
});

describe('QuickReviewState.current: preview', () => {
  it('does not recompute with a gesture preview (store.project changes, store.committed does not)', async () => {
    const h = await open();
    const first = h.quick.current.value;
    expect(h.session.store.beginGesture().ok).toBe(true);
    const moved = h.session.store.updateGesture((p) =>
      setMarkingRect(p, 'M2', { x: 1210, y: 1210, width: 400, height: 200 }),
    );
    expect(moved.ok).toBe(true);
    expect(h.session.store.project.peek()).not.toBe(h.session.store.committed.peek());
    const during = h.quick.current.value;
    expect(during?.preview).toBe(first?.preview);
    h.session.store.cancelGesture();
    expect(h.quick.current.value?.preview).toBe(first?.preview);
  });
});

describe('QuickReviewState.current: what blocks Accept (decision 4)', () => {
  const renameProposal = () =>
    propose(base, renameMarking(base, 'M1', 'Porta dianteira'), { id: 'P1' });
  const moveProposal = () =>
    propose(
      base,
      setMarkingRect(base, 'M2', { x: 1210, y: 1210, width: 400, height: 200 }),
      {
        id: 'P1',
      },
    );

  it('a live change in conflict leaves only Review', async () => {
    const h = await open({ proposals: [renameProposal()] });
    expect(h.quick.current.value?.blocked).toBeNull();
    h.session.actions.renameMarking('M1', 'Another name');
    expect(h.quick.current.value?.blocked).toBe('conflict');
  });

  it('Accept does nothing while a conflict or a lock blocks it', async () => {
    const h = await open({ proposals: [renameProposal()] });
    h.session.actions.renameMarking('M1', 'Another name');
    expect(h.quick.current.value?.blocked).toBe('conflict');
    expect(await h.quick.accept()).toBeNull();
    expect(
      h.session.store.committed.peek()?.markings.find((m) => m.id === 'M1')?.name,
    ).toBe('Another name');
    expect((await diskProposal(h.root)).applied).toEqual({});
  });

  it('a change on a locked item leaves only Review', async () => {
    const h = await open({ proposals: [moveProposal()] });
    expect(h.quick.current.value?.blocked).toBeNull();
    h.session.actions.setMarkingLocked('M2', true);
    expect(h.quick.current.value?.blocked).toBe('locked');
  });

  it('a refused Accept shows its reason, and it clears when the proposal or the project changes', async () => {
    const original = renameProposal();
    const h = await open({ proposals: [original] });
    const project = h.session.store.committed.peek();
    if (!project) throw new Error('no project');
    const prep = prepareRevision(project, original, []);
    if (!prep.ok) throw new Error(prep.error.code);
    const revision = reviseProposal(project, original, {
      drop: [],
      at: '2026-11-07T10:00:00.000Z',
      after: renameMarking(prep.proposed, 'M1', 'Porta traseira'),
    });
    if (!revision.ok) throw new Error(revision.error.code);
    writeOutside(h.root, { ...revision.proposal, revision: original.revision + 1 });

    const result = await h.quick.accept();
    expect(result).toMatchObject({ ok: false, error: 'revised' });
    expect(h.quick.accepting.value).toBe(false);
    expect(h.quick.current.value?.blocked).toBe('revised');
    expect(h.quick.current.value?.revised).toBeGreaterThan(0);

    // The project changes: the refusal is gone.
    h.session.actions.renameMarking('M3', 'Fechadura 2');
    expect(h.quick.current.value?.blocked).toBeNull();
  });
});

describe('QuickReviewState.accept', () => {
  it('hides the ghost while it runs and applies everything', async () => {
    const h = await open();
    expect(h.quick.current.value).not.toBeNull();
    const running = h.quick.accept();
    expect(h.quick.accepting.value).toBe(true);
    expect(h.quick.current.value).toBeNull();
    const result = await running;
    expect(result).toMatchObject({ ok: true });
    expect(h.quick.accepting.value).toBe(false);
    expect(h.session.store.committed.peek()?.markings.some((m) => m.id === 'M9')).toBe(
      true,
    );
    // The proposal is applied: no ghost.
    expect(h.quick.current.value).toBeNull();
  });

  it('after Ctrl+Z the ghost comes back as before the click', async () => {
    const h = await open();
    const before = h.quick.current.value;
    expect((await h.quick.accept())?.ok).toBe(true);
    expect(h.session.store.undo()).toBe(true);
    await h.session.proposals.settled();
    const back = h.quick.current.value;
    expect(back?.proposal.id).toBe('P1');
    expect(back?.proposal.status).toBe('open');
    expect(back?.proposal.decisions).toEqual({});
    expect(back?.created).toEqual(before?.created);
    expect(back?.blocked).toBeNull();
  });
});

describe('Reject on this device (decision 8)', () => {
  it('hides the ghost and writes nothing to proposal.json', async () => {
    const h = await open();
    const diskBefore = await diskProposal(h.root);
    const textBefore = await h.root.read('proposals/P1/proposal.json');
    dismissQuick(h.ui, 'P1', h.quick.current.value?.proposal.revisions?.length ?? 0);
    expect(h.quick.current.value).toBeNull();
    expect(h.ui.quickDismissed.value.get('P1')).toBe(0);
    await h.session.proposals.settled();
    expect(await h.root.read('proposals/P1/proposal.json')).toBe(textBefore);
    expect(await diskProposal(h.root)).toEqual(diskBefore);
  });

  it('Show on the canvas brings it back', async () => {
    const h = await open();
    dismissQuick(h.ui, 'P1', 0);
    expect(h.quick.current.value).toBeNull();
    showQuickAgain(h.ui, 'P1');
    expect(h.ui.quickDismissed.value.has('P1')).toBe(false);
    expect(h.quick.current.value?.proposal.id).toBe('P1');
  });

  it('a new revision of the proposal clears the entry and the ghost comes back, revised', async () => {
    const original = propose(base, renameMarking(base, 'M1', 'Porta dianteira'), {
      id: 'P1',
    });
    const h = await open({ proposals: [original] });
    dismissQuick(h.ui, 'P1', 0);
    expect(h.quick.current.value).toBeNull();

    const project = h.session.store.committed.peek();
    if (!project) throw new Error('no project');
    const prep = prepareRevision(project, original, []);
    if (!prep.ok) throw new Error(prep.error.code);
    const revision = reviseProposal(project, original, {
      drop: [],
      at: '2026-11-07T10:00:00.000Z',
      after: renameMarking(prep.proposed, 'M1', 'Porta traseira'),
    });
    if (!revision.ok) throw new Error(revision.error.code);
    writeOutside(h.root, { ...revision.proposal, revision: original.revision + 1 });
    await h.session.sync();

    const view = h.quick.current.value;
    expect(view?.proposal.revisions?.length).toBe(1);
    expect(view?.revised).toBeGreaterThan(0);
    expect(h.ui.quickDismissed.value.has('P1')).toBe(false);
  });
});
