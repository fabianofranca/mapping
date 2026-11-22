import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { selectThread, startComposing } from '../../src/store/threadUi';
import {
  ConversationStateBadge,
  ConversationWindow,
} from '../../src/ui/comments/ConversationWindow';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { AGENT, message, sampleThread } from '../model/threadFixtures';
import { typeIn } from './composerHelpers';
import { createHarness, type Harness } from './harness';

// Conversation window (stage #1881, CV2, decisions 6 to 11): the only place where a conversation
// is shown and written.

const T0 = '2026-09-01T10:00:00.000Z';
const POINT = { kind: 'point', containerId: null, x: 10, y: 20 } as const;

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

async function setup(threads: readonly Thread[] = []) {
  const harness = createHarness(sampleProject(), false);
  for (const thread of threads) await harness.context.session.threads.create(thread);
  return harness;
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

describe('ConversationWindow', () => {
  it('shows the empty state with no target, in both languages', async () => {
    const harness = await setup();
    renderWindow(harness);
    expect(
      screen.getByText(
        'No conversation open. Choose one in Details, in Comments or on a pin.',
      ),
    ).toBeTruthy();
    cleanup();
    locale.value = 'pt-BR';
    renderWindow(harness);
    expect(screen.getByText(t('conversation.empty'))).toBeTruthy();
    expect(t('conversation.title')).toBe('Conversa');
  });

  it('shows the state badge, the anchor line and the thread', async () => {
    const thread = agentThread('c1', { anchor: { kind: 'marking', id: 'M1' } });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    renderWindow(harness);
    expect(screen.getByText(t('thread.state.awaitingHuman'))).toBeTruthy();
    expect(screen.getByText(/^on /)).toBeTruthy();
    expect(screen.getByText('agent question c1')).toBeTruthy();
    // The badge is in the header only, never repeated inside the thread.
    expect(screen.getAllByText(t('thread.state.awaitingHuman'))).toHaveLength(1);
    expect(screen.getByLabelText(/Reply as/)).toBeTruthy();
  });

  it('shows the new-conversation composer with Cancel, which clears the target', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), { kind: 'marking', id: 'M1' });
    renderWindow(harness);
    expect(screen.getByLabelText(/Comment as/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }));
    expect(harness.ui.conversation.value).toBeNull();
    expect(screen.getByText(t('conversation.empty'))).toBeTruthy();
  });

  it('shows the empty state when the conversation no longer exists', async () => {
    const harness = await setup();
    harness.ui.conversation.value = { kind: 'thread', id: 'gone' };
    renderWindow(harness);
    expect(screen.getByText(t('conversation.empty'))).toBeTruthy();
  });

  it('a conversation without an item (loose point) shows in the window', async () => {
    const thread = agentThread('p1', { anchor: POINT });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    expect(harness.ui.selection.value).toBeNull();
    renderWindow(harness);
    expect(screen.getByText('agent question p1')).toBeTruthy();
    expect(
      screen.getByText(
        t('conversation.anchor', {
          where: t('thread.anchor.point', { where: t('canvas.name') }),
        }),
      ),
    ).toBeTruthy();
  });

  it('writes a loose-point draft, sends and shows the new conversation', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), POINT);
    renderWindow(harness);
    typeIn(screen.getByLabelText(/Comment as/), 'here');
    fireEvent.keyDown(screen.getByLabelText(/Comment as/), {
      key: 'Enter',
      ctrlKey: true,
    });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    await screen.findByText('here');
    expect(harness.ui.conversation.value?.kind).toBe('thread');
  });

  it('without an identity, focuses Fill in Settings on every request', async () => {
    clearIdentity();
    const harness = await setup();
    const onOpenSettings = renderWindow(harness);
    startComposing(harness.ui, harness.project(), POINT);
    const button = await screen.findByRole('button', { name: t('thread.openSettings') });
    await waitFor(() => expect(document.activeElement).toBe(button));
    (document.activeElement as HTMLElement).blur();
    startComposing(harness.ui, harness.project(), POINT);
    await waitFor(() => expect(document.activeElement).toBe(button));
    fireEvent.click(button);
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('keeps the conversation and draft when the selection changes', async () => {
    const thread = agentThread('c1', { anchor: { kind: 'marking', id: 'M1' } });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    renderWindow(harness);
    typeIn(screen.getByLabelText(/Reply as/), 'draft');
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    await waitFor(() => expect(screen.getByText('agent question c1')).toBeTruthy());
    expect(within(document.body).getByLabelText(/Reply as/).textContent).toContain(
      'draft',
    );
  });
});
