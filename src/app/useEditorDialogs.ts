import { useState } from 'preact/hooks';
import { markingDeletionImpact, type Marking, type ProjectImage } from '../model';
import type { AspectChange } from '../store/session';
import { useEditor } from '../ui/EditorContext';

/** O diálogo aberto no editor (só um por vez), com os dados que ele precisa. */
export type EditorDialog =
  | { readonly kind: 'addMenu' }
  /** Celular: menu Painéis e ações (B6). */
  | { readonly kind: 'panels' }
  /** `section`: id da seção em que a Ajuda abre (ex.: os atalhos, pelas Configurações). */
  | { readonly kind: 'help'; readonly section?: string }
  | { readonly kind: 'specs' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'deleteImage'; readonly image: ProjectImage }
  | { readonly kind: 'deleteMarking'; readonly marking: Marking }
  | {
      readonly kind: 'aspect';
      readonly change: AspectChange;
      readonly resolve: (confirmed: boolean) => void;
    }
  | { readonly kind: 'export'; readonly file: File }
  | { readonly kind: 'confirmClose' };

export interface EditorDialogs {
  readonly current: EditorDialog | null;
  show(dialog: EditorDialog): void;
  close(): void;
  requestDeleteImage(image: ProjectImage): void;
  /** Em cascata pede confirmação; simples, não (o desfazer cobre). */
  requestDeleteMarking(marking: Marking): void;
}

export function useEditorDialogs(): EditorDialogs {
  const { store, actions, ui } = useEditor();
  const [current, setCurrent] = useState<EditorDialog | null>(null);
  const show = (dialog: EditorDialog) => setCurrent(dialog);

  return {
    current,
    show,
    close: () => setCurrent(null),
    requestDeleteImage: (image) => show({ kind: 'deleteImage', image }),
    requestDeleteMarking: (marking) => {
      const project = store.project.peek();
      if (!project) return;
      const impact = markingDeletionImpact(project, marking.id);
      if (impact.descendants > 0 || impact.annotations > 0) {
        show({ kind: 'deleteMarking', marking });
      } else if (actions.removeMarking(marking.id).ok) {
        ui.selection.value = null;
      }
    },
  };
}
