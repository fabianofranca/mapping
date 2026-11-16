import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { PageNotices } from '../../src/ui/PageNotices';
import { PerspectiveNotices } from '../../src/ui/PerspectiveNotices';
import { StatusBar } from '../../src/ui/StatusBar';
import { renderLive } from './harness';
import { setupPages } from './pageUiHarness';

// Status bar "Page <name>" and the page notices (stage #883, PG2, decisions 5, 7, 9, 11, 12).

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function setup() {
  const { harness, ids, session } = await setupPages(['Second']);
  renderLive(harness, () => (
    <>
      <StatusBar />
      <PageNotices />
      <PerspectiveNotices />
    </>
  ));
  return { harness, session, second: ids[0] as string };
}

describe('status bar: page', () => {
  it('says "Page <name>" before the perspective and follows the open page', async () => {
    const { session, second } = await setup();
    const page = screen.getByText('Page Page 1');
    const perspective = screen.getByText('Perspective Full');
    expect(
      page.compareDocumentPosition(perspective) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    act(() => void session.page.open(second));
    expect(await screen.findByText('Page Second')).toBeTruthy();
  });
});

describe('page notices', () => {
  it('"removed" says the page is gone and that the first one is open; clears the signal', async () => {
    const { session } = await setup();
    act(() => {
      session.page.notice.value = { kind: 'removed', name: 'Gone' };
    });
    expect(
      await screen.findByText('The page Gone no longer exists. The first page is open.'),
    ).toBeTruthy();
    expect(session.page.notice.value).toBeNull();
  });

  it('"undone" and "redone" name the page where it happened', async () => {
    const { session } = await setup();
    act(() => {
      session.page.notice.value = { kind: 'undone', name: 'Second' };
    });
    expect(await screen.findByText('Undone on Second')).toBeTruthy();
    act(() => {
      session.page.notice.value = { kind: 'redone', name: 'Second' };
    });
    expect(await screen.findByText('Redone on Second')).toBeTruthy();
    expect(screen.queryByText('Undone on Second')).toBeNull();
  });

  it('"moved" says where and "Open the page" opens it', async () => {
    const { session, second } = await setup();
    act(() => {
      session.page.notice.value = { kind: 'moved', pageId: second, name: 'Second' };
    });
    expect(await screen.findByText('Moved to Second')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open the page' }));
    expect(session.page.id.value).toBe(second);
    expect(screen.queryByText('Moved to Second')).toBeNull();
  });

  it('a notice goes away by itself', async () => {
    vi.useFakeTimers();
    const { session } = await setup();
    act(() => {
      session.page.notice.value = { kind: 'undone', name: 'Second' };
    });
    expect(screen.getByText('Undone on Second')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(20000));
    expect(screen.queryByText('Undone on Second')).toBeNull();
  });

  it('a perspective with nothing on this page says so, and only then', async () => {
    const { harness, session, second } = await setup();
    const made = session.perspectiveActions.createPerspective({
      name: 'Flow A',
      startFrom: 'empty',
      local: false,
    });
    if (!made.ok) throw new Error('perspective not created');
    expect(screen.queryByText('Nothing from this perspective on this page')).toBeNull();
    act(() => void session.perspective.open(made.value));
    expect(
      await screen.findByText('Nothing from this perspective on this page'),
    ).toBeTruthy();
    act(() => void session.perspective.open(null));
    await waitFor(() =>
      expect(screen.queryByText('Nothing from this perspective on this page')).toBeNull(),
    );
    expect(harness.project().pages.some((p) => p.id === second)).toBe(true);
  });

  it('perspective notice "outside" goes out as the short notice', async () => {
    const { harness, session } = await setup();
    act(() => {
      session.perspective.notice.value = { kind: 'outside', name: 'Flow A' };
    });
    await waitFor(() =>
      expect(harness.ui.toast.value).toBe(
        'The perspective Flow A does not show this item. The Full one is open.',
      ),
    );
    expect(session.perspective.notice.value).toBeNull();
  });
});
