import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useRef } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { ActionMenu } from '../../src/ui/ActionMenu';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { Button } from '../../src/ui/controls';
import { Dialog } from '../../src/ui/Dialog';
import { EditorContext } from '../../src/ui/EditorContext';
import { DialogSlotContext, useDialogSlot } from '../../src/ui/focus';
import { MenuPopover } from '../../src/ui/MenuPopover';
import { OPEN_SCROLL_GRACE_MS } from '../../src/ui/openScrollGuard';
import { Popover } from '../../src/ui/Popover';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Stage 8 (8.3), finding F6: menus and popovers return the focus to the trigger on every
// close (Esc, choice, click outside), and not only on Esc; without this the focus, which was on a
// menu item, fell to the `body` when the menu left the DOM.

afterEach(cleanup);

describe('MenuPopover', () => {
  function renderMenu(onPick = vi.fn()) {
    render(
      <div>
        <MenuPopover label="Project" buttonLabel="Project menu">
          <Button onClick={onPick}>Export</Button>
        </MenuPopover>
        <button>Outside</button>
      </div>,
    );
    return screen.getByRole('button', { name: 'Project menu' });
  }

  it('choosing an item returns the focus to the trigger', async () => {
    const onPick = vi.fn();
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // Return from 8.3 (second reading, M1): the menu closed on the click bubble, after the
  // item acted; the trigger must receive the focus first (note §3, like the `ActionMenu`).
  it('the trigger receives the focus before the item acts', async () => {
    let focusedOnPick: Element | null = null;
    const onPick = vi.fn(() => {
      focusedOnPick = document.activeElement;
    });
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(focusedOnPick).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Enter on an item chooses: the item acts, the menu closes and the focus stays on the trigger', async () => {
    let focusedOnPick: Element | null = null;
    const onPick = vi.fn(() => {
      focusedOnPick = document.activeElement;
    });
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Export' }).focus();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledOnce();
    expect(focusedOnPick).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('an item that opens a dialog right away: the dialog has the trigger as its origin', async () => {
    // The dialog opens through the host slot (the origin is saved on the gesture) and has an
    // explicit return target, like Export: if the origin were the item (which leaves the DOM with
    // the menu), the focus would go to the explicit target instead of returning to the trigger.
    function Host() {
      const dialogs = useDialogSlot<'confirm'>();
      const other = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <MenuPopover label="Project" buttonLabel="Project menu">
            <Button onClick={() => dialogs.show('confirm')}>Open</Button>
          </MenuPopover>
          <button ref={other}>Other</button>
          {dialogs.current && (
            <DialogSlotContext.Provider value={dialogs.slot}>
              <Dialog
                title="Confirm"
                onCancel={dialogs.close}
                returnFocus={() => other.current}
                actions={<Button onClick={dialogs.close}>Cancel</Button>}
              >
                <p>Text</p>
              </Dialog>
            </DialogSlotContext.Provider>
          )}
        </div>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Project menu' });
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('click outside with the focus on an item returns the focus to the trigger', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Export' }).focus();
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Popover', () => {
  function renderPopover() {
    render(
      <div>
        <Popover
          label="Colors"
          trigger={({ open, toggle }) => (
            <button aria-expanded={open} onClick={toggle}>
              Color
            </button>
          )}
        >
          {(close) => <button onClick={close}>Red</button>}
        </Popover>
      </div>,
    );
    return screen.getByRole('button', { name: 'Color' });
  }

  it('choosing (close) returns the focus to the trigger', async () => {
    const trigger = renderPopover();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Red' }));
    expect(screen.queryByRole('button', { name: 'Red' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('click outside with the focus inside returns the focus to the trigger', async () => {
    const trigger = renderPopover();
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Red' }).focus();
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Red' })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });
});

describe('ActionMenu', () => {
  it('click outside with the focus on an item returns the focus to the trigger', async () => {
    render(<ActionMenu label="Actions" items={[{ label: 'Up', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    const user = userEvent.setup();
    await user.click(trigger);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Up' })),
    );
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('ActionMenu (fixed position)', () => {
  it('the list gets left/top and closes on scroll', async () => {
    render(<ActionMenu label="Actions" items={[{ label: 'Up', onSelect: vi.fn() }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const list = await screen.findByRole('menu');
    expect(list.style.left).toMatch(/px$/);
    expect(list.style.top).toMatch(/px$/);
    // The scroll that the opening itself causes (in the same frame) does not close (stage #515).
    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menu')).not.toBeNull();
    // Once the opening window has passed, scrolling closes.
    await new Promise((resolve) => setTimeout(resolve, OPEN_SCROLL_GRACE_MS + 20));
    fireEvent.scroll(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes on resizing the window', async () => {
    render(<ActionMenu label="Actions" items={[{ label: 'Up', onSelect: vi.fn() }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    fireEvent(window, new Event('resize'));
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('CanvasContextMenu', () => {
  function renderMenu() {
    const harness = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={harness.context}>
        <button>Canvas</button>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    const origin = screen.getByRole('button', { name: 'Canvas' });
    origin.focus();
    act(() => {
      harness.ui.canvasMenu.value = { x: 40, y: 60, target: { kind: 'm', id: 'M3' } };
    });
    return { harness, origin };
  }

  it('Esc returns the focus to whoever had it before opening', async () => {
    const { origin } = renderMenu();
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(origin));
  });

  it('choosing an item returns the focus to whoever had it before opening', async () => {
    const { origin } = renderMenu();
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    const user = userEvent.setup();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(origin));
  });
});

describe('Popover (scroll)', () => {
  it('ignores the opening scroll and closes on scrolling afterwards', async () => {
    render(
      <Popover
        role="menu"
        label="More"
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle}>
            Open
          </button>
        )}
      >
        <button type="button">Item</button>
      </Popover>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('menu');
    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menu')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, OPEN_SCROLL_GRACE_MS + 20));
    fireEvent.scroll(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
