import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor, selectedThreadId } from '../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { anchorLabel } from '../../src/ui/comments/anchorLabel';
import {
  CommentsHeaderActions,
  CommentsWindow,
} from '../../src/ui/comments/CommentsWindow';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, T2, message, sampleThread } from '../model/threadFixtures';
import {
  AWAITING_AGENT_PATHS,
  AWAITING_HUMAN_PATHS,
} from '../../src/utils/threadStateGlyph';
import { simulateModalFocus, restoreModalFocus } from './modalFocus';
import { createHarness, renderLive, type Harness } from './harness';

// Comments window (Comments stage, CM3): table, filters, count, New thread, delete
// (one and in bulk), read-only review.

const OTHER = { kind: 'human', name: 'Paulo Reis', email: 'paulo@example.com' } as const;

// Open, awaiting the human (the last one is from the agent), by Marina.
const WAITING_HUMAN = sampleThread({
  id: 'ta',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [
    message('a1', T0, HUMAN, 'The button lacks contrast'),
    message('a2', T1, AGENT, 'I adjusted the color'),
  ],
});
// Resolved, only by Marina.
const RESOLVED = sampleThread({
  id: 'tb',
  anchor: { kind: 'container', id: 'I1' },
  // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
  resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T2 },
  messages: [message('b1', T0, HUMAN, 'Title is CORRECT')],
});
// Orphan (the marking does not exist), open, by Paulo; the last one is from a person: it awaits the agent.
const ORPHAN = sampleThread({
  id: 'tc',
  anchor: { kind: 'marking', id: 'MX' },
  messages: [
    // pt-BR kept: accent-insensitive search is the object of the search test
    message('c1', T0, OTHER, 'Ação perdida'),
  ],
});

async function seed(harness: Harness, threads: readonly Thread[]) {
  for (const th of threads) await harness.context.session.threads.create(th);
}

function setup(
  threads: readonly Thread[] = [WAITING_HUMAN, RESOLVED, ORPHAN],
  readOnly = false,
) {
  const harness = createHarness(sampleProject(), readOnly);
  return { harness, ready: seed(harness, threads) };
}

async function mount(
  threads?: readonly Thread[],
  readOnly = false,
): Promise<{ harness: Harness; user: ReturnType<typeof userEvent.setup> }> {
  const { harness, ready } = setup(threads, readOnly);
  await ready;
  renderLive(harness, () => (
    <EditorContext.Provider value={harness.context}>
      <CommentsHeaderActions />
      <CommentsWindow />
    </EditorContext.Provider>
  ));
  return { harness, user: userEvent.setup() };
}

const table = () => screen.getByRole('table', { name: t('comments.table') });
const rowOf = (id: string) =>
  table().querySelector<HTMLElement>(`tr[data-thread="${id}"]`) as HTMLElement;
const ids = () =>
  Array.from(table().querySelectorAll<HTMLElement>('tr[data-thread]')).map(
    (r) => r.dataset.thread,
  );

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
  setIdentity('Marina Alves', 'marina@exemplo.com');
  locale.value = 'en-US';
  hideToolWindow('details');
});
afterEach(() => {
  cleanup();
  restoreModalFocus();
});

// pt-BR kept: the window is checked in both locales
describe.each(['pt-BR', 'en-US'] as const)('Comments window (%s)', (lang) => {
  beforeEach(() => {
    locale.value = lang;
  });

  it('columns, and by default only the open ones', async () => {
    await mount();
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      t('comments.col.by'),
      t('comments.col.anchor'),
      t('comments.col.last'),
      t('comments.col.messages'),
      t('comments.col.status'),
      t('comments.col.when'),
      '',
    ]);
    expect(ids().sort()).toEqual(['ta', 'tc']);
    const row = rowOf('ta');
    expect(within(row).getByText('MA')).toBeTruthy();
    expect(within(row).getByText('Marina Alves')).toBeTruthy();
    expect(within(row).getByText('I adjusted the color')).toBeTruthy();
    expect(within(row).getByText('2')).toBeTruthy();
    expect(within(row).getByText(t('comments.badge.awaitingHuman'))).toBeTruthy();
    expect(within(rowOf('tc')).getByText(t('comments.badge.awaitingAgent'))).toBeTruthy();
  });

  it('the state badge carries the state glyph before the text, hidden from screen readers', async () => {
    await mount();
    const glyphOf = (id: string) => {
      const badge = rowOf(id).querySelector('.comments-badge');
      const svg = badge?.firstElementChild;
      return { badge, svg, d: svg?.querySelector('path')?.getAttribute('d') };
    };
    const human = glyphOf('ta');
    expect(human.svg?.tagName.toLowerCase()).toBe('svg');
    expect(human.svg?.getAttribute('aria-hidden')).toBe('true');
    expect(human.badge?.textContent).toBe(t('comments.badge.awaitingHuman'));
    expect(human.d).toBe(AWAITING_HUMAN_PATHS[0]);
    expect(glyphOf('tc').d).toBe(AWAITING_AGENT_PATHS[0]);
  });

  it('the badge of each state uses the state class (the pin color)', async () => {
    await mount();
    const badgeOf = (id: string) => rowOf(id).querySelector('.comments-badge');
    expect(badgeOf('ta')?.classList.contains('comments-badge-human')).toBe(true);
    expect(badgeOf('tc')?.classList.contains('comments-badge-agent')).toBe(true);
  });

  it('status filter: all, resolved, awaiting agent and human', async () => {
    const { user } = await mount();
    const status = screen.getByLabelText(t('comments.filter.status'));
    await user.selectOptions(status, t('comments.filter.statusAll'));
    expect(ids().sort()).toEqual(['ta', 'tb', 'tc']);
    await user.selectOptions(status, t('comments.filter.statusResolved'));
    expect(ids()).toEqual(['tb']);
    await user.selectOptions(status, t('comments.filter.statusAwaitingAgent'));
    expect(ids()).toEqual(['tc']);
    await user.selectOptions(status, t('comments.filter.statusAwaitingHuman'));
    expect(ids()).toEqual(['ta']);
  });

  it('user filter by the e-mail of the person and by the agent name', async () => {
    const { user, harness } = await mount();
    const select = screen.getByLabelText(t('comments.filter.user'));
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(options[0]).toBe(t('comments.filter.userAll'));
    expect(options[0]).not.toMatch(/\d/);
    // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
    expect(options.some((o) => o?.includes('marina@exemplo.com'))).toBe(true);
    expect(options).toContain(
      t('comments.filter.userAgent', { name: 'Claude Code' }) + ' (1)',
    );
    await user.selectOptions(
      select,
      Array.from(select.querySelectorAll('option')).find((o) =>
        o.textContent?.includes('paulo@example.com'),
      ) as HTMLOptionElement,
    );
    expect(harness.ui.commentsUser.value).toBe('human:paulo@example.com');
    expect(ids()).toEqual(['tc']);
  });

  it('text search ignoring case and accents (pt-BR text)', async () => {
    const { user } = await mount();
    await user.selectOptions(
      screen.getByLabelText(t('comments.filter.status')),
      t('comments.filter.statusAll'),
    );
    // pt-BR kept: accent-insensitive search is the object of this test
    await user.type(screen.getByLabelText(t('comments.filter.text')), 'acao PERDIDA');
    expect(ids()).toEqual(['tc']);
    await user.clear(screen.getByLabelText(t('comments.filter.text')));
    await user.type(screen.getByLabelText(t('comments.filter.text')), 'correct');
    expect(ids()).toEqual(['tb']);
  });

  it('count of open, awaiting agent and resolved', async () => {
    await mount();
    const summary = screen.getByRole('status');
    expect(summary.textContent).toContain(t('comments.count.open', { count: 2 }));
    expect(summary.textContent).toContain(
      t('comments.count.awaitingAgent', { count: 1 }),
    );
    expect(summary.textContent).toContain(t('comments.count.resolvedOne'));
  });

  it('the resolved one has the anchor struck through; the orphan, in warning; the unread one, in bold', async () => {
    const { user, harness } = await mount();
    await user.selectOptions(
      screen.getByLabelText(t('comments.filter.status')),
      t('comments.filter.statusAll'),
    );
    expect(rowOf('tb').dataset.resolved).toBe('');
    expect(rowOf('tc').dataset.orphan).toBe('');
    expect(rowOf('ta').dataset.orphan).toBeUndefined();
    // The last message of `ta` is from the agent and Marina never read it: unread.
    expect(rowOf('ta').dataset.unread).toBe('');
    // The accessible name of the anchor button says there is an unread message (item 47).
    const anchorA = anchorLabel(harness.project(), WAITING_HUMAN.anchor);
    expect(
      within(rowOf('ta')).getByRole('button', {
        name: t('comments.row.openUnread', { anchor: anchorA }),
      }),
    ).toBeTruthy();
    expect(
      // pt-BR kept: the window is checked in both locales
      within(rowOf('tb')).queryByRole('button', { name: /(não lida|unread)/ }),
    ).toBeNull();
    // Marina's resolved thread is read for her.
    expect(rowOf('tb').dataset.unread).toBeUndefined();
    expect(harness.context.derived.threads.unreadIds.value.has('ta')).toBe(true);
    expect(
      within(rowOf('tc')).getByText(anchorLabel(harness.project(), ORPHAN.anchor)),
    ).toBeTruthy();
  });

  it('choosing the row selects the thread and the item, and opens the Details', async () => {
    const { user, harness } = await mount();
    const label = anchorLabel(harness.project(), WAITING_HUMAN.anchor);
    await user.click(
      screen.getByRole('button', {
        name: t('comments.row.openUnread', { anchor: label }),
      }),
    );
    expect(selectedThreadId(harness.ui)).toBe('ta');
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('New thread with a selection: opens the draft anchored to it', async () => {
    const { user, harness } = await mount();
    act(() => {
      harness.ui.selection.value = { kind: 'image', id: 'I1' };
    });
    await user.click(screen.getByRole('button', { name: t('comments.new') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'container', id: 'I1' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('New thread without a selection is disabled, with the hint', async () => {
    await mount();
    const button = screen.getByRole('button', { name: t('comments.new') });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      button.getAttribute('title') ?? button.getAttribute('aria-description') ?? '',
    ).toContain(t('comments.newNoSelection'));
  });

  it('New thread without an identity still opens the draft', async () => {
    const { user, harness } = await mount();
    clearIdentity();
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    await user.click(screen.getByRole('button', { name: t('comments.new') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'marking', id: 'M1' });
  });
});

describe('delete a thread', () => {
  it('directly when all the messages are by the person', async () => {
    const mine = sampleThread({
      id: 'td',
      messages: [message('d1', T0, HUMAN, 'only mine')],
    });
    const { user, harness } = await mount([mine]);
    await user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), mine.anchor),
        }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value).toEqual([]);
  });

  it('with a message from another author, asks for confirmation and lists the authors', async () => {
    const { user, harness } = await mount([WAITING_HUMAN]);
    await user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
        }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Claude Code/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: t('comments.delete.confirm') }),
    );
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value).toEqual([]);
  });

  it('Esc and Cancel return the focus to the row ⋯', async () => {
    simulateModalFocus();
    const { user, harness } = await mount([WAITING_HUMAN]);
    const more = screen.getByRole('button', {
      name: t('comments.row.more', {
        anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
      }),
    });
    for (const close of ['esc', 'cancel'] as const) {
      await user.click(more);
      await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
      const dialog = screen.getByRole('alertdialog');
      if (close === 'esc') {
        act(() => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        });
      } else
        await user.click(
          within(dialog).getByRole('button', { name: t('common.cancel') }),
        );
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(more);
    }
  });

  it('the Delete item is disabled without an identity and with a read-only project', async () => {
    const { user, harness } = await mount([WAITING_HUMAN]);
    clearIdentity();
    const more = () =>
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
        }),
      });
    await user.click(more());
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.row.delete'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    const ro = await mount([WAITING_HUMAN], true);
    // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
    setIdentity('Marina Alves', 'marina@exemplo.com');
    await ro.user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(ro.harness.project(), WAITING_HUMAN.anchor),
        }),
      }),
    );
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.row.delete'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe('delete threads in bulk', () => {
  const OLD_RESOLVED = sampleThread({
    id: 'te',
    // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
    resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    messages: [message('e1', '2026-01-01T10:00:00.000Z', HUMAN, 'old')],
  });
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    await user.click(screen.getByRole('menuitem', { name: t('comments.bulk.open') }));
    return screen.getByRole('alertdialog');
  };

  it('only the resolved ones by default, with count and authors; the date narrows it', async () => {
    const { user, harness } = await mount([
      WAITING_HUMAN,
      RESOLVED,
      OLD_RESOLVED,
      ORPHAN,
    ]);
    const dialog = await openMenu(user);
    const only = within(dialog).getByLabelText(
      t('comments.bulk.onlyResolved'),
    ) as HTMLInputElement;
    expect(only.checked).toBe(true);
    expect(dialog.textContent).toContain(t('comments.bulk.threads', { count: 2 }));
    expect(dialog.textContent).toContain('Marina Alves');
    await user.type(
      within(dialog).getByLabelText(t('comments.bulk.before')),
      '2026-06-01',
    );
    expect(dialog.textContent).toContain(t('comments.bulk.threadsOne'));
    expect(dialog.textContent).toContain('1');
    await user.click(only);
    // Without "only resolved", with the date: everything whose last message is before 2026-06-01.
    expect(dialog.textContent).toContain(t('comments.bulk.threadsOne'));
    await user.click(
      within(dialog).getByRole('button', { name: t('comments.delete.confirm') }),
    );
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value.map((th) => th.id).sort()).toEqual([
      'ta',
      'tb',
      'tc',
    ]);
  });

  it('the date counts as local midnight: the 11:30 pm message of 10/31 falls under "before 11/01"', async () => {
    // Built in the local time zone: in UTC−3 it is 02:30Z on 11/01, after the UTC midnight that
    // `Date.parse` of "2026-11-01" would give (the test only tells the fix apart in a zone west of UTC).
    const late = new Date(2026, 9, 31, 23, 30).toISOString();
    const LATE = sampleThread({
      id: 'tf',
      // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
      messages: [message('f1', late, HUMAN, 'late')],
    });
    const { user } = await mount([LATE]);
    const dialog = await openMenu(user);
    await user.type(
      within(dialog).getByLabelText(t('comments.bulk.before')),
      '2026-11-01',
    );
    expect(dialog.textContent).toContain(t('comments.bulk.threadsOne'));
  });

  it('zero candidates disable Delete', async () => {
    const { user } = await mount([WAITING_HUMAN]);
    const dialog = await openMenu(user);
    expect(dialog.textContent).toContain(t('comments.bulk.none'));
    expect(
      (
        within(dialog).getByRole('button', {
          name: t('comments.delete.confirm'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('Esc and Cancel return the focus to the window ⋯', async () => {
    simulateModalFocus();
    const { user } = await mount([RESOLVED]);
    const more = screen.getByRole('button', { name: t('comments.windowMore') });
    for (const close of ['esc', 'cancel'] as const) {
      const dialog = await openMenu(user);
      if (close === 'esc') {
        act(() => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        });
      } else
        await user.click(
          within(dialog).getByRole('button', { name: t('common.cancel') }),
        );
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(more);
    }
  });

  it('the item is disabled without an identity and with a read-only project', async () => {
    const { user } = await mount([RESOLVED]);
    clearIdentity();
    await user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.bulk.open'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    // pt-BR kept: shared fixture data asserted by tests/model (threadFixtures HUMAN email)
    setIdentity('Marina Alves', 'marina@exemplo.com');
    const ro = await mount([RESOLVED], true);
    await ro.user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.bulk.open'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe('proposal review (decision 26)', () => {
  it('the window is read-only, with the notice, without New thread or Delete', async () => {
    const { harness, user } = await mount([WAITING_HUMAN]);
    act(() => {
      harness.store.setReviewing('R');
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    expect(screen.getByText(t('comments.reviewNotice'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('comments.new') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('comments.windowMore') })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: new RegExp(t('comments.row.more', { anchor: '' })),
      }),
    ).toBeNull();
    expect(ids()).toEqual(['ta']);
    // Choosing the row in review does not change the selection.
    await user.click(rowOf('ta'));
    expect(selectedThreadId(harness.ui)).toBeNull();
  });
});
