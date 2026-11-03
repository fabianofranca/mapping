import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { Button } from '../../src/ui/controls';
import { EditorContext } from '../../src/ui/EditorContext';
import { MenuPopover } from '../../src/ui/MenuPopover';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// SA1 (etapa #347): os menus em popover são menus de verdade — itens `menuitem`, foco no
// primeiro habilitado ao abrir, ↑/↓ circulares, Esc devolve o foco ao gatilho e o gatilho
// tem `aria-haspopup="menu"`. O mesmo padrão do `ActionMenu`.

afterEach(cleanup);

function renderMenu() {
  render(
    <MenuPopover label="Projeto" buttonLabel="Projeto: ações">
      <Button role="menuitem" disabled>
        Desabilitado
      </Button>
      <Button role="menuitem">Exportar</Button>
      <Button role="menuitem">Fechar</Button>
    </MenuPopover>,
  );
  return screen.getByRole('button', { name: /^Projeto/ });
}

describe('MenuPopover: menu completo', () => {
  it('o gatilho anuncia o menu e o nome começa pelo texto visível', () => {
    const trigger = renderMenu();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('abre com os itens como menuitem e o foco no primeiro habilitado', async () => {
    const trigger = renderMenu();
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Desabilitado',
      'Exportar',
      'Fechar',
    ]);
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Exportar' }),
    );
  });

  it('↓ e ↑ circulam entre os habilitados', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Fechar' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Exportar' }),
    );
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Fechar' }));
  });

  it('Esc fecha e devolve o foco ao gatilho', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('menu do projeto', () => {
  it('o gatilho começa pelo nome do projeto; Exportar e Fechar projeto são menuitem', async () => {
    const harness = createHarness(sampleProject());
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorMainBar
          busy={false}
          onAdd={vi.fn()}
          dialogs={
            { show: vi.fn(), close: vi.fn(), exportButton: { current: null } } as never
          }
          commands={commands as unknown as ProjectCommands}
        />
      </EditorContext.Provider>,
    );
    const name = harness.project().project.name;
    const trigger = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(trigger.getAttribute('aria-label')).toBe(
      t('editor.projectMenuName', { name }),
    );
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      t('editor.export'),
      t('editor.closeProject'),
    ]);
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: t('editor.export') }),
    );
  });
});
