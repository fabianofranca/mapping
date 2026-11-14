import { useEditor } from './EditorContext';
import { LayerActions, LayersPanel } from './LayersPanel';
import { ToolWindow } from './ToolWindow';

/**
 * Layers window (B3), on the left below the Tree: rename in the row, palette in a
 * popover, "no annotation" mode in the footer. New layer and Show all stay in the header.
 */
export function LayersWindow({ stacked }: { readonly stacked: boolean }) {
  const { store, review } = useEditor();
  // The project in view: in the Proposed view of the review, the layer created by the proposal
  // appears here as in the Tree (phase 8.2, P1).
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const readOnly = store.locked.value;
  return (
    <ToolWindow
      id="layers"
      stacked={stacked}
      actions={<LayerActions project={project} readOnly={readOnly} />}
    >
      <LayersPanel project={project} readOnly={readOnly} />
    </ToolWindow>
  );
}
