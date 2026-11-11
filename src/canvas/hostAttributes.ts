// Texto dos atributos de teste do `.canvas-host` (`data-selection`, `data-arrow-handles` e
// `data-container-boxes`), só leitura para os testes e para o testador da nuvem. Funções puras,
// sem Konva, testadas em `tests/canvas/hostAttributes.test.ts`. Números com 2 casas, como o
// `formatSelectionBox`.
import {
  imageCanvasRect,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { arrowHandles, type ArrowHandle, type ArrowShape } from './arrowGeometry';
import type { Viewport } from './viewport';

const round2 = (n: number): string => String(Math.round(n * 100) / 100);

/** `"<tipo> <id>"` da seleção primária (`image`, `marking` ou `arrow`); `null` se não resolve. */
export function formatSelection(
  project: Project | null,
  selection: Selection,
): string | null {
  if (!selection || !resolveSelection(project, selection)) return null;
  return `${selection.kind} ${selection.id}`;
}

function handleName(handle: ArrowHandle): string {
  return handle.kind === 'end' ? handle.end : `${handle.kind}${handle.index}`;
}

/**
 * `"<nome> <x> <y>"` separados por `;`, em px CSS relativos ao canto do host: `center` (o meio do
 * traço, onde o clique pega a seta) e as alças de `arrowHandles` na ordem dela.
 */
export function formatArrowHandles(shape: ArrowShape, view: Viewport): string {
  const entry = (name: string, at: { x: number; y: number }) =>
    `${name} ${round2(at.x * view.scale + view.x)} ${round2(at.y * view.scale + view.y)}`;
  return [
    entry('center', shape.label),
    ...arrowHandles(shape, view.scale).map((h) => entry(handleName(h), h.at)),
  ].join(';');
}

/**
 * `"<id> <x> <y> <largura> <altura> <escala>"` por container colocado, em unidades do canvas e na
 * ordem de `containers`, separados por `;`. `null` sem container colocado.
 */
export function formatContainerBoxes(
  containers: readonly ProjectContainer[],
  placements: ReadonlyMap<string, Placement>,
): string | null {
  const entries: string[] = [];
  for (const container of containers) {
    const placement = placements.get(container.id);
    if (!placement) continue;
    const r = imageCanvasRect(container, placement);
    entries.push(
      [container.id, r.x, r.y, r.width, r.height, placement.scale]
        .map((v) => (typeof v === 'number' ? round2(v) : v))
        .join(' '),
    );
  }
  return entries.length > 0 ? entries.join(';') : null;
}
