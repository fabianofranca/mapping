import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPONENT_DRAG_MIME, draggedComponent } from '../../src/app/componentDrag';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { libraryHarness, type LibraryHarness } from './libraryHarness';
import { notesHarness } from './notesHarness';

// B3/P7: the Library palette (components palette).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function renderLibrary(harness: LibraryHarness, onOpenSpecs = vi.fn()) {
  render(
    <EditorContext.Provider value={harness.context}>
      <LibraryPalette onOpenSpecs={onOpenSpecs} />
    </EditorContext.Provider>,
  );
  return { user: userEvent.setup(), onOpenSpecs };
}

const addButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', {
    name: new RegExp(`^${t('library.add')}.*: ${name}$`),
  });

describe('Library palette', () => {
  it('lists the types by specialization and layer, with the container icon and without size', async () => {
    const harness = await libraryHarness();
    renderLibrary(harness);
    const group = screen.getByRole('region', { name: 'Material Design 3 (baseline)' });
    // pt-BR kept: layer name of the shared library data (libraries/material3-compose)
    expect(within(group).getByText('Componentes')).toBeTruthy();
    expect(within(group).getAllByRole('listitem')).toHaveLength(15);

    const button = within(group).getByText('Button').closest('li') as HTMLElement;
    expect(within(button).queryByText('120 × 40')).toBeNull();
    expect(
      within(button).queryByRole('img', { name: t('library.container') }),
    ).toBeNull();

    const column = within(group).getByText('Column').closest('li') as HTMLElement;
    expect(
      within(column).getByRole('img', { name: t('library.container') }),
    ).toBeTruthy();
    expect(column.querySelector('.badge')).toBeNull();
    expect(within(column).queryByText('380 × 200')).toBeNull();
    expect(group.textContent).not.toMatch(/\d+ × \d+/);
  });

  it('Add puts the component at the center of the visible screen and selects it', async () => {
    const harness = await libraryHarness();
    const { user } = renderLibrary(harness);
    const before = harness.project().markings.length;
    await user.click(addButton('Button'));

    const project = harness.project();
    expect(project.markings).toHaveLength(before + 1);
    const created = project.markings.at(-1);
    expect(created?.containerId).toBe('I1');
    expect(created?.parentId).toBeNull();
    // The viewport point (200, 150 of I1's canvas, scale 0.25) falls at (800, 600) of the image.
    const image = project.containers.find((i) => i.id === 'I1');
    const scale = image?.placement.scale ?? 1;
    expect((created?.rect.x ?? 0) + (created?.rect.width ?? 0) / 2).toBeCloseTo(
      200 / scale,
      -1,
    );
    expect((created?.rect.y ?? 0) + (created?.rect.height ?? 0) / 2).toBeCloseTo(
      150 / scale,
      -1,
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
    // The typed annotation that draws the marking.
    expect(project.annotations.find((a) => a.markingId === created?.id)?.type).toEqual({
      specId: 'material3',
      typeId: 'm3-button',
    });
  });

  it('with a container selected, the new component goes into it', async () => {
    const harness = await libraryHarness();
    const { user } = renderLibrary(harness);
    await user.click(addButton('Column'));
    const column = harness.project().markings.at(-1);
    expect(column?.parentId).toBeNull();
    // The newly created container is selected.
    await user.click(addButton('Button'));
    const button = harness.project().markings.at(-1);
    expect(button?.id).not.toBe(column?.id);
    expect(button?.parentId).toBe(column?.id);
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: button?.id });
  });

  it('with a selection on an image that is not the center one, it goes to the selected one, centered on it', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = { kind: 'image', id: 'I2' };
    const { user } = renderLibrary(harness);
    await user.click(addButton('Button'));
    const created = harness.project().markings.at(-1);
    const image = harness.project().containers.find((i) => i.id === 'I2');
    expect(created?.containerId).toBe('I2');
    expect((created?.rect.x ?? 0) + (created?.rect.width ?? 0) / 2).toBeCloseTo(
      (image?.width ?? 0) / 2,
      -1,
    );
    expect((created?.rect.y ?? 0) + (created?.rect.height ?? 0) / 2).toBeCloseTo(
      (image?.height ?? 0) / 2,
      -1,
    );
    expect(harness.canvas.revealSelection).toHaveBeenCalledTimes(1);
  });

  it('with a selection on the center image, the component is born at the center of the view', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    const { user } = renderLibrary(harness);
    await user.click(addButton('Button'));
    const created = harness.project().markings.at(-1);
    const scale = harness.project().containers[0]?.placement.scale ?? 1;
    expect(created?.containerId).toBe('I1');
    expect((created?.rect.x ?? 0) + (created?.rect.width ?? 0) / 2).toBeCloseTo(
      200 / scale,
      -1,
    );
  });

  it('without a selection, it uses the image at the center of the view', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = null;
    const { user } = renderLibrary(harness);
    await user.click(addButton('Button'));
    expect(harness.project().markings.at(-1)?.containerId).toBe('I1');
  });

  it('with no screen under the center nor a selection, Add creates on the canvas and the label states the destination', async () => {
    const harness = await libraryHarness();
    harness.canvas.viewportCenter.mockReturnValue({ x: -5000, y: -5000 });
    harness.ui.selection.value = null;
    const { user } = renderLibrary(harness);
    const button = addButton('Button');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('library.addToCanvas'));
    await user.click(button);
    const created = harness.project().markings.at(-1);
    expect(created?.containerId).toBeNull();
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
  });

  it('the label shows the destination screen when there is a container under the center', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = null;
    renderLibrary(harness);
    const image = harness.project().containers.find((i) => i.id === 'I1');
    expect(addButton('Button').textContent).toBe(
      t('library.addToScreen', { name: image?.name ?? image?.file ?? '' }),
    );
  });

  it('selection on a canvas marking without a slot: adds on the canvas', async () => {
    const harness = await libraryHarness();
    const placed = harness.actions.createMarking(null, {
      x: -400,
      y: -400,
      width: 300,
      height: 200,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    harness.ui.selection.value = { kind: 'marking', id: placed.value };
    renderLibrary(harness);
    expect(addButton('Button').textContent).toBe(t('library.addToCanvas'));
  });

  it('with the center screen out of view, the selected image will do (no center)', async () => {
    const harness = await libraryHarness();
    harness.canvas.viewportCenter.mockReturnValue({ x: -5000, y: -5000 });
    harness.ui.selection.value = { kind: 'image', id: 'I2' };
    const { user } = renderLibrary(harness);
    const button = addButton('Button');
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(harness.project().markings.at(-1)?.containerId).toBe('I2');
  });

  it('read-only: disabled', async () => {
    const harness = await libraryHarness({ readOnly: true });
    renderLibrary(harness);
    const button = addButton('Button');
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(t('library.readOnly'));
  });

  it('action error appears as an alert', async () => {
    const harness = await libraryHarness();
    vi.spyOn(harness.actions, 'addComponent').mockReturnValue({
      ok: false,
      error: 'rect-out-of-image',
    });
    const { user } = renderLibrary(harness);
    await user.click(addButton('Button'));
    expect(screen.getByRole('alert').textContent).toBe(
      t('library.error.rect-out-of-image'),
    );
  });

  it('without a library with components: empty state with a shortcut to the Specializations', async () => {
    const harness = await libraryHarness({ apply: false });
    const { user, onOpenSpecs } = renderLibrary(harness);
    expect(screen.getByText(t('library.empty'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('library.openSpecs') }));
    expect(onOpenSpecs).toHaveBeenCalledOnce();
  });
});

describe('dragging from the palette', () => {
  const li = (name: string) =>
    screen
      .getByText(name, { selector: '.library-type-name' })
      .closest('li') as HTMLElement;

  it('the item is draggable and records the MIME and the type being dragged', async () => {
    const harness = await libraryHarness();
    Object.assign(harness.canvas, { setDropTarget: vi.fn() });
    renderLibrary(harness);
    const item = li('Button');
    expect(item.getAttribute('draggable')).toBe('true');
    const data = new Map<string, string>();
    const event = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: (k: string, v: string) => data.set(k, v),
        effectAllowed: 'none',
      },
    });
    item.dispatchEvent(event);
    expect(JSON.parse(data.get(COMPONENT_DRAG_MIME) ?? '{}')).toEqual({
      specId: 'material3',
      typeId: 'm3-button',
    });
    expect(draggedComponent()).toEqual({ specId: 'material3', typeId: 'm3-button' });
    item.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(draggedComponent()).toBeNull();
  });

  it('read-only: the item does not drag', async () => {
    const harness = await libraryHarness({ readOnly: true });
    renderLibrary(harness);
    expect(li('Button').getAttribute('draggable')).toBe('false');
  });
});

describe('Library palette: floating type (notes)', () => {
  it('the note row says "Add on the canvas" even with a container selected, and creates the floating one', async () => {
    const harness = await notesHarness();
    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    const { user } = renderLibrary(harness);
    // pt-BR kept: type name of the shared notes library data (libraries/notas)
    const note = addButton('Nota');
    expect(note.textContent).toBe(t('library.addToCanvas'));
    // The common type still points to the selected container.
    expect(addButton('Button').textContent).toBe(
      // pt-BR kept: shared fixture data asserted by tests/model, tests/components (file name in tests/model/fixtures.ts)
      t('library.addToScreen', { name: 'images/lateral.jpg' }),
    );

    const before = harness.project().markings.length;
    await user.click(note);
    const project = harness.project();
    expect(project.markings).toHaveLength(before + 1);
    const created = project.markings.at(-1);
    expect(created).toMatchObject({ floating: true, containerId: null, parentId: null });
    expect(project.annotations.find((a) => a.markingId === created?.id)?.type).toEqual({
      specId: 'notas',
      typeId: 'nota',
    });
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
  });
});
