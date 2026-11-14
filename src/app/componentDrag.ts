// Type of the palette item being dragged. `dataTransfer` is only readable on `drop`, so the
// canvas `dragover` reads the type from here. The palette sets it on `dragstart` and clears
// it on `dragend`.

/** MIME of dragging a palette type (JSON `{ specId, typeId }`). */
export const COMPONENT_DRAG_MIME = 'application/x-mapping-component';

export interface DraggedComponent {
  readonly specId: string;
  readonly typeId: string;
}

let dragged: DraggedComponent | null = null;

export function setDraggedComponent(next: DraggedComponent | null): void {
  dragged = next;
}

export function draggedComponent(): DraggedComponent | null {
  return dragged;
}

/** Does the drag in progress carry a palette type? */
export function dragHasComponent(data: DataTransfer | null | undefined): boolean {
  return (
    data !== null && data !== undefined && [...data.types].includes(COMPONENT_DRAG_MIME)
  );
}
