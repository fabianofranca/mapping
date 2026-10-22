import { imageAt, pointInRect } from '../canvas/imageGeometry';
import { canvasToImagePixel } from '../canvas/markingGeometry';
import { t } from '../i18n';
import {
  imageCanvasRect,
  hasSlotComponent,
  markingComponent,
  type ProjectContainer,
} from '../model';
import { resolveSelection } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { imageLabel, markingLabel } from './labels';

// Onde a Biblioteca coloca o componente novo: seleção primeiro (componente com slot, container
// ou marcação de container, marcação do canvas); sem seleção, o container sob o centro da vista
// ou, sem container, o canvas. Função de leitura: lê os sinais com `.value`, então dentro de um
// `computed` ela segue a seleção, o projeto e o viewport; chamada num clique, só lê.

/**
 * Para onde vai o componente: container (`null` = canvas), marcação pai com slot (ou `null`) e
 * centro no espaço do destino (pixels do container ou unidades do canvas).
 */
export interface ComponentTarget {
  readonly containerId: string | null;
  readonly parentId: string | null;
  readonly center?: { readonly x: number; readonly y: number };
  /** Como o rótulo do botão descreve o destino. */
  readonly destination:
    | { readonly kind: 'slot' | 'container'; readonly name: string }
    | { readonly kind: 'canvas' };
}

/**
 * Alvo do "Adicionar" da paleta (sempre existe: sem container, é o canvas).
 *
 * 1. A seleção é uma marcação que desenha um componente com slot: entra nela.
 * 2. A seleção é um container ou uma marcação de container: nele. Se o centro do viewport
 *    cai nele, o componente nasce centrado nesse ponto; senão, no centro do próprio container.
 * 3. A seleção é uma marcação do canvas sem slot: no canvas.
 * 4. Sem seleção: o container sob o centro do viewport; sem container, o canvas, no centro.
 */
export function componentTarget(editor: EditorContextValue): ComponentTarget | null {
  const { review, ui, derived, canvas, view } = editor;
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const selected = resolveSelection(project, ui.selection.value);

  if (selected?.kind === 'marking') {
    const drawn = markingComponent(project, derived.catalog.value, selected.marking.id);
    if (drawn && hasSlotComponent(drawn.component)) {
      return {
        containerId: selected.marking.containerId,
        parentId: selected.marking.id,
        destination: { kind: 'slot', name: markingLabel(selected.marking) },
      };
    }
  }

  // Ler o viewport faz o alvo acompanhar o pan e o zoom.
  void view.viewport.value;
  const point = canvas.current?.viewportCenter();
  const inContainer = (image: ProjectContainer): ComponentTarget =>
    point && pointInRect(point, imageCanvasRect(image, image.placement))
      ? {
          containerId: image.id,
          parentId: null,
          center: canvasToImagePixel(image.placement, point),
          destination: { kind: 'container', name: imageLabel(image) },
        }
      : {
          containerId: image.id,
          parentId: null,
          destination: { kind: 'container', name: imageLabel(image) },
        };
  const onCanvas = (): ComponentTarget => ({
    containerId: null,
    parentId: null,
    ...(point ? { center: { x: Math.round(point.x), y: Math.round(point.y) } } : {}),
    destination: { kind: 'canvas' },
  });

  if (selected) {
    if (selected.image) return inContainer(selected.image);
    return onCanvas();
  }

  const image = point ? imageAt(project.containers, point) : undefined;
  return image ? inContainer(image) : onCanvas();
}

/** Rótulo do botão Adicionar com o destino ("Adicionar dentro de Lista"). */
export function addLabel(target: ComponentTarget | null): string {
  const destination = target?.destination;
  if (!destination) return t('library.add');
  if (destination.kind === 'slot') {
    return t('library.addInside', { name: destination.name });
  }
  if (destination.kind === 'container') {
    return t('library.addToScreen', { name: destination.name });
  }
  return t('library.addToCanvas');
}
