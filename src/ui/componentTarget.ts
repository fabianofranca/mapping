import { imageAt, pointInRect } from '../canvas/imageGeometry';
import { canvasToImagePixel } from '../canvas/markingGeometry';
import { imageCanvasRect, hasSlotComponent, markingComponent } from '../model';
import { resolveSelection } from '../store/ui';
import type { EditorContextValue } from './EditorContext';

// Onde a Biblioteca coloca o componente novo: seleção primeiro (container selecionado, ou a
// tela da seleção); sem seleção, a tela à vista. Função de leitura: lê os sinais com `.value`, então dentro de um `computed` ela
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
 * 2. Há seleção: a imagem selecionada (ou a da marcação selecionada). Se o centro do viewport
 *    cai nela, o componente nasce centrado nesse ponto; senão, no centro da própria imagem.
 * 3. Sem seleção: a imagem sob o centro do viewport, centrado nesse ponto; sem imagem, `null`.
 */
export function componentTarget(editor: EditorContextValue): ComponentTarget | null {
  const { review, ui, derived, canvas, view } = editor;
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const selected = resolveSelection(project, ui.selection.value);

  if (selected?.kind === 'marking') {
    const drawn = markingComponent(project, derived.catalog.value, selected.marking.id);
    if (drawn && hasSlotComponent(drawn.component)) {
      return { imageId: selected.marking.imageId, parentId: selected.marking.id };
    }
  }

  // Ler o viewport faz o alvo acompanhar o pan e o zoom.
  void view.viewport.value;
  const point = canvas.current?.viewportCenter();

  // 2. Com seleção, a imagem dela; sem o centro da vista nela, `center` falta e o componente
  // nasce no centro da própria imagem (padrão de `addComponent`).
  if (selected) {
    const { image } = selected;
    if (point && pointInRect(point, imageCanvasRect(image, image.placement))) {
      return {
        imageId: image.id,
        parentId: null,
        center: canvasToImagePixel(image.placement, point),
      };
    }
    return { imageId: image.id, parentId: null };
  }

  // 3. Sem seleção, a tela sob o centro da vista.
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
  return null;
}
