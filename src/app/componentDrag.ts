// Tipo da paleta em arrasto. O `dataTransfer` só é legível no `drop`, então o `dragover` do canvas
// lê o tipo daqui. A paleta grava no `dragstart` e limpa no `dragend`.

/** MIME do arrasto de um tipo da paleta (JSON `{ specId, typeId }`). */
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

/** O arrasto em curso traz um tipo da paleta? */
export function dragHasComponent(data: DataTransfer | null | undefined): boolean {
  return (
    data !== null && data !== undefined && [...data.types].includes(COMPONENT_DRAG_MIME)
  );
}
