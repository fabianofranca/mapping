import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { PerspectivePicker } from '../../src/ui/PerspectivePicker';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Perspective selector of the main bar (stage #659, PE3).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

async function setup() {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const shared = session.perspectiveActions.createPerspective({
    name: 'Flow A',
    startFrom: 'empty',
    local: false,
  });
  const mine = session.perspectiveActions.createPerspective({
    name: 'Draft',
    startFrom: 'empty',
    local: true,
  });
  if (!shared.ok || !mine.ok) throw new Error('perspectives not created');
  const show = vi.fn();
  const dialogs = { show } as unknown as EditorDialogs;
  renderLive(harness, () => <PerspectivePicker dialogs={dialogs} />);
  return { harness, session, shared: shared.value, mine: mine.value, show };
}

const trigger = (name: string, who: string) =>
  screen.getByRole('button', { name: `Perspective: ${name}, ${who}` });

function openList(user: ReturnType<typeof userEvent.setup>) {
  return user.click(trigger('Main', 'everything'));
}

describe('PerspectivePicker', () => {
  it('the button shows Main ("everything") by default', async () => {
    await setup();
    expect(trigger('Main', 'everything')).toBeTruthy();
  });

  it('lists Main first, For everyone and Only mine, with the open one marked', async () => {
    const { session } = await setup();
    const user = userEvent.setup();
    await openList(user);
    const list = screen.getByRole('listbox', { name: 'Perspectives' });
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('data-name'))).toEqual([
      'Main',
      'Flow A',
      'Draft',
    ]);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[1]?.getAttribute('aria-selected')).toBe('false');
    expect(
      within(options[2] as HTMLElement).getByText(/only you see it · empty/),
    ).toBeTruthy();
    expect(within(options[1] as HTMLElement).getByText('empty')).toBeTruthy();
    expect(session.perspective.id.value).toBeNull();
  });

  it('choosing a row opens the perspective and closes the list', async () => {
    const { session, shared } = await setup();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole('option', { name: /Flow A/ }));
    expect(session.perspective.id.value).toBe(shared);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger('Flow A', 'for everyone')).toBeTruthy();
  });

  it('the "Only me" button says "only me"', async () => {
    const { session, mine } = await setup();
    session.perspective.open(mine);
    await Promise.resolve();
    expect(
      await screen.findByRole('button', { name: 'Perspective: Draft, only me' }),
    ).toBeTruthy();
  });

  it('New and Manage open the dialogs', async () => {
    const { show } = await setup();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole('button', { name: 'New perspective…' }));
    expect(show).toHaveBeenLastCalledWith({ kind: 'newPerspective' });
    await openList(user);
    await user.click(screen.getByRole('button', { name: 'Manage perspectives…' }));
    expect(show).toHaveBeenLastCalledWith({ kind: 'managePerspectives' });
  });

  it('locked in the review: button disabled', async () => {
    const { session } = await setup();
    session.perspective.setLocked(true);
    await waitFor(() =>
      expect((trigger('Main', 'everything') as HTMLButtonElement).disabled).toBe(true),
    );
    expect(screen.getByText('The review shows Main. Leave it to switch.')).toBeTruthy();
  });

  it('Esc closes and returns the focus to the button; arrows move', async () => {
    await setup();
    const user = userEvent.setup();
    await openList(user);
    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(options[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Manage');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger('Main', 'everything'));
  });
});
