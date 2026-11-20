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

describe('review tree: keys after a mouse click on a row button (#2160)', () => {
  const mouseClick = (el: Element) => {
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.click(el);
  };
  const expandableToggle = () => {
    const toggle = document.querySelector('.review-row-toggle[aria-label]');
    if (!(toggle instanceof HTMLButtonElement))
      throw new Error('fixture: no expandable row');
    return toggle;
  };
  const selectedId = (tree: HTMLElement) => tree.getAttribute('aria-activedescendant');

  it('(a) after a click on the chevron the tree has the focus and the keys move the selection', async () => {
    await mount();
    const tree = screen.getByRole('tree');
    const toggle = expandableToggle();
    toggle.focus();
    act(() => mouseClick(toggle));
    expect(document.activeElement).toBe(tree);
    act(() => mouseClick(expandableToggle())); // expand it again: the tree has several rows
    expect(document.activeElement).toBe(tree);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      const handled = !fireEvent.keyDown(tree, { key });
      expect(handled).toBe(true); // preventDefault: the tree took the key
      expect(tree.getAttribute('aria-activedescendant')).toBeTruthy();
    }
    fireEvent.keyDown(tree, { key: 'Home' });
    const first = selectedId(tree);
    fireEvent.keyDown(tree, { key: 'End' });
    expect(selectedId(tree)).not.toBe(first);
  });

  it('(b) after a mouse click on a ✓ the tree has the focus and the keys move the selection', async () => {
    const h = await mount();
    const tree = screen.getByRole('tree');
    const rows = screen.getAllByRole('treeitem');
    const accept = rows[0]?.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(accept).toBeTruthy();
    act(() => mouseClick(accept));
    expect(document.activeElement).toBe(tree);
    const before = h.review.selected.value;
    fireEvent.keyDown(tree, { key: 'End' });
    expect(h.review.selected.value).not.toEqual(before);
    fireEvent.keyDown(tree, { key: 'Home' });
    expect(selectedId(tree)).toBe(rows[0]?.id);
  });

  it('(c) a keydown on the chevron itself reaches the tree and moves the selection', async () => {
    const h = await mount();
    const toggle = expandableToggle();
    toggle.focus();
    const before = h.review.selected.value;
    fireEvent.keyDown(toggle, { key: 'ArrowDown' });
    expect(h.review.selected.value).not.toEqual(before);
  });

  it('(d) collapsing with the chevron leaves the focus on the tree, never on the body', async () => {
    await mount();
    const tree = screen.getByRole('tree');
    const toggle = expandableToggle();
    act(() => mouseClick(toggle));
    expect(document.activeElement).toBe(tree);
    expect(document.activeElement).not.toBe(document.body);
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
