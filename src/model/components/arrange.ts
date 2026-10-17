/**
 * Motor dos componentes (etapa Biblioteca): organização dos filhos de um container. Um container é uma
 * instância cujo componente tem um nó `slot`; as instâncias filhas (`parentId`) ficam na ordem
 * em que aparecem em `screen.instances`. Quando o slot declara `layout` `row`/`column`, o
 * editor calcula os retângulos dos filhos e os **grava** (o arquivo guarda só retângulos
 * absolutos; o layout é uma ferramenta de edição). Slot sem layout (ou `none`) deixa os filhos
 * onde estão. Funções puras, sem DOM.
 */
import type {
  ComponentFile,
  Expr,
  FieldValues,
  SlotTemplate,
  TemplateNode,
} from './componentFormat';
import { evaluate } from './expressions';
import {
  type Box,
  type Padding,
  type TextMeasurer,
  instantiate,
  normalizePadding,
} from './instantiate';
import type { Library, TypeDef } from './library';
import { type Instance, type Screen, childrenOf, renderOrder, updateBox } from './screen';
import { absoluteBoxes, walk } from './scene';

export interface ResolvedSlotLayout {
  readonly type: 'none' | 'row' | 'column';
  readonly gap: number;
  readonly padding: Padding;
  readonly align: 'start' | 'center' | 'end' | 'stretch';
  readonly justify: 'start' | 'center' | 'end' | 'space-between';
}

const NO_LAYOUT: ResolvedSlotLayout = {
  type: 'none',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
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

/** Um tipo é container quando o componente dele tem um slot. */
export function isContainer(type: TypeDef | undefined): boolean {
  return type?.component !== undefined && findSlot(type.component) !== undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Avalia o layout do slot com os valores da instância (`gap`/`padding` podem ser expressões). Sem layout → type 'none'. */
export function resolveSlotLayout(
  slot: SlotTemplate,
  values: FieldValues,
): ResolvedSlotLayout {
  const layout = slot.layout;
  if (!layout || layout.type === 'none') return NO_LAYOUT;
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
  return {
    type: layout.type,
    gap,
    padding,
    align: layout.align ?? 'start',
    justify: layout.justify ?? 'start',
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

/** Retângulos novos (arredondados) dos filhos, na ordem de `children`. */
function layoutChildren(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly Instance[],
): Box[] {
  const row = layout.type === 'row';
  const { padding } = layout;
  const contentW = slot.width - padding.left - padding.right;
  const contentH = slot.height - padding.top - padding.bottom;
  const mainContent = row ? contentW : contentH;
  const mainStart = row ? slot.x + padding.left : slot.y + padding.top;
  const crossContent = row ? contentH : contentW;
  const crossStart = row ? slot.y + padding.top : slot.x + padding.left;

  const n = children.length;
  const mains = children.map((c) => (row ? c.box.width : c.box.height));
  const total = mains.reduce((sum, s) => sum + s, 0) + layout.gap * (n - 1);
  const free = Math.max(0, mainContent - total);
  let offset = 0;
  let extra = 0;
  if (layout.justify === 'center') offset = free / 2;
  else if (layout.justify === 'end') offset = free;
  else if (layout.justify === 'space-between' && n > 1) extra = free / (n - 1);

  let cursor = mainStart + offset;
  return children.map((child, i) => {
    const main = mains[i] ?? 0;
    const crossSize = row ? child.box.height : child.box.width;
    const cross = crossAxis(layout, crossStart, crossContent, crossSize);
    const mainPos = cursor;
    cursor += main + layout.gap + extra;
    const raw: Box = row
      ? { x: mainPos, y: cross.pos, width: main, height: cross.size }
      : { x: cross.pos, y: mainPos, width: cross.size, height: main };
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

/** Recalcula e grava os retângulos dos filhos de todos os containers com layout row/column. Puro; devolve o MESMO objeto quando nada muda. */
export function arrange(screen: Screen, library: Library, measure: TextMeasurer): Screen {
  const types = new Map(library.types.map((t) => [t.id, t]));
  let current = screen;
  // Pais antes dos filhos; a ordem é fixada no início, as instâncias são relidas a cada passo
  // (o pai pode ter movido o container ao organizar os filhos dele).
  const ids = renderOrder(screen).map((i) => i.id);
  for (const id of ids) {
    const instance = current.instances.find((i) => i.id === id);
    if (!instance) continue;
    const component = types.get(instance.typeId)?.component;
    if (!component) continue;
    const slot = findSlot(component);
    if (!slot) continue;
    const layout = resolveSlotLayout(slot, instance.values);
    if (layout.type === 'none') continue;
    const children = childrenOf(current, id);
    if (children.length === 0) continue;
    const box = slotBox(component, instance, measure);
    if (!box) continue;
    const targets = layoutChildren(box, layout, children);
    children.forEach((child, i) => {
      const target = targets[i];
      if (!target || sameBox(child.box, target)) return;
      current = updateBox(current, child.id, target);
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
  return siblings.filter((s) =>
    layout.type === 'row'
      ? s.box.x + s.box.width / 2 < point.x
      : s.box.y + s.box.height / 2 < point.y,
  ).length;
}
