import 'fake-indexeddb/auto';
import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { addContainer, createPage } from '../../src/model';
import { PageMenu } from '../../src/ui/PageMenu';
import { propose } from '../model/proposalFixtures';
import { pagesProject } from '../store/pageHarness';
import { renderLive } from './harness';
import { setupPages } from './pageUiHarness';
import { openReviewHarness, renderInEditor } from './review/reviewHarness';

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

  it('follows the language', async () => {
    locale.value = 'pt-BR';
    await setup();
    expect(t('page.picker.list')).not.toBe('Pages');
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: t('page.picker.label', { name: 'Page 1' }) }),
    );
    expect(screen.getByRole('listbox', { name: t('page.picker.list') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('page.picker.new') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('page.picker.manage') })).toBeTruthy();
  });
});

// The Page menu in the review (stage #2177, PF3, decision 14): the pages of the view being shown.
describe('PageMenu in the review', () => {
  async function setupReview() {
    const base = pagesProject();
    let after = createPage(base, { id: 'PGD', name: 'Drafts' });
    after = addContainer(after, {
      id: 'ID',
      file: 'images/draft.png',
      width: 500,
      height: 500,
      pageId: 'PGD',
    });
    const h = await openReviewHarness({
      project: base,
      proposals: [propose(base, after, { id: 'P1' })],
    });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(
      h,
      <PageMenu dialogs={{ show: vi.fn() } as unknown as EditorDialogs} />,
    );
    return h;
  }
  const names = () =>
    screen.getAllByRole('option').map((o) => o.getAttribute('data-name'));

  it('the Proposed view lists the proposal\'s page with the "New in this proposal" tag', async () => {
    const h = await setupReview();
    act(() => h.review.setView('proposed'));
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    expect(names()).toEqual(['Page 1', 'Page 2', 'Page 3', 'Drafts']);
    const drafts = screen.getAllByRole('option')[3] as HTMLElement;
    expect(within(drafts).getByText('New in this proposal')).toBeTruthy();
    expect(within(drafts).getByText('1 item')).toBeTruthy();
    expect(screen.getAllByText('New in this proposal')).toHaveLength(1);
    await user.click(drafts);
    expect(h.session.page.id.value).toBe('PGD');
    expect(trigger('Drafts')).toBeTruthy();
  });

  it('the Current view lists only the committed pages', async () => {
    const h = await setupReview();
    act(() => h.review.setView('current'));
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    expect(names()).toEqual(['Page 1', 'Page 2', 'Page 3']);
    expect(screen.queryByText('New in this proposal')).toBeNull();
  });
});

describe('PageMenu outside the review', () => {
  it('lists only the committed pages, with no tag', async () => {
    await setup();
    const user = userEvent.setup();
    await user.click(trigger('Page 1'));
    expect(screen.queryByText('New in this proposal')).toBeNull();
  });
});
