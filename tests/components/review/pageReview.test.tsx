import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReviewSync } from '../../../src/app/useReviewSync';
import {
  addContainer,
  createArrow,
  createMarking,
  createPage,
  deletePage,
  movePage,
  moveRootsToPage,
  renameMarking,
  renamePage,
  type Project,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewHeader } from '../../../src/ui/review/ReviewHeader';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { changeOf, propose } from '../../model/proposalFixtures';
import { pagesProject, rectOf } from '../../store/pageHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The Proposals window across pages (stage #883, PG4, decision 16): choosing a change opens its
// page, the rows tell their page, the page entity and the page change read as text, and the invalid
// set of a group that changes page names the `page` changes with the two exits.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function Wired() {
  useReviewSync();
  return null;
}

async function openWith(base: Project, after: Project) {
  const proposal = propose(base, after, { id: 'P1' });
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  return { h, proposal };
}

const rowNames = () =>
  screen.getAllByRole('treeitem').map((row) => row.getAttribute('aria-label') ?? '');

describe('choosing a change on another page opens its page', () => {
  it('a root created on another page opens that page', async () => {
    const base = pagesProject();
    const after = addContainer(base, {
      id: 'I9',
      file: 'images/new.jpg',
      width: 500,
      height: 500,
      pageId: 'PG2',
    });
    const { h, proposal } = await openWith(base, after);
    renderInEditor(h, <Wired />);
    expect(h.session.page.id.value).toBe('PG1');
    const created = changeOf(proposal, 'image', 'I9');
    act(() => h.review.select({ level: 'change', id: created.id }));
    expect(h.session.page.id.value).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I9' });
  });

  it('a page change opens the page where the item is in the view shown', async () => {
    const base = pagesProject();
    const { h, proposal } = await openWith(base, moveRootsToPage(base, ['I1'], 'PG2'));
    renderInEditor(h, <Wired />);
    const move = changeOf(proposal, 'image', 'I1', 'page');
    // Proposed view: the item is on its destination.
    act(() => h.review.select({ level: 'change', id: move.id }));
    expect(h.session.page.id.value).toBe('PG2');
    // Current view: it is still on its origin.
    act(() => h.review.select({ level: 'proposal', id: null }));
    act(() => h.review.setView('current'));
    act(() => h.review.select({ level: 'change', id: move.id }));
    expect(h.session.page.id.value).toBe('PG1');
    expect(h.session.perspective.locked.value).toBe(true);
  });

  it('a change of the page entity does not switch the page', async () => {
    const base = pagesProject();
    const { h, proposal } = await openWith(base, renamePage(base, 'PG3', 'Spare'));
    renderInEditor(h, <Wired />);
    act(() => h.session.page.open('PG2'));
    const rename = changeOf(proposal, 'page', 'PG3', 'name');
    act(() => h.review.select({ level: 'change', id: rename.id }));
    expect(h.session.page.id.value).toBe('PG2');
  });
});

describe('the rows tell their page', () => {
  it('an item change shows its page name; a single-page project stays quiet', async () => {
    const base = pagesProject();
    const after = renameMarking(renameMarking(base, 'M1', 'One'), 'M5', 'Five');
    const { h } = await openWith(base, after);
    renderInEditor(h, <ReviewLevels />);
    const pageLabels = Array.from(document.querySelectorAll('.review-row-page')).map(
      (el) => el.textContent,
    );
    expect(pageLabels.sort()).toEqual(['Page 1', 'Page 2']);
    const five = screen
      .getAllByRole('treeitem')
      .find((row) => within(row).queryByText('Page 2'));
    expect(five?.getAttribute('aria-label')).toContain('Page 2');
  });

  it('the page change row reads "<origin> → <destination>"', async () => {
    const base = pagesProject();
    const { h } = await openWith(base, moveRootsToPage(base, ['I1'], 'PG2'));
    renderInEditor(h, <ReviewLevels />);
    expect(screen.getByText('Page 1 → Page 2')).toBeTruthy();
  });
});

describe('the rows of the page entity read as text', () => {
  async function levels(after: (base: Project) => Project) {
    const base = pagesProject();
    const { h, proposal } = await openWith(base, after(base));
    renderInEditor(h, <ReviewLevels />);
    return { h, proposal };
  }

  it('create', async () => {
    await levels((b) => createPage(b, { id: 'PG4', name: 'Cart' }));
    expect(rowNames()).toContain('Page Cart created');
    expect(screen.getByText('Cart')).toBeTruthy();
  });

  it('rename', async () => {
    await levels((b) => renamePage(b, 'PG3', 'Spare'));
    expect(rowNames()).toContain('Name');
    expect(screen.getByText('Page 3 → Spare')).toBeTruthy();
  });

  it('reorder', async () => {
    await levels((b) => movePage(b, 'PG3', 0));
    expect(rowNames()).toContain('Order');
    expect(screen.getByText(/position 3 → position 1/)).toBeTruthy();
  });

  it('remove', async () => {
    await levels((b) => deletePage(b, 'PG3', { discard: true }));
    expect(rowNames()).toContain('Page Page 3 removed');
  });
});

describe('the invalid set of a group that changes page', () => {
  it('names the page changes and offers both exits', async () => {
    let base = createPage(pagesProject(), { id: 'PG4', name: 'Page 4' });
    base = createMarking(base, {
      id: 'A',
      containerId: null,
      rect: rectOf(6000, 100, 300, 300),
    });
    base = createMarking(base, {
      id: 'B',
      containerId: null,
      rect: rectOf(6500, 100, 300, 300),
    });
    base = createArrow(base, { id: 'AR', from: 'A', to: 'B', name: 'Flow' });
    const { h, proposal } = await openWith(
      base,
      moveRootsToPage(base, ['A', 'B'], 'PG4'),
    );
    const a = changeOf(proposal, 'marking', 'A', 'page');
    await h.review.decide({ level: 'change', id: a.id }, 'accepted');
    renderInEditor(h, <ReviewHeader target={{ level: 'proposal', id: null }} />);
    const notice = document.querySelector('.notice-box-error');
    expect(notice).not.toBeNull();
    const box = within(notice as HTMLElement);
    expect(box.getByText(/Flow.*different pages.*page changes/)).toBeTruthy();
    expect(box.getByRole('button', { name: /^Accept: Page/ })).toBeTruthy();
    expect(box.getByRole('button', { name: /^Reject: Page/ })).toBeTruthy();
  });
});
