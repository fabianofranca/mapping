import type { LayoutSpace, ToolWindowSide } from '../store/toolWindows';
import { sideWidth } from '../store/toolWindows';

// Espaço disponível para as janelas, medido no DOM. Fica fora dos componentes para o
// arrasto da divisória e o Ctrl+Shift+setas usarem a mesma conta (B2).

/** Elemento que contém as janelas e o canvas (sem as faixas laterais). */
export const PANES_CLASS = 'editor-panes';

/**
 * Espaço do lado a partir de um elemento dentro das janelas. Sem DOM medido (testes,
 * primeiro quadro), cai para a janela do navegador, que é um limite seguro.
 */
export function spaceFor(el: Element | null, side: ToolWindowSide): LayoutSpace {
  const panes = el?.closest(`.${PANES_CLASS}`);
  const box = panes?.getBoundingClientRect();
  return {
    width: box?.width || globalThis.innerWidth || 0,
    height: box?.height || globalThis.innerHeight || 0,
    otherWidth:
      side === 'left' ? sideWidth('right') : side === 'right' ? sideWidth('left') : 0,
  };
}
