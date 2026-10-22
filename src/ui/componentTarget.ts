import type { DropTarget } from '../canvas/frame';
import { ABSORB_TOLERANCE, snapTarget } from '../canvas/containment';
import { imageAt, pointInRect } from '../canvas/imageGeometry';
import { hitChain } from '../canvas/input/intents';
import { canvasToImagePixel } from '../canvas/markingGeometry';
import type { Point } from '../canvas/viewport';
import { t } from '../i18n';
import {
  IDENTITY_PLACEMENT,
  imageCanvasRect,
  hasSlotComponent,
  markingComponent,
  projectIndex,
  type ComponentCatalog,
  type ComponentType,
  type MarkingVisibility,
  type Project,
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
 *
 * Um tipo flutuante (`floating`, decisão 10) vive só no canvas: o alvo é sempre o canvas, no
 * centro da vista, qualquer que seja a seleção.
 */
export function componentTarget(
  editor: EditorContextValue,
  options: { readonly floating?: boolean } = {},
): ComponentTarget | null {
  const { review, ui, derived, canvas, view } = editor;
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const selected = resolveSelection(project, ui.selection.value);

  if (options.floating !== true && selected?.kind === 'marking') {
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

  if (options.floating === true) return onCanvas();
  // ME4: a seta selecionada não é destino de componente (UI): cai no centro da vista.
  if (selected && selected.kind !== 'arrow') {
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

// ---------------------------------------------------------------------------
// Soltar um tipo da paleta no canvas (etapa Marcações espaciais, ME2)

/** Destino de um tipo da paleta solto no canvas, mais o que acender enquanto se arrasta. */
export interface ComponentDropTarget {
  readonly containerId: string | null;
  readonly parentId: string | null;
  readonly center?: { readonly x: number; readonly y: number };
  readonly highlight: NonNullable<DropTarget>;
}

export interface ComponentDropInput {
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /** Ponteiro, em unidades do canvas. */
  readonly point: Point;
  readonly zoom: number;
  readonly type: ComponentType;
}

/**
 * Onde um componente solto em `point` nasce: no slot da marcação mais interna sob o ponteiro
 * que desenha um componente com slot; senão no container sob o ponteiro (centrado nele); senão,
 * no vazio, no container em que o retângulo do componente centrado no ponteiro fica quase
 * inteiro (encaixe); senão no canvas. Sem absorção. Um tipo flutuante nasce sempre no canvas,
 * onde cai, sem slot, container nem encaixe (decisão 10).
 */
export function componentDropTarget(input: ComponentDropInput): ComponentDropTarget {
  const { project, catalog, visibility, point, zoom, type } = input;
  const byId = projectIndex(project).markings;

  if (type.floating) {
    return {
      containerId: null,
      parentId: null,
      center: { x: Math.round(point.x), y: Math.round(point.y) },
      highlight: { containerId: null },
    };
  }

  for (const hit of hitChain(project, visibility, point)) {
    if (hit.kind === 'image') break; // o container vence os ancestrais dele
    const marking = byId.get(hit.id);
    if (!marking) continue;
    const drawn = markingComponent(project, catalog, marking.id);
    if (drawn && hasSlotComponent(drawn.component)) {
      return {
        containerId: marking.containerId,
        parentId: marking.id,
        highlight: { containerId: marking.containerId, markingId: marking.id },
      };
    }
  }

  const inside = (container: ProjectContainer): ComponentDropTarget => ({
    containerId: container.id,
    parentId: null,
    center: canvasToImagePixel(container.placement, point),
    highlight: { containerId: container.id },
  });
  const over = imageAt(project.containers, point);
  if (over) return inside(over);

  const { width, height } = type.component.size;
  const rect = { x: point.x - width / 2, y: point.y - height / 2, width, height };
  const snap = snapTarget(
    rect,
    IDENTITY_PLACEMENT,
    project.containers,
    ABSORB_TOLERANCE / zoom,
  );
  const snapped = snap && projectIndex(project).containers.get(snap.containerId);
  if (snapped) return inside(snapped);

  return {
    containerId: null,
    parentId: null,
    center: { x: Math.round(point.x), y: Math.round(point.y) },
    highlight: { containerId: null },
  };
}
