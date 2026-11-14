import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  createMarking,
  createProject,
  type Project,
  type Proposal,
} from '../../../src/model';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { rowDomId } from '../../../src/ui/review/levelRows';
import { AT, propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Stage #954, phase 5 (items 58, 60 and 61): the row measure comes from an item row (not from
// the group header), the shortcuts footer is a named group and the tree scrolls to the
// selected one even when the measure only arrives after the first render.

const ROW = 30;
const GROUP = 50;
const VIEW = 300;
const scrollTops = new WeakMap<Element, number>();

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  // jsdom has no layout: 30 px rows, 50 px group header, 300 px window.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-group')) return GROUP;
    return this.hasAttribute('data-row') ? ROW : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tree' ? VIEW : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return scrollTops.get(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: HTMLElement,
    v: number,
  ) {
    scrollTops.set(this, v);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function manyMarkings(count: number): { base: Project; proposal: Proposal } {
  const base = addContainer(
    createProject({
      name: 'Large',
      now: AT,
      firstLayer: { id: 'L1', name: 'Layer 1', color: '#D32F2F' },
    }),
    { id: 'I1', file: 'images/a.webp', width: 800, height: 600 },
  );
  let after = base;
  for (let i = 0; i < count; i++) {
    after = createMarking(after, {
      id: `M${i}`,
      containerId: 'I1',
      rect: { x: 1, y: 1, width: 10, height: 10 },
      name: `Item ${i}`,
    });
  }
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Large' }) };
}

describe('review tree: virtual window', () => {
  it('58: the row height comes from an item row, not from the group header', async () => {
    const { base, proposal } = manyMarkings(120);
    const old: Proposal = { ...proposal, status: 'superseded' };
    const next = propose(base, base, { id: 'P2', title: 'v2', supersedes: 'P1' });
    const h = await openReviewHarness({ project: base, proposals: [old, next] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    const drawn = tree.querySelectorAll('[data-row]').length;
    const total = 1 + old.changes.length; // one group header + the changes
    expect(drawn).toBeLessThan(total);
    const spacer = tree.lastElementChild as HTMLElement;
    const after = [...tree.children].filter((c) => c.getAttribute('aria-hidden')).at(-1);
    expect((after as HTMLElement).style.height).toBe(`${(total - drawn) * ROW}px`);
    expect(spacer).toBeTruthy();
  });

  it('60: the shortcuts footer is a named group', async () => {
    const { base, proposal } = manyMarkings(2);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    expect(screen.getByRole('group', { name: t('review.shortcuts') })).toBeTruthy();
  });

  it('61: scrolls to the selected one that is beyond the rows of the first render', async () => {
    const { base, proposal } = manyMarkings(100);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const last = proposal.changes.at(-1);
    if (!last) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: last.id }));
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    expect(tree.scrollTop).toBeGreaterThan(0);
    expect(document.getElementById(rowDomId(`change:${last.id}`))).not.toBeNull();
  });

  it('61: expanding or collapsing a group does not make the list jump back', async () => {
    const { base, proposal } = manyMarkings(100);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const last = proposal.changes.at(-1);
    if (!last) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: last.id }));
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    expect(tree.scrollTop).toBeGreaterThan(0);
    // The person scrolls to the top and collapses everything: the list does not go back to the selected one.
    act(() => {
      tree.scrollTop = 0;
    });
    act(() => screen.getByRole('button', { name: t('review.collapseAll') }).click());
    act(() => screen.getByRole('button', { name: t('review.expandAll') }).click());
    expect(tree.scrollTop).toBe(0);
  });

  // #1184 (item 8 of #1530): the selection leaves the virtual window with End/Home/arrows and the
  // `aria-activedescendant` element stays drawn, selected and in the right position.
  it('End, Home and arrow from the end: the activedescendant is a drawn, selected row', async () => {
    const count = 100;
    const { base, proposal } = manyMarkings(count);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    tree.focus();

    // The fixture tree is a chain: proposal > container > marking 0 > [creation of marking
    // 1, marking 1] > ... Each marking k < count - 1 has two children (the change that creates
    // it and marking k + 1); the last one has only the change that creates it. The change of the
    // last marking is the last of the proposal and is at depth count + 3.
    const lastChange = proposal.changes.at(-1);
    if (!lastChange) throw new Error('fixture');
    const lastItemLevel = { posinset: 2, setsize: 2, level: count + 2 }; // marking count - 1
    const lastChangeLevel = { posinset: 1, setsize: 1, level: count + 3 };
    const proposalLevel = { posinset: 1, setsize: 1, level: 1 };

    const press = (key: string): HTMLElement => {
      act(() => {
        tree.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
      });
      const id = tree.getAttribute('aria-activedescendant');
      expect(id, `${key}: aria-activedescendant`).toBeTruthy();
      const row = document.getElementById(id ?? '');
      expect(row, `${key}: the activedescendant row is in the DOM`).not.toBeNull();
      return row as HTMLElement;
    };
    const expectRow = (
      row: HTMLElement,
      id: string,
      at: { posinset: number; setsize: number; level: number },
    ): void => {
      expect(row.id).toBe(id);
      expect(row.getAttribute('aria-selected')).toBe('true');
      expect(row.getAttribute('aria-posinset')).toBe(String(at.posinset));
      expect(row.getAttribute('aria-setsize')).toBe(String(at.setsize));
      expect(row.getAttribute('aria-level')).toBe(String(at.level));
    };

    const end = press('End');
    expectRow(end, rowDomId(`change:${lastChange.id}`), lastChangeLevel);
    expect(tree.scrollTop).toBeGreaterThan(0);

    const up = press('ArrowUp');
    expectRow(up, rowDomId(`item:M${count - 1}`), lastItemLevel);
    expect(tree.scrollTop).toBeGreaterThan(0);

    const home = press('Home');
    expectRow(home, rowDomId('proposal:'), proposalLevel);
    expect(tree.scrollTop).toBe(0);

    expectRow(press('End'), rowDomId(`change:${lastChange.id}`), lastChangeLevel);
  });
});
