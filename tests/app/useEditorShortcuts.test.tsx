import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { HelpTip } from '../../src/ui/controls';
import { modalOpen } from '../../src/ui/focus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { t } from '../../src/i18n';
import {
  ITEM_CLIPBOARD_MIME,
  parseAnyRef,
  parseRef,
  type Project,
} from '../../src/model';
import * as imageCrop from '../../src/storage/imageCrop';
import {
  RESIZE_STEP,
  hideToolWindow,
  layersWindowHeight,
  resizeLayersWindow,
  isToolWindowOpen,
  resetToolWindowSize,
  showToolWindow,
  toolWindowSizes,
} from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { locale } from '../../src/store/settings';
import { selectItems } from '../../src/store/ui';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';

// Editor shortcuts wired to the store, the UI and the canvas: what each key really does
// (the key → shortcut translation is tested separately, in `shortcuts.test.ts`).

type Mods = Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>>;

interface Fake {
  readonly harness: Harness;
  readonly dialogs: {
    [K in keyof EditorDialogs]: EditorDialogs[K] extends (...a: never[]) => unknown
      ? ReturnType<typeof vi.fn>
      : EditorDialogs[K];
  };
  readonly commands: {
    exportProject: ReturnType<typeof vi.fn>;
    closeProject: () => Promise<void>;
  };
  readonly canvas: {
    cancelInteraction: ReturnType<typeof vi.fn>;
    isInteracting: ReturnType<typeof vi.fn>;
    centerSelection: ReturnType<typeof vi.fn>;
    zoomBy: ReturnType<typeof vi.fn>;
    zoomTo: ReturnType<typeof vi.fn>;
    fitAll: ReturnType<typeof vi.fn>;
    fitSelection: ReturnType<typeof vi.fn>;
  };
  readonly press: (key: string, mods?: Mods, init?: KeyboardEventInit) => KeyboardEvent;
  readonly rerender: (dialogs: EditorDialogs) => void;
  readonly unmount: () => void;
}

function Probe({
  dialogs,
  commands,
  enabled,
  busy,
}: {
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
  readonly enabled: boolean;
  readonly busy: boolean;
}) {
  useEditorShortcuts(dialogs, commands, enabled, busy);
  return null;
}

function setup({
  enabled = true,
  readOnly = false,
  busy = false,
  project = sampleProject(),
}: {
  enabled?: boolean;
  readOnly?: boolean;
  busy?: boolean;
  project?: Project;
} = {}): Fake {
  const harness = createHarness(project, readOnly);
  const canvas = {
    cancelInteraction: vi.fn(() => false),
    isInteracting: vi.fn(() => false),
    centerSelection: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
    fitAll: vi.fn(),
    fitSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
    requestDeleteItems: vi.fn(),
  } as unknown as Fake['dialogs'];
  const commands = {
    exportProject: vi.fn(() => Promise.resolve()),
    closeProject: () => Promise.resolve(),
  };
  const tree = (d: EditorDialogs) => (
    <EditorContext.Provider value={harness.context}>
      <Probe dialogs={d} commands={commands} enabled={enabled} busy={busy} />
    </EditorContext.Provider>
  );
  const view = render(tree(dialogs as unknown as EditorDialogs));
  return {
    harness,
    dialogs,
    commands,
    canvas,
    press: (key, mods = {}, init = {}) => {
      const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: mods.ctrl ?? false,
        metaKey: mods.meta ?? false,
        shiftKey: mods.shift ?? false,
        altKey: mods.alt ?? false,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      window.dispatchEvent(event);
      return event;
    },
    rerender: (d) => view.rerender(tree(d)),
    unmount: view.unmount,
  };
}

const marking = (h: Harness, id: string) => {
  const found = h.project().markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** Fires the event from an element (the target matters for text fields). */
function pressOn(el: Element, key: string, mods: Mods = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  for (const id of ['tree', 'layers', 'details', 'list'] as const) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useEditorShortcuts: editing', () => {
  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, and the browser does not receive the key', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    expect(s.press('z', { ctrl: true }).defaultPrevented).toBe(true);
    expect(s.harness.project().layers[0]?.name).toBe('Lataria');
    s.press('z', { ctrl: true, shift: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
    s.press('z', { ctrl: true });
    s.press('y', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('Cmd+Z also undoes (macOS)', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    s.press('z', { meta: true });
    expect(s.harness.project().layers[0]?.name).toBe('Lataria');
  });

  it('outside field focus: Ctrl+Z in a text field belongs to the field, not the editor', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    const input = document.createElement('input');
    document.body.append(input);
    const event = pressOn(input, 'z', { ctrl: true });
    expect(event.defaultPrevented).toBe(false);
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('Esc without a gesture in progress clears the selection; with a gesture, it only cancels the gesture', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.canvas.cancelInteraction.mockReturnValue(true);
    s.press('Escape');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.canvas.cancelInteraction.mockReturnValue(false);
    s.press('Escape');
    expect(s.harness.ui.selection.value).toBeNull();
  });

  it('Esc with the help tip open closes only the tip and does not clear the selection', async () => {
    locale.value = 'en-US';
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    render(<HelpTip name="Width" text="In pixels of the image." />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    const button = screen.getByRole('button', { name: 'About Width' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    // With no tip open, Esc goes to whoever handles it today.
    await user.keyboard('{Escape}');
    expect(s.harness.ui.selection.value).toBeNull();
  });

  it('Esc without a mounted canvas also clears the selection', () => {
    const s = setup();
    s.harness.context.canvas.current = null;
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('Escape');
    expect(s.harness.ui.selection.value).toBeNull();
  });
});

describe('useEditorShortcuts: delete', () => {
  it('Delete and Backspace request deletion of the selected marking', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.press('Delete');
    s.press('Backspace');
    expect(s.dialogs.requestDeleteMarking).toHaveBeenCalledTimes(2);
    expect(s.dialogs.requestDeleteMarking.mock.calls[0]?.[0]).toMatchObject({ id: 'M2' });
    expect(s.dialogs.requestDeleteImage).not.toHaveBeenCalled();
  });

  it('with an image selected, requests deletion of the image', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('Delete');
    expect(s.dialogs.requestDeleteImage.mock.calls[0]?.[0]).toMatchObject({ id: 'I2' });
  });

  it('without a selection or in a read-only project, does nothing', () => {
    const none = setup();
    none.press('Delete');
    expect(none.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
    expect(none.dialogs.requestDeleteImage).not.toHaveBeenCalled();
    cleanup();
    const ro = setup({ readOnly: true });
    ro.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    ro.press('Delete');
    expect(ro.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });

  it('in a text field, Delete erases text and not the item', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    expect(pressOn(input, 'Delete').defaultPrevented).toBe(false);
    expect(s.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });
});

describe('useEditorShortcuts: view mode (Alt+H)', () => {
  it('toggles on and off, goes back to Navigate mode and keeps the selection', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.harness.ui.mode.value = 'draw';
    expect(s.press('h', { alt: true }).defaultPrevented).toBe(true);
    expect(s.harness.ui.viewMode.value).toBe(true);
    expect(s.harness.ui.mode.value).toBe('navigate');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.press('h', { alt: true });
    expect(s.harness.ui.viewMode.value).toBe(false);
    expect(s.harness.ui.mode.value).toBe('navigate');
  });
});

describe('useEditorShortcuts: Alt+H with focus on a panel control', () => {
  it('turns the mode off with focus on a checkbox (Choice) of the panel', () => {
    const s = setup();
    s.press('h', { alt: true });
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    box.focus();
    expect(pressOn(box, 'h', { alt: true }).defaultPrevented).toBe(true);
    expect(s.harness.ui.viewMode.value).toBe(false);
    box.remove();
  });

  it('with a text field in focus, Alt+H does not act', () => {
    const s = setup();
    s.press('h', { alt: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(pressOn(input, 'h', { alt: true }).defaultPrevented).toBe(false);
    expect(s.harness.ui.viewMode.value).toBe(true);
    input.remove();
  });
});

describe('useEditorShortcuts: leaving view mode (Esc)', () => {
  it('Esc leaves the mode and does not touch the selection', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.press('h', { alt: true });
    expect(s.harness.ui.viewMode.value).toBe(true);
    s.press('Escape');
    expect(s.harness.ui.viewMode.value).toBe(false);
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
  });

  it('with a text field in focus, Esc does not leave the mode', () => {
    const s = setup();
    s.press('h', { alt: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(s.harness.ui.viewMode.value).toBe(true);
    input.remove();
  });
});

describe('useEditorShortcuts: lock (Alt+L)', () => {
  it('locks and unlocks the selected marking, with one undo entry each', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    expect(s.press('l', { alt: true }).defaultPrevented).toBe(true);
    expect(marking(s.harness, 'M2').locked).toBe(true);
    s.press('l', { alt: true });
    expect(marking(s.harness, 'M2').locked).toBe(false);
    expect(s.harness.store.revision.value).toBe(2);
    s.harness.store.undo();
    expect(marking(s.harness, 'M2').locked).toBe(true);
  });

  it('locks the selected image', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('l', { alt: true });
    expect(s.harness.project().containers[0]?.locked).toBe(true);
    s.press('l', { alt: true });
    expect(s.harness.project().containers[0]?.locked).toBe(false);
  });

  it('the locked item stays selected', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('l', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('without a selection, read-only or in a text field, does nothing', () => {
    const none = setup();
    none.press('l', { alt: true });
    expect(none.harness.store.canUndo.value).toBe(false);
    cleanup();
    const ro = setup({ readOnly: true });
    ro.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    ro.press('l', { alt: true });
    expect(marking(ro.harness, 'M1').locked).toBe(false);
    cleanup();
    const typing = setup();
    typing.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    pressOn(input, 'l', { alt: true });
    expect(marking(typing.harness, 'M1').locked).toBe(false);
  });
});

describe('useEditorShortcuts: walking the selection (Alt+↑ / Alt+↓)', () => {
  it('Alt+↑ goes up to the parent and, on the root marking, to the image', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.press('ArrowUp', { alt: true });
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I1' });
    expect(s.canvas.centerSelection).toHaveBeenCalledTimes(3);
  });

  it('Alt+↓ goes down to the first child; from the image, to the first root marking', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
  });

  it('without children, Alt+↓ does not change the selection; without a selection, nothing happens', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M3' });
    s.harness.ui.selection.value = null;
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toBeNull();
    expect(s.canvas.centerSelection).not.toHaveBeenCalled();
  });

  it('the image without markings has nowhere to go down to', () => {
    const s = setup();
    s.harness.actions.removeMarking('M4');
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });
});

const keyup = (key = 'ArrowRight') =>
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));

describe('useEditorShortcuts: arrows move the selection', () => {
  const x = (s: Fake) => marking(s.harness, 'M1').rect.x;

  it('press and release is one undo entry; Ctrl+Z reverts everything', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const x0 = x(s);
    const event = s.press('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    keyup();
    expect(x(s)).toBe(x0 + 1);
    s.press('ArrowRight', { shift: true });
    keyup();
    expect(x(s)).toBe(x0 + 11);
    s.press('z', { ctrl: true });
    expect(x(s)).toBe(x0 + 1);
    s.press('z', { ctrl: true });
    expect(x(s)).toBe(x0);
    expect(s.harness.store.canUndo.value).toBe(false);
  });

  it('holding (repeated keydown, one keyup) is a single gesture', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const x0 = x(s);
    s.press('ArrowRight');
    for (let i = 0; i < 4; i++) s.press('ArrowRight', {}, { repeat: true });
    expect(s.harness.store.canUndo.value).toBe(false);
    keyup();
    expect(x(s)).toBe(x0 + 5);
    s.press('z', { ctrl: true });
    expect(x(s)).toBe(x0);
    expect(s.harness.store.canUndo.value).toBe(false);
  });

  it('losing window focus closes the gesture', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    s.press('ArrowRight');
    window.dispatchEvent(new Event('blur'));
    expect(s.harness.store.canUndo.value).toBe(true);
  });

  it('does not move with focus in a field, defaultPrevented, read-only or a pointer gesture', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const x0 = x(s);
    const input = document.createElement('input');
    document.body.append(input);
    pressOn(input, 'ArrowRight');
    input.remove();
    s.press('ArrowRight', {}, { cancelable: true });
    keyup();
    expect(x(s)).toBe(x0 + 1);
    // defaultPrevented: an earlier listener already handled it.
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', stop, true);
    s.press('ArrowRight');
    window.removeEventListener('keydown', stop, true);
    keyup();
    expect(x(s)).toBe(x0 + 1);
    s.canvas.isInteracting.mockReturnValue(true);
    s.press('ArrowRight');
    keyup();
    expect(x(s)).toBe(x0 + 1);
    s.unmount();
    const ro = setup({ readOnly: true });
    selectItems(ro.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    const r0 = x(ro);
    ro.press('ArrowRight');
    keyup();
    expect(x(ro)).toBe(r0);
  });

  it('a locked item does not move and nothing enters the undo history', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M1' }]);
    s.harness.actions.setMarkingLocked('M1', true);
    const x0 = x(s);
    s.harness.store.undo();
    s.harness.actions.setMarkingLocked('M1', true);
    const revision = s.harness.store.revision.value;
    s.press('ArrowRight');
    keyup();
    expect(x(s)).toBe(x0);
    expect(s.harness.store.revision.value).toBe(revision);
  });
});

describe('useEditorShortcuts: zoom, help, settings and project', () => {
  it('Shift+1 frames all and Shift+2 the selection, but in a text field the key belongs to the field', () => {
    const s = setup();
    s.press('!', { shift: true }, { code: 'Digit1' });
    s.press('@', { shift: true }, { code: 'Digit2' });
    expect(s.canvas.fitAll).toHaveBeenCalledTimes(1);
    expect(s.canvas.fitSelection).toHaveBeenCalledTimes(1);
    const input = document.createElement('input');
    document.body.append(input);
    const typed = new KeyboardEvent('keydown', {
      key: '@',
      code: 'Digit2',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(typed);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '!',
        code: 'Digit1',
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(typed.defaultPrevented).toBe(false);
    expect(s.canvas.fitAll).toHaveBeenCalledTimes(1);
    expect(s.canvas.fitSelection).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+= and Ctrl+− zoom by step, and Ctrl+0 goes back to 100%', () => {
    const s = setup();
    s.press('=', { ctrl: true });
    s.press('-', { ctrl: true });
    s.press('0', { ctrl: true });
    expect(s.canvas.zoomBy).toHaveBeenNthCalledWith(1, 1.25);
    expect(s.canvas.zoomBy).toHaveBeenNthCalledWith(2, 1 / 1.25);
    expect(s.canvas.zoomTo).toHaveBeenCalledWith(1);
  });

  it('F1 opens Help and Ctrl+, opens Settings', () => {
    const s = setup();
    s.press('F1');
    s.press(',', { ctrl: true });
    expect(s.dialogs.show).toHaveBeenNthCalledWith(1, { kind: 'help' });
    expect(s.dialogs.show).toHaveBeenNthCalledWith(2, { kind: 'settings' });
  });

  it('Ctrl+E exports the project', () => {
    const s = setup();
    s.press('e', { ctrl: true });
    expect(s.commands.exportProject).toHaveBeenCalledOnce();
  });

  it('Ctrl+E with an import in progress (busy) does not export, like the buttons (#971, item 4)', () => {
    const s = setup({ busy: true });
    s.press('e', { ctrl: true });
    expect(s.commands.exportProject).not.toHaveBeenCalled();
  });

  it('Ctrl+L opens Layers', () => {
    const s = setup();
    s.press('l', { ctrl: true });
    expect(isToolWindowOpen('layers')).toBe(true);
  });
});

describe('useEditorShortcuts: windows', () => {
  it('Ctrl+Shift+N opens the window; again, with it focused, hides it', () => {
    const s = setup();
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(isToolWindowOpen('tree')).toBe(true);
    // With focus inside the window, the same shortcut hides it.
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'tree');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(isToolWindowOpen('tree')).toBe(false);
  });

  it('Alt+N opens the window where the browser allows it (outside Linux)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0)',
    );
    const s = setup();
    s.press('3', { alt: true }, { code: 'Digit3' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('on Chrome for Linux, Alt+number is ignored (the browser switches tabs)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64)',
    );
    const s = setup();
    s.press('3', { alt: true }, { code: 'Digit3' });
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('Shift+Esc hides the focused window (and without focus does nothing)', () => {
    const s = setup();
    showToolWindow('details');
    s.press('Escape', { shift: true });
    expect(isToolWindowOpen('details')).toBe(true);
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'details');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('Escape', { shift: true });
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('Shift+Esc with a pointer gesture in progress cancels the gesture and does not hide the window', () => {
    const s = setup();
    showToolWindow('details');
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'details');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.canvas.cancelInteraction.mockReturnValue(true);
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('Escape', { shift: true });
    expect(s.canvas.cancelInteraction).toHaveBeenCalled();
    expect(isToolWindowOpen('details')).toBe(true);
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('Ctrl+Shift+arrows resize the focused window in steps of 16 px', () => {
    const s = setup();
    resetToolWindowSize('right', { width: 1400, height: 800, otherWidth: 0 });
    showToolWindow('details');
    const before = toolWindowSizes.value.right;
    // Without focus in a window, nothing changes.
    s.press('ArrowLeft', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before);
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'details');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('ArrowLeft', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before + RESIZE_STEP);
    s.press('ArrowRight', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before);
  });

  // Stage 8 (8.7), residue 5 (F4): the window and the column are found by the `data-*` that
  // ToolWindow and EditorWindows expose, not by their CSS classes.
  it('Ctrl+Shift+↑ on stacked Layers moves the divider, measured by the column', () => {
    const s = setup();
    showToolWindow('layers');
    resizeLayersWindow(300, 800);
    const column = document.createElement('div');
    column.setAttribute('data-tool-column', '');
    column.getBoundingClientRect = () => new DOMRect(0, 0, 280, 800);
    const el = document.createElement('section');
    el.className = 'tool-window-stacked';
    el.setAttribute('data-window', 'layers');
    el.tabIndex = 0;
    column.append(el);
    document.body.append(column);
    el.focus();
    s.press('ArrowUp', { ctrl: true, shift: true });
    expect(layersWindowHeight.value).toBe(300 + RESIZE_STEP);
  });
});

describe('useEditorShortcuts: Alt+N', () => {
  it('does nothing: neither triggers a button nor opens Details (the active layer is gone)', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const button = document.createElement('button');
    button.setAttribute('data-action', 'add-annotation');
    const click = vi.fn();
    button.addEventListener('click', click);
    const input = document.createElement('input');
    document.body.append(button, input);
    const details = isToolWindowOpen('details');
    const event = pressOn(input, 'n', { alt: true });
    expect(event.defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(isToolWindowOpen('details')).toBe(details);
  });
});

describe('useEditorShortcuts: when the keys do not apply', () => {
  it('with a dialog open, the keyboard belongs to the dialog', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    // Stage 8 (8.3), F4: an open modal counts in `modalOpen` (instead of looking for
    // `dialog[open]` in the document).
    modalOpen.value += 1;
    try {
      s.press('z', { ctrl: true });
      s.press('F1');
    } finally {
      modalOpen.value -= 1;
    }
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('an already handled event (defaultPrevented) is ignored', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    window.addEventListener('keydown', (e) => e.preventDefault(), {
      capture: true,
      once: true,
    });
    s.press('z', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('turned off (narrow window, editor behind the notice), no key applies', () => {
    const s = setup({ enabled: false });
    s.harness.actions.renameLayer('L1', 'Pintura');
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    expect(s.press('z', { ctrl: true }).defaultPrevented).toBe(false);
    s.press('Delete');
    s.press('F1');
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
    expect(s.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('keys without a shortcut are not intercepted', () => {
    const s = setup();
    expect(s.press('a').defaultPrevented).toBe(false);
    expect(s.press('Enter').defaultPrevented).toBe(false);
  });

  it('on unmount, the listener leaves the window', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    s.unmount();
    s.press('z', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('always uses the current version of the dialogs, without re-registering the listener', () => {
    const s = setup();
    const next = {
      current: null,
      show: vi.fn(),
      close: vi.fn(),
      requestDeleteImage: vi.fn(),
      requestDeleteMarking: vi.fn(),
    };
    s.rerender(next as unknown as EditorDialogs);
    s.press('F1');
    expect(next.show).toHaveBeenCalledWith({ kind: 'help' });
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });
});

// Stage 3a.2: Ctrl+C copies the reference and Ctrl+Alt+C the crop, without taking away the
// native copy from text fields or from text selected on the page.
describe('useEditorShortcuts: copy reference and crop', () => {
  function mockClipboard(custom = false) {
    const writeText = vi.fn((text: string) => {
      void text;
      return Promise.resolve();
    });
    const write = vi.fn((items: unknown[]) => {
      void items;
      return Promise.resolve();
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, write },
      configurable: true,
    });
    if (custom) {
      class FakeItem {
        static supports = (type: string) => type === `web ${ITEM_CLIPBOARD_MIME}`;
        constructor(readonly data: Record<string, unknown>) {}
      }
      vi.stubGlobal('ClipboardItem', FakeItem);
      // The custom format only goes with `clipboard-read` already granted.
      Object.defineProperty(navigator, 'permissions', {
        value: { query: () => Promise.resolve({ state: 'granted' }) },
        configurable: true,
      });
    }
    return { writeText, write };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'permissions');
    window.getSelection()?.removeAllRanges();
  });

  it('with a marking selected, copies the reference and notifies', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };

    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(true);

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]?.[0]);
    // Only the URL: without the readable path (stage referencia-url, decision 1).
    // pt-BR kept: shared fixture data (project slug `projeto` of sampleProject) asserted by tests/mcp, tests/examples
    expect(text).toBe('mapping://projeto/m/m2');
    // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
    expect(parseRef(text)).toEqual({ project: 'projeto', kind: 'm', code: 'm2' });
    await vi.waitFor(() =>
      expect(s.harness.ui.toast.value).toBe(t('copy.referenceDone')),
    );
  });

  it('Cmd+C (macOS) also copies', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    expect(s.press('c', { meta: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it('image selected: the reference is of type i', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseRef(String(writeText.mock.calls[0]?.[0]))).toMatchObject({
      kind: 'i',
      code: 'i2',
    });
  });

  it('also writes the item data, in the custom web format, when the browser allows it', async () => {
    const { write, writeText } = mockClipboard(true);
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0]?.[0][0] as { data: Record<string, Blob> };
    expect(Object.keys(item.data).sort()).toEqual([
      'text/plain',
      `web ${ITEM_CLIPBOARD_MIME}`,
    ]);
    const data = JSON.parse(await item.data[`web ${ITEM_CLIPBOARD_MIME}`]!.text());
    // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
    expect(data).toMatchObject({ format: 'mapping-item', kind: 'm', project: 'projeto' });
    expect(data.item.id).toBe('M1');
    // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
    expect(data.ref).toMatch(/^mapping:\/\/projeto\/m\/[0-9a-z]+$/);
    expect(await item.data['text/plain']!.text()).toBe(data.ref);
  });

  it('with nothing selected, native copy continues', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('with focus in a text field, native copy continues', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();
    expect(pressOn(input, 'c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('with text selected on the page, native copy continues', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const p = document.body.appendChild(document.createElement('p'));
    p.textContent = 'page text';
    window.getSelection()?.selectAllChildren(p);
    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('with focus on an annotation card (outside the fields), copies its reference', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const card = document.body.appendChild(document.createElement('div'));
    card.setAttribute('data-annotation', 'A1');
    const button = card.appendChild(document.createElement('button'));
    button.focus();
    expect(pressOn(button, 'c', { ctrl: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const ref = parseRef(String(writeText.mock.calls[0]?.[0]));
    expect(ref).toMatchObject({ kind: 'a', code: 'a1' });
  });

  describe('with focus on a property (CM5, decision 32)', () => {
    /** Card `A1` with the field `type`, the pair `E1` and a table `atributos` with one row `R1`. */
    function propertyCard() {
      const card = document.body.appendChild(document.createElement('div'));
      card.setAttribute('data-annotation', 'AC');
      const field = card.appendChild(document.createElement('div'));
      field.setAttribute('data-field', 'name');
      const fieldButton = field.appendChild(document.createElement('button'));
      // The pair belongs to a free annotation (`AU`), in another card.
      const free = document.body.appendChild(document.createElement('div'));
      free.setAttribute('data-annotation', 'AU');
      const entry = free.appendChild(document.createElement('div'));
      entry.setAttribute('data-entry', 'EN');
      const entryButton = entry.appendChild(document.createElement('button'));
      const table = card.appendChild(document.createElement('div'));
      // pt-BR kept: shared fixture data (`atributos` table of cadastroProject) asserted by tests/mcp, tests/examples
      table.setAttribute('data-field', 'atributos');
      const tableButton = table.appendChild(document.createElement('button'));
      const row = table.appendChild(document.createElement('div'));
      row.setAttribute('data-row-id', 'R1');
      const rowInput = row.appendChild(document.createElement('input'));
      return { card, fieldButton, entryButton, tableButton, rowInput };
    }

    const copiedRef = (writeText: { mock: { calls: unknown[][] } }) =>
      String(writeText.mock.calls[0]?.[0]);

    it('on the field copies ...//f/<field>', async () => {
      const { writeText } = mockClipboard();
      const s = setup({ project: cadastroProject() });
      s.harness.ui.selection.value = { kind: 'marking', id: 'MF' };
      const { fieldButton } = propertyCard();
      fieldButton.focus();
      expect(pressOn(fieldButton, 'c', { ctrl: true }).defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(parseAnyRef(copiedRef(writeText))).toMatchObject({
        // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
        project: 'projeto',
        ref: { type: 'field', key: 'name' },
      });
      expect(copiedRef(writeText)).toMatch(
        // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
        /^mapping:\/\/projeto\/a\/[0-9a-z]+\/f\/name$/,
      );
    });

    it('on the pair copies .../e/<code>', async () => {
      const { writeText } = mockClipboard();
      const s = setup({ project: cadastroProject() });
      const { entryButton } = propertyCard();
      entryButton.focus();
      expect(pressOn(entryButton, 'c', { ctrl: true }).defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(copiedRef(writeText)).toMatch(
        // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
        /^mapping:\/\/projeto\/a\/[0-9a-z]+\/e\/[0-9a-z]+$/,
      );
      expect(s.harness.ui.toast.value).not.toBe(t('copy.failed'));
    });

    it('on the table row copies .../f/<field>/r/<code> (the row wins over the field)', async () => {
      const { writeText } = mockClipboard();
      setup({ project: cadastroProject() });
      const { rowInput } = propertyCard();
      rowInput.focus();
      expect(pressOn(rowInput, 'c', { ctrl: true }).defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(copiedRef(writeText)).toMatch(
        // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
        /^mapping:\/\/projeto\/a\/[0-9a-z]+\/f\/atributos\/r\/[0-9a-z]+$/,
      );
    });

    it('on the table field, outside the rows, copies the field', async () => {
      const { writeText } = mockClipboard();
      setup({ project: cadastroProject() });
      const { tableButton } = propertyCard();
      tableButton.focus();
      pressOn(tableButton, 'c', { ctrl: true });
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      // pt-BR kept: shared fixture data (project slug `projeto`, table `atributos`) asserted by tests/mcp, tests/examples
      expect(copiedRef(writeText)).toMatch(/\/f\/atributos$/);
    });

    it('in a text field without a selection copies the property; with selected text, native copy continues', async () => {
      const { writeText } = mockClipboard();
      setup({ project: cadastroProject() });
      const { rowInput } = propertyCard();
      rowInput.value = 'ana@example.com';
      rowInput.focus();
      rowInput.setSelectionRange(0, 3);
      expect(pressOn(rowInput, 'c', { ctrl: true }).defaultPrevented).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
      rowInput.setSelectionRange(3, 3);
      expect(pressOn(rowInput, 'c', { ctrl: true }).defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    });

    it('in a text editor (contentEditable) native copy continues', () => {
      const { writeText } = mockClipboard();
      setup({ project: cadastroProject() });
      const { field } = {
        field: propertyCard().fieldButton.parentElement as HTMLElement,
      };
      const editor = field.appendChild(document.createElement('div'));
      Object.defineProperty(editor, 'isContentEditable', { value: true });
      editor.tabIndex = 0;
      editor.focus();
      expect(pressOn(editor, 'c', { ctrl: true }).defaultPrevented).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('in a local project (outside a folder) it does not copy', () => {
      const { writeText } = mockClipboard();
      const s = setup({ project: cadastroProject() });
      Object.defineProperty(s.harness.context.session.storage, 'folderName', {
        value: undefined,
        configurable: true,
      });
      const { fieldButton, rowInput } = propertyCard();
      fieldButton.focus();
      expect(pressOn(fieldButton, 'c', { ctrl: true }).defaultPrevented).toBe(false);
      rowInput.focus();
      expect(pressOn(rowInput, 'c', { ctrl: true }).defaultPrevented).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  it('Ctrl+Alt+C copies the crop of the selected marking as PNG', async () => {
    const { write } = mockClipboard(true);
    const s = setup();
    const png = new Blob(['png'], { type: 'image/png' });
    const crop = vi.spyOn(imageCrop, 'cropToPng').mockResolvedValue(png);
    vi.spyOn(s.harness.context.session, 'readImage').mockResolvedValue(new Blob(['jpg']));
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };

    expect(
      s.press('c', { ctrl: true, alt: true }, { code: 'KeyC' }).defaultPrevented,
    ).toBe(true);

    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item = write.mock.calls[0]?.[0][0] as { data: Record<string, Promise<Blob>> };
    expect(Object.keys(item.data)).toEqual(['image/png']);
    await expect(item.data['image/png']).resolves.toBe(png);
    // The crop is in pixels of the original image: the marking rect.
    expect(crop).toHaveBeenCalledWith(expect.any(Blob), marking(s.harness, 'M2').rect);
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.cropDone')));
  });

  it('the crop warns when the image cannot be read', async () => {
    const { write } = mockClipboard(true);
    write.mockRejectedValue(new Error('refused'));
    const s = setup();
    vi.spyOn(s.harness.context.session, 'readImage').mockResolvedValue(null);
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.press('c', { ctrl: true, alt: true });
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.cropFailed')));
  });

  it('Ctrl+Alt+C with an image (or nothing) selected does nothing', () => {
    const { write } = mockClipboard(true);
    const s = setup();
    expect(s.press('c', { ctrl: true, alt: true }).defaultPrevented).toBe(false);
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    expect(s.press('c', { ctrl: true, alt: true }).defaultPrevented).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('if the clipboard refuses, warns that it did not copy', async () => {
    const { writeText } = mockClipboard();
    writeText.mockRejectedValue(new Error('denied'));
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.failed')));
  });
});

describe('useEditorShortcuts: multiple selection', () => {
  const two = [
    { kind: 'marking', id: 'M1' },
    { kind: 'marking', id: 'M2' },
  ] as const;

  it('Esc goes back to the main item and, again, clears the selection', () => {
    const s = setup();
    selectItems(s.harness.ui, two);
    s.press('Escape');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.harness.ui.selectionGroup.value).toBeNull();
    s.press('Escape');
    expect(s.harness.ui.selection.value).toBeNull();
  });

  it('Esc with a gesture in progress only cancels the gesture', () => {
    const s = setup();
    selectItems(s.harness.ui, two);
    s.canvas.cancelInteraction.mockReturnValueOnce(true);
    s.press('Escape');
    expect(s.harness.ui.selectionGroup.value).not.toBeNull();
  });

  it('Delete requests ONE deletion of the whole selection', () => {
    const s = setup();
    selectItems(s.harness.ui, [...two, { kind: 'image', id: 'I2' }]);
    s.press('Delete');
    expect(s.dialogs.requestDeleteItems).toHaveBeenCalledTimes(1);
    expect(s.dialogs.requestDeleteItems.mock.calls[0]?.[0]).toHaveLength(3);
    expect(s.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });

  it('Alt+L locks all; with all locked, unlocks all (one undo entry)', () => {
    const s = setup();
    s.harness.actions.setMarkingLocked('M1', true);
    selectItems(s.harness.ui, two);
    s.press('l', { alt: true });
    expect(marking(s.harness, 'M1').locked).toBe(true);
    expect(marking(s.harness, 'M2').locked).toBe(true);
    s.press('l', { alt: true });
    expect(marking(s.harness, 'M1').locked).toBe(false);
    expect(marking(s.harness, 'M2').locked).toBe(false);
    s.harness.store.undo();
    expect(marking(s.harness, 'M2').locked).toBe(true);
  });

  it('read-only: Delete and Alt+L do nothing', () => {
    const s = setup({ readOnly: true });
    selectItems(s.harness.ui, two);
    s.press('Delete');
    s.press('l', { alt: true });
    expect(s.dialogs.requestDeleteItems).not.toHaveBeenCalled();
    expect(marking(s.harness, 'M1').locked).toBe(false);
  });
});

describe('useEditorShortcuts: Wrap (Ctrl/Cmd+G)', () => {
  const ids = (h: Harness) => h.project().markings.map((m) => m.id);
  const created = (h: Harness) =>
    h.project().markings.find((m) => !'M1M2M3M4'.includes(m.id));

  it('with a single item, wraps and leaves the new one selected; Ctrl+Z undoes', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    const event = s.press('g', { ctrl: true });
    expect(event.defaultPrevented).toBe(true);
    const wrap = created(s.harness);
    expect(wrap).toBeDefined();
    expect(marking(s.harness, 'M4').parentId).toBe(wrap?.id);
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: wrap?.id });
    s.press('z', { ctrl: true });
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('with three items, wraps the three in a single entry (Cmd+G also works)', () => {
    const s = setup();
    selectItems(s.harness.ui, [
      { kind: 'marking', id: 'M1' },
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M3' },
    ]);
    s.press('g', { meta: true });
    const wrap = created(s.harness);
    expect(wrap?.containerId).toBe('I1');
    for (const id of ['M1']) expect(marking(s.harness, id).parentId).toBe(wrap?.id);
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: wrap?.id });
    s.press('z', { ctrl: true });
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('does not act, and does not call preventDefault, without a selection', () => {
    const s = setup();
    expect(s.press('g', { ctrl: true }).defaultPrevented).toBe(false);
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('does not act with focus in a text field', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    const input = document.createElement('input');
    document.body.append(input);
    expect(pressOn(input, 'g', { ctrl: true }).defaultPrevented).toBe(false);
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('does not act with a read-only project', () => {
    const s = setup({ readOnly: true });
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    expect(s.press('g', { ctrl: true }).defaultPrevented).toBe(false);
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('does not act when nothing of the selection qualifies (only a note or an arrow)', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'arrow', id: 'none' }]);
    expect(s.press('g', { ctrl: true }).defaultPrevented).toBe(false);
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('does not act with the shortcut turned off (narrow window)', () => {
    const s = setup({ enabled: false });
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    expect(s.press('g', { ctrl: true }).defaultPrevented).toBe(false);
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('holding Ctrl+G (repeated key) wraps only once, without nesting parents', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    s.press('g', { ctrl: true });
    const wrap = created(s.harness);
    expect(wrap).toBeDefined();
    const repeated = s.press('g', { ctrl: true }, { repeat: true });
    s.press('g', { ctrl: true }, { repeat: true });
    // The browser "find next" stays out of the way; the shortcut just does not act.
    expect(repeated.defaultPrevented).toBe(true);
    expect(s.harness.project().markings).toHaveLength(5);
    expect(marking(s.harness, wrap?.id ?? '').parentId).toBeNull();
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: wrap?.id });
    // A single undo entry.
    s.press('z', { ctrl: true });
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('with a drag or resize in progress, does not act or show the notice', () => {
    const s = setup();
    selectItems(s.harness.ui, [{ kind: 'marking', id: 'M4' }]);
    s.canvas.isInteracting.mockReturnValue(true);
    s.press('g', { ctrl: true });
    expect(ids(s.harness)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(s.harness.ui.toast.value).toBeNull();
    s.canvas.isInteracting.mockReturnValue(false);
    s.press('g', { ctrl: true });
    expect(created(s.harness)).toBeDefined();
  });
});
