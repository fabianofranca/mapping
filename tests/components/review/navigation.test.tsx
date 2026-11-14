import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAnnotation, updateEntry, type Project } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { PanelWithShortcuts, openReviewHarness, renderInEditor } from './reviewHarness';

// Navigation from the Proposals window (phase 9.6, HANDOFF-REVIEW-DETAILS 6): the selected
// change opens the section, layer and annotation that hide it, scrolls to the field and
// highlights it (`aria-current`); click or Enter on the row move focus to the marker and open
// the popover; the arrows only scroll and highlight, focus stays in the list.
// pt-BR kept: shared fixture data asserted by tests/model (names from sampleProject, e.g. Vidros, tipo)

const scrollIntoView = vi.fn();

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

/** M1 with pair E3 of annotation A2 (layer Vidros) changed. */
function pairScenario(): { base: Project; after: Project } {
  const base = sampleProject();
  return { base, after: updateEntry(base, 'A2', 'E3', { key: 'tipo', value: 'break' }) };
}

describe('navigation to the selected change', () => {
  it('opens the collapsed section, layer and annotation, scrolls to the field and highlights it', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    // The person collapsed everything after reaching the item.
    act(() => {
      h.ui.collapsed.value = new Set(['annotations', 'layer:L2', 'annotation:A2']);
    });
    expect(screen.queryByRole('button', { name: /^tipo · / })).toBeNull();

    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: change.id }));
    const entry = await screen.findByRole('button', { name: /^tipo · .*: changed/ });
    expect(h.ui.collapsed.value.has('annotations')).toBe(false);
    expect(h.ui.collapsed.value.has('layer:L2')).toBe(false);
    expect(h.ui.collapsed.value.has('annotation:A2')).toBe(false);
    expect(entry.getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
    // Selecting neither moves focus nor opens the popover (only click and Enter do).
    expect(document.activeElement).not.toBe(entry);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the summary of the change row carries the full text in the title', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');
    const row = document.querySelector(`[data-row="change:${change.id}"]`) as HTMLElement;
    const text = row.querySelector('.review-row-text') as HTMLElement;
    expect(text.textContent).not.toBe('');
    expect(text.getAttribute('title')).toBe(text.textContent);
  });

  it('the mark column of the Key/Value grid follows the language (pt-BR)', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    // pt-BR kept: locale switching is the object of the test (column header in both languages)
    act(() => {
      locale.value = 'pt-BR';
    });
    const heads = () =>
      [...document.querySelectorAll('[role="columnheader"].visually-hidden')].map(
        (e) => e.textContent,
      );
    // pt-BR kept: locale switching is the object of the test (column header in both languages)
    expect(heads()).toContain('Mudança');
    act(() => {
      locale.value = 'en-US';
    });
    await waitFor(() => expect(heads()).toContain('Change'));
    // pt-BR kept: locale switching is the object of the test (column header in both languages)
    expect(heads()).not.toContain('Mudança');
  });

  it('click or Enter on the list moves focus to the marker and opens the popover', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');

    // The change row in the list (click).
    const row = document.querySelector(`[data-row="change:${change.id}"]`) as HTMLElement;
    fireEvent.click(row);
    const entry = await screen.findByRole('button', { name: /^tipo · .*: changed/ });
    await waitFor(() => expect(document.activeElement).toBe(entry));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(h.review.markRequest.value).toBeNull();
    expect(h.review.selected.value).toEqual({ level: 'change', id: change.id });
  });

  it('with the arrows it only scrolls and highlights: focus stays in the list', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <PanelHost />);
    const user = userEvent.setup();
    const tree = screen.getByRole('tree', { name: 'Proposal levels' });
    tree.focus();
    // Goes down to the name change of M1 (the first change with a field in the panel).
    const name = changeOf(proposal, 'marking', 'M1', 'name');
    for (let i = 0; i < 20 && h.review.selected.value?.id !== name.id; i++) {
      await user.keyboard('{ArrowDown}');
    }
    expect(h.review.selected.value).toEqual({ level: 'change', id: name.id });
    const nameMark = await screen.findByRole('button', { name: /^Name: changed/ });
    expect(nameMark.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(tree);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Enter on the selected change moves focus to the marker and opens the popover.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(nameMark));
    expect(screen.getByRole('dialog', { name: 'Name · changed' })).toBeTruthy();
  });

  it('large item: opens the collapsed layer and what goes past "Show more"', async () => {
    const base = sampleProject();
    let after = base;
    for (let i = 1; i <= 15; i++) {
      after = addAnnotation(after, {
        id: `N${i}`,
        markingId: 'M4',
        layerId: 'L1',
        name: `n${i}`,
      });
    }
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    renderInEditor(h, <PanelHost />);
    // Collapsed layer and only the first 12 headers.
    expect(h.ui.collapsed.value.has('layer:L1')).toBe(true);
    act(() => {
      h.ui.collapsed.value = new Set(
        [...h.ui.collapsed.value].filter((k) => k !== 'layer:L1'),
      );
    });
    expect(document.querySelectorAll('[data-layer="L1"] [data-annotation]')).toHaveLength(
      12,
    );
    expect(
      screen.getByRole('button', { name: 'Show 3 more annotation(s)' }),
    ).toBeTruthy();

    // The 15th (beyond the limit) opens by itself when selected.
    const last = changeOf(proposal, 'annotation', 'N15');
    act(() => h.review.select({ level: 'change', id: last.id }));
    await waitFor(() =>
      expect(document.querySelector('[data-annotation="N15"]')).not.toBeNull(),
    );
    expect(h.ui.collapsed.value.has('annotation:N15')).toBe(false);
    const card = document.querySelector('[data-annotation="N15"]') as HTMLElement;
    expect(
      within(card).getByRole('button', { name: /^Annotation n15 created: new/ }),
    ).toBeTruthy();
  });

  it('N and C walk through the pending ones and open what hides them', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    act(() => {
      h.ui.collapsed.value = new Set(['annotations', 'layer:L2', 'annotation:A2']);
    });
    const user = userEvent.setup();
    await user.keyboard('n');
    const change = proposal.changes[0];
    expect(h.review.selected.value).toEqual({ level: 'change', id: change?.id });
    const entry = await screen.findByRole('button', { name: /^tipo · .*: changed/ });
    expect(entry.getAttribute('aria-current')).toBe('true');
    expect(h.ui.collapsed.value.has('layer:L2')).toBe(false);
  });
});

/** The Proposals window (levels) and the Details, side by side. */
function PanelHost() {
  return (
    <>
      <ReviewLevels />
      <PanelWithShortcuts />
    </>
  );
}
