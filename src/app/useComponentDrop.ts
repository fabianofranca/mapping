import { useEditor } from '../ui/EditorContext';
import { componentDropTarget } from '../ui/componentTarget';
import { libraryErrorMessage } from '../ui/labels';
import { dragHasComponent, draggedComponent, setDraggedComponent } from './componentDrag';
import type { EditorNotices } from './useEditorNotices';

export interface ComponentDrop {
  readonly onDragOver: (e: DragEvent) => void;
  readonly onDragLeave: (e: DragEvent) => void;
  readonly onDrop: (e: DragEvent) => void;
}

/**
 * Soltar no canvas um tipo arrastado da paleta cria a instância onde ela cai (uma entrada de
 * desfazer: `addComponent`). O destino acende durante o arrasto (`setDropTarget`).
 */
export function useComponentDrop({
  setMessage,
}: Pick<EditorNotices, 'setMessage'>): ComponentDrop {
  const editor = useEditor();
  const { actions, store, ui, canvas, review, derived, view } = editor;

  const targetAt = (e: DragEvent) => {
    const dragged = draggedComponent();
    const project = review.derived.shownProject.value;
    const controller = canvas.current;
    if (!dragged || !project || !controller) return null;
    const type = derived.componentTypes
      .peek()
      .find((c) => c.specId === dragged.specId && c.typeId === dragged.typeId);
    if (!type) return null;
    return {
      dragged,
      target: componentDropTarget({
        project,
        catalog: derived.catalog.peek(),
        visibility: derived.markingVisibility.peek(),
        point: controller.canvasPointAt(e.clientX, e.clientY),
        zoom: view.viewport.peek().scale,
        type,
      }),
    };
  };

  const accepts = (e: DragEvent) =>
    dragHasComponent(e.dataTransfer) &&
    !store.locked.peek() &&
    review.proposalId.peek() === null;

  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    canvas.current?.setDropTarget(targetAt(e)?.target.highlight ?? null);
  };

  const onDragLeave = (e: DragEvent) => {
    if (!dragHasComponent(e.dataTransfer)) return;
    if (e.relatedTarget instanceof Node && e.currentTarget instanceof Node) {
      if (e.currentTarget.contains(e.relatedTarget)) return;
    }
    canvas.current?.setDropTarget(null);
  };

  const onDrop = (e: DragEvent) => {
    if (!dragHasComponent(e.dataTransfer)) return;
    e.preventDefault();
    canvas.current?.setDropTarget(null);
    if (!accepts(e)) return;
    const hit = targetAt(e);
    setDraggedComponent(null);
    if (!hit) return;
    const { dragged, target } = hit;
    const result = actions.addComponent({
      containerId: target.containerId,
      parentId: target.parentId,
      specId: dragged.specId,
      typeId: dragged.typeId,
      ...(target.center ? { center: target.center } : {}),
    });
    if (!result.ok) {
      setMessage(libraryErrorMessage(result.error));
      return;
    }
    setMessage(null);
    ui.selection.value = { kind: 'marking', id: result.value };
  };

  return { onDragOver, onDragLeave, onDrop };
}
