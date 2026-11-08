import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Etapa "Enquadrar a seleção" (EQ1), hipótese H1: com o Card selecionado, `Shift+seta` só chega
// ao atalho de mover quando o foco está no canvas ou em nenhum controle (`body`). Num campo dos
// Detalhes, numa célula da tabela Itens, na Paleta, num menu ou numa janela, as setas são do
// controle. Os alvos imitam a estrutura do `Editor`: o `<main data-canvas-area>` e as janelas
// de ferramenta ao lado dele, fora dele.

function Probe({
  dialogs,
  commands,
}: {
  dialogs: EditorDialogs;
  commands: ProjectCommands;
}) {
  useEditorShortcuts(dialogs, commands, true);
  return null;
}

function setup() {
  const harness = createHarness(sampleProject());
  harness.context.canvas.current = {
    cancelInteraction: vi.fn(() => false),
    isInteracting: vi.fn(() => false),
    centerSelection: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
  } as unknown as CanvasController;
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
  } as unknown as EditorDialogs;
  const commands = {
    exportProject: vi.fn(() => Promise.resolve()),
    closeProject: () => Promise.resolve(),
  } as unknown as ProjectCommands;
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe dialogs={dialogs} commands={commands} />
    </EditorContext.Provider>,
  );
  harness.ui.selection.value = { kind: 'marking', id: 'M1' };
  return harness;
}

/** Alvos como o `Editor` os monta: canvas, janelas ao lado dele e controles dentro delas. */
function buildDom() {
  const root = document.createElement('div');
  root.innerHTML = `
    <main data-canvas-area tabindex="-1"><div class="canvas-host" id="host"></div></main>
    <aside data-window="details">
      <input id="x" value="30" />
      <table><tr><td><input id="cell" value="A" /></td></tr></table>
      <label id="label">Posição</label>
    </aside>
    <aside data-window="palette"><button id="add">Adicionar na tela</button>
      <ul role="menu"><li role="menuitem" tabindex="0" id="menuitem">Item</li></ul></aside>
    <div role="dialog" id="dialog"><button id="ok">OK</button></div>`;
  document.body.append(root);
  const q = (id: string) => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(id);
    return el;
  };
  return q;
}

function shiftArrow(target: EventTarget, key = 'ArrowRight'): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  target.dispatchEvent(
    new KeyboardEvent('keyup', { key, shiftKey: true, bubbles: true }),
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('H1: Shift+seta com a seleção e o foco em outro lugar', () => {
  const rectX = (h: ReturnType<typeof setup>) =>
    h.project().markings.find((m) => m.id === 'M1')?.rect.x;

  it.each([
    ['um campo dos Detalhes', 'x'],
    ['uma célula da tabela Itens', 'cell'],
    ['o botão da Paleta', 'add'],
    ['um item de menu', 'menuitem'],
    ['o botão de uma janela', 'ok'],
    ['o rótulo (sem foco) de uma janela', 'label'],
  ])('com o foco em %s a seleção não anda', (_nome, id) => {
    const h = setup();
    const q = buildDom();
    const before = rectX(h);
    shiftArrow(q(id));
    expect(rectX(h)).toBe(before);
  });

  it('com o foco no canvas, e no body (sem controle), anda 10 px: é o comportamento documentado', () => {
    const h = setup();
    const q = buildDom();
    const before = rectX(h) ?? 0;
    shiftArrow(q('host'));
    expect(rectX(h)).toBe(before + 10);
    shiftArrow(document.body);
    expect(rectX(h)).toBe(before + 20);
  });
});
