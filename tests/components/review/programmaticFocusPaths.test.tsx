import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../../src/store/toolWindows';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import { IncompleteView } from '../../../src/ui/IncompleteView';
import { ToolStrip } from '../../../src/ui/ToolStrip';
import { ToolWindow } from '../../../src/ui/ToolWindow';
import { closeToolWindow, openToolWindow } from '../../../src/ui/toolWindowLayout';
import { cadastroProject } from '../../model/specFixtures';
import { createHarness, type Harness } from '../harness';

// "Ir à anotação" em Incompletas abre Detalhes guardando o item focado como origem
// (o `goTo` de `EditorWindows`); fechar Detalhes devolve o foco, nunca ao body.

function Shell() {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  // Mesmo `goTo` do caso 'incomplete' de EditorWindows.
  const goTo = () => {
    openToolWindow('details');
  };
  return (
    <>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas" />
      {windows.map((id) =>
        id === 'incomplete' ? (
          <ToolWindow key={id} id={id}>
            <IncompleteView onGoToAnnotation={goTo} />
          </ToolWindow>
        ) : (
          <ToolWindow key={id} id={id}>
            <button type="button">controle {id}</button>
          </ToolWindow>
        ),
      )}
      <ToolStrip side="right" />
    </>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `controle ${id}` });
const item = () =>
  screen.getByRole('button', { name: t('incomplete.go', { name: 'Título' }) });

function mount(harness: Harness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <Shell />
    </EditorContext.Provider>,
  );
}

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(cleanup);

describe('goTo de Incompletas devolve o foco ao fechar Detalhes', () => {
  it('ir à anotação, focar em Detalhes e fechar → item de Incompletas', async () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('incomplete');
    mount(harness);
    const button = item();
    button.focus();
    button.click();
    await settle();
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(document.activeElement).toBe(button);
  });

  it('com o item fora do DOM (lista remontada) → botão da faixa, nunca ao body', async () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('incomplete');
    mount(harness);
    const button = item();
    button.focus();
    button.click();
    await settle();
    cleanup();
    mount(harness);
    expect(button.isConnected).toBe(false);
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(stripButton('details'));
  });
});
