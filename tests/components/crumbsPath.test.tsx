import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { sampleProject } from '../model/fixtures';
import { firstImport, openReviewHarness, renderInEditor } from './review/reviewHarness';
import { createHarness } from './harness';
import { EditorContext } from '../../src/ui/EditorContext';
import { render } from '@testing-library/preact';

// BC1 (#1064): the "…" of the collapsed path and the menu of the whole path. With 3 or more
// segments the `Breadcrumbs` always draws the "…" (the CSS hides it on the wide bar); with 2 there is none.
// pt-BR kept: shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta' and the review fixture 'Formulário')

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function openPath(selection: Parameters<typeof select>[1]) {
  const harness = createHarness(sampleProject());
  select(harness, selection);
  const onSelect = vi.fn();
  render(
    <EditorContext.Provider value={harness.context}>
      <Breadcrumbs onSelect={onSelect} />
    </EditorContext.Provider>,
  );
  return { harness, onSelect };
}

function select(
  harness: ReturnType<typeof createHarness>,
  selection: typeof harness.ui.selection.value,
) {
  harness.ui.selection.value = selection;
}

const showFull = () => screen.queryByRole('button', { name: t('crumbs.showFull') });

describe('the "…" of the path', () => {
  it('with 3 or more segments there is the "…" button, with an accessible name', () => {
    openPath({ kind: 'marking', id: 'M2' });
    const more = showFull();
    expect(more).toBeTruthy();
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('with 2 segments (Canvas › Image) there is no "…"', () => {
    openPath({ kind: 'image', id: 'I1' });
    expect(showFull()).toBeNull();
  });

  it('the menu lists from the Canvas to the selection with the full names', async () => {
    openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    const menu = screen.getByRole('menu', { name: t('crumbs.menu') });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      t('canvas.name'),
      'images/lateral.jpg',
      'Porta',
      'Maçaneta',
    ]);
    // The Canvas only labels; the last one is the selection.
    expect((items[0] as HTMLButtonElement).disabled).toBe(true);
    expect(items.map((i) => i.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'location',
    ]);
  });

  it('choosing a level selects its item and closes the menu', async () => {
    const { onSelect } = openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Porta' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Esc closes the menu and the focus returns to the "…"', async () => {
    openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(showFull());
  });

  it('in the review, Proposed, the menu shows the path of the open view', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    renderInEditor(h, <Breadcrumbs onSelect={() => undefined} />);
    await userEvent.click(showFull()!);
    const menu = screen.getByRole('menu', { name: t('crumbs.menu') });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([t('canvas.name'), 'images/cadastro.webp', 'Formulário']);
  });
});
