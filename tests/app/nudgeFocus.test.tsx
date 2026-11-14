import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Stage "Frame the selection" (EQ1), hypothesis H1: with the Card selected, `Shift+arrow` only
// reaches the move shortcut when focus is on the canvas or on no control (`body`). In a Details
// field, in a cell of the Items table, in the Palette, in a menu or in a window, the arrows
// belong to the control. The targets mimic the structure of the `Editor`: the
// `<main data-canvas-area>` and the tool windows next to it, outside it.

function Probe({
  dialogs,
  commands,
}: {
  dialogs: EditorDialogs;
  commands: ProjectCommands;
}) {
  useEditorShortcuts(dialogs, commands, true);
  return null;
}

function setup() {
  const harness = createHarness(sampleProject());
  harness.context.canvas.current = {
    cancelInteraction: vi.fn(() => false),
    isInteracting: vi.fn(() => false),
    centerSelection: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
  } as unknown as CanvasController;
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
  } as unknown as EditorDialogs;
  const commands = {
    exportProject: vi.fn(() => Promise.resolve()),
    closeProject: () => Promise.resolve(),
  } as unknown as ProjectCommands;
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe dialogs={dialogs} commands={commands} />
    </EditorContext.Provider>,
  );
  harness.ui.selection.value = { kind: 'marking', id: 'M1' };
  return harness;
}

/** Targets as the `Editor` builds them: canvas, windows next to it and controls inside them. */
function buildDom() {
  const root = document.createElement('div');
  root.innerHTML = `
    <main data-canvas-area tabindex="-1"><div class="canvas-host" id="host"></div></main>
    <aside data-window="details">
      <input id="x" value="30" />
      <table><tr><td><input id="cell" value="A" /></td></tr></table>
      <label id="label">Position</label>
    </aside>
    <aside data-window="palette"><button id="add">Add to screen</button>
      <ul role="menu"><li role="menuitem" tabindex="0" id="menuitem">Item</li></ul></aside>
    <div role="dialog" id="dialog"><button id="ok">OK</button></div>`;
  document.body.append(root);
  const q = (id: string) => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(id);
    return el;
  };
  return q;
}

function shiftArrow(target: EventTarget, key = 'ArrowRight'): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  target.dispatchEvent(
    new KeyboardEvent('keyup', { key, shiftKey: true, bubbles: true }),
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('H1: Shift+arrow with the selection and the focus elsewhere', () => {
  const rectX = (h: ReturnType<typeof setup>) =>
    h.project().markings.find((m) => m.id === 'M1')?.rect.x;

  it.each([
    ['a Details field', 'x'],
    ['a cell of the Items table', 'cell'],
    ['the Palette button', 'add'],
    ['a menu item', 'menuitem'],
    ['the button of a window', 'ok'],
    ['the label (unfocusable) of a window', 'label'],
  ])('with the focus on %s the selection does not move', (_name, id) => {
    const h = setup();
    const q = buildDom();
    const before = rectX(h);
    shiftArrow(q(id));
    expect(rectX(h)).toBe(before);
  });

  it('with the focus on the canvas, and on the body (no control), it moves 10 px: the documented behavior', () => {
    const h = setup();
    const q = buildDom();
    const before = rectX(h) ?? 0;
    shiftArrow(q('host'));
    expect(rectX(h)).toBe(before + 10);
    shiftArrow(document.body);
    expect(rectX(h)).toBe(before + 20);
  });
});
