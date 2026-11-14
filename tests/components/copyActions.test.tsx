import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRef } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Stage 3a.2: "Copy reference" and "Copy crop" in the menus of the Tree, of the Details and of the
// canvas. They only exist in projects opened from a folder (the harness one is named "projeto").
// pt-BR kept: shared fixture data asserted by tests/model (sampleProject names 'Maçaneta', 'images/frente.jpg' and the harness folder 'projeto')

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'clipboard');
});

/**
 * `userEvent.setup()` installs its own clipboard in `navigator.clipboard`:
 * the mock goes in after it.
 */
function setupClipboard() {
  const user = userEvent.setup();
  const writeText = vi.fn((text: string) => {
    void text;
    return Promise.resolve();
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, write: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
  return { user, writeText };
}

/** Removes the folder name from the storage: the project becomes "outside a folder". */
function makeNotAFolder(harness: Harness) {
  Object.defineProperty(harness.context.session.storage, 'folderName', {
    value: undefined,
    configurable: true,
  });
}

const copied = (writeText: { mock: { calls: string[][] } }, call = 0) =>
  parseRef(writeText.mock.calls[call]?.[0] ?? '');

function renderTree(harness: Harness) {
  return renderLive(harness, (p) => (
    <MarkingTree project={p} selection={null} onSelect={() => undefined} />
  ));
}

describe('Tree row menu', () => {
  it('copies the marking reference', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderTree(harness);

    await user.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: t('copy.crop') })).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toEqual({ project: 'projeto', kind: 'm', code: 'm2' });
    // The menu closes on choosing.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the image only offers the reference (the crop belongs to the marking)', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderTree(harness);

    await user.click(
      screen.getByRole('button', {
        name: t('copy.itemActions', { name: 'images/frente.jpg' }),
      }),
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: t('copy.crop') })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'i', code: 'i2' });
  });

  it('outside a folder, the Tree does not copy: the image only has Wrap and the marking, select and Wrap', async () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderTree(harness);
    // The image does not copy outside a folder, but its ⋯ brings the Wrap (the image is a container).
    await userEvent.click(
      screen.getByRole('button', {
        name: t('copy.itemActions', { name: 'images/frente.jpg' }),
      }),
    );
    const imageMenu = screen.getByRole('menu');
    expect(
      within(imageMenu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([t('cite.insert'), t('comments.comment'), `${t('multi.wrap')}Ctrl+G`]);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    const menu = screen.getByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: t('copy.reference') }),
    ).toBeNull();
    expect(
      within(menu).getByRole('menuitem', { name: t('multi.selectWithContents') }),
    ).toBeTruthy();
  });
});

describe('Details', () => {
  function renderMarking(harness: Harness, id: string) {
    renderLive(harness, (p) => {
      const m = p.markings.find((x) => x.id === id);
      const image = p.containers.find((i) => i.id === m?.containerId);
      if (!m || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={m}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
  }

  it('the marking has copy reference and copy crop next to the ID', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMarking(harness, 'M2');
    expect(screen.getAllByRole('button', { name: t('copy.crop') })).toHaveLength(1);
    // The first one is the marking's; the others belong to its annotations.
    await user.click(screen.getAllByRole('button', { name: t('copy.reference') })[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'm', code: 'm2' });
  });

  it('each annotation card copies its reference', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMarking(harness, 'M1');
    const card = document.querySelector('[data-annotation="A1"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'a', code: 'a1' });
    expect(within(card).queryByRole('button', { name: t('copy.crop') })).toBeNull();
  });

  it('the image only has copy reference', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const image = p.containers[0];
      return image ? (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      ) : null;
    });
    expect(screen.queryByRole('button', { name: t('copy.crop') })).toBeNull();
    await user.click(screen.getByRole('button', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'i', code: 'i1' });
  });

  it('outside a folder, the Details does not offer copy', () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderMarking(harness, 'M2');
    expect(screen.queryByRole('button', { name: t('copy.reference') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('copy.crop') })).toBeNull();
  });
});

describe('canvas context menu', () => {
  function renderMenu(harness: Harness) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
  }

  it('does not appear without `canvasMenu`', () => {
    renderMenu(createHarness(sampleProject()));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with both actions for a marking and copies on choosing', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 40, y: 60, target: { kind: 'm', id: 'M3' } };

    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    expect(within(menu).getByRole('menuitem', { name: t('copy.crop') })).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'm', code: 'm3' });
    expect(harness.ui.canvasMenu.value).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('for an image, only the reference', async () => {
    setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'i', id: 'I1' } };
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: t('copy.crop') })).toBeNull();
    expect(
      within(menu).getByRole('menuitem', { name: t('copy.reference') }),
    ).toBeTruthy();
  });

  it('closes with Esc and with a click outside', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(harness.ui.canvasMenu.value).toBeNull();

    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    await screen.findByRole('menu');
    await user.click(document.body);
    expect(harness.ui.canvasMenu.value).toBeNull();
  });

  it('outside a folder, the image only has "Wrap" (no copy) and the marking "select" and "Wrap"', async () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'i', id: 'I1' } };
    const imageItems = await screen.findAllByRole('menuitem');
    // Citing in the thread also works outside a folder (Comment belongs to the canvas comment menu).
    expect(imageItems.map((i) => i.textContent)).toEqual([
      t('cite.insert'),
      `${t('multi.wrap')}Ctrl+G`,
    ]);
    harness.ui.canvasMenu.value = null;
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      t('cite.insert'),
      t('multi.selectWithContents'),
      // Wrap (EV1): the new menu entry, with the shortcut.
      `${t('multi.wrap')}Ctrl+G`,
    ]);
  });
});
