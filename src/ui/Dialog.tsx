import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { IconButton } from './controls';

/** Largura do diálogo: 480px (padrão), 560px ou 820px (seção Layouts do DS 2.0). */
export type DialogSize = 'sm' | 'md' | 'lg';

const FOCUSABLE = [
  'input:not([disabled]):not([hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
];

/** Seletor dos controles focáveis dentro de `scope` (a vírgula não herda o escopo). */
const focusableIn = (scope: string) => FOCUSABLE.map((f) => `${scope} ${f}`).join(', ');

/**
 * Foco inicial: o `autofocus`, senão o primeiro controle do corpo, senão o primeiro botão do
 * rodapé (numa confirmação, "Cancelar"). Sem isto o `showModal` cairia no fechar do cabeçalho.
 */
function focusFirst(dialog: HTMLDialogElement): void {
  const target =
    dialog.querySelector<HTMLElement>('[autofocus]') ??
    dialog.querySelector<HTMLElement>(focusableIn('.dialog-body')) ??
    dialog.querySelector<HTMLElement>(focusableIn('.dialog-actions'));
  target?.focus();
}

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

/** Guarda quem tem o foco agora (antes de o diálogo pegá-lo). */
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

function tryFocus(el: Element | null | undefined, dialog: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  if (dialog.contains(el)) return false;
  el.focus();
  return document.activeElement === el;
}

/**
 * Devolve o foco ao fechar um diálogo modal (chamar depois de fechá-lo): a quem abriu; se
 * saiu do DOM, ao alvo explícito; sem ele, ao contêiner focável mais próximo de quem abriu
 * (ou ao primeiro controle dentro dele); o `body` nunca. Não mexe se o foco já foi para
 * outro lugar de propósito (fora do diálogo e do `body`).
 */
export function restoreFocus(
  dialog: HTMLElement,
  origin: FocusOrigin,
  returnFocus?: FocusReturn,
): void {
  const active = document.activeElement;
  const lost = active === null || active === document.body || dialog.contains(active);
  if (!lost) return;
  if (tryFocus(origin.opener, dialog)) return;
  const explicit = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
  if (tryFocus(explicit, dialog)) return;
  const selector = FOCUSABLE.join(', ');
  for (const container of origin.containers) {
    if (!container.isConnected) continue;
    if (tryFocus(container, dialog)) return;
    for (const el of container.querySelectorAll(selector)) {
      if (tryFocus(el, dialog)) return;
    }
  }
}

/**
 * `restoreFocus` depois da renderização que fechou o diálogo: o Preact desmonta o diálogo
 * antes de aplicar o resto da mesma renderização (a linha excluída, o item trocado), então
 * só depois dela se sabe se quem abriu continua no DOM.
 */
export function restoreFocusAfterRender(
  dialog: HTMLElement,
  origin: FocusOrigin | null,
  returnFocus: { readonly current: FocusReturn | undefined },
): void {
  if (!origin) return;
  queueMicrotask(() => restoreFocus(dialog, origin, returnFocus.current));
}

interface DialogBaseProps {
  readonly title: string;
  readonly children?: ComponentChildren;
  /** Botões do rodapé. */
  readonly actions: ComponentChildren;
  readonly size?: DialogSize;
  /** Corpo sem margem interna nem rolagem própria: o conteúdo cuida dos dois (ex.: Ajuda). */
  readonly flush?: boolean;
  /** Alvo do foco ao fechar quando quem abriu não está mais no DOM (`restoreFocus`). */
  readonly returnFocus?: FocusReturn;
}

/**
 * `closable={false}`: a escolha no rodapé é obrigatória (ex.: "Projeto alterado fora da app"),
 * então não há botão de fechar no cabeçalho e Esc e o toque fora não fazem nada.
 */
type DialogProps = DialogBaseProps &
  (
    | {
        readonly closable?: true;
        /** Esc, toque fora ou botão de fechar do cabeçalho. */
        readonly onCancel: () => void;
      }
    | { readonly closable: false; readonly onCancel?: undefined }
  );

/**
 * Diálogo modal com `<dialog>` nativo (foco preso e Esc de graça). Cabeçalho de 44px com
 * título e fechar, corpo que rola e rodapé com borda.
 */
export function Dialog({
  title,
  onCancel,
  closable = true,
  children,
  actions,
  size = 'sm',
  flush = false,
  returnFocus,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Quem tinha o foco ao abrir (o botão que abriu, ou o diálogo de baixo): ao fechar, o
  // foco volta para ele em vez de cair no `body`. Guardado na renderização, antes de o
  // diálogo pegar o foco.
  const origin = useRef<FocusOrigin | null>(null);
  origin.current ??= captureFocusOrigin();
  // Lido ao fechar: o chamador pode trocar o alvo enquanto o diálogo está aberto.
  const returnTo = useRef(returnFocus);
  returnTo.current = returnFocus;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      // Detecção de recurso: sem `showModal` (navegador antigo) abre sem modal.
      dialog.setAttribute('open', '');
    }
    focusFirst(dialog);
    return () => {
      // Fecha antes de sair do DOM: com o modal aberto, o resto da página está inerte.
      try {
        if (dialog.open) dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
      restoreFocusAfterRender(dialog, origin.current, returnTo);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      class={size === 'sm' ? 'dialog' : `dialog dialog-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.();
      }}
      onClose={() => {
        // O Chrome deixa de aceitar o `preventDefault` do Esc repetido sem outro gesto e fecha
        // o `<dialog>` assim mesmo: sem fechar, ele volta a abrir enquanto estiver montado.
        const dialog = ref.current;
        if (closable || !dialog || !dialog.isConnected || dialog.open) return;
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }}
      onClick={(e) => {
        // Clique no fundo (fora do conteúdo) fecha.
        if (e.target === ref.current) onCancel?.();
      }}
    >
      <header class="dialog-header">
        <h2 id={titleId} class="dialog-title">
          {title}
        </h2>
        {closable && (
          <IconButton icon="close" label={t('dialog.close')} onClick={onCancel} />
        )}
      </header>
      <div class={flush ? 'dialog-body dialog-body-flush' : 'dialog-body'}>
        {children}
      </div>
      <footer class="dialog-actions">{actions}</footer>
    </dialog>
  );
}
