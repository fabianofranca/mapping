import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Stage #950, items 4 and 5 (#961, #962): the review tree only handles keys when focus is
// in it (on the row buttons, Enter decides), and announces the selected row through
// `aria-activedescendant`, with position and total of the level.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function mount() {
  const { base, proposal } = richScenario();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  renderInEditor(h, <ReviewLevels />);
  return h;
}

describe('review tree: keyboard on the row buttons', () => {
  it('Enter and arrows on a ✓/✕ button do not move the selection or focus', async () => {
    const h = await mount();
    const tree = screen.getByRole('tree');
    const rows = screen.getAllByRole('treeitem');
    const row = rows[1];
    if (!row) throw new Error('fixture');
    act(() => {
      fireEvent.click(row);
    });
    const selected = h.review.selected.value;
    const button = row.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'End' });
    fireEvent.keyDown(button, { key: 'Home' });
    expect(h.review.selected.value).toEqual(selected);
    const enter = fireEvent.keyDown(button, { key: 'Enter' });
    expect(enter).toBe(true); // no preventDefault: the native click happens
    expect(document.activeElement).toBe(button);
    expect(tree.contains(button)).toBe(true);
  });
});

describe('review tree: aria-activedescendant', () => {
  it('the rows have id, position and total, and the tree points to the selected one', async () => {
    const h = await mount();
    const tree = screen.getByRole('tree');
    const rows = screen.getAllByRole('treeitem');
    for (const r of rows) {
      expect(r.id).toBeTruthy();
      expect(r.getAttribute('aria-setsize')).toBeTruthy();
      expect(r.getAttribute('aria-posinset')).toBeTruthy();
    }
    expect(rows[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(rows[0]?.getAttribute('aria-setsize')).toBe('1');
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    const selectedRow = document.querySelector('[role="treeitem"][aria-selected="true"]');
    expect(selectedRow).toBeTruthy();
    expect(tree.getAttribute('aria-activedescendant')).toBe(selectedRow?.id);
    expect(h.review.selected.value).not.toBeNull();
  });
});
