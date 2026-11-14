import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { Dialog } from '../../src/ui/Dialog';
import { ActionMenu } from '../../src/ui/ActionMenu';
import { locale } from '../../src/store/settings';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  isToolWindowOpen,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { toolWindowMeta } from '../../src/ui/toolWindowMeta';
import {
  closeToolWindow,
  openToolWindow,
  showAndFocusToolWindow,
} from '../../src/ui/toolWindowLayout';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Focus when closing a tool window (stage #295, FJ1): goes to whoever opened it, otherwise to
// the strip button, otherwise to the canvas; only acts with focus inside the window.

const harness = createHarness(sampleProject());

function Shell() {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  return (
    <EditorContext.Provider value={harness.context}>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas">
        <button type="button">background</button>
      </main>
      {windows.map((id) => (
        <ToolWindow key={id} id={id}>
          <button type="button">control {id}</button>
        </ToolWindow>
      ))}
      <ToolStrip side="right" />
    </EditorContext.Provider>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const active = () => document.activeElement;
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `control ${id}` });

beforeEach(() => {
  locale.value = 'en-US';
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
});

describe('return focus on close', () => {
  it('Tree opened from the strip, focus on the control, X → strip button', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(stripButton('tree') as HTMLElement);
    await user.click(control('tree'));
    await user.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: toolWindowMeta('tree').title() }),
      }),
    );
    await settle();
    expect(active()).toBe(stripButton('tree'));
    // Closed, the strip button reflects it: aria-pressed "false".
    expect(stripButton('tree')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Tree opened by shortcut with focus on the canvas, close → canvas', async () => {
    render(<Shell />);
    const background = screen.getByRole('button', { name: 'background' });
    background.focus();
    showAndFocusToolWindow('tree');
    await settle();
    expect(active()?.getAttribute('data-window')).toBe('tree');
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(background);
  });

  it.each(['details', 'catalog'] as const)(
    '%s closes with the X and goes back to the origin',
    async (id) => {
      render(<Shell />);
      const background = screen.getByRole('button', { name: 'background' });
      background.focus();
      showAndFocusToolWindow(id);
      await settle();
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(background);
    },
  );

  it('focus outside the window on close → does not change', async () => {
    render(<Shell />);
    showToolWindow('tree');
    await settle();
    const background = screen.getByRole('button', { name: 'background' });
    background.focus();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(background);
  });

  it('whoever opened it left the DOM → strip button', async () => {
    render(<Shell />);
    const background = screen.getByRole('button', { name: 'background' });
    background.focus();
    showAndFocusToolWindow('tree');
    await settle();
    background.remove();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(stripButton('tree'));
  });

  it('window open since load → strip button', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    control('tree').focus();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(stripButton('tree'));
  });

  it('without a strip button → canvas', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    stripButton('tree')?.remove();
    control('tree').focus();
    closeToolWindow('tree');
    await settle();
    expect(active()?.hasAttribute('data-canvas-area')).toBe(true);
  });

  it('opening the Catalog with focus on the Tree does not leave focus on body', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    control('tree').focus();
    openToolWindow('catalog');
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()).toBe(stripButton('tree'));
  });

  it('switching tabs of the bottom window moves focus to the active tab', async () => {
    const user = userEvent.setup();
    showToolWindow('list');
    render(<Shell />);
    await settle();
    await user.click(screen.getByRole('tab', { name: t('incomplete.title') }));
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()?.getAttribute('role')).toBe('tab');
    expect(active()?.getAttribute('aria-selected')).toBe('true');
  });

  it('switching tabs by shortcut, with focus on the canvas or on the content, focuses the active tab', async () => {
    showToolWindow('list');
    const { rerender } = render(<Shell />);
    await settle();
    for (const from of ['canvas', 'content'] as const) {
      hideToolWindow('incomplete');
      showToolWindow('list');
      rerender(<Shell />);
      await settle();
      if (from === 'canvas') screen.getByLabelText('canvas').focus();
      else control('list').focus();
      showAndFocusToolWindow('incomplete');
      rerender(<Shell />);
      await settle();
      expect(active()?.getAttribute('role')).toBe('tab');
      expect(active()?.getAttribute('aria-selected')).toBe('true');
    }
  });
});

// Esc in the Details and Comments windows (stage #1273, FE1): closes like the X when focus is
// inside, outside a text field and without a modal or menu that consumes the Esc.
describe('Esc closes Details and Comments', () => {
  function EscShell({ extra }: { readonly extra?: (id: ToolWindowId) => unknown }) {
    const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
    const bottom = openWindowOf('bottom');
    if (bottom) windows.push(bottom);
    return (
      <EditorContext.Provider value={harness.context}>
        <ToolStrip side="left" />
        <main data-canvas-area tabIndex={-1} aria-label="canvas" />
        {windows.map((id) => (
          <ToolWindow key={id} id={id}>
            <button type="button">control {id}</button>
            <input aria-label={`field ${id}`} type="text" />
            {extra?.(id) as never}
          </ToolWindow>
        ))}
        <ToolStrip side="right" />
      </EditorContext.Provider>
    );
  }

  beforeEach(() => {
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
  });

  it.each(['details', 'comments'] as const)(
    '%s: Esc with focus on a button closes, focuses the strip button and the selection stays',
    async (id) => {
      const user = userEvent.setup();
      showToolWindow(id);
      render(<EscShell />);
      await settle();
      control(id).focus();
      await user.keyboard('{Escape}');
      await settle();
      expect(isToolWindowOpen(id)).toBe(false);
      expect(active()).toBe(stripButton(id));
      expect(stripButton(id)?.getAttribute('aria-pressed')).toBe('false');
      expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    },
  );

  it('Esc in a text field of Details does not close the window', async () => {
    const user = userEvent.setup();
    showToolWindow('details');
    render(<EscShell />);
    await settle();
    const field = screen.getByRole('textbox', { name: 'field details' });
    field.focus();
    await user.keyboard('{Escape}');
    await settle();
    expect(isToolWindowOpen('details')).toBe(true);
    expect(active()).toBe(field);
  });

  it('with a modal open inside Details, the Esc belongs only to the modal', async () => {
    const user = userEvent.setup();
    showToolWindow('details');
    render(
      <EscShell
        extra={(id) =>
          id === 'details' ? (
            <Dialog
              title="Modal"
              onCancel={() => undefined}
              actions={<button type="button">Modal OK</button>}
            />
          ) : null
        }
      />,
    );
    await settle();
    screen.getByRole('button', { name: 'Modal OK', hidden: true }).focus();
    await user.keyboard('{Escape}');
    await settle();
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('a menu open inside Details closes only the menu', async () => {
    const user = userEvent.setup();
    showToolWindow('details');
    render(
      <EscShell
        extra={(id) =>
          id === 'details' ? (
            <ActionMenu label="Actions" items={[{ label: 'Item', onSelect: () => {} }]} />
          ) : null
        }
      />,
    );
    await settle();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await settle();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('Esc in the Tree does not close the Tree', async () => {
    const user = userEvent.setup();
    showToolWindow('tree');
    render(<EscShell />);
    await settle();
    control('tree').focus();
    await user.keyboard('{Escape}');
    await settle();
    expect(isToolWindowOpen('tree')).toBe(true);
  });

  it('Shift+Esc keeps hiding the focused window', async () => {
    const user = userEvent.setup();
    showToolWindow('details');
    render(<EscShell />);
    await settle();
    control('details').focus();
    // Shift+Esc belongs to the editor shortcuts; ToolWindow does not handle it (the window stays open).
    await user.keyboard('{Shift>}{Escape}{/Shift}');
    await settle();
    expect(isToolWindowOpen('details')).toBe(true);
  });
});
