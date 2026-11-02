import type { LayoutSpace, ToolWindowId, ToolWindowSide } from '../store/toolWindows';
import {
  TOOL_WINDOWS,
  WINDOW_SIDE,
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
  sideWidth,
} from '../store/toolWindows';

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
 * Quem tinha o foco quando cada janela abriu. Mora aqui (UI), nunca no store; não é
 * persistido: uma janela aberta desde o carregamento não tem nada guardado.
 */
const openers = new Map<ToolWindowId, Element>();

/** Atributos que marcam o botão da faixa e a área do canvas (alvos de reserva). */
const STRIP_BUTTON_ATTR = 'data-strip-window';
const CANVAS_AREA_ATTR = 'data-canvas-area';

function windowElement(id: ToolWindowId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-window="${id}"]`);
}

function focusIfOutside(el: Element | null | undefined, scope: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  if (scope.contains(el)) return false;
  el.focus();
  return document.activeElement === el;
}

/**
 * Se o foco está dentro da janela `id`, leva-o, ainda com a janela no DOM, a: quem abriu →
 * botão da janela na faixa → canvas. Síncrono: não há quadro com o foco no `body`.
 */
function releaseFocus(id: ToolWindowId): void {
  const el = windowElement(id);
  if (!el?.contains(document.activeElement)) return;
  if (focusIfOutside(openers.get(id), el)) return;
  if (focusIfOutside(document.querySelector(`[${STRIP_BUTTON_ATTR}="${id}"]`), el))
    return;
  focusIfOutside(document.querySelector(`[${CANVAS_AREA_ATTR}]`), el);
}

/** Aba ativa da janela inferior, para onde o foco vai quando a troca remonta a janela. */
function focusActiveTab(id: ToolWindowId): void {
  windowElement(id)
    ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ?.focus();
}

/**
 * Abre a janela (faixa, aba, atalho). Guarda quem tem o foco, se a janela estava fechada, e
 * trata as janelas que saem por causa dela (decisões 3 e 4): o foco que estava nelas vai ao
 * destino da ordem acima; na janela inferior, à aba ativa da nova (a troca remonta a seção,
 * então isso espera a renderização, na mesma exceção de `showAndFocusToolWindow`).
 */
export function openToolWindow(id: ToolWindowId): void {
  const active = document.activeElement;
  const wasOpen = isToolWindowOpen(id);
  const leaving = TOOL_WINDOWS.filter(
    (other) =>
      other !== id &&
      isToolWindowOpen(other) &&
      windowElement(other)?.contains(active ?? null),
  );
  if (!wasOpen && active && active !== document.body) openers.set(id, active);
  showToolWindow(id);
  for (const other of leaving) {
    if (isToolWindowOpen(other)) continue;
    if (WINDOW_SIDE[other] === 'bottom' && WINDOW_SIDE[id] === 'bottom') {
      queueMicrotask(() => focusActiveTab(id));
    } else {
      releaseFocus(other);
    }
  }
}

/**
 * Fecha a janela e devolve o foco, se ele estava dentro dela (decisão 1). Único dono do
 * fechamento: o X, `hide-window`, `toggle-window` e o clique na faixa passam por aqui.
 */
export function closeToolWindow(id: ToolWindowId): void {
  releaseFocus(id);
  openers.delete(id);
  hideToolWindow(id);
}

/** Alterna pela faixa ou pelo atalho: abre guardando a origem, ou fecha devolvendo o foco. */
export function toggleToolWindowFocus(id: ToolWindowId): void {
  if (isToolWindowOpen(id)) closeToolWindow(id);
  else openToolWindow(id);
}

/**
 * Abre a janela e leva o foco para ela (o chip da camada ativa e o Ctrl+L). O foco
 * espera a janela ser desenhada: abrir é só uma mudança de signal, e a renderização que
 * ele agenda roda numa microtarefa anterior a esta. É uma das duas exceções documentadas ao
 * idioma `useFocusRequest` (função de módulo, sem componente; `docs/ARCHITECTURE.md`,
 * "Foco e teclado").
 */
export function showAndFocusToolWindow(id: ToolWindowId): void {
  openToolWindow(id);
  queueMicrotask(() => focusToolWindow(id));
}
