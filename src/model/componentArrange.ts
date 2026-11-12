import {
  findSlot,
  contentExtent,
  layoutChildren,
  resolveSlotLayout,
  slotBoxOfScene,
  type ResolvedSlotLayout,
} from './components/arrange';
import type {
  ComponentFile,
  FieldValues,
  IntrinsicSize,
} from './components/componentFormat';
import { isIntrinsicSize } from './components/layoutValues';
import {
  expressionPx,
  fitComponentSize,
  followedAxes,
  resolveSizing,
  type ResolvedAxis,
  type ResolvedSizing,
} from './components/sizing';
import type { ResolvedTokens } from './components/tokens';
import {
  instantiate,
  measureComponent,
  type TextMeasurer,
} from './components/instantiate';
import { markingComponent, type ComponentCatalog } from './componentCatalog';
import { drawingValues } from './componentValues';
import { componentForDrawing } from './drawingMode';
import { fail } from './errors';
import {
  MIN_STORED_MARKING_SIZE,
  bottom,
  clamp,
  imagePixelRect,
  right,
} from './geometry';
import { settleFrom, type SettleOptions } from './hierarchySettle';
import { markingLockStates } from './locks';
import { modelMessage, type ModelMessage } from './modelMessage';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { Marking, Project, Rect } from './types';

// Arrumar (etapa Biblioteca, B3): recalcula e grava os retângulos das filhas de um componente
// com slot pelo `layout` do slot, e o tamanho do componente que abraça o conteúdo (`hug`). Só por ação
// da pessoa: nunca na carga, no MCP nem ao aplicar proposta. Puro; o store faz dela uma
// entrada de desfazer.

export interface ArrangeResult {
  readonly project: Project;
  /** O que não coube ou foi preso, um aviso por linha, sem repetição (de texto igual). */
  readonly warnings: readonly ModelMessage[];
}

/** Voltas no máximo até os tamanhos estabilizarem (um componente com slot esticado pelo pai rearruma as filhas). */
const MAX_PASSES = 4;

/** Um componente com slot que arruma: slot `row`/`column` e ao menos uma filha. */
interface Container {
  readonly id: string;
  readonly component: ComponentFile;
  /** Tabela de tokens do modo do desenho (a mesma que o `component` já traz aplicada). */
  readonly tokens: ResolvedTokens | undefined;
  readonly values: FieldValues;
  readonly layout: ResolvedSlotLayout;
  readonly kids: readonly Marking[];
  readonly label: string;
}

function tokensOption(tokens: ResolvedTokens | undefined): { tokens?: ResolvedTokens } {
  return tokens === undefined ? {} : { tokens };
}

function containerOf(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): Container | null {
  const mc = markingComponent(p, catalog, markingId);
  if (mc === null) return null;
  const marking = projectIndex(p).markings.get(markingId);
  const drawn = componentForDrawing(p, mc.component, marking?.containerId ?? null);
  const slot = findSlot(drawn.component);
  if (slot === undefined) return null;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const layout = resolveSlotLayout(slot, values);
  if (layout.type === 'none') return null;
  const kids = projectIndex(p).children.get(markingId) ?? [];
  if (kids.length === 0) return null;
  return {
    id: markingId,
    component: drawn.component,
    tokens: drawn.tokens,
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

/** O espaço do slot decide as linhas (`wrap`) ou as trilhas (`minColumnWidth`/`minRowHeight`)? */
function needsAvailable(layout: ResolvedSlotLayout): boolean {
  if (layout.type === 'grid') return layout.grid?.min !== undefined;
  return layout.wrap !== 'none';
}

/** O eixo principal do slot (o que `available` mede) é o horizontal: `row`, ou grade vertical. */
function alongTracks(layout: ResolvedSlotLayout): boolean {
  if (layout.type === 'grid') return layout.grid?.orientation !== 'horizontal';
  return layout.type === 'row';
}

/** O `align: stretch` do slot do pai estica o filho neste eixo (o cruzado do layout dele). */
function stretchedBy(parent: Container | null, axis: 'width' | 'height'): boolean {
  if (parent === null) return false;
  const { layout } = parent;
  // Grade: `justify` estica no eixo das trilhas e `align` no das linhas (na célula).
  if (layout.type === 'grid') {
    const onTracks = alongTracks(layout) === (axis === 'width');
    return (onTracks ? layout.justify : layout.align) === 'stretch';
  }
  if (layout.align !== 'stretch') return false;
  return axis === (layout.type === 'row' ? 'height' : 'width');
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Inteiro para cima, sem que o ruído do ponto flutuante some um pixel. */
function ceilFit(value: number): number {
  return Math.ceil(value - 1e-6);
}

/**
 * O que o `sizing` faz num eixo: medir o conteúdo (`hug`, `min-content` ou `max-content`; `mode` diz
 * qual medida intrínseca, nenhuma = o `hug`), dar um px por expressão, ou nada.
 */
interface AxisPlan {
  readonly hug: boolean;
  readonly mode: IntrinsicSize | null;
  readonly px: number | undefined;
}

function axisPlan(axis: ResolvedAxis, stretched: boolean): AxisPlan {
  const intrinsic = isIntrinsicSize(axis.spec) ? axis.spec : null;
  return {
    hug: (axis.spec === 'hug' || intrinsic !== null) && !stretched,
    mode: intrinsic,
    px: stretched ? undefined : expressionPx(axis),
  };
}

/** O valor final de um eixo: o medido (inteiro para cima), o px da expressão ou o atual, nunca abaixo do mínimo. */
function axisValue(
  plan: AxisPlan,
  current: number,
  measured: number,
  min: number | undefined,
): number {
  const raw = plan.hug ? ceilFit(measured) : (plan.px ?? current);
  return plan.hug || plan.px !== undefined
    ? Math.max(raw, min ?? 0, MIN_STORED_MARKING_SIZE)
    : raw;
}

/**
 * Os eixos que o `measureComponent` recebe: o `hug` é medido (`null`), o `min-content`/`max-content`
 * pela medida intrínseca; o outro vale o px que a expressão dá, ou o que já tem. `undefined` quando
 * nenhum eixo é medido (nada a medir).
 */
function fixedSizes(
  rect: Rect,
  w: AxisPlan,
  h: AxisPlan,
):
  | { width: number | IntrinsicSize | null; height: number | IntrinsicSize | null }
  | undefined {
  if (!w.hug && !h.hug) return undefined;
  return {
    width: w.hug ? w.mode : (w.px ?? rect.width),
    height: h.hug ? h.mode : (h.px ?? rect.height),
  };
}

/** O eixo muda no ajuste: mede o conteúdo ou vale um px de expressão. */
const acts = (plan: AxisPlan): boolean => plan.hug || plan.px !== undefined;

/** O que o `sizing` avaliado pede a um componente: o retângulo novo, ou `undefined` se nada muda. */
function applySizing(
  rect: Rect,
  sizing: ResolvedSizing,
  stretched: { readonly width: boolean; readonly height: boolean },
  min: { readonly width: number; readonly height: number } | undefined,
  measure: (fixed: {
    width: number | IntrinsicSize | null;
    height: number | IntrinsicSize | null;
  }) => {
    width: number;
    height: number;
  },
): { rect: Rect; hugW: boolean; hugH: boolean } | undefined {
  const w = axisPlan(sizing.width, stretched.width);
  const h = axisPlan(sizing.height, stretched.height);
  if (!acts(w) && !acts(h)) return undefined;
  const fixed = fixedSizes(rect, w, h);
  const measured = fixed === undefined ? rect : measure(fixed);
  return {
    rect: {
      ...rect,
      width: axisValue(w, rect.width, measured.width, min?.width),
      height: axisValue(h, rect.height, measured.height, min?.height),
    },
    hugW: w.hug && w.mode === null,
    hugH: h.hug,
  };
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
    return stretchedBy(parentId === null ? null : containerAt(parentId), axis);
  };

  // Por texto, para não repetir o mesmo aviso entre as voltas.
  let warnings = new Map<string, ModelMessage>();
  const warn = (message: ModelMessage): void => {
    warnings.set(message.text, message);
  };

  /**
   * Remede as filhas folha cujo componente é `hug` num eixo: o eixo vira o tamanho medido
   * (inteiro para cima, nunca abaixo do `minSize`). O componente com slot filho já se ajustou na própria
   * volta (do mais fundo para o raso). O eixo que o `stretch` do pai estica fica.
   */
  const remeasureHugKids = (kids: readonly Marking[]) => {
    for (const kid of kids) {
      if (containerAt(kid.id) !== null) continue;
      const mc = markingComponent(p, catalog, kid.id);
      if (mc === null || mc.component.sizing === undefined) continue;
      const values = drawingValues(p, mc.annotation, mc.type).values;
      const sizing = resolveSizing(mc.component, values);
      sizing.messages.forEach(warn);
      const rect = rects.get(kid.id) as Rect;
      const drawn = componentForDrawing(p, mc.component, kid.containerId);
      const fitted = applySizing(
        rect,
        sizing,
        {
          width: stretchedByParent(kid.id, 'width'),
          height: stretchedByParent(kid.id, 'height'),
        },
        mc.component.minSize,
        (fixed) =>
          measureComponent(drawn.component, values, fixed, {
            measure,
            ...tokensOption(drawn.tokens),
          }),
      );
      if (fitted !== undefined) rects.set(kid.id, fitted.rect);
    }
  };

  /** A primeira linha de base do desenho de uma filha (`align: "baseline"` do slot). */
  const baselineOf = (kid: Marking): number | undefined => {
    const mc = markingComponent(p, catalog, kid.id);
    if (mc === null) return undefined;
    const values = drawingValues(p, mc.annotation, mc.type).values;
    const drawn = componentForDrawing(p, mc.component, kid.containerId);
    return instantiate(drawn.component, values, rects.get(kid.id) as Rect, {
      measure,
      idPrefix: kid.id,
      ...tokensOption(drawn.tokens),
    }).firstBaseline;
  };

  const arrangeOne = (id: string) => {
    const info = containerAt(id);
    if (info === null) return;
    const { component, values, layout, kids } = info;
    remeasureHugKids(kids);
    const sizes = kids.map((k) => rects.get(k.id) as Rect);
    const pad = layout.padding;
    const baselines =
      layout.align === 'baseline' ? kids.map((kid) => baselineOf(kid)) : [];
    const children = sizes.map((box, i) => ({ box, baseline: baselines[i] }));
    const padded = (extent: { width: number; height: number }) => ({
      width: extent.width + pad.left + pad.right,
      height: extent.height + pad.top + pad.bottom,
    });
    // O que os filhos pedem ao slot (o `hug` do componente): uma linha só, ou, com `wrap`, as linhas
    // pelo espaço do eixo principal que o slot tem (o desenho com o pedido de uma linha só dá o espaço).
    let slotContent = padded(contentExtent(layout, children, null));
    if (needsAvailable(layout)) {
      const probe = slotBoxOfScene(
        instantiate(component, values, rects.get(id) as Rect, {
          measure,
          idPrefix: id,
          slotContent,
          ...tokensOption(info.tokens),
        }).root,
      );
      if (probe !== undefined) {
        const available = alongTracks(layout)
          ? probe.width - pad.left - pad.right
          : probe.height - pad.top - pad.bottom;
        slotContent = padded(contentExtent(layout, children, Math.max(0, available)));
      }
    }

    let rect = rects.get(id) as Rect;
    const sizing = resolveSizing(component, values);
    sizing.messages.forEach(warn);
    const fitted = applySizing(
      rect,
      sizing,
      { width: stretchedByParent(id, 'width'), height: stretchedByParent(id, 'height') },
      component.minSize,
      (fixed) =>
        measureComponent(component, values, fixed, {
          measure,
          slotContent,
          ...tokensOption(info.tokens),
        }),
    );
    const hugW = fitted?.hugW ?? false;
    const hugH = fitted?.hugH ?? false;
    if (fitted !== undefined) {
      rect = fitted.rect;
      rects.set(id, rect);
    }

    const { root } = instantiate(component, values, rect, {
      measure,
      idPrefix: id,
      slotContent,
      ...tokensOption(info.tokens),
    });
    const box = slotBoxOfScene(root);
    if (box === undefined) return;
    if (
      (!hugW && slotContent.width > box.width + 0.5) ||
      (!hugH && slotContent.height > box.height + 0.5)
    ) {
      warn(
        modelMessage(
          'arrange.overflow',
          { label: info.label },
          `${info.label}: conteúdo maior que o container`,
        ),
      );
    }
    const targets = layoutChildren(box, layout, children);
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
    warnings = new Map();
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
    let outer: Rect;
    let where: string;
    if (marking.parentId !== null) {
      outer = isRoot
        ? (index.markings.get(marking.parentId) as Marking).rect
        : (rects.get(marking.parentId) as Rect);
      where = labelOf(marking.parentId);
    } else if (marking.containerId === null) {
      continue; // Marcação do canvas sem pai: nada a limita.
    } else {
      const container = index.containers.get(marking.containerId);
      outer = imagePixelRect(container ?? { width: 0, height: 0 });
      where = container?.name ?? marking.containerId;
    }
    const fixed = clampRect(rect, outer, isRoot ? 'shrink' : 'push');
    if (sameRect(rect, fixed)) continue;
    rects.set(id, fixed);
    translate(id, fixed.x - rect.x, fixed.y - rect.y);
    warn(
      modelMessage(
        'arrange.outside',
        { label: labelOf(id), where },
        `${labelOf(id)}: não cabe em ${where}`,
      ),
    );
  }

  const changed = topDownIds.filter(
    (id) => !sameRect(rects.get(id) as Rect, (index.markings.get(id) as Marking).rect),
  );
  if (changed.length === 0) return { project: p, warnings: [...warnings.values()] };
  const locks = markingLockStates(p);
  if (changed.some((id) => locks.has(id))) fail('locked');
  const next = new Set(changed);
  return {
    project: settleFrom(
      p,
      {
        ...p,
        markings: p.markings.map((m) =>
          next.has(m.id) ? { ...m, rect: rects.get(m.id) as Rect } : m,
        ),
      },
      options,
    ),
    warnings: [...warnings.values()],
  };
}

/** O que o ajuste ao conteúdo precisa de uma marcação de componente sem filhas no slot. */
interface FitTarget {
  readonly marking: Marking;
  readonly component: ComponentFile;
  readonly tokens: ResolvedTokens | undefined;
  readonly values: FieldValues;
  readonly parent: Container | null;
}

/**
 * A marcação é de um componente cujo `sizing` avaliado depende do conteúdo (`hug` ou px por expressão)
 * num dos eixos e que não é um componente com slot com filhas (esse se arruma: `arrangeMarking`
 * já ajusta o `hug` dele). `null` quando não é.
 */
function fitTargetOf(
  p: Project,
  catalog: ComponentCatalog,
  marking: Marking,
): FitTarget | null {
  if (containerOf(p, catalog, marking.id) !== null) return null;
  const mc = markingComponent(p, catalog, marking.id);
  if (mc === null) return null;
  // Filhas num slot sem layout `row`/`column` também não se ajustam: medir sem elas encolheria o
  // componente e o assentar tiraria as filhas dele.
  const hasKids = (projectIndex(p).children.get(marking.id)?.length ?? 0) > 0;
  if (hasKids && findSlot(mc.component) !== undefined) return null;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const followed = followedAxes(resolveSizing(mc.component, values));
  if (!followed.width && !followed.height) return null;
  const drawn = componentForDrawing(p, mc.component, marking.containerId);
  return {
    marking,
    component: drawn.component,
    tokens: drawn.tokens,
    values,
    parent: marking.parentId === null ? null : containerOf(p, catalog, marking.parentId),
  };
}

/**
 * Dá para ajustar ao conteúdo: a marcação é de um componente sem filhas no slot cujo `sizing`
 * (hug ou expressão) depende do conteúdo num eixo. Não mede nada (a pergunta do menu e do botão).
 */
export function canFit(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  const marking = projectIndex(p).markings.get(markingId);
  return marking !== undefined && fitTargetOf(p, catalog, marking) !== null;
}

/**
 * O Arrumar de uma marcação ajusta ao conteúdo (`fitMarking`) e não arruma filhas: ela é de um
 * componente que não se arruma (sem slot `row`/`column` com filhas). Uma marcação sem componente fica
 * com `arrangeMarking` (e o `not-arrangeable` dele).
 */
export function arrangesByFit(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  return (
    containerOf(p, catalog, markingId) === null &&
    markingComponent(p, catalog, markingId) !== null
  );
}

function optionalMaxWidth(value: number | undefined): { maxWidth?: number } {
  return value === undefined || value < MIN_STORED_MARKING_SIZE
    ? {}
    : { maxWidth: value };
}

/** A largura que sobra da posição `x` até a borda da imagem do container; no canvas não há limite. */
function widthToImageEdge(p: Project, marking: Marking): number | undefined {
  if (marking.containerId === null) return undefined;
  const container = projectIndex(p).containers.get(marking.containerId);
  return container === undefined
    ? undefined
    : right(imagePixelRect(container)) - marking.rect.x;
}

/** O retângulo preso à imagem do container (o ajuste não passa dela); no canvas não há limite. */
function withinImage(p: Project, marking: Marking, rect: Rect): Rect {
  if (marking.containerId === null) return rect;
  const container = projectIndex(p).containers.get(marking.containerId);
  if (container === undefined) return rect;
  const image = imagePixelRect(container);
  return {
    ...rect,
    width: Math.min(rect.width, right(image) - rect.x),
    height: Math.min(rect.height, bottom(image) - rect.y),
  };
}

/**
 * Ajusta a marcação de um componente ao conteúdo (decisão 14 da #898): cada eixo cujo `sizing` é `hug`
 * (ou expressão que dá `hug` ou px) vira o tamanho medido com os valores da anotação, inteiro para
 * cima, entre o `minSize` e os limites da raiz do componente e nunca abaixo de
 * `MIN_STORED_MARKING_SIZE`. A posição (canto de cima à esquerda) fica; o eixo `fill`, o ausente e o
 * que o `align: stretch` do pai estica não mudam; o resultado nunca passa da imagem. Só por ação da
 * pessoa ou do agente: nunca na carga nem ao editar um valor. Assenta ao fim (a marcação pode
 * passar a conter outras), numa entrada de desfazer. Devolve o mesmo `Project` quando nada muda;
 * falha com `not-found`, `not-fittable` (nenhum eixo depende do conteúdo, a marcação não é de um
 * componente ou é um componente com filhas no slot, que se arruma) e `locked` (a geometria é
 * travada e mudaria).
 */
export function fitMarking(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
  measure: TextMeasurer,
  options?: SettleOptions,
): Project {
  const marking = findById(p.markings, markingId);
  const target = fitTargetOf(p, catalog, marking) ?? fail('not-fittable', markingId);
  const auto: { width?: boolean; height?: boolean } = {};
  if (stretchedBy(target.parent, 'width')) auto.width = false;
  if (stretchedBy(target.parent, 'height')) auto.height = false;
  const fitted = fitComponentSize(
    target.component,
    target.values,
    { measure, ...tokensOption(target.tokens) },
    {
      base: marking.rect,
      auto,
      ...optionalMaxWidth(widthToImageEdge(p, marking)),
    },
  );
  if (fitted === undefined) return p;
  const rect = withinImage(p, marking, {
    ...marking.rect,
    width: fitted.width,
    height: fitted.height,
  });
  if (sameRect(rect, marking.rect)) return p;
  if (markingLockStates(p).has(markingId)) fail('locked');
  return settleFrom(
    p,
    { ...p, markings: p.markings.map((m) => (m.id === markingId ? { ...m, rect } : m)) },
    options,
  );
}
