// Caixa da seleção primária em pixels de tela, publicada em `data-selection-box` (só leitura
// para os testes e2e). Função pura, testada em `tests/canvas/`.
import { imageCanvasRect, type Placement, type Project, type Rect } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { markingCanvasRect, placementOfSpace } from './markingGeometry';
import type { Viewport } from './viewport';

/**
 * Retângulo (px CSS, relativo ao host do canvas) da marcação, do container ou da flutuante
 * selecionados, com a colocação do container já somada. `null` sem seleção, com seta selecionada
 * ou com o item fora da vista colocada (outra perspectiva, por exemplo).
 */
export function selectionScreenBox(
  project: Project | null,
  selection: Selection,
  placements: ReadonlyMap<string, Placement>,
  viewport: Viewport,
): Rect | null {
  const selected = resolveSelection(project, selection);
  if (!selected || selected.kind === 'arrow') return null;
  let canvas: Rect;
  if (selected.kind === 'image') {
    const placement = placements.get(selected.image.id);
    if (!placement) return null;
    canvas = imageCanvasRect(selected.image, placement);
  } else {
    const placement = placementOfSpace(placements, selected.marking.containerId);
    if (!placement) return null;
    canvas = markingCanvasRect(placement, selected.marking.rect);
  }
  return {
    x: canvas.x * viewport.scale + viewport.x,
    y: canvas.y * viewport.scale + viewport.y,
    width: canvas.width * viewport.scale,
    height: canvas.height * viewport.scale,
  };
}

const round2 = (n: number): string => String(Math.round(n * 100) / 100);

/** `"<esquerda> <topo> <largura> <altura>"` com 2 casas; `null` vira atributo ausente. */
export function formatSelectionBox(box: Rect | null): string | null {
  return box
    ? `${round2(box.x)} ${round2(box.y)} ${round2(box.width)} ${round2(box.height)}`
    : null;
}

/** `"<x> <y> <escala>"`: translação com 2 casas e escala sem arredondar. */
export function formatViewport(v: Viewport): string {
  return `${round2(v.x)} ${round2(v.y)} ${String(v.scale)}`;
}
