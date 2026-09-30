import { signal, type Signal } from '@preact/signals';
import type { Marking, Project, ProjectImage } from '../model';

/** Item selecionado no editor. */
export type Selection =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'marking'; readonly id: string }
  | null;

/** Navegar: tocar seleciona, arrastar move ou faz pan. Desenhar: arrastar cria marcações. */
export type EditorMode = 'navigate' | 'draw';

/**
 * Estado da UI do editor: não vai para o JSON nem entra no desfazer.
 * O viewport fica com o `CanvasController`, que é quem o altera.
 */
export interface EditorUi {
  readonly selection: Signal<Selection>;
  readonly mode: Signal<EditorMode>;
}

export function createEditorUi(): EditorUi {
  return { selection: signal<Selection>(null), mode: signal<EditorMode>('navigate') };
}

export type ResolvedSelection =
  | { readonly kind: 'image'; readonly image: ProjectImage }
  | {
      readonly kind: 'marking';
      readonly marking: Marking;
      readonly image: ProjectImage;
    }
  | null;

/** Item selecionado no projeto atual (`null` se ele não existe mais, ex.: após desfazer). */
export function resolveSelection(
  project: Project | null,
  selection: Selection,
): ResolvedSelection {
  if (!project || !selection) return null;
  if (selection.kind === 'image') {
    const image = project.images.find((i) => i.id === selection.id);
    return image ? { kind: 'image', image } : null;
  }
  const marking = project.markings.find((m) => m.id === selection.id);
  const image = marking && project.images.find((i) => i.id === marking.imageId);
  return marking && image ? { kind: 'marking', marking, image } : null;
}
