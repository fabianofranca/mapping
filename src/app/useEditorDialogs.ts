import {
  canDeleteImage,
  canDeleteMarking,
  markingDeletionImpact,
  type Marking,
  type ProjectContainer,
} from '../model';
import type { AspectChange } from '../store/session';
import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import { useEditor } from '../ui/EditorContext';
import { useDialogSlot, type DialogSlot } from '../ui/focus';

/** O diálogo aberto no editor (só um por vez), com os dados que ele precisa. */
export type EditorDialog =
  /** `section`: id da seção em que a Ajuda abre (ex.: os atalhos, pelas Configurações). */
  | { readonly kind: 'help'; readonly section?: string }
  | { readonly kind: 'specs' }
  /** Novo container (etapa Biblioteca, B3). */
  | { readonly kind: 'container' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'deleteImage'; readonly image: ProjectContainer }
  | { readonly kind: 'deleteMarking'; readonly marking: Marking }
  | {
      readonly kind: 'aspect';
      readonly change: AspectChange;
      readonly resolve: (confirmed: boolean) => void;
    }
  | { readonly kind: 'export'; readonly file: File; readonly saved: boolean }
  | { readonly kind: 'confirmClose' }
  /** Sair da revisão com aceitas ainda não aplicadas (etapa 4). */
  | { readonly kind: 'exitReview' };

export interface EditorDialogs {
  readonly current: EditorDialog | null;
  /** O slot do diálogo aberto (`DialogSlotContext`): quem abriu, herdado numa troca. */
  readonly slot: DialogSlot | null;
  /** Abre; com um diálogo aberto, troca por este (o foco volta a quem abriu o primeiro). */
  show(dialog: EditorDialog): void;
  close(): void;
  /**
   * O botão Exportar da barra (que o preenche): o retorno do foco do diálogo de exportação,
   * aberto depois de gerar o zip com o botão desabilitado.
   */
  readonly exportButton: RefObject<HTMLButtonElement>;
  requestDeleteImage(image: ProjectContainer): void;
  /** Em cascata pede confirmação; simples, não (o desfazer cobre). Item trancado: não faz nada. */
  requestDeleteMarking(marking: Marking): void;
}

export function useEditorDialogs(): EditorDialogs {
  const { store, actions, ui } = useEditor();
  const dialogs = useDialogSlot<EditorDialog>();
  const exportButton = useRef<HTMLButtonElement>(null);
  const { show } = dialogs;

  return {
    current: dialogs.current,
    slot: dialogs.slot,
    show,
    close: dialogs.close,
    exportButton,
    requestDeleteImage: (image) => {
      const project = store.project.peek();
      // Trancada (ou com marcação trancada): nada a confirmar, o modelo recusaria.
      if (!project || !canDeleteImage(project, image.id)) return;
      show({ kind: 'deleteImage', image });
    },
    requestDeleteMarking: (marking) => {
      const project = store.project.peek();
      if (!project || !canDeleteMarking(project, marking.id)) return;
      const impact = markingDeletionImpact(project, marking.id);
      if (impact.descendants > 0 || impact.annotations > 0) {
        show({ kind: 'deleteMarking', marking });
      } else if (actions.removeMarking(marking.id).ok) {
        ui.selection.value = null;
      }
    },
  };
}
