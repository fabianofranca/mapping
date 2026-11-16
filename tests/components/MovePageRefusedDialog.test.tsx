import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { MovePageRefusedDialog } from '../../src/ui/MovePageRefusedDialog';
import { renderLive } from './harness';
import { setupPages } from './pageUiHarness';

// Refusal of "Move to page" (stage #883, PG2, decision 11): lists the arrows that would be cut.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const ARROWS = [
  { id: 'AR1', from: 'MN', to: 'MI' },
  { id: 'AR2', from: 'ME', to: 'GONE' },
];

async function setup() {
  const { harness } = await setupPages([]);
  const onClose = vi.fn();
  const onGoToArrow = vi.fn();
  renderLive(harness, () => (
    <MovePageRefusedDialog arrows={ARROWS} onGoToArrow={onGoToArrow} onClose={onClose} />
  ));
  return { onClose, onGoToArrow };
}

describe('MovePageRefusedDialog', () => {
  it('explains the refusal and lists each arrow as "from → to" with the end names', async () => {
    await setup();
    const dialog = screen.getByRole('alertdialog', {
      name: 'The move would cut arrows',
    });
    expect(
      within(dialog).getByText(/An arrow cannot join markings of different pages/),
    ).toBeTruthy();
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Nome → Idade')).toBeTruthy();
    // An end that no longer exists falls back to the neutral text.
    expect(items[1]?.textContent).toContain('E-mail →');
  });

  it('"Go to the arrow" calls the callback with the arrow id and closes', async () => {
    const { onClose, onGoToArrow } = await setup();
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button', { name: 'Go to the arrow' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1] as HTMLElement);
    expect(onGoToArrow).toHaveBeenCalledWith('AR2');
    expect(onClose).toHaveBeenCalled();
  });

  it('Close and Esc close it without navigating', async () => {
    const { onClose, onGoToArrow } = await setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGoToArrow).not.toHaveBeenCalled();
  });
});
