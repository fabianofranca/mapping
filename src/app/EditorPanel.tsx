import type { ProjectImage } from '../model';
import { resolveSelection, type AnnotationLocation, type Selection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { MarkingPanel } from '../ui/MarkingPanel';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ReviewDetails } from '../ui/review/ReviewDetails';
import type { EditorDialogs } from './useEditorDialogs';

export interface EditorPanelProps {
  readonly busy: boolean;
  readonly dialogs: EditorDialogs;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Detalhes: a janela da direita. */
export function EditorPanel({
  busy,
  dialogs,
  onReplace,
  onGoToAnnotation,
}: EditorPanelProps) {
  const { store, ui, display, canvas, review } = useEditor();
  // Projeto confirmado: os campos do painel atualizam ao soltar o gesto, não durante.
  const project = store.committed.value;
  if (!project) return null;
  // Revisão de uma proposta: Detalhes mostra o nível selecionado com as mudanças.
  if (review.proposalId.value !== null) {
    return (
      <div class="tab-panel">
        <ReviewDetails />
      </div>
    );
  }
  const readOnly = store.locked.value;
  const selected = resolveSelection(project, ui.selection.value);
  const selectedImage = selected?.kind === 'image' ? selected.image : null;

  const onSelectMarking = (id: string) => {
    const next: NonNullable<Selection> = { kind: 'marking', id };
    ui.selection.value = next;
    canvas.current?.centerSelection();
  };

  return (
    <div class="tab-panel">
      {selected?.kind === 'marking' ? (
        <MarkingPanel
          key={selected.marking.id}
          project={project}
          marking={selected.marking}
          image={selected.image}
          readOnly={readOnly || busy}
          onDelete={dialogs.requestDeleteMarking}
          onSelectMarking={onSelectMarking}
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : (
        <SelectionPanel
          image={selectedImage}
          display={
            selectedImage ? display.images.value.get(selectedImage.file) : undefined
          }
          readOnly={readOnly}
          busy={busy}
          onReplace={onReplace}
          onDelete={dialogs.requestDeleteImage}
        />
      )}
    </div>
  );
}
