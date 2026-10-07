import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRef } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Etapa 3a.2: "Copiar referência" e "Copiar recorte" nos menus da Árvore, de Detalhes e do
// canvas. Só existem em projetos abertos de uma pasta (a do harness se chama "projeto").

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'clipboard');
});

/**
 * O `userEvent.setup()` instala a própria área de transferência em `navigator.clipboard`:
 * o mock entra depois dele.
 */
function setupClipboard() {
  const user = userEvent.setup();
  const writeText = vi.fn((text: string) => {
    void text;
    return Promise.resolve();
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, write: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
  return { user, writeText };
}

/** Tira o nome da pasta do armazenamento: o projeto passa a ser "fora de uma pasta". */
function makeNotAFolder(harness: Harness) {
  Object.defineProperty(harness.context.session.storage, 'folderName', {
    value: undefined,
    configurable: true,
  });
}

const copied = (writeText: { mock: { calls: string[][] } }, call = 0) =>
  parseRef(writeText.mock.calls[call]?.[0] ?? '');

function renderTree(harness: Harness) {
  return renderLive(harness, (p) => (
    <MarkingTree project={p} selection={null} onSelect={() => undefined} />
  ));
}

describe('menu da linha da Árvore', () => {
  it('copia a referência da marcação', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderTree(harness);

    await user.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: t('copy.crop') })).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toEqual({ project: 'projeto', kind: 'm', code: 'm2' });
    // O menu fecha ao escolher.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a imagem só oferece a referência (o recorte é da marcação)', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderTree(harness);

    await user.click(
      screen.getByRole('button', {
        name: t('copy.itemActions', { name: 'images/frente.jpg' }),
      }),
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: t('copy.crop') })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'i', code: 'i2' });
  });

  it('fora de uma pasta, a Árvore não tem o menu', () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderTree(harness);
    expect(screen.queryByRole('button', { name: /^Ações de/ })).toBeNull();
  });
});

describe('Detalhes', () => {
  function renderMarking(harness: Harness, id: string) {
    renderLive(harness, (p) => {
      const m = p.markings.find((x) => x.id === id);
      const image = p.images.find((i) => i.id === m?.imageId);
      if (!m || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={m}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onSelectMarking={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
  }

  it('a marcação tem copiar referência e copiar recorte ao lado do ID', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMarking(harness, 'M2');
    expect(screen.getAllByRole('button', { name: t('copy.crop') })).toHaveLength(1);
    // A primeira é a da marcação; as demais são das anotações dela.
    await user.click(screen.getAllByRole('button', { name: t('copy.reference') })[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'm', code: 'm2' });
  });

  it('cada cartão de anotação copia a referência dela', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMarking(harness, 'M1');
    const card = document.querySelector('[data-annotation="A1"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'a', code: 'a1' });
    expect(within(card).queryByRole('button', { name: t('copy.crop') })).toBeNull();
  });

  it('a imagem só tem copiar referência', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const image = p.images[0];
      return image ? (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      ) : null;
    });
    expect(screen.queryByRole('button', { name: t('copy.crop') })).toBeNull();
    await user.click(screen.getByRole('button', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'i', code: 'i1' });
  });

  it('fora de uma pasta, Detalhes não oferece copiar', () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderMarking(harness, 'M2');
    expect(screen.queryByRole('button', { name: t('copy.reference') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('copy.crop') })).toBeNull();
  });
});

describe('menu de contexto do canvas', () => {
  function renderMenu(harness: Harness) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
  }

  it('não aparece sem `canvasMenu`', () => {
    renderMenu(createHarness(sampleProject()));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('abre com as duas ações para uma marcação e copia ao escolher', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 40, y: 60, target: { kind: 'm', id: 'M3' } };

    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    expect(within(menu).getByRole('menuitem', { name: t('copy.crop') })).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(copied(writeText)).toMatchObject({ kind: 'm', code: 'm3' });
    expect(harness.ui.canvasMenu.value).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('para uma imagem, só a referência', async () => {
    setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'i', id: 'I1' } };
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: t('copy.crop') })).toBeNull();
    expect(
      within(menu).getByRole('menuitem', { name: t('copy.reference') }),
    ).toBeTruthy();
  });

  it('fecha com Esc e com clique fora', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(harness.ui.canvasMenu.value).toBeNull();

    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    await screen.findByRole('menu');
    await user.click(document.body);
    expect(harness.ui.canvasMenu.value).toBeNull();
  });

  it('fora de uma pasta não mostra nada', () => {
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
