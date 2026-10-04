import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { IconButton } from './controls';

// Folha de ações do celular (o menu Painéis, B6): sobe de baixo, sobre um fundo
// escurecido, com a alça no topo. `<dialog>` nativo: foco preso e Esc de graça; tocar
// no fundo fecha.

interface ActionSheetProps {
  /** Nome acessível da folha. */
  readonly label: string;
  /** Esc, toque no fundo ou botão de fechar. */
  readonly onCancel: () => void;
  readonly children: ComponentChildren;
}

export function ActionSheet({ label, onCancel, children }: ActionSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      // Detecção de recurso: sem `showModal` (navegador antigo) abre sem modal.
      dialog.setAttribute('open', '');
    }
    // Foco no primeiro item do corpo, não no fechar.
    dialog
      .querySelector<HTMLElement>('.action-sheet-body button:not([disabled])')
      ?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      class="action-sheet"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Toque no fundo (fora do conteúdo) fecha.
        if (e.target === ref.current) onCancel();
      }}
    >
      <div class="action-sheet-head">
        <span class="sheet-handle" aria-hidden="true" />
        <IconButton icon="close" label={t('dialog.close')} onClick={onCancel} />
      </div>
      <div class="action-sheet-body">{children}</div>
    </dialog>
  );
}
