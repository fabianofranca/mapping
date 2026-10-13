import type { LayoutSpace, ToolWindowId, ToolWindowSide } from '../store/toolWindows';
import { showToolWindow, sideWidth } from '../store/toolWindows';

// Espaço disponível para as janelas, medido no DOM. Fica fora dos componentes para o
// arrasto da divisória e o Ctrl+Shift+setas usarem a mesma conta (B2).

/**
 * Elemento que contém as janelas e o canvas (sem as faixas laterais): a classe é do CSS; a
 * medida acha o elemento pelo `data-panes` (seletor por classe atravessa componentes).
 */
export const PANES_CLASS = 'editor-panes';

/**
 * Espaço do lado a partir de um elemento dentro das janelas. Sem DOM medido (testes,
 * primeiro quadro), cai para a janela do navegador, que é um limite seguro.
 */
export function spaceFor(el: Element | null, side: ToolWindowSide): LayoutSpace {
  const panes = el?.closest('[data-panes]');
  const box = panes?.getBoundingClientRect();
  return {
    width: box?.width || globalThis.innerWidth || 0,
    height: box?.height || globalThis.innerHeight || 0,
    otherWidth:
      side === 'left' ? sideWidth('right') : side === 'right' ? sideWidth('left') : 0,
  };
}

/** Foca a janela de ferramenta (a seção dela é focável), se ela estiver desenhada. */
export function focusToolWindow(id: ToolWindowId): void {
  document.querySelector<HTMLElement>(`[data-window="${id}"]`)?.focus();
}

/**
 * Abre a janela e leva o foco para ela (o chip da camada ativa e o Ctrl+L). O foco
 * espera a janela ser desenhada: abrir é só uma mudança de signal, e a renderização que
 * ele agenda roda numa microtarefa anterior a esta. É uma das duas exceções documentadas ao
 * idioma `useFocusRequest` (função de módulo, sem componente; `docs/ARCHITECTURE.md`,
 * "Foco e teclado").
 */
export function showAndFocusToolWindow(id: ToolWindowId): void {
  showToolWindow(id);
  queueMicrotask(() => focusToolWindow(id));
}
