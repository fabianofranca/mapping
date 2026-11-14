import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { SCHEMA_VERSION } from '../../src/model';
import { locale } from '../../src/store/settings';
import {
  hideToolWindow,
  isToolWindowOpen,
  resetToolWindowSize,
  showToolWindow,
} from '../../src/store/toolWindows';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { LayersWindow } from '../../src/ui/LayersWindow';
import { Minimap } from '../../src/ui/Minimap';
import { StatusBar } from '../../src/ui/StatusBar';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { ZoomField } from '../../src/ui/ZoomField';
import { BUILD_ID } from '../../src/utils/build';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// Structure of the desktop editor (R4): strips, windows, breadcrumbs, status bar,
// minimap and zoom field.
// pt-BR kept: shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta')

const SPACE = { width: 1400, height: 800, otherWidth: 0 };

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
  showToolWindow('layers');
  showToolWindow('details');
  hideToolWindow('list');
  resetToolWindowSize('left', SPACE);
  resetToolWindowSize('right', SPACE);
});

afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

function fakeCanvas(harness: Harness) {
  const canvas = {
    centerSelection: vi.fn(),
    zoomTo: vi.fn(),
    centerOnPoint: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return canvas;
}

describe('strips and windows', () => {
  it('the left strip opens and hides the Tree and the List', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="left" />);
    const user = userEvent.setup();
    const tree = t('panel.treeTitle');
    // The name is fixed (the window title); the state stays only in aria-pressed (NE1).
    const treeButton = () => screen.getByRole('button', { name: tree });
    expect(treeButton().getAttribute('aria-pressed')).toBe('true');
    await user.click(treeButton());
    expect(isToolWindowOpen('tree')).toBe(false);
    expect(treeButton().getAttribute('aria-pressed')).toBe('false');
    await user.click(treeButton());
    expect(isToolWindowOpen('tree')).toBe(true);
    expect(treeButton().getAttribute('aria-pressed')).toBe('true');
    // The left strip also opens the bottom window (List).
    const listButton = screen.getByRole('button', { name: t('list.title') });
    expect(listButton.getAttribute('aria-pressed')).toBe('false');
    await user.click(listButton);
    expect(isToolWindowOpen('list')).toBe(true);
    expect(listButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('the open button stays pressed', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="right" />);
    const button = screen.getByRole('button', {
      name: t('panel.details'),
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  // #497 (AC1): the strip tooltip comes out beside the button; below, it covered the window content.
  it('all strip buttons open the tooltip beside them (placement end)', () => {
    const harness = createHarness(sampleProject());
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolStrip side="right" />
      </>,
    );
    const anchors = document.querySelectorAll('.tool-strip .tooltip-anchor');
    expect(anchors.length).toBeGreaterThan(4);
    for (const anchor of anchors) expect(anchor.className).toContain('tooltip-end');
  });

  it('the window shows the title, the divider and closes from the header', async () => {
    const harness = createHarness(sampleProject());
    withContext(
      harness,
      <ToolWindow id="tree">
        <p>content</p>
      </ToolWindow>,
    );
    const title = t('panel.treeTitle');
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(
      screen.getByRole('separator', { name: t('window.resize', { name: title }) }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: t('window.closeWindow', { name: title }) }),
    );
    expect(isToolWindowOpen('tree')).toBe(false);
  });
});

describe('Layers as a window (B3)', () => {
  it('the left strip also opens and hides the Layers', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="left" />);
    const name = t('layer.title');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name }));
    expect(isToolWindowOpen('layers')).toBe(false);
    // Hiding the Layers does not hide the Tree: they share the left column.
    expect(isToolWindowOpen('tree')).toBe(true);
    await user.click(screen.getByRole('button', { name }));
    expect(isToolWindowOpen('layers')).toBe(true);
    expect(isToolWindowOpen('tree')).toBe(true);
  });

  it('the window brings New layer and Show all in the header and the list in the body', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <LayersWindow stacked />);
    const region = screen.getByRole('region', { name: t('layer.title') });
    const head = region.querySelector<HTMLElement>('.tool-window-head');
    if (!head) throw new Error('no header');
    expect(within(head).getByRole('button', { name: t('layer.add') })).toBeTruthy();
    expect(within(head).getByRole('button', { name: t('layer.showAll') })).toBeTruthy();
    expect(screen.getAllByLabelText(t('layer.name'))).toHaveLength(2);
    expect(screen.getByLabelText(t('layer.displayMode'))).toBeTruthy();

    const before = harness.project().layers.length;
    await userEvent.click(within(head).getByRole('button', { name: t('layer.add') }));
    expect(harness.project().layers).toHaveLength(before + 1);
    // The list follows the project without the editor reopening anything.
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('stacked has the divider with the Tree; alone, it does not', () => {
    const harness = createHarness(sampleProject());
    const { unmount } = withContext(harness, <LayersWindow stacked />);
    const name = t('layer.title');
    const label = t('window.resize', { name });
    // Two dividers: the lateral one (column width) and the horizontal one (height).
    expect(screen.getAllByRole('separator', { name: label })).toHaveLength(2);
    expect(
      screen
        .getAllByRole('separator', { name: label })
        .map((s) => s.getAttribute('aria-orientation'))
        .sort(),
    ).toEqual(['horizontal', 'vertical']);
    unmount();
    withContext(harness, <LayersWindow stacked={false} />);
    expect(screen.getAllByRole('separator', { name: label })).toHaveLength(1);
  });

  it('closes from the header without touching the Tree', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <LayersWindow stacked />);
    await userEvent.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: t('layer.title') }),
      }),
    );
    expect(isToolWindowOpen('layers')).toBe(false);
    expect(isToolWindowOpen('tree')).toBe(true);
  });
});

describe('breadcrumbs', () => {
  it('shows the path and choosing a level selects the item', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    withContext(harness, <Breadcrumbs onSelect={onSelect} />);
    // The "…" (BC1) is not a segment of the path.
    const crumbs = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('crumb'));
    // Image › Porta › Maçaneta: the last one is the selected item.
    expect(crumbs).toHaveLength(3);
    expect(crumbs[2]?.getAttribute('aria-current')).toBe('location');
    await userEvent.click(crumbs[1]!);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('with no selection it says that nothing is selected', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(screen.getByText(t('panel.nothingSelected'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('status bar', () => {
  it('shows saving, destination, selection, cursor, zoom, schema, channel and build', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    harness.context.view.cursor.value = { containerId: 'I1', x: 120, y: 48 };
    harness.context.view.viewport.value = { x: 0, y: 0, scale: 0.5 };
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.saved'))).toBeTruthy();
    expect(screen.getByText(t('status.targetFolder'))).toBeTruthy();
    expect(screen.getByText('Porta')).toBeTruthy();
    expect(screen.getByText('120, 48')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(
      screen.getByText(t('status.schema', { version: SCHEMA_VERSION })),
    ).toBeTruthy();
    expect(screen.getByText(t('status.channelMain'))).toBeTruthy();
    expect(screen.getByText(BUILD_ID)).toBeTruthy();
  });

  it('outside an image the cursor is empty', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.empty'))).toBeTruthy();
  });

  it('read-only appears in place of the saving', () => {
    const harness = createHarness(sampleProject(), true);
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.readOnly'))).toBeTruthy();
    expect(screen.queryByText(t('status.saved'))).toBeNull();
  });
});

describe('zoom and minimap', () => {
  it('the zoom field shows the percentage and goes back to 100%', async () => {
    const harness = createHarness(sampleProject());
    const canvas = fakeCanvas(harness);
    harness.context.view.viewport.value = { x: 0, y: 0, scale: 0.42 };
    withContext(harness, <ZoomField />);
    await userEvent.click(
      screen.getByRole('button', { name: t('zoom.reset', { percent: 42 }) }),
    );
    expect(canvas.zoomTo).toHaveBeenCalledWith(1);
  });

  it('the minimap appears with the images and the click moves the view', async () => {
    const harness = createHarness(sampleProject());
    const canvas = fakeCanvas(harness);
    const { view } = harness.context;
    view.bounds.value = { x: 0, y: 0, width: 1000, height: 800 };
    view.size.value = { width: 400, height: 300 };
    view.viewport.value = { x: 0, y: 0, scale: 1 };
    withContext(harness, <Minimap />);
    await userEvent.click(screen.getByRole('button', { name: t('minimap.label') }));
    expect(canvas.centerOnPoint).toHaveBeenCalledOnce();
  });

  it('with no images there is no minimap', () => {
    const harness = createHarness(sampleProject());
    harness.context.view.size.value = { width: 400, height: 300 };
    withContext(harness, <Minimap />);
    expect(screen.queryByRole('button', { name: t('minimap.label') })).toBeNull();
  });
});
