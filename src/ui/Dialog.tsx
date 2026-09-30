import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

interface DialogProps {
  readonly title: string;
  /** Esc, toque fora ou botão de fechar do sistema. */
  readonly onCancel: () => void;
  readonly children?: ComponentChildren;
  /** Botões do rodapé. */
  readonly actions: ComponentChildren;
}

/** Diálogo modal com `<dialog>` nativo (foco preso e Esc de graça). */
export function Dialog({ title, onCancel, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
    }
  }, []);

  return (
    <dialog
      ref={ref}
      class="dialog"
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
      <div class="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div class="dialog-actions">{actions}</div>
      </div>
    </dialog>
  );
}
