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
import { Popover } from '../../src/ui/Popover';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Etapa 8 (8.3), achado F6: menus e popovers devolvem o foco ao gatilho em todo
// fechamento (Esc, escolha, clique fora), e não só no Esc; sem isso o foco, que estava num
// item do menu, caía no `body` quando o menu saía do DOM.

afterEach(cleanup);

describe('MenuPopover', () => {
  function renderMenu(onPick = vi.fn()) {
    render(
      <div>
        <MenuPopover label="Projeto" buttonLabel="Menu do projeto">
          <Button onClick={onPick}>Exportar</Button>
        </MenuPopover>
        <button>Fora</button>
      </div>,
    );
    return screen.getByRole('button', { name: 'Menu do projeto' });
  }

  it('escolher um item devolve o foco ao gatilho', async () => {
    const onPick = vi.fn();
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // Devolução da 8.3 (segunda leitura, M1): o menu fechava na bolha do clique, depois de o
  // item agir; o gatilho tem de receber o foco antes (nota §3, como o `ActionMenu`).
  it('o gatilho recebe o foco antes de o item agir', async () => {
    let focusedOnPick: Element | null = null;
    const onPick = vi.fn(() => {
      focusedOnPick = document.activeElement;
    });
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(focusedOnPick).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Enter num item escolhe: o item age, o menu fecha e o foco fica no gatilho', async () => {
    let focusedOnPick: Element | null = null;
    const onPick = vi.fn(() => {
      focusedOnPick = document.activeElement;
    });
    const trigger = renderMenu(onPick);
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Exportar' }).focus();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledOnce();
    expect(focusedOnPick).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('um item que abre um diálogo na hora: o diálogo tem o gatilho como origem', async () => {
    // O diálogo abre pelo slot do host (a origem é guardada no gesto) e tem um alvo
    // explícito de retorno, como o Exportar: se a origem fosse o item (que sai do DOM com o
    // menu), o foco iria ao alvo explícito em vez de voltar ao gatilho.
    function Host() {
      const dialogs = useDialogSlot<'confirm'>();
      const other = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <MenuPopover label="Projeto" buttonLabel="Menu do projeto">
            <Button onClick={() => dialogs.show('confirm')}>Abrir</Button>
          </MenuPopover>
          <button ref={other}>Outro</button>
          {dialogs.current && (
            <DialogSlotContext.Provider value={dialogs.slot}>
              <Dialog
                title="Confirmar"
                onCancel={dialogs.close}
                returnFocus={() => other.current}
                actions={<Button onClick={dialogs.close}>Cancelar</Button>}
              >
                <p>Texto</p>
              </Dialog>
            </DialogSlotContext.Provider>
          )}
        </div>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Menu do projeto' });
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('clique fora com o foco num item devolve o foco ao gatilho', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Exportar' }).focus();
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
          label="Cores"
          trigger={({ open, toggle }) => (
            <button aria-expanded={open} onClick={toggle}>
              Cor
            </button>
          )}
        >
          {(close) => <button onClick={close}>Vermelho</button>}
        </Popover>
      </div>,
    );
    return screen.getByRole('button', { name: 'Cor' });
  }

  it('escolher (close) devolve o foco ao gatilho', async () => {
    const trigger = renderPopover();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Vermelho' }));
    expect(screen.queryByRole('button', { name: 'Vermelho' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('clique fora com o foco dentro devolve o foco ao gatilho', async () => {
    const trigger = renderPopover();
    const user = userEvent.setup();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Vermelho' }).focus();
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Vermelho' })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });
});

describe('ActionMenu', () => {
  it('clique fora com o foco num item devolve o foco ao gatilho', async () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Subir', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'Ações' });
    const user = userEvent.setup();
    await user.click(trigger);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('menuitem', { name: 'Subir' }),
      ),
    );
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('ActionMenu (posição fixa)', () => {
  it('a lista recebe left/top e fecha ao rolar', async () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Subir', onSelect: vi.fn() }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ações' }));
    const list = await screen.findByRole('menu');
    expect(list.style.left).toMatch(/px$/);
    expect(list.style.top).toMatch(/px$/);
    fireEvent.scroll(document.body);
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('fecha ao redimensionar a janela', async () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Subir', onSelect: vi.fn() }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ações' }));
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

  it('Esc devolve o foco a quem o tinha antes de abrir', async () => {
    const { origin } = renderMenu();
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(origin));
  });

  it('escolher um item devolve o foco a quem o tinha antes de abrir', async () => {
    const { origin } = renderMenu();
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    const user = userEvent.setup();
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(origin));
  });
});
