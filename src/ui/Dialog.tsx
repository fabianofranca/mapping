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

interface DialogBaseProps {
  readonly title: string;
  readonly children?: ComponentChildren;
  /** Botões do rodapé. */
  readonly actions: ComponentChildren;
  readonly size?: DialogSize;
  /** Corpo sem margem interna nem rolagem própria: o conteúdo cuida dos dois (ex.: Ajuda). */
  readonly flush?: boolean;
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
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Quem tinha o foco ao abrir (o botão que abriu, ou o diálogo de baixo): ao fechar, o
  // foco volta para ele em vez de cair no `body`. Guardado na renderização, antes de o
  // diálogo pegar o foco.
  const opener = useRef<Element | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = document.activeElement;

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
      const target = opener.current;
      // Só se o foco não foi para outro lugar de propósito (ficou no diálogo ou no body).
      const lost =
        document.activeElement === null ||
        document.activeElement === document.body ||
        dialog.contains(document.activeElement);
      if (lost && target instanceof HTMLElement && target.isConnected) target.focus();
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
