import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPONENT_DRAG_MIME, draggedComponent } from '../../src/app/componentDrag';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// B3/P7: a paleta da Biblioteca (paleta de componentes).

beforeEach(() => {
  locale.value = 'pt-BR';
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
    name: t('library.addType', { name }),
  });

describe('paleta da Biblioteca', () => {
  it('lista os tipos por especialização e camada, com selo de container e tamanho', async () => {
    const harness = await libraryHarness();
    renderLibrary(harness);
    const group = screen.getByRole('region', { name: 'Material Design 3 (baseline)' });
    expect(within(group).getByText('Componentes')).toBeTruthy();
    expect(within(group).getAllByRole('listitem')).toHaveLength(15);

    const button = within(group).getByText('Button').closest('li') as HTMLElement;
    expect(within(button).getByText('120 × 40')).toBeTruthy();
    expect(within(button).queryByText(t('library.container'))).toBeNull();

    const column = within(group).getByText('Column').closest('li') as HTMLElement;
    expect(within(column).getByText(t('library.container'))).toBeTruthy();
    expect(within(column).getByText('380 × 200')).toBeTruthy();
  });

  it('Adicionar põe o componente no centro da tela à vista e o seleciona', async () => {
    const harness = await libraryHarness();
    const { user } = renderLibrary(harness);
    const before = harness.project().markings.length;
    await user.click(addButton('Button'));

    const project = harness.project();
    expect(project.markings).toHaveLength(before + 1);
    const created = project.markings.at(-1);
    expect(created?.containerId).toBe('I1');
    expect(created?.parentId).toBeNull();
    // O ponto do viewport (200, 150 do canvas da I1, escala 0,25) cai em (800, 600) da imagem.
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
    // A anotação tipada que desenha a marcação.
    expect(project.annotations.find((a) => a.markingId === created?.id)?.type).toEqual({
      specId: 'material3',
      typeId: 'm3-button',
    });
  });

  it('com um container selecionado, o componente novo entra nele', async () => {
    const harness = await libraryHarness();
    const { user } = renderLibrary(harness);
    await user.click(addButton('Column'));
    const column = harness.project().markings.at(-1);
    expect(column?.parentId).toBeNull();
    // O container recém-criado está selecionado.
    await user.click(addButton('Button'));
    const button = harness.project().markings.at(-1);
    expect(button?.id).not.toBe(column?.id);
    expect(button?.parentId).toBe(column?.id);
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: button?.id });
  });

  it('com seleção numa imagem que não é a do centro, vai para a selecionada, centrada nela', async () => {
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

  it('com seleção na imagem do centro, o componente nasce no centro da vista', async () => {
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

  it('sem seleção, usa a imagem do centro da vista', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = null;
    const { user } = renderLibrary(harness);
    await user.click(addButton('Button'));
    expect(harness.project().markings.at(-1)?.containerId).toBe('I1');
  });

  it('sem tela sob o centro nem seleção, Adicionar cria no canvas e o rótulo diz o destino', async () => {
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

  it('o rótulo mostra a tela de destino quando há container sob o centro', async () => {
    const harness = await libraryHarness();
    harness.ui.selection.value = null;
    renderLibrary(harness);
    const image = harness.project().containers.find((i) => i.id === 'I1');
    expect(addButton('Button').textContent).toBe(
      t('library.addToScreen', { name: image?.name ?? image?.file ?? '' }),
    );
  });

  it('seleção numa marcação do canvas sem slot: adiciona no canvas', async () => {
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

  it('com a tela do centro fora de vista, a imagem selecionada serve (sem centro)', async () => {
    const harness = await libraryHarness();
    harness.canvas.viewportCenter.mockReturnValue({ x: -5000, y: -5000 });
    harness.ui.selection.value = { kind: 'image', id: 'I2' };
    const { user } = renderLibrary(harness);
    const button = addButton('Button');
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(harness.project().markings.at(-1)?.containerId).toBe('I2');
  });

  it('somente leitura: desabilitado', async () => {
    const harness = await libraryHarness({ readOnly: true });
    renderLibrary(harness);
    const button = addButton('Button');
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(t('library.readOnly'));
  });

  it('erro da action aparece como alerta', async () => {
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

  it('sem biblioteca com componentes: estado vazio com atalho para as Especializações', async () => {
    const harness = await libraryHarness({ apply: false });
    const { user, onOpenSpecs } = renderLibrary(harness);
    expect(screen.getByText(t('library.empty'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('library.openSpecs') }));
    expect(onOpenSpecs).toHaveBeenCalledOnce();
  });
});

describe('arrastar da paleta', () => {
  const li = (name: string) =>
    screen
      .getByText(name, { selector: '.library-type-name' })
      .closest('li') as HTMLElement;

  it('o item é arrastável e grava o MIME e o tipo em arrasto', async () => {
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

  it('somente leitura: o item não arrasta', async () => {
    const harness = await libraryHarness({ readOnly: true });
    renderLibrary(harness);
    expect(li('Button').getAttribute('draggable')).toBe('false');
  });
});
