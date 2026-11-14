import type { Signal } from '@preact/signals';
import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../src/i18n';
import { useExternalChanges } from '../../../src/app/useExternalChanges';
import { useReviewSync } from '../../../src/app/useReviewSync';
import { locale } from '../../../src/store/settings';
import { changeOf } from '../../model/proposalFixtures';
import { Breadcrumbs } from '../../../src/ui/Breadcrumbs';
import { LayersWindow } from '../../../src/ui/LayersWindow';
import { Minimap } from '../../../src/ui/Minimap';
import { StatusBar } from '../../../src/ui/StatusBar';
import { firstImport, openReviewHarness, renderInEditor } from './reviewHarness';

// Phase 8.2 (P1, O7 of round 4): the "shown project" contract. In the Proposed view of the
// review, everything that describes the selection and the project on screen (breadcrumbs,
// status bar, Layers, minimap) reads `review.derived.shownProject`, never `store.committed`:
// in a new import, the image, the marking and the layer exist only in the preview. In the
// Current view and outside the review, the committed one.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

// pt-BR kept: shared fixture data (marking 'Formulário' from firstImport) asserted by tests/components
// Read at each use: the language is only set in `beforeEach`.
const nothing = () => t('panel.nothingSelected');

// The path segments: the "…" (BC1) is another breadcrumb button.
const crumbButtons = (root: HTMLElement | Document = document) => [
  ...root.querySelectorAll<HTMLElement>('button.crumb'),
];

async function openProposed() {
  const { base, proposal } = firstImport();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  expect(h.review.view.value).toBe('proposed');
  // The person picks in the Tree the marking that exists only in the proposal.
  act(() => {
    h.ui.selection.value = { kind: 'marking', id: 'M1' };
  });
  // The canvas measured the area of the shown images (the minimap depends on it).
  h.context.view.size.value = { width: 380, height: 700 };
  h.context.view.bounds.value = { x: 0, y: 0, width: 800, height: 600 };
  return h;
}

describe('shown project in the review (shownProject contract)', () => {
  it('the breadcrumbs show Image › Marking of the item that exists only in the proposal; in the Current view, "Nothing selected"', async () => {
    const h = await openProposed();
    const onSelect = vi.fn();
    renderInEditor(h, <Breadcrumbs onSelect={onSelect} />);
    const crumbs = crumbButtons();
    expect(crumbs.map((c) => c.getAttribute('aria-label'))).toEqual([
      t('crumbs.image', { name: 'images/cadastro.webp' }),
      t('crumbs.marking', { name: 'Formulário' }),
    ]);
    expect(screen.queryByText(nothing())).toBeNull();
    crumbs[0]?.click();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'image', id: 'I1' });

    act(() => h.review.setView('current'));
    expect(crumbButtons()).toHaveLength(0);
    expect(screen.getByText(nothing())).toBeTruthy();
  });

  it('the status bar shows the name of the proposed marking; in the Current view, "Nothing selected"', async () => {
    const h = await openProposed();
    renderInEditor(h, <StatusBar />);
    const bar = screen.getByRole('contentinfo');
    expect(within(bar).getByTitle(t('status.selectionLabel', { name: 'Formulário' })));
    act(() => h.review.setView('current'));
    expect(within(bar).getByTitle(t('status.selectionLabel', { name: nothing() })));
  });

  it('Layers lists the layer created by the proposal in the Proposed view, and only the current ones in the Current view', async () => {
    const h = await openProposed();
    renderInEditor(h, <LayersWindow stacked />);
    expect(
      screen
        .getAllByLabelText(t('layer.name'))
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Camada 1', 'Eventos']);
    act(() => h.review.setView('current'));
    expect(
      screen
        .getAllByLabelText(t('layer.name'))
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Camada 1']);
  });

  it('the minimap draws the image that exists only in the proposal; in the Current view, none', async () => {
    const h = await openProposed();
    const { container } = renderInEditor(h, <Minimap />);
    const images = () => container.querySelectorAll('.minimap-image').length;
    expect(screen.getByRole('button', { name: t('minimap.label') })).toBeTruthy();
    expect(images()).toBe(1);
    act(() => h.review.setView('current'));
    expect(images()).toBe(0);
  });

  it('rejecting the creation of the item keeps the selection on it: the breadcrumbs and the status bar keep showing it', async () => {
    const h = await openProposed();
    const marking = changeOf(
      h.review.derived.proposal.value as NonNullable<
        typeof h.review.derived.proposal.value
      >,
      'marking',
      'M1',
    );
    function Wired() {
      useReviewSync();
      useExternalChanges();
      return (
        <>
          <Breadcrumbs onSelect={() => {}} />
          <StatusBar />
        </>
      );
    }
    renderInEditor(h, <Wired />);
    expect(crumbButtons(screen.getByRole('navigation'))).toHaveLength(2);
    await act(async () => {
      await h.review.decide({ level: 'change', id: marking.id }, 'rejected');
    });
    // The item left the "how it would look" (the creation no longer counts), but stays selected.
    expect(h.review.derived.shownProject.value?.markings.some((m) => m.id === 'M1')).toBe(
      false,
    );
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(
      crumbButtons(screen.getByRole('navigation')).map((c) =>
        c.getAttribute('aria-label'),
      ),
    ).toEqual([
      t('crumbs.image', { name: 'images/cadastro.webp' }),
      t('crumbs.marking', { name: 'Formulário' }),
    ]);
    const bar = screen.getByRole('contentinfo');
    expect(within(bar).getByTitle(t('status.selectionLabel', { name: 'Formulário' })));
    // Reloading the file (change outside) does not clear the selection: it validates against the shown project.
    act(() => {
      (h.context.session.reloads as unknown as Signal<number>).value++;
    });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    // In the Current view the creation does not exist: "Nothing selected", as before.
    act(() => h.review.setView('current'));
    expect(screen.getAllByText(nothing())).toHaveLength(2);
  });

  it('outside the review, everything goes back to the committed project', async () => {
    const h = await openProposed();
    renderInEditor(h, <Breadcrumbs onSelect={() => {}} />);
    expect(crumbButtons()).toHaveLength(2);
    act(() => h.review.close());
    // On exit, the selection of an item that existed only in the preview is cleared by
    // `useReviewSync`; here, without the hook, the breadcrumbs simply do not find it in the committed one.
    expect(screen.getByText(nothing())).toBeTruthy();
  });
});
