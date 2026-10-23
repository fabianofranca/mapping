import { findSlot, slotBoxOfScene } from './components/arrange';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import { instantiate, type TextMeasurer } from './components/instantiate';
import type { FrameNode } from './components/scene';
import {
  markingComponent,
  type ComponentCatalog,
  type MarkingComponent,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import { topDown } from './hierarchy';
import { projectIndex } from './projectIndex';
import type { Project, Rect } from './types';

// Desenhos dos componentes (etapa Biblioteca, B3): a cena instanciada de cada marcação que
// tem componente, derivada do projeto (retângulo da marcação, tipo e valores da anotação,
// molde da especialização) e nunca gravada. O cache só reinstancia a marcação cujas entradas
// mudaram e devolve o **mesmo objeto** nas demais: o canvas compara por identidade.

export interface ComponentDrawing {
  readonly markingId: string;
  /** Container da marcação; `null` = marcação do canvas (retângulo em unidades do canvas). */
  readonly containerId: string | null;
  readonly annotationId: string;
  /** Cena instanciada na caixa = retângulo da marcação (pixels da imagem ou unidades do canvas). */
  readonly root: FrameNode;
  readonly warnings: readonly string[];
  /** Não cabe: aviso "conteúdo maior que a caixa" do motor ou filha fora da caixa do slot. */
  readonly overflow: boolean;
}

/** Por id de marcação, inserido em ordem de desenho (pais antes das filhas; irmãs na ordem do array). */
export type ComponentDrawings = ReadonlyMap<string, ComponentDrawing>;

export const NO_DRAWINGS: ComponentDrawings = new Map();

/** Tolerância (px) entre a caixa do slot (decimal) e o retângulo inteiro de uma filha. */
const SLOT_TOLERANCE = 1;

const OVERFLOW_WARNING = 'conteúdo maior que a caixa';

export type DrawingCache = (
  p: Project | null,
  catalog: ComponentCatalog,
  measure: TextMeasurer,
  epoch: number,
) => ComponentDrawings;

interface Entry {
  readonly markingId: string;
  readonly containerId: string | null;
  readonly annotationId: string;
  readonly rect: Rect;
  readonly component: ComponentFile;
  readonly values: FieldValues;
  readonly valueWarnings: readonly string[];
  readonly measure: TextMeasurer;
  readonly epoch: number;
  /** Retângulos das filhas diretas (só containers). */
  readonly childRects: readonly Rect[];
  readonly drawing: ComponentDrawing;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRect(r, b[i] as Rect));
}

/** Mesmo valor; as linhas de uma tabela (listas recriadas a cada leitura) comparam célula a célula. */
function sameFieldValue(a: FieldValues[string], b: FieldValues[string]): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    if (row === other) return true;
    if (other === undefined) return false;
    const keys = Object.keys(row);
    return (
      keys.length === Object.keys(other).length &&
      keys.every((key) => key in other && Object.is(row[key], other[key]))
    );
  });
}

function shallowEqual(a: FieldValues, b: FieldValues): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => key in b && sameFieldValue(a[key], b[key]));
}

/** Alguma filha com o retângulo fora da caixa do slot (com a tolerância do arredondamento). */
function childOutsideSlot(root: FrameNode, childRects: readonly Rect[]): boolean {
  const box = slotBoxOfScene(root);
  if (box === undefined) return false;
  return childRects.some(
    (r) =>
      r.x < box.x - SLOT_TOLERANCE ||
      r.y < box.y - SLOT_TOLERANCE ||
      r.x + r.width > box.x + box.width + SLOT_TOLERANCE ||
      r.y + r.height > box.y + box.height + SLOT_TOLERANCE,
  );
}

function draw(
  mc: MarkingComponent,
  markingId: string,
  containerId: string | null,
  rect: Rect,
  values: FieldValues,
  valueWarnings: readonly string[],
  childRects: readonly Rect[],
  measure: TextMeasurer,
): ComponentDrawing {
  const { root, warnings } = instantiate(mc.component, values, rect, {
    measure,
    idPrefix: markingId,
  });
  const overflow =
    warnings.some((w) => w.startsWith(OVERFLOW_WARNING)) ||
    (childRects.length > 0 && childOutsideSlot(root, childRects));
  return {
    markingId,
    containerId,
    annotationId: mc.annotation.id,
    root,
    warnings: [...warnings, ...valueWarnings],
    overflow,
  };
}

/**
 * Cache dos desenhos de um projeto. A cada chamada devolve, em ordem de desenho, um desenho
 * por marcação com componente. Uma marcação só é reinstanciada quando muda algo de que o
 * desenho dela depende: o retângulo, o componente (por identidade), os valores resolvidos
 * (comparação rasa), o medidor, a época das fontes e, nos containers, os retângulos das
 * filhas; senão volta o mesmo `ComponentDrawing`. Mesmas entradas devolvem o mesmo `Map`.
 */
export function createDrawingCache(): DrawingCache {
  let entries = new Map<string, Entry>();
  let last: {
    p: Project | null;
    catalog: ComponentCatalog;
    measure: TextMeasurer;
    epoch: number;
    result: ComponentDrawings;
  } | null = null;

  return (p, catalog, measure, epoch) => {
    if (
      last !== null &&
      last.p === p &&
      last.catalog === catalog &&
      last.measure === measure &&
      last.epoch === epoch
    ) {
      return last.result;
    }
    if (p === null) {
      entries = new Map();
      last = { p, catalog, measure, epoch, result: NO_DRAWINGS };
      return NO_DRAWINGS;
    }

    const children = projectIndex(p).children;
    const next = new Map<string, Entry>();
    const drawings = new Map<string, ComponentDrawing>();
    for (const marking of topDown(p.markings)) {
      const mc = markingComponent(p, catalog, marking.id);
      if (mc === null) continue;
      const { values, warnings: valueWarnings } = drawingValues(
        p,
        mc.annotation,
        mc.type,
      );
      const childRects =
        findSlot(mc.component) === undefined
          ? []
          : (children.get(marking.id) ?? []).map((c) => c.rect);
      const before = entries.get(marking.id);
      if (
        before !== undefined &&
        before.annotationId === mc.annotation.id &&
        before.containerId === marking.containerId &&
        sameRect(before.rect, marking.rect) &&
        before.component === mc.component &&
        before.measure === measure &&
        before.epoch === epoch &&
        shallowEqual(before.values, values) &&
        before.valueWarnings.length === valueWarnings.length &&
        before.valueWarnings.every((w, i) => w === valueWarnings[i]) &&
        sameRects(before.childRects, childRects)
      ) {
        next.set(marking.id, before);
        drawings.set(marking.id, before.drawing);
        continue;
      }
      const drawing = draw(
        mc,
        marking.id,
        marking.containerId,
        marking.rect,
        values,
        valueWarnings,
        childRects,
        measure,
      );
      next.set(marking.id, {
        markingId: marking.id,
        containerId: marking.containerId,
        annotationId: mc.annotation.id,
        rect: marking.rect,
        component: mc.component,
        values,
        valueWarnings,
        measure,
        epoch,
        childRects,
        drawing,
      });
      drawings.set(marking.id, drawing);
    }
    entries = next;

    // Nada mudou nos desenhos (mesmos objetos, mesma ordem): mantém o mesmo mapa.
    const previous = last?.result;
    let result: ComponentDrawings = drawings.size === 0 ? NO_DRAWINGS : drawings;
    if (previous !== undefined && previous.size === drawings.size) {
      const before = [...previous];
      const same = [...drawings].every(
        ([id, drawing], i) => before[i]?.[0] === id && before[i]?.[1] === drawing,
      );
      if (same) result = previous;
    }
    last = { p, catalog, measure, epoch, result };
    return result;
  };
}
