import {
  findSlot,
  layoutChildren,
  resolveSlotLayout,
  slotBoxOfScene,
  type ResolvedSlotLayout,
} from './components/arrange';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import {
  instantiate,
  measureComponent,
  type TextMeasurer,
} from './components/instantiate';
import { markingComponent, type ComponentCatalog } from './componentCatalog';
import { drawingValues } from './componentValues';
import { fail } from './errors';
import { MIN_MARKING_SIZE, bottom, clamp, imagePixelRect, right } from './geometry';
import { settleIf, type SettleOptions } from './hierarchySettle';
import { isMarkingGeometryLocked } from './locks';
import { projectIndex } from './projectIndex';
import type { Marking, Project, Rect } from './types';

// Arrumar (etapa Biblioteca, B3): recalcula e grava os retângulos das filhas de um componente
// com slot pelo `layout` do slot, e o tamanho do componente que abraça o conteúdo (`hug`). Só por ação
// da pessoa: nunca na carga, no MCP nem ao aplicar proposta. Puro; o store faz dela uma
// entrada de desfazer.

export interface ArrangeResult {
  readonly project: Project;
  /** O que não coube ou foi preso, um aviso por linha, sem repetição. */
  readonly warnings: readonly string[];
}

/** Voltas no máximo até os tamanhos estabilizarem (um componente com slot esticado pelo pai rearruma as filhas). */
const MAX_PASSES = 4;

/** Um componente com slot que arruma: slot `row`/`column` e ao menos uma filha. */
interface Container {
  readonly id: string;
  readonly component: ComponentFile;
  readonly values: FieldValues;
  readonly layout: ResolvedSlotLayout;
  readonly kids: readonly Marking[];
  readonly label: string;
}

function containerOf(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): Container | null {
  const mc = markingComponent(p, catalog, markingId);
  if (mc === null) return null;
  const slot = findSlot(mc.component);
  if (slot === undefined) return null;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const layout = resolveSlotLayout(slot, values);
  if (layout.type === 'none') return null;
  const kids = projectIndex(p).children.get(markingId) ?? [];
  if (kids.length === 0) return null;
  const marking = projectIndex(p).markings.get(markingId);
  return {
    id: markingId,
    component: mc.component,
    values,
    layout,
    kids,
    label: marking?.name ?? mc.type.name,
  };
}

/** Dá para arrumar: a marcação é um componente com slot `row`/`column` com filhas. */
export function canArrange(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  return containerOf(p, catalog, markingId) !== null;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Inteiro para cima, sem que o ruído do ponto flutuante some um pixel. */
function ceilFit(value: number): number {
  return Math.ceil(value - 1e-6);
}

/** `inner` preso dentro de `outer`. `push` empurra (e encolhe só se for maior); `shrink` mantém x e y e corta o excesso. */
function clampRect(inner: Rect, outer: Rect, mode: 'push' | 'shrink'): Rect {
  if (mode === 'shrink') {
    const x = clamp(inner.x, outer.x, Math.max(outer.x, right(outer) - 1));
    const y = clamp(inner.y, outer.y, Math.max(outer.y, bottom(outer) - 1));
    return {
      x,
      y,
      width: Math.max(1, Math.min(right(inner), right(outer)) - x),
      height: Math.max(1, Math.min(bottom(inner), bottom(outer)) - y),
    };
  }
  const width = Math.min(inner.width, outer.width);
  const height = Math.min(inner.height, outer.height);
  return {
    x: clamp(inner.x, outer.x, right(outer) - width),
    y: clamp(inner.y, outer.y, bottom(outer) - height),
    width,
    height,
  };
}

/**
 * Arruma o componente com slot escolhido e os componentes com slot dentro dele (a subárvore). Do mais fundo para
 * o raso, cada componente com slot posiciona as filhas na caixa do slot (a ordem é a do array; o
 * tamanho no eixo principal fica (menos o das filhas `hug`, remedidas), `align: stretch` estica o cruzado, `justify` distribui) e,
 * se o componente é `hug` num eixo, ajusta o componente com slot ao conteúdo (nunca abaixo do
 * `minSize`; a posição fica). Eixo fixo não muda: se o conteúdo não cabe, avisa. Mover uma
 * filha leva os descendentes dela. No fim, toda marcação fica inteira e dentro do pai e da
 * imagem: o que passaria é preso, com aviso (uma raiz do canvas não tem limite). Assenta ao fim
 * (as filhas mudaram de lugar: o pertencimento se refaz). Devolve o mesmo `Project` quando nada
 * muda; falha com `not-arrangeable` (não é componente com slot `row`/`column` com filhas) e
 * `locked` (algum retângulo que mudaria tem a geometria travada).
 */
export function arrangeMarking(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
  measure: TextMeasurer,
  options?: SettleOptions,
): ArrangeResult {
  if (containerOf(p, catalog, markingId) === null) fail('not-arrangeable', markingId);
  const index = projectIndex(p);
  const rects = new Map<string, Rect>();
  const childrenOf = (id: string): readonly Marking[] => index.children.get(id) ?? [];

  // Subárvore: de cima para baixo (a raiz primeiro) e a pós-ordem (o mais fundo primeiro).
  const topDownIds: string[] = [];
  const queue = [markingId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    topDownIds.push(id);
    queue.push(...childrenOf(id).map((c) => c.id));
  }
  for (const id of topDownIds) {
    rects.set(id, (index.markings.get(id) as Marking).rect);
  }
  const postOrder: string[] = [];
  const visit = (id: string) => {
    for (const child of childrenOf(id)) visit(child.id);
    postOrder.push(id);
  };
  visit(markingId);

  const containers = new Map<string, Container | null>();
  const containerAt = (id: string): Container | null => {
    if (!containers.has(id)) containers.set(id, containerOf(p, catalog, id));
    return containers.get(id) ?? null;
  };
  const labelOf = (id: string): string => {
    const marking = index.markings.get(id) as Marking;
    return marking.name ?? markingComponent(p, catalog, id)?.type.name ?? marking.id;
  };

  const translate = (id: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    for (const child of childrenOf(id)) {
      const r = rects.get(child.id) as Rect;
      rects.set(child.id, { ...r, x: r.x + dx, y: r.y + dy });
      translate(child.id, dx, dy);
    }
  };

  /** O pai estica este componente com slot no eixo (o `stretch` do pai vale mais que o `hug`). */
  const stretchedByParent = (id: string, axis: 'width' | 'height'): boolean => {
    const parentId = (index.markings.get(id) as Marking).parentId;
    const parent = parentId === null ? null : containerAt(parentId);
    if (parent === null || parent.layout.align !== 'stretch') return false;
    return axis === (parent.layout.type === 'row' ? 'height' : 'width');
  };

  let warnings = new Set<string>();

  /**
   * Remede as filhas folha cujo componente é `hug` num eixo: o eixo vira o tamanho medido
   * (inteiro para cima, nunca abaixo do `minSize`). O componente com slot filho já se ajustou na própria
   * volta (do mais fundo para o raso). O eixo que o `stretch` do pai estica fica.
   */
  const remeasureHugKids = (kids: readonly Marking[]) => {
    for (const kid of kids) {
      if (containerAt(kid.id) !== null) continue;
      const mc = markingComponent(p, catalog, kid.id);
      const sizing = mc?.component.sizing;
      if (mc === undefined || mc === null || sizing === undefined) continue;
      const hugW = sizing.width === 'hug' && !stretchedByParent(kid.id, 'width');
      const hugH = sizing.height === 'hug' && !stretchedByParent(kid.id, 'height');
      if (!hugW && !hugH) continue;
      const rect = rects.get(kid.id) as Rect;
      const values = drawingValues(p, mc.annotation, mc.type).values;
      const measured = measureComponent(
        mc.component,
        values,
        { width: hugW ? null : rect.width, height: hugH ? null : rect.height },
        { measure },
      );
      const min = mc.component.minSize;
      rects.set(kid.id, {
        ...rect,
        width: hugW
          ? Math.max(ceilFit(measured.width), min?.width ?? 0, MIN_MARKING_SIZE)
          : rect.width,
        height: hugH
          ? Math.max(ceilFit(measured.height), min?.height ?? 0, MIN_MARKING_SIZE)
          : rect.height,
      });
    }
  };

  const arrangeOne = (id: string) => {
    const info = containerAt(id);
    if (info === null) return;
    const { component, values, layout, kids } = info;
    remeasureHugKids(kids);
    const sizes = kids.map((k) => rects.get(k.id) as Rect);
    const row = layout.type === 'row';
    const pad = layout.padding;
    const gaps = layout.gap * (kids.length - 1);
    const sum = (axis: 'width' | 'height') => sizes.reduce((s, r) => s + r[axis], 0);
    const widest = (axis: 'width' | 'height') =>
      sizes.reduce((m, r) => Math.max(m, r[axis]), 0);
    const slotContent = {
      width: (row ? sum('width') + gaps : widest('width')) + pad.left + pad.right,
      height: (row ? widest('height') : sum('height') + gaps) + pad.top + pad.bottom,
    };

    let rect = rects.get(id) as Rect;
    const hugW = component.sizing?.width === 'hug' && !stretchedByParent(id, 'width');
    const hugH = component.sizing?.height === 'hug' && !stretchedByParent(id, 'height');
    if (hugW || hugH) {
      const measured = measureComponent(
        component,
        values,
        { width: hugW ? null : rect.width, height: hugH ? null : rect.height },
        { measure, slotContent },
      );
      const min = component.minSize;
      const width = hugW
        ? Math.max(ceilFit(measured.width), min?.width ?? 0, MIN_MARKING_SIZE)
        : rect.width;
      const height = hugH
        ? Math.max(ceilFit(measured.height), min?.height ?? 0, MIN_MARKING_SIZE)
        : rect.height;
      rect = { ...rect, width, height };
      rects.set(id, rect);
    }

    const { root } = instantiate(component, values, rect, {
      measure,
      idPrefix: id,
      slotContent,
    });
    const box = slotBoxOfScene(root);
    if (box === undefined) return;
    if (
      (!hugW && slotContent.width > box.width + 0.5) ||
      (!hugH && slotContent.height > box.height + 0.5)
    ) {
      warnings.add(`${info.label}: conteúdo maior que o container`);
    }
    const targets = layoutChildren(
      box,
      layout,
      sizes.map((box) => ({ box })),
    );
    kids.forEach((kid, i) => {
      const target = targets[i] as Rect;
      const before = rects.get(kid.id) as Rect;
      if (sameRect(before, target)) return;
      rects.set(kid.id, target);
      translate(kid.id, target.x - before.x, target.y - before.y);
    });
  };

  const snapshot = () => postOrder.map((id) => rects.get(id) as Rect);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const before = snapshot();
    warnings = new Set();
    for (const id of postOrder) arrangeOne(id);
    const after = snapshot();
    if (after.every((r, i) => sameRect(r, before[i] as Rect))) break;
  }

  // Invariantes: inteiros e dentro do pai (ou do container). A raiz encolhe, as demais são
  // empurradas para dentro e só encolhem se forem maiores que o pai. Sem pai, o limite é o
  // container (marcação de container) ou nenhum (marcação do canvas).
  for (const id of topDownIds) {
    const marking = index.markings.get(id) as Marking;
    const rect = rects.get(id) as Rect;
    const isRoot = id === markingId;
    let outer: Rect | null;
    if (marking.parentId !== null) {
      outer = isRoot
        ? (index.markings.get(marking.parentId) as Marking).rect
        : (rects.get(marking.parentId) as Rect);
    } else if (marking.containerId === null) {
      outer = null;
    } else {
      outer = imagePixelRect(
        index.containers.get(marking.containerId) ?? { width: 0, height: 0 },
      );
    }
    if (outer === null) continue;
    const fixed = clampRect(rect, outer, isRoot ? 'shrink' : 'push');
    if (sameRect(rect, fixed)) continue;
    rects.set(id, fixed);
    translate(id, fixed.x - rect.x, fixed.y - rect.y);
    const where =
      marking.parentId === null
        ? (index.containers.get(marking.containerId ?? '')?.name ?? marking.containerId)
        : labelOf(marking.parentId);
    warnings.add(`${labelOf(id)}: não cabe em ${where}`);
  }

  const changed = topDownIds.filter(
    (id) => !sameRect(rects.get(id) as Rect, (index.markings.get(id) as Marking).rect),
  );
  if (changed.length === 0) return { project: p, warnings: [...warnings] };
  if (changed.some((id) => isMarkingGeometryLocked(p, id))) fail('locked');
  const next = new Set(changed);
  return {
    project: settleIf(
      {
        ...p,
        markings: p.markings.map((m) =>
          next.has(m.id) ? { ...m, rect: rects.get(m.id) as Rect } : m,
        ),
      },
      options,
    ),
    warnings: [...warnings],
  };
}
