import { signal, type Signal } from '@preact/signals';

/** Item selecionado no editor. Marcações entram na Fase 4. */
export type Selection = { readonly kind: 'image'; readonly id: string } | null;

/**
 * Estado da UI do editor: não vai para o JSON nem entra no desfazer.
 * O viewport fica com o `CanvasController`, que é quem o altera.
 */
export interface EditorUi {
  readonly selection: Signal<Selection>;
}

export function createEditorUi(): EditorUi {
  return { selection: signal<Selection>(null) };
}
