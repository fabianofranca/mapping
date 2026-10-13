import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { ActionMenu } from '../../src/ui/ActionMenu';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { Button } from '../../src/ui/controls';
import { EditorContext } from '../../src/ui/EditorContext';
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
