import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanel } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { lastReadAt } from '../../src/store/threadReads';
import { selectThread, startComposing } from '../../src/store/threadUi';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { keyDown, typeIn } from './composerHelpers';
import { createHarness, type Harness } from './harness';

// Threads section of the Details (Comments stage, phase CM3, decision 18).
// pt-BR kept: shared fixture data (Amassado, Lataria, tipo, marina@exemplo.com) asserted by tests/model

// The harness clock (the session's `now`) is 2026-10-02: the sample messages come before it,
// so that the person's reply is the last in the `at` order.
const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-01T11:00:00.000Z';
import { relativeTime } from '../../src/ui/comments/relativeTime';

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

function renderMarking(harness: Harness, onOpenSettings = vi.fn()) {
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
        onOpenSettings={onOpenSettings}
      />
    </EditorContext.Provider>,
  );
  return onOpenSettings;
}

const sectionEl = () => screen.getByRole('region', { name: t('thread.section') });
const composer = () => screen.getByLabelText(/Comment as|Reply as/);

describe('Threads › state A (no thread)', () => {
  it('shows the "Comment as <name>" composer with Send disabled until there is text', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = screen.getByLabelText(t('thread.composeAs', { name: 'Marina Alves' }));
    const send = within(sectionEl()).getByRole<HTMLButtonElement>('button', {
      name: t('thread.send'),
    });
    expect(send.disabled).toBe(true);
    typeIn(field, '   ');
    expect(send.disabled).toBe(true);
    typeIn(field, 'hi');
    expect(send.disabled).toBe(false);
  });

  it('Ctrl+Enter sends, opens the thread and shows it; Enter only breaks the line', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = composer();
    typeIn(field, 'line 1');
    keyDown(field, 'Enter');
    typeIn(field, 'line 2');
    expect(harness.ui.threadDrafts.value.size).toBe(1);
    expect([...harness.ui.threadDrafts.value.values()]).toEqual(['line 1\nline 2']);
    expect(harness.context.session.threads.list.value).toHaveLength(0);
    keyDown(field, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    const thread = harness.context.session.threads.list.value[0]!;
    expect(thread.messages[0]!.text).toBe('line 1\nline 2');
    expect(thread.anchor).toEqual({ kind: 'marking', id: 'M1' });
    // The new thread shows up, selected, with the reply composer and the message in <br/>.
    await screen.findByLabelText(t('thread.replyAs', { name: 'Marina Alves' }));
    expect(sectionEl().querySelectorAll('.markdown br')).toHaveLength(1);
  });

  it('the Send button also sends; a server error stays visible and keeps the text', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = composer();
    typeIn(field, 'note');
    vi.spyOn(harness.context.session.threadActions, 'open').mockResolvedValue({
      ok: false,
      error: 'read-only',
    });
    await userEvent.click(screen.getByRole('button', { name: t('thread.send') }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(t('thread.error.read-only'));
    expect(field.textContent).toBe('note');
  });
});

describe('Threads › state B (awaiting human, opened by the agent)', () => {
  it('shows the thread directly, with badge, name, agent badge and the reply', async () => {
    const harness = await setup([agentThread('t1')]);
    renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText(t('thread.state.awaitingHuman'))).toBeTruthy();
    expect(section.getByText('Claude Code')).toBeTruthy();
    expect(section.getByText(t('thread.agent'))).toBeTruthy();
    expect(section.getByText('agent question t1')).toBeTruthy();
    expect(section.getByRole('button', { name: t('thread.resolve') })).toBeTruthy();
    expect(section.getByRole('button', { name: t('thread.new') })).toBeTruthy();
    expect(section.queryByRole('list', { name: t('thread.list') })).toBeNull();
    const reply = screen.getByLabelText(t('thread.replyAs', { name: 'Marina Alves' }));
    typeIn(reply, 'replying');
    keyDown(reply, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.get('t1')?.messages).toHaveLength(2),
    );
    // After the reply it is the agent's turn.
    await screen.findByText(t('thread.state.awaitingAgent'));
  });

  it('the texts come in English (en-US)', async () => {
    locale.value = 'en-US';
    const harness = await setup([agentThread('t1')]);
    renderMarking(harness);
    expect(screen.getByText('Awaiting human')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
    expect(screen.getByLabelText('Reply as Marina Alves')).toBeTruthy();
  });
});

describe('Threads › resolve and reopen (state C)', () => {
  it('Resolve keeps the thread in view as resolved; Reopen gives it back', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.resolve') }));
    await screen.findByText(t('thread.state.resolved'));
    expect(harness.context.session.threads.get('t1')?.resolved).not.toBeNull();
    // Resolved: no reply composer, with "Resolved by".
    expect(screen.queryByLabelText(/Reply as/)).toBeNull();
    expect(sectionEl().textContent).toContain('Marina Alves');
    await userEvent.click(screen.getByRole('button', { name: t('thread.reopen') }));
    await screen.findByText(t('thread.state.awaitingAgent'));
    expect(harness.context.session.threads.get('t1')?.resolved).toBeNull();
  });

  it('the resolved one only shows when it is the selected one', async () => {
    const resolved = humanThread('r1', {
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    });
    const harness = await setup([resolved]);
    renderMarking(harness);
    // Nothing open: the state A composer, without the resolved thread.
    expect(screen.queryByText('my note r1')).toBeNull();
    composer();
    selectThread(harness.ui, harness.project(), resolved);
    await screen.findByText('my note r1');
    expect(screen.getByText(t('thread.state.resolved'))).toBeTruthy();
    expect(
      screen.getByText(
        t('thread.resolvedBy', { name: 'Marina Alves', date: relativeTime(T1) }),
      ),
    ).toBeTruthy();
  });
});

describe('Threads › state D (no identity)', () => {
  it('swaps the composer for the notice and leads to Settings', async () => {
    clearIdentity();
    const harness = await setup([agentThread('t1')]);
    const onOpenSettings = renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText('agent question t1')).toBeTruthy();
    expect(section.getByText(t('thread.noIdentity'))).toBeTruthy();
    expect(section.queryByLabelText(/Reply as/)).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.new') })).toBeNull();
    await userEvent.click(
      section.getByRole('button', { name: t('thread.openSettings') }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('Threads › list and New', () => {
  it('the list only shows with more than one open; choosing a row shows the thread', async () => {
    const harness = await setup([agentThread('t1'), humanThread('t2')]);
    renderMarking(harness);
    const list = within(sectionEl()).getByRole('list', { name: t('thread.list') });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('agent question t1')).toBeTruthy();
    expect(within(list).getAllByText(t('thread.messagesOne'))).toHaveLength(2);
    // None chosen: only the list.
    expect(sectionEl().querySelector('.thread-view')).toBeNull();
    await userEvent.click(within(list).getByText('my note t2'));
    await waitFor(() => expect(sectionEl().querySelector('.thread-view')).not.toBeNull());
    expect(within(sectionEl()).getAllByText('my note t2').length).toBeGreaterThan(1);
  });

  it('New opens a composer for a new thread and sending selects it', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.new') }));
    const field = await screen.findByLabelText(
      t('thread.composeAs', { name: 'Marina Alves' }),
    );
    expect(document.activeElement).toBe(field);
    typeIn(field, 'another subject');
    keyDown(field, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(2),
    );
    const list = await screen.findByRole('list', { name: t('thread.list') });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(harness.ui.composing.value).toBeNull();
  });

  it('the draft survives the selection change and comes back', async () => {
    const harness = await setup();
    renderMarking(harness);
    typeIn(composer(), 'draft');
    cleanup();
    renderMarking(harness);
    expect(composer().textContent).toBe('draft');
  });
});

describe('Threads › anchored to parts of the item', () => {
  it('the thread of an annotation shows in the marking section with "on <where>"', async () => {
    const thread = humanThread('p1', { anchor: { kind: 'annotation', id: 'A1' } });
    const harness = await setup([thread]);
    renderMarking(harness);
    expect(
      within(sectionEl()).getByText(t('thread.in', { where: 'Amassado' })),
    ).toBeTruthy();
  });

  it('the thread of a pair shows with "on Annotation › key" in the list', async () => {
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

describe('Threads › read and unread', () => {
  it('opening the thread writes lastReadAt; the unread row is bold', async () => {
    const harness = await setup([agentThread('u1'), agentThread('u2')]);
    renderMarking(harness);
    const rows = () => sectionEl().querySelectorAll('.thread-row');
    expect(rows()).toHaveLength(2);
    expect(sectionEl().querySelectorAll('.thread-row-unread')).toHaveLength(2);
    await userEvent.click(within(sectionEl()).getByText('agent question u1'));
    await waitFor(() => expect(lastReadAt('harness', 'u1')).toBe(T0));
    expect(lastReadAt('harness', 'u2')).toBeNull();
    await waitFor(() =>
      expect(sectionEl().querySelectorAll('.thread-row-unread')).toHaveLength(1),
    );
  });
});

describe('Threads › review and read-only', () => {
  it('in proposal review the section disappears', async () => {
    const harness = await setup([humanThread('t1')]);
    harness.store.setReviewing('R');
    renderMarking(harness);
    expect(screen.queryByRole('region', { name: t('thread.section') })).toBeNull();
  });

  it('read-only: reads the thread, without composer, Resolve, New or Delete', async () => {
    const harness = await setup([humanThread('t1')], true);
    renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText('my note t1')).toBeTruthy();
    expect(section.queryByLabelText(/Reply as/)).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.new') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.menu') })).toBeNull();
  });
});

describe('Threads › Delete menu', () => {
  it('deletes directly the thread that only belongs to the person', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.menu') }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('thread.delete') }),
    );
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(0),
    );
  });
});

describe('Threads › other panels', () => {
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

describe('Threads › no item (EditorPanel)', () => {
  const dialogs = () => ({ show: vi.fn() }) as unknown as EditorDialogs;
  const renderPanel = (harness: Harness, d = dialogs()) =>
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorPanel
          busy={false}
          dialogs={d}
          onReplace={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
      </EditorContext.Provider>,
    );

  it('the layer thread opens by itself, in place of the selection panel', async () => {
    const thread = humanThread('c1', { anchor: { kind: 'layer', id: 'L1' } });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    renderPanel(harness);
    expect(
      screen.getByRole('heading', {
        name: t('thread.anchor.layer', { name: 'Lataria' }),
      }),
    ).toBeTruthy();
    expect(screen.getByText('my note c1')).toBeTruthy();
    expect(screen.queryByText(t('panel.nothingSelected'))).toBeNull();
  });

  it('the loose point writes the draft and opens the new thread', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), {
      kind: 'point',
      containerId: null,
      x: 10,
      y: 20,
    });
    renderPanel(harness);
    expect(
      screen.getByRole('heading', {
        name: t('thread.anchor.point', { where: t('canvas.name') }),
      }),
    ).toBeTruthy();
    typeIn(composer(), 'here');
    fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    await screen.findByText('here');
  });

  it('the orphan shows what was deleted and the notice button opens Settings', async () => {
    clearIdentity();
    const orphan = humanThread('o1', { anchor: { kind: 'marking', id: 'GONE' } });
    const harness = await setup([orphan]);
    selectThread(harness.ui, harness.project(), orphan);
    const d = dialogs();
    renderPanel(harness, d);
    expect(
      screen.getByRole('heading', { name: t('thread.anchor.missing.marking') }),
    ).toBeTruthy();
    expect(screen.getByText('my note o1')).toBeTruthy();
    expect(screen.queryByLabelText(/Reply as/)).toBeNull();
  });
});
