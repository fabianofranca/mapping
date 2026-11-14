import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { t } from '../../src/i18n';
import { modelMessage, rawMessage, siblingPosition } from '../../src/model';
import { locale } from '../../src/store/settings';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { arrangeHintKey } from '../../src/ui/arrange';
import { markingErrorMessage } from '../../src/ui/labels';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { libraryHarness, type LibraryHarness } from './libraryHarness';
import { renderLive } from './harness';

// B3/P7: Order field and Arrange (button, canvas menu and shortcut) in the marking Details.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

interface Scene {
  readonly harness: LibraryHarness;
  readonly column: string;
  readonly first: string;
  readonly second: string;
  /** A fixed-size leaf (no axis that depends on the content), outside the column. */
  readonly leaf: string;
}

const LONG_LABEL = 'A label much longer than the previous button';

/** A column (container) with two buttons inside and a FAB (fixed-size leaf) outside, in I1. */
async function scene(options: { readOnly?: boolean } = {}): Promise<Scene> {
  const harness = await libraryHarness();
  const add = (typeId: string, parentId: string | null) => {
    const result = harness.actions.addComponent({
      containerId: 'I1',
      parentId,
      specId: 'material3',
      typeId,
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const column = add('m3-column', null);
  const first = add('m3-button', column);
  const second = add('m3-button', column);
  const leaf = add('m3-fab', null);
  if (options.readOnly) harness.store.load(harness.project(), { readOnly: true });
  return { harness, column, first, second, leaf };
}

const rectOf = (harness: LibraryHarness, id: string) =>
  harness.project().markings.find((m) => m.id === id)!.rect;

/** Puts a long label on the button (the width `hug` now asks for another size). */
function lengthen(harness: LibraryHarness, markingId: string): void {
  const annotation = harness
    .project()
    .annotations.find((a) => a.markingId === markingId)!;
  const result = harness.actions.setFieldValue(annotation.id, 'label', LONG_LABEL);
  if (!result.ok) throw new Error(result.error);
}

function renderPanel(harness: LibraryHarness, markingId: string) {
  renderLive(harness, (project) => {
    const marking = project.markings.find((m) => m.id === markingId);
    const image = project.containers.find((i) => i.id === marking?.containerId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={harness.store.locked.value}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const position = (harness: LibraryHarness, id: string) =>
  siblingPosition(harness.project(), id);

describe('Details: Order field', () => {
  it('shows "N of M" and moves backward and forward', async () => {
    const { harness, second, first } = await scene();
    const user = renderPanel(harness, second);
    expect(screen.getByText('2 of 2')).toBeTruthy();
    const back = screen.getByRole<HTMLButtonElement>('button', {
      name: t('marking.orderBack'),
    });
    const front = screen.getByRole<HTMLButtonElement>('button', {
      name: t('marking.orderFront'),
    });
    expect(front.disabled).toBe(true);
    expect(back.disabled).toBe(false);

    await user.click(back);
    expect(position(harness, second)).toEqual({ index: 0, count: 2 });
    expect(position(harness, first)).toEqual({ index: 1, count: 2 });
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(back.disabled).toBe(true);
    expect(front.disabled).toBe(false);

    await user.click(front);
    expect(position(harness, second)).toEqual({ index: 1, count: 2 });
    // One undo entry per click.
    harness.store.undo();
    expect(position(harness, second)).toEqual({ index: 0, count: 2 });
  });

  it('read-only: both buttons are disabled', async () => {
    const { harness, first } = await scene({ readOnly: true });
    renderPanel(harness, first);
    for (const name of [t('marking.orderBack'), t('marking.orderFront')]) {
      expect(screen.getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(true);
    }
  });
});

describe('Arrange', () => {
  it('the button only shows on a container that can be arranged and announces the result', async () => {
    const { harness, column, first } = await scene();
    // Moves the button out of place so there is something to arrange.
    harness.actions.moveMarking(first, 3, 3);
    const user = renderPanel(harness, column);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.done'));

    // Already arranged: nothing changes.
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.nothing'));
  });

  it('a leaf without an adjustable axis has no button', async () => {
    const { harness, leaf } = await scene();
    renderPanel(harness, leaf);
    expect(
      screen.queryByRole('button', { name: new RegExp(t('arrange.action')) }),
    ).toBeNull();
  });

  it('a marking without a slot with an adjustable axis (button with hug width) has the button and adjusts in a single entry (MC3)', async () => {
    const { harness, first } = await scene();
    lengthen(harness, first);
    const grown = rectOf(harness, first);
    const user = renderPanel(harness, first);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
    const fitted = rectOf(harness, first);
    expect(fitted.width).toBeGreaterThan(grown.width);
    expect(fitted).toMatchObject({ x: grown.x, y: grown.y, height: grown.height });
    // Ctrl+Z undoes the whole adjustment, in a single entry.
    harness.store.undo();
    expect(rectOf(harness, first)).toEqual(grown);
    // Adjusted again: "nothing to arrange".
    harness.store.redo();
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.nothing'));
  });

  it('the button hint says what it does: arranges the inner ones or fits to the content', async () => {
    const { harness, column, first } = await scene();
    expect(arrangeHintKey(harness.context, column)).toBe('arrange.hint');
    expect(arrangeHintKey(harness.context, first)).toBe('arrange.hintFit');
    expect(t('arrange.hintFit')).not.toBe('arrange.hintFit');
  });

  it('a marking without an adjustable axis refuses with not-fittable and the message of the new key', async () => {
    const { harness, leaf } = await scene();
    expect(harness.actions.arrange(leaf)).toEqual({ ok: false, error: 'not-fittable' });
    expect(t('marking.error.not-fittable')).not.toBe('marking.error.not-fittable');
    expect(markingErrorMessage('not-fittable')).toBe(t('marking.error.not-fittable'));
    locale.value = 'en-US';
    expect(markingErrorMessage('not-fittable')).toBe(t('marking.error.not-fittable'));
    expect(t('marking.error.not-fittable')).toMatch(/content|fit/i);
  });

  it('read-only: disabled', async () => {
    const { harness, column } = await scene({ readOnly: true });
    renderPanel(harness, column);
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: new RegExp(t('arrange.action')),
      }).disabled,
    ).toBe(true);
  });

  it('with warnings, counts and shows the first', async () => {
    const { harness, column } = await scene();
    vi.spyOn(harness.actions, 'arrange').mockReturnValue({
      ok: true,
      value: [rawMessage('does not fit'), rawMessage('other')],
    });
    const user = renderPanel(harness, column);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(
      t('arrange.doneWarnings', { count: 2, first: 'does not fit' }),
    );
  });

  it('in en-US the Arrange warning comes out in English (#945)', async () => {
    const { harness, column } = await scene();
    vi.spyOn(harness.actions, 'arrange').mockReturnValue({
      ok: true,
      value: [
        modelMessage(
          'arrange.overflow',
          { label: 'Column' },
          'Column: content is larger than the container',
        ),
      ],
    });
    locale.value = 'en-US';
    const user = renderPanel(harness, column);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(String(harness.ui.toast.value)).toBe(
      t('arrange.doneWarnings', {
        count: 1,
        first: 'Column: content is larger than the container',
      }),
    );
  });

  it('the canvas menu offers Arrange on the container', async () => {
    const { harness, column, first } = await scene();
    harness.actions.moveMarking(first, 3, 3);
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    const user = userEvent.setup();
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: column } };
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: t('arrange.action') }));
    expect(harness.ui.canvasMenu.value).toBeNull();
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
  });

  it('the canvas menu of a leaf without an adjustable axis does not offer Arrange', async () => {
    const { harness, leaf } = await scene();
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: leaf } };
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: t('arrange.action') }),
    ).toBeNull();
  });

  it('the canvas menu offers Arrange on the marking without a slot with an adjustable axis (MC3)', async () => {
    const { harness, first } = await scene();
    lengthen(harness, first);
    const grown = rectOf(harness, first);
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    const user = userEvent.setup();
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: first } };
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: t('arrange.action') }));
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
    expect(rectOf(harness, first).width).toBeGreaterThan(grown.width);
  });
});

describe('Arrange: Alt+Shift+A shortcut', () => {
  function Probe() {
    useEditorShortcuts(
      { current: null, show: vi.fn(), close: vi.fn() } as unknown as EditorDialogs,
      { exportProject: vi.fn(), closeProject: vi.fn() } as unknown as ProjectCommands,
    );
    return null;
  }
  const press = () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'A',
        code: 'KeyA',
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

  it('arranges the selected container and announces it', async () => {
    const { harness, column, first } = await scene();
    harness.actions.moveMarking(first, 3, 3);
    harness.ui.selection.value = { kind: 'marking', id: column };
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe />
      </EditorContext.Provider>,
    );
    const before = harness.project().markings.find((m) => m.id === first)?.rect;
    press();
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
    expect(harness.project().markings.find((m) => m.id === first)?.rect).not.toEqual(
      before,
    );
  });

  it('fits the marking without a slot with an adjustable axis to the content (MC3)', async () => {
    const { harness, first } = await scene();
    lengthen(harness, first);
    const grown = rectOf(harness, first);
    harness.ui.selection.value = { kind: 'marking', id: first };
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe />
      </EditorContext.Provider>,
    );
    press();
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
    expect(rectOf(harness, first).width).toBeGreaterThan(grown.width);
  });

  it('on a leaf without an adjustable axis or in read-only does nothing', async () => {
    const { harness, leaf } = await scene();
    harness.ui.selection.value = { kind: 'marking', id: leaf };
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe />
      </EditorContext.Provider>,
    );
    press();
    expect(harness.ui.toast.value).toBeNull();
  });
});
