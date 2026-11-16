import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { locale } from '../../src/store/settings';
import { PageMenu } from '../../src/ui/PageMenu';
import { renderLive } from './harness';
import { setupPages } from './pageUiHarness';

// Page menu of the canvas bar (stage #883, PG2, decision 9).

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function setup() {
  const { harness, ids, session } = await setupPages(['Second']);
  const show = vi.fn();
  renderLive(harness, () => <PageMenu dialogs={{ show } as unknown as EditorDialogs} />);
  return { harness, session, second: ids[0] as string, show };
}

const trigger = (name: string) => screen.getByRole('button', { name: `Page: ${name}` });

describe('PageMenu', () => {
  it('is always visible: the button shows the open page', async () => {
    await setup();
    expect(trigger('Page 1')).toBeTruthy();
  });

  it('is visible with a single page too', async () => {
    const { harness } = await setupPages([]);
    renderLive(harness, () => (
      <PageMenu dialogs={{ show: vi.fn() } as unknown as EditorDialogs} />
    ));
    expect(trigger('Page 1')).toBeTruthy();
  });

  it('lists the pages in order with their root counts and the open one marked', async () => {
    await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    const list = screen.getByRole('listbox', { name: 'Pages' });
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('data-name'))).toEqual(['Page 1', 'Second']);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[1]?.getAttribute('aria-selected')).toBe('false');
    expect(within(options[0] as HTMLElement).getByText('1 item')).toBeTruthy();
    expect(within(options[1] as HTMLElement).getByText('empty')).toBeTruthy();
  });

  it('the count follows the project (plural form)', async () => {
    const { harness, session, second } = await setup();
    const moved = harness.actions.moveRootsToPage(['I1'], second);
    expect(moved.ok).toBe(true);
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    const options = screen.getAllByRole('option');
    expect(within(options[0] as HTMLElement).getByText('empty')).toBeTruthy();
    expect(within(options[1] as HTMLElement).getByText('1 item')).toBeTruthy();
    expect(session.page.rootCounts.value.get(second)).toBe(1);
  });

  it('choosing a row opens the page and closes the list', async () => {
    const { session, second } = await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    await user.click(screen.getByRole('option', { name: /Second/ }));
    expect(session.page.id.value).toBe(second);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger('Second')).toBeTruthy();
  });

  it('New page… opens Manage pages with the create field focused', async () => {
    const { show } = await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    await user.click(screen.getByRole('button', { name: 'New page…' }));
    expect(show).toHaveBeenLastCalledWith({
      kind: 'managePages',
      focus: { kind: 'create' },
    });
  });

  it('Manage pages… opens the dialog', async () => {
    const { show } = await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    await user.click(screen.getByRole('button', { name: 'Manage pages…' }));
    expect(show).toHaveBeenLastCalledWith({ kind: 'managePages' });
  });

  it('Esc closes and returns the focus to the button; arrows move', async () => {
    await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(options[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Manage');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger('Page 1'));
  });

  it('pt-BR texts', async () => {
    locale.value = 'pt-BR';
    await setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Página: Page 1' }));
    expect(screen.getByRole('listbox', { name: 'Páginas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nova página…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerenciar páginas…' })).toBeTruthy();
  });
});
