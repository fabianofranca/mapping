import type { ComponentChildren, Ref } from 'preact';
import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { IconButton } from './controls';
import {
  assignRef,
  FOCUSABLE,
  useFocusOrigin,
  useModal,
  type FocusReturn,
} from './focus';

export type { FocusOrigin, FocusReturn } from './focus';

/** Largura do diálogo: 480px (padrão), 560px ou 820px (seção Layouts do DS 2.0). */
export type DialogSize = 'sm' | 'md' | 'lg';

/** De onde veio o fechamento: Esc (`cancel` do `<dialog>`), clique no fundo ou o X. */
export type DialogCancelCause = 'cancel' | 'backdrop' | 'close-button';

/**
 * Foco inicial: o `autofocus`, senão o primeiro controle do corpo, senão o primeiro botão do
 * rodapé (numa confirmação, "Cancelar"). Sem isto o `showModal` cairia no fechar do cabeçalho.
 */
function focusFirst(dialog: HTMLDialogElement): void {
  const target =
    dialog.querySelector<HTMLElement>('[autofocus]') ??
    dialog.querySelector('[data-dialog-body]')?.querySelector<HTMLElement>(FOCUSABLE) ??
    dialog.querySelector('[data-dialog-actions]')?.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
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
  /**
   * Confirmação destrutiva (excluir, remover): `role="alertdialog"`, descrita pelo corpo,
   * que o leitor de tela lê ao abrir. Só aqui: num diálogo comprido (Ajuda) ele leria o
   * corpo inteiro.
   */
  readonly alert?: boolean;
  /** O `<dialog>` para quem precisa ler o estado dele (o rastro do Abrir de pasta). */
  readonly dialogRef?: Ref<HTMLDialogElement>;
}

/**
 * `closable={false}`: a escolha no rodapé é obrigatória (ex.: "Projeto alterado fora da app"),
 * então não há botão de fechar no cabeçalho e Esc e o toque fora não fazem nada.
 */
type DialogProps = DialogBaseProps &
  (
    | {
        readonly closable?: true;
        /**
         * Esc, toque fora ou botão de fechar do cabeçalho; `cause` diz qual (opcional: só o
         * rastro do Abrir de pasta usa, para o Diagnóstico).
         */
        readonly onCancel: (cause?: DialogCancelCause) => void;
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
  alert = false,
  dialogRef,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Quem tinha o foco ao abrir (o botão que abriu, o diálogo de baixo, ou quem abriu o
  // primeiro diálogo do slot do host): ao fechar, o foco volta para ele em vez de cair no
  // `body`. Guardado na renderização, antes de o diálogo pegar o foco.
  const origin = useFocusOrigin();
  useModal(ref, origin, returnFocus, focusFirst);
  // Depois do `showModal` (efeito acima): quem lê o ref já vê o diálogo aberto.
  useLayoutEffect(() => {
    assignRef(dialogRef, ref.current);
    return () => assignRef(dialogRef, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      class={size === 'sm' ? 'dialog' : `dialog dialog-${size}`}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={alert ? bodyId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.('cancel');
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
        if (e.target === ref.current) onCancel?.('backdrop');
      }}
    >
      <header class="dialog-header">
        <h2 id={titleId} class="dialog-title">
          {title}
        </h2>
        {closable && (
          <IconButton
            icon="close"
            label={t('dialog.close')}
            onClick={() => onCancel?.('close-button')}
          />
        )}
      </header>
      <div
        class={flush ? 'dialog-body dialog-body-flush' : 'dialog-body'}
        id={bodyId}
        data-dialog-body=""
      >
        {children}
      </div>
      <footer class="dialog-actions" data-dialog-actions="">
        {actions}
      </footer>
    </dialog>
  );
}
