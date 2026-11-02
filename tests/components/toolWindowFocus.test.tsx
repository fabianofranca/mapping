import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { toolWindowMeta } from '../../src/ui/toolWindowMeta';
import {
  closeToolWindow,
  openToolWindow,
  showAndFocusToolWindow,
} from '../../src/ui/toolWindowLayout';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Foco ao fechar uma janela de ferramenta (etapa #295, FJ1): vai a quem abriu, senão ao
// botão da faixa, senão ao canvas; só age com o foco dentro da janela.

const harness = createHarness(sampleProject());

function Shell() {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  return (
    <EditorContext.Provider value={harness.context}>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas">
        <button type="button">fundo</button>
      </main>
      {windows.map((id) => (
        <ToolWindow key={id} id={id}>
          <button type="button">controle {id}</button>
        </ToolWindow>
      ))}
      <ToolStrip side="right" />
    </EditorContext.Provider>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const active = () => document.activeElement;
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `controle ${id}` });

beforeEach(() => {
  locale.value = 'pt-BR';
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
});

describe('devolver o foco ao fechar', () => {
  it('Árvore aberta pela faixa, foco no controle, X → botão da faixa', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(stripButton('tree') as HTMLElement);
    await user.click(control('tree'));
    await user.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: toolWindowMeta('tree').title() }),
      }),
    );
    await settle();
    expect(active()).toBe(stripButton('tree'));
  });

  it('Árvore aberta por atalho com o foco no canvas, fechar → canvas', async () => {
    render(<Shell />);
    const fundo = screen.getByRole('button', { name: 'fundo' });
    fundo.focus();
    showAndFocusToolWindow('tree');
    await settle();
    expect(active()?.getAttribute('data-window')).toBe('tree');
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(fundo);
  });

  it.each(['details', 'catalog'] as const)(
    '%s fecha pelo X e volta à origem',
    async (id) => {
      render(<Shell />);
      const fundo = screen.getByRole('button', { name: 'fundo' });
      fundo.focus();
      showAndFocusToolWindow(id);
      await settle();
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(fundo);
    },
  );

  it('foco fora da janela ao fechar → não muda', async () => {
    render(<Shell />);
    showToolWindow('tree');
    await settle();
    const fundo = screen.getByRole('button', { name: 'fundo' });
    fundo.focus();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(fundo);
  });

  it('quem abriu saiu do DOM → botão da faixa', async () => {
    render(<Shell />);
    const fundo = screen.getByRole('button', { name: 'fundo' });
    fundo.focus();
    showAndFocusToolWindow('tree');
    await settle();
    fundo.remove();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(stripButton('tree'));
  });

  it('janela aberta desde o carregamento → botão da faixa', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    control('tree').focus();
    closeToolWindow('tree');
    await settle();
    expect(active()).toBe(stripButton('tree'));
  });

  it('sem botão da faixa → canvas', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    stripButton('tree')?.remove();
    control('tree').focus();
    closeToolWindow('tree');
    await settle();
    expect(active()?.hasAttribute('data-canvas-area')).toBe(true);
  });

  it('abrir o Catálogo com o foco na Árvore não deixa o foco no body', async () => {
    showToolWindow('tree');
    render(<Shell />);
    await settle();
    control('tree').focus();
    openToolWindow('catalog');
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()).toBe(stripButton('tree'));
  });

  it('trocar de aba da janela inferior leva o foco à aba ativa', async () => {
    const user = userEvent.setup();
    showToolWindow('list');
    render(<Shell />);
    await settle();
    await user.click(screen.getByRole('tab', { name: t('incomplete.title') }));
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()?.getAttribute('role')).toBe('tab');
    expect(active()?.getAttribute('aria-selected')).toBe('true');
  });
});
