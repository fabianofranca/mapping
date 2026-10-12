import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

// Modelo de foco da app (etapa 8, fase 8.3; `docs/ARCHITECTURE.md`, "Foco e teclado").
// Um modal (`Dialog`, `RefPicker`) abre na mesma renderização que o põe no DOM e, ao sair,
// devolve o foco a quem o abriu; nunca ao `body`.

/** Controles que recebem foco (para o foco inicial e o último recurso do retorno). */
export const FOCUSABLE = [
  'input:not([disabled]):not([hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Para onde o foco vai ao fechar quando quem abriu saiu do DOM (ou não havia quem abrisse,
 * como no Exportar, que gera o zip antes de abrir): o elemento, ou uma função lida na hora
 * de fechar (a linha que ficou no lugar da excluída, por exemplo).
 */
export type FocusReturn = HTMLElement | null | (() => HTMLElement | null | undefined);

/** Quem tinha o foco ao abrir e os ancestrais dele (do mais próximo ao mais distante). */
export interface FocusOrigin {
  readonly opener: Element | null;
  readonly containers: readonly Element[];
}

/** Guarda quem tem o foco agora (antes de o modal pegá-lo). */
export function captureFocusOrigin(): FocusOrigin {
  const active = document.activeElement;
  const opener = active === document.body ? null : active;
  const containers: Element[] = [];
  for (
    let el = opener?.parentElement ?? null;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    containers.push(el);
  }
  return { opener, containers };
}

function tryFocus(el: Element | null | undefined, scope: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  if (scope.contains(el)) return false;
  el.focus();
  return document.activeElement === el;
}

/** Raiz da app (`App.tsx`): o último recurso é o primeiro controle dentro dela. */
const FOCUS_ROOT = '[data-focus-root]';

/**
 * Devolve o foco ao fechar `scope` (um modal, um menu sem gatilho), chamada depois de ele
 * sair: a quem abriu; se saiu do DOM, ao alvo explícito; sem ele, ao contêiner focável mais
 * próximo de quem abriu (ou ao primeiro controle dentro dele); por último, ao primeiro
 * controle da app (`data-focus-root`), para o teclado não ficar perdido no `body`. O `body`
 * nunca. Não mexe se o foco já foi para outro lugar de propósito (fora de `scope` e do
 * `body`): quem fecha e leva o foco a outro lugar é o dono daquele fechamento.
 */
export function restoreFocus(
  scope: HTMLElement,
  origin: FocusOrigin,
  returnFocus?: FocusReturn,
): void {
  const active = document.activeElement;
  const lost = active === null || active === document.body || scope.contains(active);
  if (!lost) return;
  if (tryFocus(origin.opener, scope)) return;
  const explicit = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
  if (tryFocus(explicit, scope)) return;
  for (const container of origin.containers) {
    if (!container.isConnected) continue;
    if (tryFocus(container, scope)) return;
    for (const el of container.querySelectorAll(FOCUSABLE)) {
      if (tryFocus(el, scope)) return;
    }
  }
  const root = document.querySelector(FOCUS_ROOT);
  for (const el of root?.querySelectorAll(FOCUSABLE) ?? []) {
    if (tryFocus(el, scope)) return;
  }
}

/**
 * `restoreFocus` depois da renderização que fechou: o Preact desmonta o modal antes de
 * aplicar o resto da mesma renderização (a linha excluída, o item trocado), então só
 * depois dela se sabe se quem abriu continua no DOM. É a única espera por microtarefa do
 * modelo: quem leva o foco a outro lugar de propósito faz isso até o commit, antes dela.
 */
export function restoreFocusAfterRender(
  scope: HTMLElement,
  origin: FocusOrigin | null,
  returnFocus: { readonly current: FocusReturn | undefined },
): void {
  if (!origin) return;
  queueMicrotask(() => restoreFocus(scope, origin, returnFocus.current));
}

/**
 * Quantos modais estão abertos agora. Os atalhos do editor e o colar de imagens não agem
 * com um modal aberto (no lugar de procurar `dialog[open]` no documento).
 */
export const modalOpen = signal(0);

/**
 * Ciclo de vida de um modal com `<dialog>` nativo: na mesma renderização que o põe no DOM,
 * abre (`showModal`), dá o foco inicial, conta em `modalOpen` e registra o retorno; ao sair,
 * fecha antes de deixar o DOM (com o modal aberto, o resto da página é inerte) e devolve o
 * foco. Em `useLayoutEffect`: um `<dialog>` no DOM está sempre aberto e sempre tem retorno,
 * mesmo que saia antes do próximo quadro (etapa 8, F1).
 */
export function useModal(
  ref: RefObject<HTMLDialogElement>,
  origin: FocusOrigin | null,
  returnFocus: FocusReturn | undefined,
  focusInitial: (dialog: HTMLDialogElement) => void,
): void {
  // Lidos ao fechar: o chamador pode trocar o alvo enquanto o modal está aberto.
  const returnTo = useRef(returnFocus);
  returnTo.current = returnFocus;
  const from = useRef(origin);
  from.current = origin;
  const initial = useRef(focusInitial);
  initial.current = focusInitial;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    try {
      dialog.showModal();
    } catch {
      // Detecção de recurso: sem `showModal` (navegador antigo) abre sem modal.
      dialog.setAttribute('open', '');
    }
    initial.current(dialog);
    modalOpen.value += 1;
    return () => {
      try {
        if (dialog.open) dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
      modalOpen.value -= 1;
      restoreFocusAfterRender(dialog, from.current, returnTo);
    };
    // Abre uma vez por montagem; o resto é lido pelos refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
