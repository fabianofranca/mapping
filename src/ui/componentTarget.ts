import { imageAt } from '../canvas/imageGeometry';
import { canvasToImagePixel } from '../canvas/markingGeometry';
import { isContainerComponent, markingComponent } from '../model';
import { resolveSelection } from '../store/ui';
import type { EditorContextValue } from './EditorContext';

// Onde a Biblioteca coloca o componente novo: dentro do container selecionado, ou na tela
// à vista. Função de leitura: lê os sinais com `.value`, então dentro de um `computed` ela
// segue a seleção, o projeto e o viewport; chamada num clique, só lê.

/** Para onde vai o componente: imagem, container pai (ou `null`) e centro em pixels da imagem. */
export interface ComponentTarget {
  readonly imageId: string;
  readonly parentId: string | null;
  readonly center?: { readonly x: number; readonly y: number };
}

/**
 * Alvo do "Adicionar" da paleta, ou `null` sem tela possível.
 *
 * 1. A seleção é uma marcação que desenha um componente container: entra nela.
 * 2. A tela à vista: a imagem sob o centro do viewport, com o componente centrado nesse ponto.
 * 3. Senão, a imagem selecionada (ou a da marcação selecionada), sem centro.
 */
export function componentTarget(editor: EditorContextValue): ComponentTarget | null {
  const { review, ui, derived, canvas, view } = editor;
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const selected = resolveSelection(project, ui.selection.value);

  if (selected?.kind === 'marking') {
    const drawn = markingComponent(project, derived.catalog.value, selected.marking.id);
    if (drawn && isContainerComponent(drawn.component)) {
      return { imageId: selected.marking.imageId, parentId: selected.marking.id };
    }
  }

  // Ler o viewport faz o alvo acompanhar o pan e o zoom.
  void view.viewport.value;
  const point = canvas.current?.viewportCenter();
  if (point) {
    const image = imageAt(project.images, point);
    if (image) {
      return {
        imageId: image.id,
        parentId: null,
        center: canvasToImagePixel(image.placement, point),
      };
    }
  }

  if (selected) return { imageId: selected.image.id, parentId: null };
  return null;
}
