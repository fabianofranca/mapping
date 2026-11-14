import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { StatusBar } from '../../src/ui/StatusBar';
import { PerspectiveNotices } from '../../src/ui/PerspectiveNotices';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Status bar and perspective notices (stage #659, PE3).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function setup() {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const created = session.perspectiveActions.createPerspective({
    name: 'Flow A',
    startFrom: 'empty',
    local: false,
  });
  if (!created.ok) throw new Error('perspective not created');
  renderLive(harness, () => (
    <>
      <StatusBar />
      <PerspectiveNotices />
    </>
  ));
  return { harness, session, id: created.value };
}

const addArrivals = (h: Awaited<ReturnType<typeof setup>>['harness'], count: number) =>
  act(() => {
    h.store.apply((p) => ({
      ...p,
      arrivals: Array.from({ length: count }, (_, i) => ({
        root: `R${i}`,
        from: 'X',
        fromName: 'Flow A',
      })),
    }));
  });

describe('status bar: perspective', () => {
  it('shows Main and, when another is opened, its name', async () => {
    const { session, id } = await setup();
    expect(screen.getByText('Perspective Main')).toBeTruthy();
    act(() => void session.perspective.open(id));
    expect(await screen.findByText('Perspective Flow A')).toBeTruthy();
  });

  it('on Main with arrivals, counts how many items came', async () => {
    const { harness } = await setup();
    expect(screen.queryByText(/Arrivals/)).toBeNull();
    addArrivals(harness, 1);
    // Short text in the bar (does not truncate at 900 px); the full sentence goes in the title.
    const one = await screen.findByText('Arrivals: 1');
    expect(one.closest('.status-item')?.getAttribute('title')).toBe(
      '1 item came from another perspective',
    );
    addArrivals(harness, 3);
    const many = await screen.findByText('Arrivals: 3');
    expect(many.closest('.status-item')?.getAttribute('title')).toBe(
      '3 items came from other perspectives',
    );
  });

  it('outside Main it does not show the arrivals count', async () => {
    const { harness, session, id } = await setup();
    addArrivals(harness, 2);
    act(() => void session.perspective.open(id));
    await screen.findByText('Perspective Flow A');
    expect(screen.queryByText(/Arrivals/)).toBeNull();
  });
});

describe('forced switch notices', () => {
  it('"removed" shows the text with the name and clears the signal', async () => {
    const { harness, session } = await setup();
    act(() => {
      session.perspective.notice.value = { kind: 'removed', name: 'Flow A' };
    });
    await waitFor(() =>
      expect(harness.ui.toast.value).toBe('The perspective Flow A was deleted.'),
    );
    expect(session.perspective.notice.value).toBeNull();
  });

  it('"review" shows the text and clears the signal', async () => {
    const { harness, session } = await setup();
    act(() => {
      session.perspective.notice.value = { kind: 'review' };
    });
    await waitFor(() => expect(harness.ui.toast.value).toBe('The review shows Main.'));
    expect(session.perspective.notice.value).toBeNull();
  });
});
