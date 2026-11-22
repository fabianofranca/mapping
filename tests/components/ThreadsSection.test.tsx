import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanel } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { lastReadAt } from '../../src/store/threadReads';
import {
  composingAnchor,
  selectedThreadId,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import {
  ConversationStateBadge,
  ConversationWindow,
} from '../../src/ui/comments/ConversationWindow';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { keyDown, typeIn } from './composerHelpers';
import { createHarness, type Harness } from './harness';

// Conversations section of the Details (stage #1881, CV2, decision 9): only a list, with New.
// The conversation itself (thread, composer, Resolve, Delete, Settings notice, read state) lives
// in the Conversation window.
// pt-BR kept: shared fixture data (Amassado, Lataria, tipo, marina@exemplo.com) asserted by tests/model

// The harness clock (the session's `now`) is 2026-10-02: the sample messages come before it.
const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-01T11:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  locale.value = 'en-US';
  clearIdentity();
});

const agentThread = (id: string, overrides: Partial<Thread> = {}): Thread =>
  sampleThread({
    id,
    messages: [message(`${id}a`, T0, AGENT, `agent question ${id}`)],
    ...overrides,
  });

const humanThread = (id: string, overrides: Partial<Thread> = {}): Thread =>
  sampleThread({
    id,
    messages: [message(`${id}a`, T0, HUMAN, `my note ${id}`)],
    ...overrides,
  });

async function setup(threads: readonly Thread[] = [], readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  for (const thread of threads) {
    await harness.context.session.threads.create(thread);
  }
  return harness;
}

function renderMarking(harness: Harness) {
  const project = harness.project();
  const marking = project.markings.find((m) => m.id === 'M1')!;
  const image = project.containers.find((c) => c.id === 'I1')!;
  render(
    <EditorContext.Provider value={harness.context}>
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={vi.fn()}
        onGoToAnnotation={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </EditorContext.Provider>,
  );
}

function renderWindow(harness: Harness, onOpenSettings = vi.fn()) {
  render(
    <EditorContext.Provider value={harness.context}>
      <ConversationStateBadge />
      <ConversationWindow onOpenSettings={onOpenSettings} />
    </EditorContext.Provider>,
  );
  return onOpenSettings;
}

const sectionEl = () => screen.getByRole('region', { name: t('thread.section') });
const listEl = () => within(sectionEl()).getByRole('list', { name: t('thread.list') });
const newButton = () =>
  within(sectionEl()).queryByRole('button', { name: t('thread.new') });

describe('Conversations section › list', () => {
  it('shows the empty text and New when the item has no conversation', async () => {
    const harness = await setup();
    renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText(t('thread.sectionEmpty'))).toBeTruthy();
    expect(section.queryByRole('list', { name: t('thread.list') })).toBeNull();
    expect(newButton()).toBeTruthy();
  });

  it('lists the open conversations as rows, never a thread or a composer', async () => {
    const harness = await setup([agentThread('t1'), humanThread('t2')]);
    renderMarking(harness);
    const list = listEl();
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('agent question t1')).toBeTruthy();
    expect(within(list).getByText('my note t2')).toBeTruthy();
    expect(within(list).getAllByText(t('thread.messagesOne'))).toHaveLength(2);
    expect(sectionEl().querySelector('.thread-view')).toBeNull();
    expect(within(sectionEl()).queryByLabelText(/Reply as|Comment as/)).toBeNull();
    expect(
      within(sectionEl()).queryByRole('button', { name: t('thread.resolve') }),
    ).toBeNull();
  });

  it('a row opens the conversation in the window and marks the row as current', async () => {
    const harness = await setup([agentThread('t1'), humanThread('t2')]);
    renderMarking(harness);
    const rows = within(listEl()).getAllByRole('button');
    expect(rows.every((row) => row.getAttribute('aria-current') === 'false')).toBe(true);
    await userEvent.click(within(listEl()).getByText('my note t2'));
    expect(harness.ui.conversation.value).toEqual({ kind: 'thread', id: 't2' });
    expect(selectedThreadId(harness.ui)).toBe('t2');
    await waitFor(() =>
      expect(
        within(listEl())
          .getByText('my note t2')
          .closest('button')
          ?.getAttribute('aria-current'),
      ).toBe('true'),
    );
    expect(
      within(listEl()).getByText('agent question t1').closest('button')?.ariaCurrent,
    ).toBe('false');
    // Still only the list: the thread is not rendered in the section.
    expect(sectionEl().querySelector('.thread-view')).toBeNull();
  });

  it('a resolved conversation only shows in the list when it is the window one', async () => {
    const resolved = humanThread('r1', {
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    });
    const harness = await setup([resolved]);
    renderMarking(harness);
    expect(screen.queryByText('my note r1')).toBeNull();
    expect(screen.getByText(t('thread.sectionEmpty'))).toBeTruthy();
    selectThread(harness.ui, harness.project(), resolved);
    const row = await screen.findByText('my note r1');
    expect(row.closest('button')?.getAttribute('aria-current')).toBe('true');
  });

  it('the unread row is bold', async () => {
    const harness = await setup([agentThread('u1'), agentThread('u2')]);
    renderMarking(harness);
    expect(sectionEl().querySelectorAll('.thread-row')).toHaveLength(2);
    expect(sectionEl().querySelectorAll('.thread-row-unread')).toHaveLength(2);
  });
});

describe('Conversations section › New', () => {
  it('New asks the window for a new conversation anchored at the item', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.new') }));
    expect(harness.ui.conversation.value).toEqual({
      kind: 'new',
      anchor: { kind: 'marking', id: 'M1' },
    });
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'marking', id: 'M1' });
    // The section itself shows no composer.
    expect(within(sectionEl()).queryByLabelText(/Comment as/)).toBeNull();
  });

  it('the draft survives the selection change', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), { kind: 'marking', id: 'M1' });
    renderWindow(harness);
    typeIn(screen.getByLabelText(/Comment as/), 'draft');
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    expect(harness.ui.conversation.value).toEqual({
      kind: 'new',
      anchor: { kind: 'marking', id: 'M1' },
    });
    expect([...harness.ui.threadDrafts.value.values()]).toEqual(['draft']);
    expect(screen.getByLabelText(/Comment as/).textContent).toBe('draft');
  });
});

describe('Conversations section › anchored to parts of the item', () => {
  it('the conversation of an annotation shows in the marking section with "on <where>"', async () => {
    const thread = humanThread('p1', { anchor: { kind: 'annotation', id: 'A1' } });
    const harness = await setup([thread]);
    renderMarking(harness);
    expect(
      within(sectionEl()).getByText(t('thread.in', { where: 'Amassado' })),
    ).toBeTruthy();
  });

  it('the conversation of a pair shows with "on Annotation › key" in the list', async () => {
    const entry = humanThread('p2', {
      anchor: { kind: 'entry', annotationId: 'A1', entryId: 'E1' },
    });
    const harness = await setup([entry, humanThread('p3')]);
    renderMarking(harness);
    expect(
      within(sectionEl()).getByText(t('thread.in', { where: 'Amassado › tipo' })),
    ).toBeTruthy();
  });
});

describe('Conversations section › review and read-only', () => {
  it('in proposal review the section disappears', async () => {
    const harness = await setup([humanThread('t1')]);
    harness.store.setReviewing('R');
    renderMarking(harness);
    expect(screen.queryByRole('region', { name: t('thread.section') })).toBeNull();
  });

  it('read-only: lists the conversations without New', async () => {
    const harness = await setup([humanThread('t1')], true);
    renderMarking(harness);
    expect(within(sectionEl()).getByText('my note t1')).toBeTruthy();
    expect(newButton()).toBeNull();
  });
});

describe('Conversations section › other panels', () => {
  it('the arrow and the container also have the section', async () => {
    const harness = await setup();
    const project = harness.project();
    harness.actions.addArrow('M1', 'M4');
    const arrow = harness.project().arrows[0]!;
    render(
      <EditorContext.Provider value={harness.context}>
        <ArrowPanel
          project={harness.project()}
          arrow={arrow}
          readOnly={false}
          onDelete={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
        <SelectionPanel
          image={project.containers[0]!}
          project={project}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={vi.fn()}
          onDelete={vi.fn()}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getAllByRole('region', { name: t('thread.section') })).toHaveLength(2);
  });
});

describe('Details (EditorPanel) › conversations without an item', () => {
  const dialogs = () => ({ show: vi.fn() }) as unknown as EditorDialogs;
  const renderPanel = (harness: Harness) =>
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorPanel
          busy={false}
          dialogs={dialogs()}
          onReplace={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
      </EditorContext.Provider>,
    );

  it('a layer conversation does not take over Details: it shows only in the window', async () => {
    const thread = humanThread('c1', { anchor: { kind: 'layer', id: 'L1' } });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    renderPanel(harness);
    expect(screen.queryByText('my note c1')).toBeNull();
    expect(
      screen.queryByRole('heading', {
        name: t('thread.anchor.layer', { name: 'Lataria' }),
      }),
    ).toBeNull();
    expect(screen.getByText(t('panel.nothingSelected'))).toBeTruthy();
    cleanup();
    renderWindow(harness);
    expect(screen.getByText('my note c1')).toBeTruthy();
  });

  it('a loose-point draft does not render a composer in Details', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), {
      kind: 'point',
      containerId: null,
      x: 10,
      y: 20,
    });
    renderPanel(harness);
    expect(screen.queryByLabelText(/Comment as/)).toBeNull();
    expect(screen.getByText(t('panel.nothingSelected'))).toBeTruthy();
  });
});

describe('Conversation window › state transitions kept from the old section', () => {
  it('Resolve keeps the conversation in view as resolved; Reopen gives it back', async () => {
    const harness = await setup([humanThread('t1')]);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('t1')!,
    );
    renderWindow(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.resolve') }));
    await screen.findAllByText(t('thread.state.resolved'));
    expect(harness.context.session.threads.get('t1')?.resolved).not.toBeNull();
    expect(screen.getByText('my note t1')).toBeTruthy();
    expect(screen.queryByLabelText(/Reply as/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t('thread.reopen') }));
    await screen.findByText(t('thread.state.awaitingAgent'));
    expect(harness.context.session.threads.get('t1')?.resolved).toBeNull();
  });

  it('the Delete menu deletes directly a conversation that only belongs to the person', async () => {
    const harness = await setup([humanThread('t1')]);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('t1')!,
    );
    renderWindow(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.menu') }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('thread.delete') }),
    );
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(0),
    );
  });

  it('opening the conversation in the window writes lastReadAt', async () => {
    const harness = await setup([agentThread('u1'), agentThread('u2')]);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('u1')!,
    );
    renderWindow(harness);
    await waitFor(() => expect(lastReadAt('harness', 'u1')).toBe(T0));
    expect(lastReadAt('harness', 'u2')).toBeNull();
  });

  it('read-only: reads the conversation without composer, Resolve or menu', async () => {
    const harness = await setup([humanThread('t1')], true);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('t1')!,
    );
    renderWindow(harness);
    expect(screen.getByText('my note t1')).toBeTruthy();
    expect(screen.queryByLabelText(/Reply as|Comment as/)).toBeNull();
    expect(screen.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('thread.menu') })).toBeNull();
  });

  it('with no identity, shows the notice and leads to Settings', async () => {
    clearIdentity();
    const harness = await setup([agentThread('t1')]);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('t1')!,
    );
    const onOpenSettings = renderWindow(harness);
    expect(screen.getByText(t('thread.noIdentity'))).toBeTruthy();
    expect(screen.queryByLabelText(/Reply as/)).toBeNull();
    expect(screen.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t('thread.openSettings') }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('with no identity, a second request on the same anchor focuses the notice button again', async () => {
    clearIdentity();
    const harness = await setup();
    const anchor = { kind: 'marking', id: 'M1' } as const;
    startComposing(harness.ui, harness.project(), anchor);
    renderWindow(harness);
    const button = screen.getByRole('button', { name: t('thread.openSettings') });
    await waitFor(() => expect(document.activeElement).toBe(button));
    const notice = document.getElementById(button.getAttribute('aria-describedby')!);
    expect(notice?.textContent).toBe(t('thread.noIdentity'));
    (document.activeElement as HTMLElement).blur();
    startComposing(harness.ui, harness.project(), anchor);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('with no identity, only showing a conversation, with no request, does not move the focus', async () => {
    clearIdentity();
    const harness = await setup([agentThread('t1')]);
    selectThread(
      harness.ui,
      harness.project(),
      harness.context.session.threads.get('t1')!,
    );
    renderWindow(harness);
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: t('thread.openSettings') }),
    );
  });

  it('Ctrl+Enter in a new draft sends and shows the conversation', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), { kind: 'marking', id: 'M1' });
    renderWindow(harness);
    const field = screen.getByLabelText(/Comment as/);
    typeIn(field, 'line 1');
    keyDown(field, 'Enter');
    typeIn(field, 'line 2');
    keyDown(field, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    expect(harness.context.session.threads.list.value[0]!.messages[0]!.text).toBe(
      'line 1\nline 2',
    );
    await screen.findByLabelText(/Reply as/);
  });
});
