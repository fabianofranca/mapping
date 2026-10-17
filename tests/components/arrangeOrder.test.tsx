import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { t } from '../../src/i18n';
import { siblingPosition } from '../../src/model';
import { locale } from '../../src/store/settings';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { libraryHarness, type LibraryHarness } from './libraryHarness';
import { renderLive } from './harness';

// B3/P7: campo Ordem e Arrumar (botão, menu do canvas e atalho) nos Detalhes da marcação.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

interface Scene {
  readonly harness: LibraryHarness;
  readonly column: string;
  readonly first: string;
  readonly second: string;
}

/** Uma coluna (container) com dois botões dentro, na I1. */
async function scene(options: { readOnly?: boolean } = {}): Promise<Scene> {
  const harness = await libraryHarness();
  const add = (typeId: string, parentId: string | null) => {
    const result = harness.actions.addComponent({
      imageId: 'I1',
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
  if (options.readOnly) harness.store.load(harness.project(), { readOnly: true });
  return { harness, column, first, second };
}

function renderPanel(harness: LibraryHarness, markingId: string) {
  renderLive(harness, (project) => {
    const marking = project.markings.find((m) => m.id === markingId);
    const image = project.images.find((i) => i.id === marking?.imageId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={harness.store.locked.value}
        onDelete={() => undefined}
        onSelectMarking={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const position = (harness: LibraryHarness, id: string) =>
  siblingPosition(harness.project(), id);

describe('Detalhes: campo Ordem', () => {
  it('mostra "N de M" e move para trás e para a frente', async () => {
    const { harness, second, first } = await scene();
    const user = renderPanel(harness, second);
    expect(screen.getByText('2 de 2')).toBeTruthy();
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
    expect(screen.getByText('1 de 2')).toBeTruthy();
    expect(back.disabled).toBe(true);
    expect(front.disabled).toBe(false);

    await user.click(front);
    expect(position(harness, second)).toEqual({ index: 1, count: 2 });
    // Uma entrada de desfazer por clique.
    harness.store.undo();
    expect(position(harness, second)).toEqual({ index: 0, count: 2 });
  });

  it('somente leitura: os dois botões ficam desabilitados', async () => {
    const { harness, first } = await scene({ readOnly: true });
    renderPanel(harness, first);
    for (const name of [t('marking.orderBack'), t('marking.orderFront')]) {
      expect(screen.getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(true);
    }
  });
});

describe('Arrumar', () => {
  it('o botão só aparece num container que dá para arrumar e avisa o resultado', async () => {
    const { harness, column, first } = await scene();
    // Tira o botão do lugar para ter o que arrumar.
    harness.actions.moveMarking(first, 3, 3);
    const user = renderPanel(harness, column);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.done'));

    // Já arrumado: nada muda.
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(t('arrange.nothing'));
  });

  it('uma folha não tem o botão', async () => {
    const { harness, first } = await scene();
    renderPanel(harness, first);
    expect(
      screen.queryByRole('button', { name: new RegExp(t('arrange.action')) }),
    ).toBeNull();
  });

  it('somente leitura: desabilitado', async () => {
    const { harness, column } = await scene({ readOnly: true });
    renderPanel(harness, column);
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: new RegExp(t('arrange.action')),
      }).disabled,
    ).toBe(true);
  });

  it('com avisos, conta e mostra o primeiro', async () => {
    const { harness, column } = await scene();
    vi.spyOn(harness.actions, 'arrange').mockReturnValue({
      ok: true,
      value: ['não cabe', 'outro'],
    });
    const user = renderPanel(harness, column);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t('arrange.action')) }),
    );
    expect(harness.ui.toast.value).toBe(
      t('arrange.doneWarnings', { count: 2, first: 'não cabe' }),
    );
  });

  it('o menu do canvas oferece Arrumar no container', async () => {
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

  it('o menu do canvas de uma folha não oferece Arrumar', async () => {
    const { harness, first } = await scene();
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: first } };
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: t('arrange.action') }),
    ).toBeNull();
  });
});

describe('Arrumar: atalho Alt+Shift+A', () => {
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

  it('arruma o container selecionado e avisa', async () => {
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

  it('numa folha ou em somente leitura não faz nada', async () => {
    const { harness, first } = await scene();
    harness.ui.selection.value = { kind: 'marking', id: first };
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe />
      </EditorContext.Provider>,
    );
    press();
    expect(harness.ui.toast.value).toBeNull();
  });
});
