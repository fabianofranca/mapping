import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createArrow, createMarking, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { selectItems, selectedItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Etapa Envolver (EV1, decisão 3): a entrada "Envolver" no menu de contexto do canvas e no ⋯ da
// linha da Árvore, com a seleção atual (ou só o item da linha, se ele estiver fora dela).

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(cleanup);

/** O projeto de exemplo mais uma nota (marcação flutuante do canvas) e uma seta. */
function projectWithNote(): Project {
  let p = sampleProject();
  p = createMarking(p, {
    id: 'F1',
    containerId: null,
    name: 'Lembrete',
    floating: true,
    rect: { x: 50000, y: 50000, width: 300, height: 200 },
  });
  return createArrow(p, { id: 'S1', from: 'M1', to: 'M4' });
}

const wrapItem = () => screen.queryByRole('menuitem', { name: t('multi.wrap') });
const newMarking = (h: Harness) =>
  h.project().markings.find((m) => !['M1', 'M2', 'M3', 'M4', 'F1'].includes(m.id));
const parentOf = (h: Harness, id: string) =>
  h.project().markings.find((m) => m.id === id)?.parentId;

const containerParent = (h: Harness, id: string) =>
  h.project().containers.find((c) => c.id === id)?.parentId;

function renderMenu(harness: Harness) {
  return render(
    <EditorContext.Provider value={harness.context}>
      <CanvasContextMenu />
    </EditorContext.Provider>,
  );
}

function openCanvasMenu(harness: Harness, kind: 'i' | 'm' | 'arrow', id: string) {
  act(() => {
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind, id } };
  });
}

describe('Envolver no menu de contexto do canvas', () => {
  it('com o alvo dentro de uma seleção de 3, envolve os 3 e seleciona a nova', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M3' },
      { kind: 'marking', id: 'M4' },
    ]);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M3');
    await userEvent.click(await screen.findByRole('menuitem', { name: t('multi.wrap') }));

    const wrap = newMarking(harness);
    expect(wrap).toBeDefined();
    // M4 é de outro container: a marcação nova é do canvas e os dois containers são filhos dela.
    expect(wrap?.containerId).toBeNull();
    for (const id of ['I1', 'I2']) expect(containerParent(harness, id)).toBe(wrap?.id);
    expect(selectedItems(harness.ui)).toEqual([{ kind: 'marking', id: wrap?.id }]);
    expect(harness.ui.canvasMenu.value).toBeNull();
    harness.store.undo();
    expect(newMarking(harness)).toBeUndefined();
  });

  it('sobre um item só, envolve só ele', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [{ kind: 'marking', id: 'M4' }]);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    await userEvent.click(await screen.findByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(parentOf(harness, 'M4')).toBe(wrap?.id);
    expect(parentOf(harness, 'M1')).not.toBe(wrap?.id);
  });

  it('a entrada mostra o atalho Ctrl+G', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    const item = await screen.findByRole('menuitem', { name: t('multi.wrap') });
    expect(item.textContent).toContain('Ctrl+G');
    expect(item.getAttribute('aria-keyshortcuts')).toBe('Control+G');
  });

  it('alvo nota: a entrada fica desabilitada, com a dica', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'F1');
    const item = (await screen.findByRole('menuitem', {
      name: t('multi.wrap'),
    })) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe(t('multi.wrapBlocked'));
  });

  it('alvo seta: sem a entrada', async () => {
    const harness = createHarness(projectWithNote());
    renderMenu(harness);
    openCanvasMenu(harness, 'arrow', 'S1');
    await screen.findByRole('menu');
    expect(wrapItem()).toBeNull();
  });

  it('somente leitura: sem a entrada', async () => {
    const harness = createHarness(projectWithNote(), true);
    renderMenu(harness);
    openCanvasMenu(harness, 'm', 'M4');
    await screen.findByRole('menu');
    expect(wrapItem()).toBeNull();
  });
});

describe('Envolver no ⋯ da linha da Árvore', () => {
  function renderTree(harness: Harness) {
    renderLive(harness, (p) => (
      <MarkingTree project={p} selection={null} onSelect={() => undefined} />
    ));
  }
  const openRow = async (name: string) => {
    await userEvent.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name }) }),
    );
    return screen.getByRole('menu');
  };

  it('item na seleção: envolve a seleção inteira', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M4' },
    ]);
    renderTree(harness);
    const menu = await openRow('Maçaneta');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    // Containers diferentes: a nova é do canvas.
    expect(wrap?.containerId).toBeNull();
    for (const id of ['I1', 'I2']) expect(containerParent(harness, id)).toBe(wrap?.id);
    expect(selectedItems(harness.ui)).toEqual([{ kind: 'marking', id: wrap?.id }]);
  });

  it('item fora da seleção: envolve só o item da linha', async () => {
    const harness = createHarness(projectWithNote());
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M1' },
      { kind: 'marking', id: 'M2' },
    ]);
    renderTree(harness);
    const menu = await openRow('Fechadura');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(parentOf(harness, 'M3')).toBe(wrap?.id);
    expect(parentOf(harness, 'M1')).not.toBe(wrap?.id);
  });

  it('a imagem (container) também pode ser envolvida', async () => {
    const harness = createHarness(projectWithNote());
    renderTree(harness);
    const menu = await openRow('images/frente.jpg');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    const wrap = newMarking(harness);
    expect(wrap?.containerId).toBeNull();
    expect(harness.project().containers.find((c) => c.id === 'I2')?.parentId).toBe(
      wrap?.id,
    );
  });

  it('linha de nota: a entrada fica desabilitada, com a dica e o atalho', async () => {
    const harness = createHarness(projectWithNote());
    renderTree(harness);
    const menu = await openRow('Lembrete');
    const item = within(menu).getByRole('menuitem', {
      name: t('multi.wrap'),
    }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe(t('multi.wrapBlocked'));
    expect(item.textContent).toContain('Ctrl+G');
  });

  it('somente leitura: sem a entrada', async () => {
    const harness = createHarness(projectWithNote(), true);
    renderTree(harness);
    const menu = await openRow('Porta');
    expect(within(menu).queryByRole('menuitem', { name: t('multi.wrap') })).toBeNull();
  });
});
