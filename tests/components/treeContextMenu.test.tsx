import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Finding 6.3 (stage #2024, CL1): right-click on a Tree row opens the app's menu (the canvas
// one, with Move to page ›) instead of the browser's.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup() {
  const harness = createHarness(sampleProject());
  renderLive(harness, (p) => (
    <EditorContext.Provider value={harness.context}>
      <section data-window="tree" tabIndex={-1}>
        <MarkingTree
          project={p}
          selection={harness.ui.selection.value}
          onSelect={(item) => {
            harness.ui.selection.value = item;
          }}
        />
      </section>
      <CanvasContextMenu />
    </EditorContext.Provider>
  ));
  return harness;
}

describe('right-click on a Tree row', () => {
  it('prevents the browser menu, selects the row and opens the app menu', async () => {
    const harness = setup();
    // The container row: a page root, so Move to page › is offered.
    const row = document.querySelector<HTMLElement>('.tree-image') as HTMLElement;
    const notPrevented = fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    expect(notPrevented).toBe(false);
    expect(harness.ui.selection.value).toMatchObject({ kind: 'image', id: 'I1' });
    expect(harness.ui.canvasMenu.value).toMatchObject({
      x: 40,
      y: 60,
      target: { kind: 'i', id: 'I1' },
    });
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    expect(within(menu).getByRole('menuitem', { name: /Move to page/ })).toBeTruthy();
  });

  it('Esc closes the menu and focus returns to the row', async () => {
    setup();
    const row = document.querySelector<HTMLElement>('.tree-image') as HTMLElement;
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    fireEvent.keyDown(menu, { key: 'Escape' });
    await Promise.resolve();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
