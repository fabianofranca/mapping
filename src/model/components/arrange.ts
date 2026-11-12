/**
 * Motor dos componentes (etapa Biblioteca): organização dos filhos de um componente com slot. Um componente
 * com slot é uma instância cujo componente tem um nó `slot`; as instâncias filhas (`parentId`) ficam na ordem
 * em que aparecem em `screen.instances`. Quando o slot declara `layout` `row`/`column`, o
 * editor calcula os retângulos dos filhos e os **grava** (o arquivo guarda só retângulos
 * absolutos; o layout é uma ferramenta de edição). Slot sem layout (ou `none`) deixa os filhos
 * onde estão. Funções puras, sem DOM.
 */
import type {
  ComponentFile,
  Expr,
  FieldValues,
  LayoutAlign,
  LayoutJustify,
  LayoutSpec,
  LayoutWrap,
  SlotTemplate,
  TemplateNode,
} from './componentFormat';
import { evaluate, evaluateBoolean } from './expressions';
import {
  LAYOUT_ALIGNS,
  LAYOUT_JUSTIFIES,
  LAYOUT_TYPES,
  LAYOUT_WRAPS,
  allowedValue,
  justifySpacing,
  mirrorMain,
} from './layoutValues';
import {
  type Box,
  type Padding,
  type TextMeasurer,
  instantiate,
  normalizePadding,
} from './instantiate';
import type { Library, TypeDef } from './library';
import { type Instance, type Screen, childrenOf, renderOrder, updateBox } from './screen';
import { type FrameNode, absoluteBoxes, walk } from './scene';
import { applyTokens, resolveTokens } from './tokens';
import { breakLines, stackLines } from './wrapLines';

export interface ResolvedSlotLayout {
  readonly type: 'none' | 'row' | 'column';
  readonly gap: number;
  readonly padding: Padding;
  readonly align: LayoutAlign;
  readonly justify: LayoutJustify;
  /** Filhos em ordem inversa e `start` no fim (`layout.reverse`). */
  readonly reverse: boolean;
  /** Quebra de fileira (`layout.wrap`): as linhas, o espaço entre elas e os limites (v4). */
  readonly wrap: LayoutWrap;
  readonly lineGap: number;
  readonly maxPerLine?: number | undefined;
  readonly maxLines?: number | undefined;
}

const NO_LAYOUT: ResolvedSlotLayout = {
  type: 'none',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
};

/** Primeiro nó `slot` do template (busca em profundidade pelos `children` dos frames), ou nenhum. */
export function findSlot(component: ComponentFile): SlotTemplate | undefined {
  const search = (node: TemplateNode): SlotTemplate | undefined => {
    if (node.type === 'slot') return node;
    if (node.type !== 'frame') return undefined;
    for (const child of node.children ?? []) {
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  return search(component.template);
}

/**
 * O componente com os `$token` trocados pela tabela do desenho dele (`resolvedTokens`, ou só os
 * embutidos), como o `instantiate` faz: o `gap` e o `padding` do slot só valem depois disso.
 */
export function tokenizedComponent(component: ComponentFile): ComponentFile {
  return applyTokens(component, component.resolvedTokens ?? resolveTokens(undefined, {}));
}

/** Um tipo é um componente com slot quando o componente dele tem um slot. */
export function hasSlot(type: TypeDef | undefined): boolean {
  return type?.component !== undefined && findSlot(type.component) !== undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Avalia uma expressão de conjunto fechado (sem aviso: cai no padrão se vier algo de fora). */
function choice<T extends string>(
  expr: Expr<T> | undefined,
  allowed: readonly T[],
  fallback: T,
  values: FieldValues,
): T {
  if (expr === undefined) return fallback;
  return (
    allowedValue(evaluate<unknown>(expr as Expr<unknown>, values, fallback), allowed) ??
    fallback
  );
}

/** `maxPerLine`/`maxLines`: inteiro ≥ 1, ou nenhum limite. */
function limitCount(
  expr: Expr<number> | undefined,
  values: FieldValues,
): number | undefined {
  if (expr === undefined) return undefined;
  const n = toNumber(evaluate<unknown>(expr as Expr<unknown>, values, undefined), NaN);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** A quebra de fileira do layout do slot (sem `wrap`, ou `none`, as outras três chaves não valem). */
function resolveWrap(
  layout: LayoutSpec,
  values: FieldValues,
): Pick<ResolvedSlotLayout, 'wrap' | 'lineGap' | 'maxPerLine' | 'maxLines'> {
  const wrap = choice(layout.wrap, LAYOUT_WRAPS, 'none', values);
  if (wrap === 'none') return { wrap, lineGap: 0 };
  return {
    wrap,
    lineGap: Math.max(
      0,
      toNumber(evaluate<unknown>(layout.lineGap as Expr<unknown>, values, 0), 0),
    ),
    maxPerLine: limitCount(layout.maxPerLine, values),
    maxLines: limitCount(layout.maxLines, values),
  };
}

/** Avalia o layout do slot com os valores da instância (`gap`/`padding` podem ser expressões). Sem layout → type 'none'. */
export function resolveSlotLayout(
  slot: SlotTemplate,
  values: FieldValues,
): ResolvedSlotLayout {
  const layout = slot.layout;
  if (!layout) return NO_LAYOUT;
  const type = choice(layout.type, LAYOUT_TYPES, 'none', values);
  if (type === 'none') return NO_LAYOUT;
  const gap = Math.max(
    0,
    toNumber(evaluate<unknown>(layout.gap as Expr<unknown>, values, 0), 0),
  );
  const rawPadding = layout.padding
    ? evaluate<unknown>(layout.padding as Expr<unknown>, values, 0)
    : 0;
  const padding = Array.isArray(rawPadding)
    ? normalizePadding(rawPadding.map((v) => toNumber(v, 0)))
    : normalizePadding(toNumber(rawPadding, 0));
  // `baseline` só vale numa `row`: numa `column` cai em `start`, como no motor.
  const aligns =
    type === 'row' ? LAYOUT_ALIGNS : LAYOUT_ALIGNS.filter((a) => a !== 'baseline');
  return {
    type,
    gap,
    padding,
    align: choice(layout.align, aligns, 'start', values),
    justify: choice(layout.justify, LAYOUT_JUSTIFIES, 'start', values),
    reverse:
      layout.reverse !== undefined && evaluateBoolean(layout.reverse, values, false),
    ...resolveWrap(layout, values),
  };
}

/** Caixa absoluta (na tela) do slot de uma instância, instanciando o componente na caixa da instância; nenhuma se o slot estiver invisível. */
export function slotBox(
  component: ComponentFile,
  instance: Instance,
  measure: TextMeasurer,
): Box | undefined {
  const { root } = instantiate(component, instance.values, instance.box, {
    measure,
    idPrefix: instance.id,
  });
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    // A raiz tem `translate(box.x, box.y)`: as caixas absolutas já estão no espaço da tela.
    return absoluteBoxes(root).get(node.id);
  }
  return undefined;
}

/** Caixa absoluta do slot numa cena já instanciada (a raiz leva o `translate` da caixa); nenhuma se o slot estiver invisível. */
export function slotBoxOfScene(root: FrameNode): Box | undefined {
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    return absoluteBoxes(root).get(node.id);
  }
  return undefined;
}

/** A caixa do slot (primeiro da cena) quando ele tem `clip`; senão nenhuma. */
export function clippedSlotBox(root: FrameNode): Box | undefined {
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    return node.clipChildren === true ? slotBoxOfScene(root) : undefined;
  }
  return undefined;
}

/** Posição e tamanho no eixo cruzado. */
function crossAxis(
  layout: ResolvedSlotLayout,
  start: number,
  content: number,
  size: number,
): { pos: number; size: number } {
  switch (layout.align) {
    case 'center':
      return { pos: start + (content - size) / 2, size };
    case 'end':
      return { pos: start + content - size, size };
    case 'stretch':
      return { pos: start, size: Math.max(0, content) };
    default:
      return { pos: start, size };
  }
}

/** Os eixos do slot: onde começa e quanto mede a área de conteúdo, no eixo principal e no cruzado. */
interface SlotGeometry {
  readonly row: boolean;
  readonly mainStart: number;
  readonly mainContent: number;
  readonly crossStart: number;
  readonly crossContent: number;
}

function slotGeometry(slot: Box, layout: ResolvedSlotLayout): SlotGeometry {
  const row = layout.type === 'row';
  const { padding } = layout;
  const contentW = slot.width - padding.left - padding.right;
  const contentH = slot.height - padding.top - padding.bottom;
  return {
    row,
    mainStart: row ? slot.x + padding.left : slot.y + padding.top,
    mainContent: row ? contentW : contentH,
    crossStart: row ? slot.y + padding.top : slot.x + padding.left,
    crossContent: row ? contentH : contentW,
  };
}

interface LayoutChild {
  readonly box: Box;
  readonly baseline?: number | undefined;
}

/** A extensão de uma linha no eixo cruzado: a maior (ou, com `baseline`, do topo mais alto ao fundo mais baixo). */
function lineExtent(
  layout: ResolvedSlotLayout,
  row: boolean,
  line: readonly LayoutChild[],
): number {
  const crosses = line.map((c) => (row ? c.box.height : c.box.width));
  if (layout.align !== 'baseline') return Math.max(0, ...crosses);
  const lines = line.map((c, i) => c.baseline ?? crosses[i] ?? 0);
  const above = Math.max(0, ...lines);
  return above + Math.max(0, ...crosses.map((size, i) => size - (lines[i] ?? size)));
}

/** Posição e tamanho no eixo cruzado de um filho de uma linha de extensão `extent` que começa em `start`. */
function crossInLine(
  layout: ResolvedSlotLayout,
  start: number,
  extent: number,
  size: number,
  baseline: { above: number; own: number } | undefined,
): { pos: number; size: number } {
  if (baseline) return { pos: start + baseline.above - baseline.own, size };
  return crossAxis(layout, start, extent, size);
}

/**
 * Retângulos novos (arredondados) dos filhos, na ordem de `children`. Com `align: "baseline"` cada
 * filho traz a `baseline` dele (a primeira linha de base, a partir do topo da caixa; sem ela vale o
 * fundo da caixa) e a fileira se alinha pela mais baixa. Com `wrap`, os filhos se repartem em
 * linhas (o que não cabe no que resta do eixo principal vai para a seguinte, `maxPerLine` e
 * `maxLines` valem) e `justify`, `reverse`, `align` e `baseline` valem em cada linha; as linhas se
 * empilham no início do eixo cruzado, separadas por `lineGap` (`wrap-reverse`: a ordem inversa).
 * Os filhos além de `maxLines` linhas não se movem (a arrumação devolve a caixa que já tinham).
 */
export function layoutChildren(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
): Box[] {
  const geometry = slotGeometry(slot, layout);
  const { row } = geometry;
  const wrapped = layout.wrap !== 'none';
  const mains = children.map((c) => (row ? c.box.width : c.box.height));
  const broken = wrapped
    ? breakLines(mains, geometry.mainContent, {
        gap: layout.gap,
        maxPerLine: layout.maxPerLine,
        maxLines: layout.maxLines,
      })
    : { lines: [children.map((_, i) => i)], dropped: 0 };
  const members = broken.lines.map((line) => line.map((i) => children[i] as LayoutChild));
  // Sem `wrap` há uma linha só, com a extensão do conteúdo todo (`center` e `end` valem nele).
  const extents = wrapped
    ? members.map((line) => lineExtent(layout, row, line))
    : [geometry.crossContent];
  const stacked = stackLines(extents, layout.lineGap, layout.wrap === 'wrap-reverse');
  const out: Box[] = children.map((c) => c.box);
  broken.lines.forEach((line, k) => {
    const place = placeLine(layout, geometry, line, children, {
      extent: extents[k] ?? 0,
      top: geometry.crossStart + (stacked.tops[k] ?? 0),
    });
    line.forEach((index, i) => (out[index] = place[i] as Box));
  });
  return out;
}

/**
 * A extensão que os filhos ocupam no slot, sem o padding (o que o `hug` do componente com slot
 * mede): a soma com os `gap` no eixo principal e a maior extensão no cruzado (com `baseline`, do
 * topo mais alto ao fundo mais baixo). Com `wrap`, as linhas se repartem como em `layoutChildren`
 * (`available`: o espaço do eixo principal; nulo = só o `maxPerLine` quebra): o eixo principal
 * mede a linha mais cheia e o cruzado soma as linhas com os `lineGap`.
 */
export function contentExtent(
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
  available: number | null,
): { width: number; height: number } {
  const row = layout.type === 'row';
  const mains = children.map((c) => (row ? c.box.width : c.box.height));
  const lines =
    layout.wrap === 'none'
      ? [children.map((_, i) => i)]
      : breakLines(mains, available, {
          gap: layout.gap,
          maxPerLine: layout.maxPerLine,
          maxLines: layout.maxLines,
        }).lines;
  const used = lines.map((line) =>
    Math.max(
      0,
      line.reduce((sum, i) => sum + (mains[i] ?? 0), 0) + layout.gap * (line.length - 1),
    ),
  );
  const crosses = lines.map((line) =>
    lineExtent(
      layout,
      row,
      line.map((i) => children[i] as LayoutChild),
    ),
  );
  const main = Math.max(0, ...used);
  const cross = stackLines(crosses, layout.lineGap, false).total;
  return row ? { width: main, height: cross } : { width: cross, height: main };
}

/** Posições no eixo principal de uma linha: `justify` sobre a folga da linha e `reverse` espelhando-a. */
function lineMainPositions(
  layout: ResolvedSlotLayout,
  geometry: SlotGeometry,
  mains: readonly number[],
): number[] {
  const total = mains.reduce((sum, s) => sum + s, 0) + layout.gap * (mains.length - 1);
  const free = Math.max(0, geometry.mainContent - total);
  const { offset, extra } = justifySpacing(layout.justify, free, mains.length);
  let cursor = geometry.mainStart + offset;
  return mains.map((main) => {
    const forward = cursor;
    cursor += main + layout.gap + extra;
    return layout.reverse
      ? mirrorMain(forward, main, geometry.mainStart, geometry.mainContent)
      : forward;
  });
}

/** Os retângulos (arredondados) de uma linha de filhos, dados o começo e a extensão dela no eixo cruzado. */
function placeLine(
  layout: ResolvedSlotLayout,
  geometry: SlotGeometry,
  indices: readonly number[],
  children: readonly LayoutChild[],
  cross: { extent: number; top: number },
): Box[] {
  const { row } = geometry;
  const line = indices.map((i) => children[i] as LayoutChild);
  const mains = line.map((c) => (row ? c.box.width : c.box.height));
  const positions = lineMainPositions(layout, geometry, mains);
  const lines = line.map((c) => c.baseline ?? (row ? c.box.height : c.box.width));
  const above = Math.max(0, ...lines);
  return line.map((child, i) => {
    const main = mains[i] ?? 0;
    const size = row ? child.box.height : child.box.width;
    const baseline =
      layout.align === 'baseline' ? { above, own: lines[i] ?? size } : undefined;
    const placed = crossInLine(layout, cross.top, cross.extent, size, baseline);
    const mainPos = positions[i] ?? 0;
    const raw: Box = row
      ? { x: mainPos, y: placed.pos, width: main, height: placed.size }
      : { x: placed.pos, y: mainPos, width: placed.size, height: main };
    return {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width: Math.max(1, Math.round(raw.width)),
      height: Math.max(1, Math.round(raw.height)),
    };
  });
}

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** A primeira linha de base do desenho de uma instância (`undefined` = sem texto ou sem componente). */
function instanceBaseline(
  types: ReadonlyMap<string, TypeDef>,
  child: Instance,
  measure: TextMeasurer,
): number | undefined {
  const raw = types.get(child.typeId)?.component;
  if (!raw) return undefined;
  return instantiate(tokenizedComponent(raw), child.values, child.box, {
    measure,
    idPrefix: child.id,
  }).firstBaseline;
}

/** Os alvos das filhas de uma instância com slot row/column, ou `null` quando não há o que arrumar. */
function childTargets(
  instance: Instance,
  raw: ComponentFile | undefined,
  children: readonly Instance[],
  measure: TextMeasurer,
  types: ReadonlyMap<string, TypeDef>,
): Box[] | null {
  if (!raw || children.length === 0) return null;
  const component = tokenizedComponent(raw);
  const slot = findSlot(component);
  if (!slot) return null;
  const layout = resolveSlotLayout(slot, instance.values);
  if (layout.type === 'none') return null;
  const box = slotBox(component, instance, measure);
  if (!box) return null;
  const baselines =
    layout.align === 'baseline'
      ? children.map((child) => instanceBaseline(types, child, measure))
      : [];
  return layoutChildren(
    box,
    layout,
    children.map((child, i) => ({ box: child.box, baseline: baselines[i] })),
  );
}

/** Recalcula e grava os retângulos dos filhos de todos os componentes com slot com layout row/column. Puro; devolve o MESMO objeto quando nada muda. */
export function arrange(screen: Screen, library: Library, measure: TextMeasurer): Screen {
  const types = new Map(library.types.map((t) => [t.id, t]));
  let current = screen;
  // Pais antes dos filhos; a ordem é fixada no início, as instâncias são relidas a cada passo
  // (o pai pode ter movido o componente com slot ao organizar os filhos dele).
  const ids = renderOrder(screen).map((i) => i.id);
  // Estrutura (pais e ordem dos filhos) não muda ao arrumar, só as caixas: um índice por id
  // (refeito quando uma caixa muda); os filhos vêm do índice de `childrenOf` da tela original.
  let byId = new Map(current.instances.map((i) => [i.id, i]));
  for (const id of ids) {
    const instance = byId.get(id);
    if (!instance) continue;
    const children = childrenOf(screen, id).map((k) => byId.get(k.id) as Instance);
    const targets = childTargets(
      instance,
      types.get(instance.typeId)?.component,
      children,
      measure,
      types,
    );
    if (!targets) continue;
    children.forEach((child, i) => {
      const target = targets[i];
      if (!target || sameBox(child.box, target)) return;
      current = updateBox(current, child.id, target);
      byId = new Map(current.instances.map((x) => [x.id, x]));
    });
  }
  return current;
}

/** Índice entre os irmãos em que um ponto (centro do arrastado) cairia, segundo o eixo do layout: quantos irmãos (exceto `excludeId`) têm o centro antes dele. Para 'none' devolve o fim. */
export function dropIndex(
  screen: Screen,
  parentId: string,
  layout: ResolvedSlotLayout,
  point: { x: number; y: number },
  excludeId?: string,
): number {
  const siblings = childrenOf(screen, parentId).filter((i) => i.id !== excludeId);
  if (layout.type === 'none') return siblings.length;
  return siblings.filter((s) => {
    const center =
      layout.type === 'row' ? s.box.x + s.box.width / 2 : s.box.y + s.box.height / 2;
    const at = layout.type === 'row' ? point.x : point.y;
    // Em `reverse` a ordem corre do fim para o início: antes dele são os irmãos depois do ponto.
    return layout.reverse ? center > at : center < at;
  }).length;
}
