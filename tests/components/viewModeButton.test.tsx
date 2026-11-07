import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewModeButton, ModeButtons } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { setViewMode } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { ViewModePanel } from '../../src/ui/ViewModePanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

function setup() {
  const h = createHarness(sampleProject());
  renderLive(h, () => (
    <EditorContext.Provider value={h.context}>
      <ViewModeButton />
      <ViewModePanel />
      <ModeButtons />
    </EditorContext.Provider>
  ));
  return h;
}

describe('Modo visualização: botão', () => {
  it('liga e desliga o modo visualização, com aria-pressed, e desabilita Desenhar enquanto ligado', () => {
    const h = setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    const draw = screen.getByRole('button', { name: t('editor.modeDraw') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(draw.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(draw.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('entrar no modo abre o painel Mostrar no canvas; sair o fecha', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
  });

  it('Mostrar no canvas só fica habilitado no modo e reabre o painel', () => {
    const h = setup();
    const open = screen.getByRole('button', { name: t('view.panelOpen') });
    expect(open.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t('view.viewMode') }));
    expect(open.hasAttribute('disabled')).toBe(false);
    // Esc fecha o painel e o modo continua.
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
    expect(h.ui.viewMode.value).toBe(true);
    fireEvent.click(open);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
  });

  it('Alt+H ou Esc para sair do modo deixam o foco em Visualizar, não no body', () => {
    const h = setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    fireEvent.click(button);
    // O foco está dentro do painel (primeira caixa); sair pelo Alt+H leva o foco ao Visualizar.
    expect(document.activeElement).not.toBe(document.body);
    act(() => setViewMode(h.ui, false));
    expect(document.activeElement).toBe(button);
  });

  it('Esc no painel aberto ao ligar o modo devolve o foco ao Visualizar', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(document.activeElement).toBe(button);
  });

  it('painel aberto por Mostrar no canvas devolve o foco a ele ao fechar', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: t('view.viewMode') }));
    const dialog = () => screen.getByRole('dialog', { name: t('view.panelTitle') });
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    const open = screen.getByRole('button', { name: t('view.panelOpen') });
    fireEvent.click(open);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(document.activeElement).toBe(open);
  });

  it('a dica do Visualizar fica suprimida enquanto o painel está aberto', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    const anchor = () => button.closest('.tooltip-anchor');
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(false);
    fireEvent.click(button);
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(false);
  });
});
