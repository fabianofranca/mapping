import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { createArrow, projectIndex, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { pagesProject } from '../store/pageHarness';
import { createHarness, type Harness } from './harness';

// "Move to page" in the right-click menu and in the Details of a root (stage #883, PG2, decision
// 11): the list of the OTHER pages, the same store action, and the refusal dialog with
// "Go to the arrow" (decision 12 navigation).

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

function DialogsHost() {
  const dialogs = useEditorDialogs();
  return <EditorDialogs dialogs={dialogs} />;
}

function setup(project: Project = pagesProject()) {
  const harness = createHarness(project);
  const center = vi.fn();
  harness.context.canvas.current = {
    centerSelection: center,
  } as unknown as CanvasController;
  return { harness, center };
}

function renderMenu(harness: Harness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <CanvasContextMenu />
      <DialogsHost />
    </EditorContext.Provider>,
  );
}

function openMenu(harness: Harness, kind: 'i' | 'm', id: string) {
  act(() => {
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind, id } };
  });
}

const pageOf = (harness: Harness, id: string) =>
  projectIndex(harness.project()).pageOf.get(id);
const moveItem = () => screen.getByRole('menuitem', { name: 'Move to page' });
const moveItemOrNull = () => screen.queryByRole('menuitem', { name: 'Move to page' });
const submenu = () => screen.getByRole('menu', { name: 'Move to page' });

describe('right-click menu: Move to page', () => {
  it('a container root lists the OTHER pages and moves it on click', () => {
    const { harness } = setup();
    renderMenu(harness);
    openMenu(harness, 'i', 'I1');
    const item = moveItem();
    expect(item.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(item);
    const items = within(submenu()).getAllByRole('menuitem');
    expect(items.map((b) => b.textContent)).toEqual(['Page 2', 'Page 3']);
    fireEvent.click(items[1] as HTMLElement);
    expect(pageOf(harness, 'I1')).toBe('PG3');
    expect(harness.ui.canvasMenu.value).toBeNull();
    // The app stays on the source page; the store tells the notice.
    expect(harness.context.session.page.id.value).toBe('PG1');
    expect(harness.context.session.page.notice.value).toEqual({
      kind: 'moved',
      pageId: 'PG3',
      name: 'Page 3',
    });
  });

  it('a canvas marking (floating root) moves too, from any open page', () => {
    const { harness } = setup();
    renderMenu(harness);
    openMenu(harness, 'm', 'K');
    fireEvent.click(moveItem());
    const items = within(submenu()).getAllByRole('menuitem');
    expect(items.map((b) => b.textContent)).toEqual(['Page 1', 'Page 3']);
    fireEvent.click(items[0] as HTMLElement);
    expect(pageOf(harness, 'K')).toBe('PG1');
  });

  it('the item is absent for a marking that is not a root', () => {
    const { harness } = setup();
    renderMenu(harness);
    openMenu(harness, 'm', 'M1');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(moveItemOrNull()).toBeNull();
  });

  it('a selection moves only its roots; non-root items are ignored', () => {
    const { harness } = setup();
    renderMenu(harness);
    act(() => {
      selectItems(harness.ui, [
        { kind: 'image', id: 'I1' },
        { kind: 'marking', id: 'M4' },
        { kind: 'image', id: 'I2' },
      ]);
    });
    openMenu(harness, 'i', 'I2');
    fireEvent.click(moveItem());
    fireEvent.click(within(submenu()).getByRole('menuitem', { name: 'Page 3' }));
    expect(pageOf(harness, 'I1')).toBe('PG3');
    expect(pageOf(harness, 'I2')).toBe('PG3');
    expect(pageOf(harness, 'M4')).toBe('PG3');
  });

  it('a selection with no root at all does not show the item', () => {
    const { harness } = setup();
    renderMenu(harness);
    act(() => {
      selectItems(harness.ui, [
        { kind: 'marking', id: 'M1' },
        { kind: 'marking', id: 'M4' },
      ]);
    });
    openMenu(harness, 'm', 'M1');
    expect(moveItemOrNull()).toBeNull();
  });

  it('with a single page the item is disabled and says there is no other page', () => {
    const { harness } = setup(sampleProject());
    renderMenu(harness);
    openMenu(harness, 'i', 'I1');
    const item = moveItem() as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    const hint = screen.getByText('There is no other page');
    expect(item.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('read-only: the item is disabled', () => {
    const harness = createHarness(pagesProject(), true);
    renderMenu(harness);
    openMenu(harness, 'i', 'I1');
    expect((moveItem() as HTMLButtonElement).disabled).toBe(true);
  });

  it('→ opens the submenu and ← closes it', () => {
    const { harness } = setup();
    renderMenu(harness);
    openMenu(harness, 'i', 'I1');
    const item = moveItem();
    item.focus();
    fireEvent.keyDown(item, { key: 'ArrowRight' });
    const first = within(submenu()).getAllByRole('menuitem')[0] as HTMLElement;
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'Move to page' })).toBeNull();
    expect(document.activeElement).toBe(item);
  });
});

describe('refusal: an arrow in the way', () => {
  function withArrow() {
    const s = setup(createArrow(pagesProject(), { id: 'R1', from: 'M1', to: 'M4' }));
    return s;
  }

  it('nothing moves and the dialog lists the arrow', () => {
    const { harness } = withArrow();
    renderMenu(harness);
    openMenu(harness, 'i', 'I2');
    fireEvent.click(moveItem());
    fireEvent.click(within(submenu()).getByRole('menuitem', { name: 'Page 2' }));
    expect(pageOf(harness, 'I2')).toBe('PG1');
    const dialog = screen.getByRole('alertdialog', {
      name: 'The move would cut arrows',
    });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
    expect(harness.context.session.page.notice.value).toBeNull();
  });

  it('"Go to the arrow" switches to the arrow page, selects it and frames it', async () => {
    const { harness, center } = withArrow();
    renderMenu(harness);
    openMenu(harness, 'i', 'I2');
    fireEvent.click(moveItem());
    fireEvent.click(within(submenu()).getByRole('menuitem', { name: 'Page 2' }));
    // The user wanders to another page before using the button.
    act(() => void harness.context.session.page.open('PG3'));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to the arrow' }));
    expect(harness.context.session.page.id.value).toBe('PG1');
    expect(harness.ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
    expect(center).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Details: Move to page', () => {
  function renderContainer(harness: Harness, id: string) {
    render(
      <EditorContext.Provider value={harness.context}>
        <SelectionPanel
          image={harness.project().containers.find((c) => c.id === id) ?? null}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
        <DialogsHost />
      </EditorContext.Provider>,
    );
  }

  function renderMarking(harness: Harness, id: string) {
    const marking = harness.project().markings.find((m) => m.id === id);
    if (!marking) throw new Error('no marking');
    render(
      <EditorContext.Provider value={harness.context}>
        <MarkingPanel
          project={harness.project()}
          marking={marking}
          image={harness.project().containers.find((c) => c.id === marking.containerId) ?? null}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
        <DialogsHost />
      </EditorContext.Provider>,
    );
  }

  it('a container root: the control lists the other pages and moves it', async () => {
    const { harness } = setup();
    renderContainer(harness, 'I1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Move to page' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((b) => b.textContent)).toEqual(['Page 2', 'Page 3']);
    await user.click(items[0] as HTMLElement);
    expect(pageOf(harness, 'I1')).toBe('PG2');
    expect(harness.context.session.page.notice.value?.kind).toBe('moved');
  });

  it('a canvas marking that is a root has the control', async () => {
    const { harness } = setup();
    renderMarking(harness, 'K');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Move to page' }));
    await user.click(screen.getByRole('menuitem', { name: 'Page 3' }));
    expect(pageOf(harness, 'K')).toBe('PG3');
  });

  it('a marking inside a container has no control', () => {
    const { harness } = setup();
    renderMarking(harness, 'M1');
    expect(screen.queryByRole('button', { name: 'Move to page' })).toBeNull();
  });

  it('with a single page the control is disabled with the hint', () => {
    const { harness } = setup(sampleProject());
    renderContainer(harness, 'I1');
    const button = screen.getByRole('button', { name: 'Move to page' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('There is no other page')).toBeTruthy();
  });

  it('read-only: the control is disabled', () => {
    const harness = createHarness(pagesProject(), true);
    render(
      <EditorContext.Provider value={harness.context}>
        <SelectionPanel
          image={harness.project().containers[0] ?? null}
          display={undefined}
          readOnly
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      </EditorContext.Provider>,
    );
    expect(
      (screen.getByRole('button', { name: 'Move to page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('an arrow in the way opens the refusal dialog', async () => {
    const { harness } = setup(
      createArrow(pagesProject(), { id: 'R1', from: 'M1', to: 'M4' }),
    );
    renderContainer(harness, 'I2');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Move to page' }));
    await user.click(screen.getByRole('menuitem', { name: 'Page 2' }));
    expect(pageOf(harness, 'I2')).toBe('PG1');
    expect(screen.getByRole('alertdialog', { name: 'The move would cut arrows' })).toBeTruthy();
  });
});
