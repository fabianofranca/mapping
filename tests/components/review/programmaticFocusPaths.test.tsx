import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../../src/store/toolWindows';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import { IncompleteView } from '../../../src/ui/IncompleteView';
import { ToolStrip } from '../../../src/ui/ToolStrip';
import { ToolWindow } from '../../../src/ui/ToolWindow';
import { closeToolWindow, openToolWindow } from '../../../src/ui/toolWindowLayout';
import { cadastroProject } from '../../model/specFixtures';
import { createHarness, type Harness } from '../harness';

// "Go to annotation" in Incomplete opens Details keeping the focused item as the origin
// (the `goTo` of `EditorWindows`); closing Details returns focus, never to the body.
// pt-BR kept: shared fixture data asserted by tests/model (annotation name Título from cadastroProject)

function Shell() {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  // Same `goTo` as the 'incomplete' case of EditorWindows.
  const goTo = () => {
    openToolWindow('details');
  };
  return (
    <>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas" />
      {windows.map((id) =>
        id === 'incomplete' ? (
          <ToolWindow key={id} id={id}>
            <IncompleteView onGoToAnnotation={goTo} />
          </ToolWindow>
        ) : (
          <ToolWindow key={id} id={id}>
            <button type="button">control {id}</button>
          </ToolWindow>
        ),
      )}
      <ToolStrip side="right" />
    </>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `control ${id}` });
const item = () =>
  screen.getByRole('button', { name: t('incomplete.go', { name: 'Título' }) });

function mount(harness: Harness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <Shell />
    </EditorContext.Provider>,
  );
}

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(cleanup);

describe('goTo of Incomplete returns focus on closing Details', () => {
  it('go to the annotation, focus in Details and close → the Incomplete item', async () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('incomplete');
    mount(harness);
    const button = item();
    button.focus();
    button.click();
    await settle();
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(document.activeElement).toBe(button);
  });

  it('with the item out of the DOM (remounted list) → strip button, never the body', async () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('incomplete');
    mount(harness);
    const button = item();
    button.focus();
    button.click();
    await settle();
    cleanup();
    mount(harness);
    expect(button.isConnected).toBe(false);
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(stripButton('details'));
  });
});
