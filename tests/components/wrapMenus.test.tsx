import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createArrow, createMarking, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { selectItems, selectedItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Wrap stage (EV1, decision 3): the "Wrap" entry in the canvas context menu and in the ⋯ of the
// Tree row, with the current selection (or only the row item, if it is outside it).
// pt-BR kept: shared fixture data (names Porta, Maçaneta, Fechadura, image 'frente.jpg' of sampleProject) asserted by tests/

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(cleanup);

/** The sample project plus a note (floating canvas marking) and an arrow. */
function projectWithNote(): Project {
  let p = sampleProject();
  p = createMarking(p, {
    id: 'F1',
    containerId: null,
    name: 'Reminder',
    floating: true,
    rect: { x: 50000, y: 50000, width: 300, height: 200 },
  });
  return createArrow(p, { id: 'S1', from: 'M1', to: 'M4' });
}

const wrapItem = () => screen.queryByRole('menuitem', { name: t('multi.wrap') });
const newMarking = (h: Harness) =>
  h.project().markings.find((m) => !['M1', 'M2', 'M3', 'M4', 'F1'].includes(m.id));
const parentOf = (h: Harness, id: string) =>
  h.project().markings.find((m) => m.id === id)?.parentId;

const containerParent = (h: Harness, id: string) =>
  h.project().containers.find((c) => c.id === id)?.parentId;

function renderMenu(harness: Harness) {
  return render(
    <EditorContext.Provider value={harness.context}>
      <CanvasContextMenu />
    </EditorContext.Provider>,
  );
}

function openCanvasMenu(harness: Harness, kind: 'i' | 'm' | 'arrow', id: string) {
  act(() => {
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind, id } };
  });
}

describe('Wrap in the canvas context menu', () => {
  it('with the target inside a selection of 3, wraps the 3 and selects the new one', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M3' },
      { kind: 'marking', id: 'M4' },
    ]);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M3');
    await userEvent.click(await screen.findByRole('menuitem', { name: t('multi.wrap') }));

    const wrap = newMarking(harness);
    expect(wrap).toBeDefined();
    // M4 is in another container: the new marking is the canvas's and both containers are its children.
    expect(wrap?.containerId).toBeNull();
    for (const id of ['I1', 'I2']) expect(containerParent(harness, id)).toBe(wrap?.id);
    expect(selectedItems(harness.ui)).toEqual([{ kind: 'marking', id: wrap?.id }]);
    expect(harness.ui.canvasMenu.value).toBeNull();
    harness.store.undo();
    expect(newMarking(harness)).toBeUndefined();
  });

  it('over a single item, wraps only it', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [{ kind: 'marking', id: 'M4' }]);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    await userEvent.click(await screen.findByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(parentOf(harness, 'M4')).toBe(wrap?.id);
    expect(parentOf(harness, 'M1')).not.toBe(wrap?.id);
  });

  it('the entry shows the Ctrl+G shortcut', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    const item = await screen.findByRole('menuitem', { name: t('multi.wrap') });
    expect(item.textContent).toContain('Ctrl+G');
    expect(item.getAttribute('aria-keyshortcuts')).toBe('Control+G');
  });

  it('note target: the entry is disabled, with the hint', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'F1');
    const item = (await screen.findByRole('menuitem', {
      name: t('multi.wrap'),
    })) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe(t('multi.wrapBlocked'));
  });

  it('arrow target: no entry', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'arrow', 'S1');
    await screen.findByRole('menu');
    expect(wrapItem()).toBeNull();
  });

  it('read-only: no entry', async () => {
    const harness = createHarness(projectWithNote(), true);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    await screen.findByRole('menu');
    expect(wrapItem()).toBeNull();
  });
});

describe('Wrap in the ⋯ of the Tree row', () => {
  function renderTree(harness: Harness) {
    renderLive(harness, (p) => (
      <MarkingTree project={p} selection={null} onSelect={() => undefined} />
    ));
  }
  const openRow = async (name: string) => {
    await userEvent.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name }) }),
    );
    return screen.getByRole('menu');
  };

  it('item in the selection: wraps the whole selection', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M4' },
    ]);
    renderTree(harness);
    const menu = await openRow('Maçaneta');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    // Different containers: the new one is the canvas's.
    expect(wrap?.containerId).toBeNull();
    for (const id of ['I1', 'I2']) expect(containerParent(harness, id)).toBe(wrap?.id);
    expect(selectedItems(harness.ui)).toEqual([{ kind: 'marking', id: wrap?.id }]);
  });

  it('item outside the selection: wraps only the row item', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M1' },
      { kind: 'marking', id: 'M2' },
    ]);
    renderTree(harness);
    const menu = await openRow('Fechadura');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(parentOf(harness, 'M3')).toBe(wrap?.id);
    expect(parentOf(harness, 'M1')).not.toBe(wrap?.id);
  });

  it('the image (container) can also be wrapped', async () => {
    const harness = createHarness(projectWithNote());
    renderTree(harness);
    const menu = await openRow('images/frente.jpg');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(wrap?.containerId).toBeNull();
    expect(harness.project().containers.find((c) => c.id === 'I2')?.parentId).toBe(
      wrap?.id,
    );
  });

  it('note row: the entry is disabled, with the hint and the shortcut', async () => {
    const harness = createHarness(projectWithNote());
    renderTree(harness);
    const menu = await openRow('Reminder');
    const item = within(menu).getByRole('menuitem', {
      name: t('multi.wrap'),
    }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe(t('multi.wrapBlocked'));
    expect(item.textContent).toContain('Ctrl+G');
  });

  it('read-only: no entry', async () => {
    const harness = createHarness(projectWithNote(), true);
    renderTree(harness);
    const menu = await openRow('Porta');
    expect(within(menu).queryByRole('menuitem', { name: t('multi.wrap') })).toBeNull();
  });
});
