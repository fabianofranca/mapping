import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { collapseTree, selectItems, selectedItems, treeKey } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { TreeWindow } from '../../src/ui/TreeWindow';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// Tree window (R6): collapsible nodes, layer dots on the row, Locate and
// Collapse all. The project is the sample one: I1 › M1 › M2 › M3 and I2 › M4.
// pt-BR kept: shared fixture data (names Porta, Maçaneta, Fechadura, Lataria, Vidros, image files lateral/frente of sampleProject) asserted by tests/

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

const rowOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('Tree window', () => {
  it('shows the title, the actions and the rows', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: t('panel.treeTitle') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('tree.locate') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('tree.collapseAll') })).toBeTruthy();
    expect(rowOf('Porta')).toBeTruthy();
    expect(rowOf('Maçaneta')).toBeTruthy();
  });

  it('choosing a row selects the item', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    withContext(harness, <TreeWindow onSelect={onSelect} />);
    await userEvent.click(rowOf('Porta'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('the node collapses and opens, and hides the children', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: t('tree.collapse', { name: 'Porta' }) }),
    );
    expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull();
    expect(harness.ui.collapsedTree.value.has(treeKey('marking', 'M1'))).toBe(true);
    const toggle = screen.getByRole('button', {
      name: t('tree.expand', { name: 'Porta' }),
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(rowOf('Maçaneta')).toBeTruthy();
  });

  it('Collapse all leaves only the images and does not touch the project', async () => {
    const harness = createHarness(sampleProject());
    const before = harness.project();
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: t('tree.collapseAll') }));
    expect(screen.queryByRole('button', { name: /^Porta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull();
    expect(
      screen.queryAllByRole('button', { name: /lateral|frente/ }).length,
    ).toBeGreaterThan(0);
    // It is UI state: the project and the undo stay as they were.
    expect(harness.project()).toBe(before);
    expect(harness.store.canUndo.value).toBe(false);
  });

  it('Locate opens the ancestors of the selection and moves focus to the row', async () => {
    const harness = createHarness(sampleProject());
    collapseTree(harness.ui, harness.project());
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    // The selection also opens the ancestors by itself; collapsing again isolates the button.
    await waitFor(() => expect(rowOf('Maçaneta')).toBeTruthy());
    collapseTree(harness.ui, harness.project());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull(),
    );
    await userEvent.click(screen.getByRole('button', { name: t('tree.locate') }));
    await waitFor(() => expect(document.activeElement).toBe(rowOf('Maçaneta')));
  });

  it('Locate is disabled without a selection', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('tree.locate') })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('the selected row is marked and aria-current', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(rowOf('Porta').getAttribute('aria-current')).toBe('true');
    expect(rowOf('Porta').closest('.tree-row')?.className).toContain('tree-row-current');
    expect(rowOf('Maçaneta').getAttribute('aria-current')).toBeNull();
  });
});

describe('tree: selection from outside', () => {
  function Tree({ harness }: { readonly harness: Harness }) {
    // Reading the signal here re-renders the tree when the selection changes from outside.
    return (
      <MarkingTree
        project={harness.project()}
        selection={harness.ui.selection.value}
        onSelect={vi.fn()}
      />
    );
  }

  it('selecting a hidden marking opens its ancestors', async () => {
    const harness = createHarness(sampleProject());
    collapseTree(harness.ui, harness.project());
    withContext(harness, <Tree harness={harness} />);
    expect(screen.queryByRole('button', { name: /^Porta/ })).toBeNull();
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    await waitFor(() => expect(rowOf('Maçaneta')).toBeTruthy());
    expect(rowOf('Maçaneta').getAttribute('aria-current')).toBe('true');
    expect(harness.ui.collapsedTree.value.has(treeKey('image', 'I1'))).toBe(false);
    expect(harness.ui.collapsedTree.value.has(treeKey('marking', 'M1'))).toBe(false);
    // The other images stay collapsed.
    expect(harness.ui.collapsedTree.value.has(treeKey('image', 'I2'))).toBe(true);
  });
});

describe('layer dots on the row', () => {
  it('each marking shows the visible layers that reach it', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const dots = (name: string) =>
      [...(rowOf(name).querySelectorAll<HTMLElement>('.tree-dot') ?? [])].map(
        (d) => d.title,
      );
    // A1 (M1/L1) and A2 (M1/L2); A3 (M2/L1).
    expect(dots('Porta')).toEqual(['Layer Lataria', 'Layer Vidros']);
    expect(dots('Maçaneta')).toEqual(['Layer Lataria']);
  });

  it('hiding a layer removes its dot', () => {
    const harness = createHarness(sampleProject());
    harness.ui.hiddenLayers.value = new Set(['L2']);
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const titles = [...rowOf('Porta').querySelectorAll<HTMLElement>('.tree-dot')].map(
      (d) => d.title,
    );
    expect(titles).toEqual(['Layer Lataria']);
  });

  it('the image has no dots', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const image = screen.getAllByRole('button', { name: /lateral/ })[0];
    expect(image?.querySelectorAll('.tree-dot')).toHaveLength(0);
  });
});

describe('Tree: multiple selection', () => {
  it('Shift+click adds and removes items, with the selected rows in view', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    withContext(harness, <TreeWindow onSelect={onSelect} />);
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const user = userEvent.setup();
    await user.keyboard('{Shift>}');
    await user.click(rowOf('Fechadura'));
    await user.click(rowOf('Maçaneta'));
    await user.keyboard('{/Shift}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M1', 'M3', 'M2']);
    expect(
      rowOf('Maçaneta').closest('.tree-row')?.classList.contains('tree-row-current'),
    ).toBe(true);
    expect(
      rowOf('Porta').closest('.tree-row')?.classList.contains('tree-row-selected'),
    ).toBe(true);
    await user.keyboard('{Shift>}');
    await user.click(rowOf('Fechadura'));
    await user.keyboard('{/Shift}');
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M1', 'M2']);
    // Plain click: a single item.
    await user.click(rowOf('Porta'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('Ctrl+click and Cmd+click on the row add and remove like Shift+click', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    withContext(harness, <TreeWindow onSelect={onSelect} />);
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(rowOf('Fechadura'));
    await user.keyboard('{/Control}');
    await user.keyboard('{Meta>}');
    await user.click(rowOf('Maçaneta'));
    await user.keyboard('{/Meta}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M1', 'M3', 'M2']);
    await user.keyboard('{Control>}');
    await user.click(rowOf('Fechadura'));
    await user.keyboard('{/Control}');
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M1', 'M2']);
  });

  it('the row menu has "Select with contents" and closes on choosing', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Porta' }) }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: t('multi.selectWithContents') }),
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M2', 'M3', 'M1']);
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });
});
