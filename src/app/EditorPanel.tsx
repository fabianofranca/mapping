import type { ProjectContainer } from '../model';
import {
  existingItems,
  resolveSelection,
  selectedItems,
  type AnnotationLocation,
} from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { ArrowPanel } from '../ui/ArrowPanel';
import { MarkingPanel } from '../ui/MarkingPanel';
import { MultiSelectionPanel } from '../ui/MultiSelectionPanel';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ReviewPanel } from '../ui/review/ReviewPanel';
import type { EditorDialogs } from './useEditorDialogs';

export interface EditorPanelProps {
  readonly busy: boolean;
  readonly dialogs: EditorDialogs;
  readonly onReplace: (image: ProjectContainer) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Detalhes: a janela da direita. */
export function EditorPanel({
  busy,
  dialogs,
  onReplace,
  onGoToAnnotation,
}: EditorPanelProps) {
  const { store, ui, display, review } = useEditor();
  // O projeto à vista: fora da revisão, o confirmado (os campos do painel atualizam ao
  // soltar o gesto, não durante); na revisão, o que a visão Atual/Proposto mostra.
  const project = review.derived.shownProject.value;
  if (!project) return null;

  // Revisão de uma proposta: o painel normal do item, somente leitura, com os marcadores
  // (ou o nível selecionado com as mudanças, na proposta e no grupo Projeto).
  if (review.proposalId.value !== null) {
    return (
      <div class="tab-panel">
        <ReviewPanel onGoToAnnotation={onGoToAnnotation} />
      </div>
    );
  }
  const readOnly = store.locked.value;
  const items = existingItems(project, selectedItems(ui));
  if (items.length > 1) {
    return (
      <div class="tab-panel">
        <MultiSelectionPanel
          project={project}
          items={items}
          readOnly={readOnly || busy}
          onDelete={dialogs.requestDeleteItems}
        />
      </div>
    );
  }
  const selected = resolveSelection(project, ui.selection.value);
  const selectedImage = selected?.kind === 'image' ? selected.image : null;

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
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : selected?.kind === 'arrow' ? (
        <ArrowPanel
          key={selected.arrow.id}
          project={project}
          arrow={selected.arrow}
          readOnly={readOnly || busy}
          onDelete={dialogs.requestDeleteArrow}
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : (
        <SelectionPanel
          image={selectedImage}
          project={project}
          display={
            selectedImage?.file ? display.images.value.get(selectedImage.file) : undefined
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
