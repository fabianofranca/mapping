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

interface DialogProps {
  readonly title: string;
  /** Esc, toque fora ou botão de fechar do cabeçalho. */
  readonly onCancel: () => void;
  readonly children?: ComponentChildren;
  /** Botões do rodapé. */
  readonly actions: ComponentChildren;
  readonly size?: DialogSize;
  /** Corpo sem margem interna nem rolagem própria: o conteúdo cuida dos dois (ex.: Ajuda). */
  readonly flush?: boolean;
}

/**
 * Diálogo modal com `<dialog>` nativo (foco preso e Esc de graça). Cabeçalho de 44px com
 * título e fechar, corpo que rola e rodapé com borda; no celular ocupa a tela toda.
 */
export function Dialog({
  title,
  onCancel,
  children,
  actions,
  size = 'sm',
  flush = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
  }, []);

  return (
    <dialog
      ref={ref}
      class={size === 'sm' ? 'dialog' : `dialog dialog-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clique no fundo (fora do conteúdo) fecha.
        if (e.target === ref.current) onCancel();
      }}
    >
      <header class="dialog-header">
        <h2 id={titleId} class="dialog-title">
          {title}
        </h2>
        <IconButton icon="close" label={t('dialog.close')} onClick={onCancel} />
      </header>
      <div class={flush ? 'dialog-body dialog-body-flush' : 'dialog-body'}>
        {children}
      </div>
      <footer class="dialog-actions">{actions}</footer>
    </dialog>
  );
}
