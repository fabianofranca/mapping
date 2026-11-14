import type { ProjectContainer } from '../model';
import {
  existingItems,
  resolveSelection,
  selectedItems,
  type AnnotationLocation,
} from '../store/ui';
import {
  StandaloneThreadPanel,
  hasStandaloneThread,
} from '../ui/comments/StandaloneThreadPanel';
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

/** Details: the window on the right. */
export function EditorPanel({
  busy,
  dialogs,
  onReplace,
  onGoToAnnotation,
}: EditorPanelProps) {
  const { store, ui, display, review, derived } = useEditor();
  // The project in view: outside the review, the confirmed one (the panel fields update when
  // the gesture is released, not during); in the review, what the Current/Proposed view shows.
  const project = review.derived.shownProject.value;
  if (!project) return null;

  // Reviewing a proposal: the item's normal panel, read-only, with the markers (or the
  // selected level with the changes, in the proposal and in the Project group).
  if (review.proposalId.value !== null) {
    return (
      <div class="tab-panel">
        <ReviewPanel onGoToAnnotation={onGoToAnnotation} />
      </div>
    );
  }
  const openSettings = () => dialogs.show({ kind: 'settings' });
  // Thread without an item (layer, loose point, orphan): opens by itself, in place of the
  // selection panel.
  if (hasStandaloneThread(ui, project, derived.threads.entries.value)) {
    return (
      <div class="tab-panel">
        <StandaloneThreadPanel onOpenSettings={openSettings} />
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
          onOpenSettings={openSettings}
        />
      ) : selected?.kind === 'arrow' ? (
        <ArrowPanel
          key={selected.arrow.id}
          project={project}
          arrow={selected.arrow}
          readOnly={readOnly || busy}
          onDelete={dialogs.requestDeleteArrow}
          onGoToAnnotation={onGoToAnnotation}
          onOpenSettings={openSettings}
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
          onOpenSettings={openSettings}
        />
      )}
    </div>
  );
}
