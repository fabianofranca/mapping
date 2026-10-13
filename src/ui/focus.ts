import { signal } from '@preact/signals';
import { createContext, type RefObject } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';

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
 * sair: a quem abriu; se saiu do DOM, ao alvo explícito; sem alvo explícito, ao contêiner
 * focável mais próximo de quem abriu (ou ao primeiro controle dentro dele); por último, ao primeiro
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
  if (returnFocus !== undefined) {
    // Com alvo explícito, ele é a decisão de quem fecha: sem ele no DOM, nada de adivinhar
    // um contêiner (etapa 8, F2); vai direto ao último recurso.
    const explicit = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
    if (tryFocus(explicit, scope)) return;
  } else {
    for (const container of origin.containers) {
      if (!container.isConnected) continue;
      if (tryFocus(container, scope)) return;
      for (const el of container.querySelectorAll(FOCUSABLE)) {
        if (tryFocus(el, scope)) return;
      }
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
 * Slot de diálogos de um host (o editor, a tela inicial, os passos de uma criação): só um
 * diálogo por vez, e uma troca (Configurações › Ver atalhos) herda quem abriu o primeiro.
 * O primeiro `Dialog` montado sob o slot reivindica a origem; os seguintes (um diálogo
 * aberto por cima, como os passos do `SpecsDialog`) guardam a sua.
 */
export interface DialogSlot {
  claim(): FocusOrigin | null;
}

function createSlot(origin: FocusOrigin): DialogSlot {
  let claimed = false;
  return {
    claim() {
      if (claimed) return null;
      claimed = true;
      return origin;
    },
  };
}

/** O host envolve o diálogo do slot com este contexto (`slot` de `useDialogSlot`). */
export const DialogSlotContext = createContext<DialogSlot | null>(null);

/** Origem do foco de um modal: a do slot do host, se houver, senão quem tem o foco agora. */
export function useFocusOrigin(): FocusOrigin {
  const slot = useContext(DialogSlotContext);
  const origin = useRef<FocusOrigin | null>(null);
  origin.current ??= slot?.claim() ?? captureFocusOrigin();
  return origin.current;
}

export interface DialogSlotState<T> {
  /** O diálogo aberto (só um por vez), com os dados que ele precisa. */
  readonly current: T | null;
  /** Para o `DialogSlotContext` em volta do diálogo aberto. */
  readonly slot: DialogSlot | null;
  /** Abre `next`; com um diálogo já aberto, troca por ele e mantém quem abriu o primeiro. */
  show(next: T): void;
  close(): void;
  /** Fecha só se o diálogo aberto agora atender a `test` (depois de uma espera). */
  closeIf(test: (current: T) => boolean): void;
}

/**
 * Estado de um slot de diálogos. A origem do foco é guardada no gesto que abre o primeiro
 * diálogo, antes de qualquer renderização, e passa de um diálogo ao seguinte numa troca:
 * sem isso o diálogo novo nasce depois de o antigo levar o botão que tinha o foco, e ao
 * fechar não há a quem devolvê-lo (etapa 8, F3).
 */
export function useDialogSlot<T>(): DialogSlotState<T> {
  const [state, setState] = useState<{
    readonly current: T | null;
    readonly slot: DialogSlot | null;
  }>({ current: null, slot: null });
  // O que está aberto agora (os gestos podem abrir e trocar antes de renderizar).
  const open = useRef<{ current: T; origin: FocusOrigin } | null>(null);
  const close = () => {
    open.current = null;
    setState({ current: null, slot: null });
  };
  return {
    current: state.current,
    slot: state.slot,
    show(next) {
      const origin = open.current?.origin ?? captureFocusOrigin();
      open.current = { current: next, origin };
      setState({ current: next, slot: createSlot(origin) });
    },
    close,
    closeIf(test) {
      if (open.current && test(open.current.current)) close();
    },
  };
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
  origin: FocusOrigin,
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
