import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// Palette and anchor (R4, decision 13): with a marking selected, "Add" of a type whose
// component declares `anchor` at the root creates the instance anchored to and touching the selected one,
// instead of inside it or centered; the rest follows today's rule.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const ANCHOR = { side: 'top', align: 'center', offset: { main: 4, cross: 0 } };

/** `m3-button` now declares `anchor` at the root (a usual tooltip). */
async function anchoredHarness(): Promise<LibraryHarness> {
  return libraryHarness({
    mutate: (files) => {
      const path = 'components/m3-button.json';
      const text = files.get(path);
      if (typeof text !== 'string') throw new Error('no m3-button.json');
      files.set(path, JSON.stringify({ ...JSON.parse(text), anchor: ANCHOR }));
    },
  });
}

function renderLibrary(harness: LibraryHarness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <LibraryPalette onOpenSpecs={vi.fn()} />
    </EditorContext.Provider>,
  );
  return userEvent.setup();
}

const addButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', {
    name: new RegExp(`^${t('library.add')}.*: ${name}$`),
  });

/** Puts a FAB (fixed-size leaf) on I1 and returns it. */
function addFab(
  harness: LibraryHarness,
  typeId = 'm3-fab',
  parentId: string | null = null,
) {
  const result = harness.actions.addComponent({
    containerId: 'I1',
    parentId,
    specId: 'material3',
    typeId,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const marking = (harness: LibraryHarness, id: string) =>
  harness.project().markings.find((m) => m.id === id)!;
const last = (harness: LibraryHarness) => harness.project().markings.at(-1)!;

describe('Adding a type with `anchor` at the root', () => {
  it('with a marking selected, it is born anchored to it and touching (above, centered)', async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    harness.ui.selection.value = { kind: 'marking', id: fab };
    const user = renderLibrary(harness);
    const before = harness.project().markings.length;
    await user.click(addButton('Button'));

    const created = last(harness);
    expect(harness.project().markings).toHaveLength(before + 1);
    expect(created.id).not.toBe(fab);
    expect(created.anchor).toMatchObject({ to: fab });
    expect(created.containerId).toBe('I1');
    const target = marking(harness, fab).rect;
    // `anchor.offset.main` 4 (units, density 1): right above the FAB, centered on it.
    expect(created.rect.y + created.rect.height).toBe(target.y - 4);
    expect(created.rect.x).toBe(
      Math.round(target.x + (target.width - created.rect.width) / 2),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created.id });
  });

  it('the button label says what it anchors to; types without `anchor` keep the usual label', async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    harness.actions.renameMarking(fab, 'Action');
    harness.ui.selection.value = { kind: 'marking', id: fab };
    renderLibrary(harness);
    expect(addButton('Button').textContent).toBe(
      t('library.addAnchored', { name: 'Action' }),
    );
    // Without `anchor` at the root, the label is the usual one (the screen of the selected marking).
    expect(addButton('FAB').textContent).toMatch(
      new RegExp(`^${t('library.addToScreen', { name: '' }).trim()}`),
    );
  });

  it('on a marking with a slot the anchor applies instead of going into it', async () => {
    const harness = await anchoredHarness();
    const column = addFab(harness, 'm3-column');
    harness.ui.selection.value = { kind: 'marking', id: column };
    const user = renderLibrary(harness);
    await user.click(addButton('Button'));
    const created = last(harness);
    expect(created.anchor).toMatchObject({ to: column });
    expect(created.parentId).not.toBe(column);
  });

  it("without a selection, with a container selected or on a type without `anchor`, today's rule applies", async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    const user = renderLibrary(harness);

    await user.click(addButton('Button'));
    expect(last(harness).anchor ?? null).toBeNull();

    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    await user.click(addButton('Button'));
    expect(last(harness).anchor ?? null).toBeNull();
    expect(last(harness).containerId).toBe('I1');

    harness.ui.selection.value = { kind: 'marking', id: fab };
    await user.click(addButton('FAB'));
    expect(last(harness).anchor ?? null).toBeNull();
    expect(within(document.body).queryByRole('alert')).toBeNull();
  });
});
