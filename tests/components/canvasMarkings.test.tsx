import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { addAnnotation, createMarking, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { collapseTree, revealInTree, treeKey } from '../../src/store/ui';
import { Breadcrumbs, crumbsOf } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { ListView } from '../../src/ui/ListView';
import { IncompleteView } from '../../src/ui/IncompleteView';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// ME1: the canvas marking (null `containerId`) in the Tree, the breadcrumb, the List, the
// Incomplete and the Details. The project is the sample (I1 › M1 › M2 › M3, I2 › M4) with
// the canvas marking "Group" around the two containers and a floating note.
// pt-BR kept: shared fixture data (Porta, Maçaneta, images/frente) asserted by tests/model

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(cleanup);

function canvasProject(): Project {
  let p = sampleProject();
  p = createMarking(p, {
    id: 'C1',
    containerId: null,
    name: 'Group',
    rect: { x: -20000, y: -20000, width: 60000, height: 60000 },
  });
  p = createMarking(p, {
    id: 'F1',
    containerId: null,
    name: 'Note',
    floating: true,
    rect: { x: 50000, y: 50000, width: 300, height: 200 },
  });
  return addAnnotation(p, { id: 'AC', markingId: 'C1', layerId: 'L1' });
}

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

const rowOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('Tree with the Canvas root', () => {
  it('shows the Canvas with the canvas markings and the members inside them', () => {
    const p = canvasProject();
    expect(p.containers.every((c) => c.parentId === 'C1')).toBe(true);
    const harness = createHarness(p);
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    expect(rowOf('Canvas')).toBeTruthy();
    expect(rowOf('Group')).toBeTruthy();
    expect(rowOf('Note')).toBeTruthy();
    // The member containers stay under the Group, with their markings.
    expect(rowOf('Porta')).toBeTruthy();
    const group = rowOf('Group').closest('li');
    expect(group?.querySelector('.tree-image')).toBeTruthy();
    // The floating one has no children: no node to open.
    const note = rowOf('Note').closest('.tree-row');
    expect(note?.querySelector('button.tree-toggle')).toBeNull();
  });

  it('containers without a parent stay at the level of the Canvas root', () => {
    const p = canvasProject();
    const loose = {
      ...p,
      containers: p.containers.map((c) => ({ ...c, parentId: null })),
    };
    const harness = createHarness(loose);
    const { container } = withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    const top = container.querySelectorAll(':scope > ul > li');
    // Canvas + two containers.
    expect(top).toHaveLength(3);
  });

  it('the Canvas root collapses and opens', async () => {
    const harness = createHarness(canvasProject());
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: t('tree.collapse', { name: 'Canvas' }) }),
    );
    expect(screen.queryByRole('button', { name: /^Group/ })).toBeNull();
    expect(harness.ui.collapsedTree.value.has(treeKey('canvas', ''))).toBe(true);
  });

  it('revealInTree opens the whole chain: container marking, container, group and Canvas', () => {
    const harness = createHarness(canvasProject());
    collapseTree(harness.ui, harness.project());
    const collapsed = harness.ui.collapsedTree.value;
    expect(collapsed.has(treeKey('canvas', ''))).toBe(true);
    expect(collapsed.has(treeKey('marking', 'C1'))).toBe(true);
    expect(
      revealInTree(harness.ui, harness.project(), { kind: 'marking', id: 'M2' }),
    ).toBe(true);
    const open = harness.ui.collapsedTree.value;
    for (const key of [
      treeKey('canvas', ''),
      treeKey('marking', 'C1'),
      treeKey('image', 'I1'),
      treeKey('marking', 'M1'),
    ]) {
      expect(open.has(key)).toBe(false);
    }
  });

  it('the container padlock shows the lock inherited from the canvas marking', () => {
    const p = canvasProject();
    const locked = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'C1' ? { ...m, locked: true } : m)),
    };
    const harness = createHarness(locked);
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    const row = rowOf('images/frente').closest('.tree-row');
    expect(row?.querySelector('.tree-lock-inherited')).toBeTruthy();
  });
});

describe('breadcrumb', () => {
  it('container inside a canvas marking: Canvas › group › container', () => {
    const p = canvasProject();
    const crumbs = crumbsOf(p, { kind: 'image', id: 'I1' });
    expect(crumbs.map((c) => c.name)).toEqual(['Canvas', 'Group', expect.any(String)]);
    expect(crumbs[0]?.selection).toBeNull();
  });

  it('container marking: Canvas › group › container › markings', () => {
    const p = canvasProject();
    const names = crumbsOf(p, { kind: 'marking', id: 'M2' }).map((c) => c.name);
    expect(names).toEqual(['Canvas', 'Group', expect.any(String), 'Porta', 'Maçaneta']);
  });

  it('canvas marking: Canvas › marking', async () => {
    const harness = createHarness(canvasProject());
    const onSelect = vi.fn();
    harness.ui.selection.value = { kind: 'marking', id: 'C1' };
    withContext(harness, <Breadcrumbs onSelect={onSelect} />);
    expect(screen.getByLabelText(t('crumbs.canvas'))).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('location');
  });
});

describe('List and Incomplete', () => {
  it('the List has the Canvas group with the canvas marking', () => {
    const harness = createHarness(canvasProject());
    withContext(harness, <ListView onSelect={vi.fn()} />);
    const header = screen.getByRole('columnheader', { name: t('canvas.name') });
    expect(header).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('list.select', { name: 'Group' }) }),
    ).toBeTruthy();
  });

  it('the Incomplete group the canvas pending items under Canvas', () => {
    const harness = createHarness(canvasProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    // The untyped annotation of the sample is a pending item; the canvas one falls in the Canvas group.
    const headers = screen.queryAllByRole('columnheader', { name: t('canvas.name') });
    const incomplete = harness.context.derived.incompleteList.value;
    expect(headers.length).toBe(incomplete.some((g) => g.image === null) ? 1 : 0);
  });
});

describe('Details', () => {
  function renderPanel(markingId: string) {
    const harness = createHarness(canvasProject());
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === markingId);
      if (!marking) return null;
      const image = p.containers.find((i) => i.id === marking.containerId) ?? null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    return { harness, user: userEvent.setup() };
  }

  it('canvas marking: Container: Canvas, "Belongs to" read-only and Floating switch', async () => {
    const { harness, user } = renderPanel('C1');
    expect(screen.getAllByText(t('marking.container')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t('canvas.name')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t('marking.parent')).length).toBeGreaterThan(0);
    // "Belongs to" is no longer an editable field.
    const section = screen.getByRole('region', { name: t('marking.section') });
    expect(within(section).queryByRole('combobox')).toBeNull();
    const floating = screen.getByRole<HTMLInputElement>('checkbox', {
      name: t('marking.floating'),
    });
    expect(floating.checked).toBe(false);
    await user.click(floating);
    await waitFor(() =>
      expect(harness.project().markings.find((m) => m.id === 'C1')?.floating).toBe(true),
    );
  });

  it('the Position and Size hint follows the space: canvas units or container pixels', () => {
    // TX1 (#514): the canvas marking is not in "original image pixels".
    renderPanel('C1');
    const section = screen.getByRole('region', { name: t('marking.section') });
    expect(
      within(section).getAllByText(t('marking.canvasUnitsHint')).length,
    ).toBeGreaterThan(0);
    expect(within(section).queryByText(t('marking.pixelsHint'))).toBeNull();
    expect(t('marking.canvasUnitsHint')).toBe('In canvas units');
  });

  it('container marking: the Position and Size hint speaks of container pixels', () => {
    renderPanel('M2');
    const section = screen.getByRole('region', { name: t('marking.section') });
    expect(within(section).getAllByText(t('marking.pixelsHint')).length).toBeGreaterThan(
      0,
    );
    expect(within(section).queryByText(t('marking.canvasUnitsHint'))).toBeNull();
    expect(t('marking.pixelsHint')).toBe('In container pixels');
  });

  it('container marking: shows the settled parent and also has the switch', () => {
    renderPanel('M2');
    expect(screen.getByText('Porta', { selector: '.props-text' })).toBeTruthy();
    // Any marking can become floating (decision 10).
    expect(screen.getByRole('checkbox', { name: t('marking.floating') })).toBeTruthy();
    // x/y/w/h stay editable.
    expect(screen.getByLabelText('X')).toBeTruthy();
  });

  it('the container shows the canvas marking it belongs to', () => {
    const harness = createHarness(canvasProject());
    renderLive(harness, (p) => (
      <SelectionPanel
        image={p.containers[0] ?? null}
        project={p}
        display={undefined}
        readOnly={false}
        busy={false}
        onReplace={() => undefined}
        onDelete={() => undefined}
      />
    ));
    expect(screen.getAllByText(t('marking.parent')).length).toBeGreaterThan(0);
    expect(screen.getByText('Group', { selector: '.props-text' })).toBeTruthy();
  });
});
