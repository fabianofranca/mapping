import type { Project } from '../model';
import type { EditorMode, Selection } from './ui';

/**
 * A dica do modo Desenhar ("Arraste sobre uma imagem…") aparece na barra do canvas, no lugar
 * de "Nada selecionado": só com o modo `draw`, o projeto não trancado, sem seleção e com o
 * projeto à vista tendo ao menos um container. Condição num lugar só (lida pelo `Breadcrumbs`).
 */
export function drawHintVisible(input: {
  readonly mode: EditorMode;
  readonly locked: boolean;
  readonly selection: Selection;
  readonly shownProject: Project | null;
}): boolean {
  return (
    input.mode === 'draw' &&
    !input.locked &&
    input.selection === null &&
    (input.shownProject?.containers.length ?? 0) > 0
  );
}
