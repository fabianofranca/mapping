/**
 * Motor dos componentes (etapa Biblioteca): arrumação por tamanhos (fase L2). Recebe uma tela **sem
 * geometria** (uma árvore de nós com tipo, valores e filhos, mais as raízes ancoradas) e
 * calcula o retângulo de cada instância a partir do dimensionamento dos componentes
 * (`sizing`: px, `fill` ou `hug`). A tela é o container raiz, em coluna. A saída é a descrição
 * neutra de tela (`Screen`), a mesma que o visualizador e o editor desenham. Puro, sem DOM: o
 * texto é medido pelo `TextMeasurer` injetado.
 *
 * Regras:
 * - Spec por eixo: `component.sizing?.[eixo] ?? component.size[eixo]` (px, `fill` ou `hug`);
 *   todo tamanho final respeita `minSize`; o `hug` medido sobe para o inteiro seguinte
 *   (`Math.ceil`), para o texto não quebrar por arredondamento. O resto fica exato.
 * - Um container é um componente com `slot`; o layout do slot (row/column/none, gap, padding,
 *   align, justify) vem de `resolveSlotLayout`. O `hug` de um container mede os filhos
 *   arrumados (`slotContent` em `measureComponent`), então a altura do cartão cresce com o texto.
 * - `fill` no eixo principal de um pai `hug` não tem de onde tirar tamanho: cai em `hug`, com aviso.
 * - A tela é uma coluna sem padding nem gap; as raízes sem `anchor` entram nela, as ancoradas
 *   ficam fora do fluxo (com `margin` nas bordas tocadas).
 */
import { findSlot, resolveSlotLayout, type ResolvedSlotLayout } from './arrange';
import type { ComponentFile, FieldValues, SlotTemplate } from './componentFormat';
import {
  type Box,
  type TextMeasurer,
  instantiate,
  measureComponent,
} from './instantiate';
import type { Library } from './library';
import type { Instance, Screen } from './screen';
import { absoluteBoxes, walk } from './scene';

/** Nó da árvore sem geometria. */
export interface LayoutNode {
  /** Vira o id da instância (único na tela). */
  readonly id: string;
  /** Id do tipo de anotação na biblioteca. */
  readonly typeId: string;
  readonly values: FieldValues;
  /** Vão para o slot do componente, na ordem. */
  readonly children: readonly LayoutNode[];
}

/** Âncora de uma raiz fora do fluxo, na tela (`start`/`end` = esquerda/direita). */
export type ScreenAnchor =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'start'
  | 'center'
  | 'end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end';

export const SCREEN_ANCHORS: readonly ScreenAnchor[] = [
  'top-start',
  'top',
  'top-end',
  'start',
  'center',
  'end',
  'bottom-start',
  'bottom',
  'bottom-end',
];

export interface LayoutRoot {
  readonly node: LayoutNode;
  /** Ausente = no fluxo (coluna da tela); presente = fora do fluxo, ancorada na tela. */
  readonly anchor?: ScreenAnchor;
  /** Distância das bordas da âncora (px; padrão 0). Só com `anchor`. */
  readonly margin?: number;
  /**
   * Tipo de anotação desenhado por baixo da raiz, cobrindo a tela inteira (película de um
   * modal). A instância dele entra logo antes da raiz, com id `<id da raiz>#scrim`.
   */
  readonly scrimTypeId?: string;
}

export interface LayoutScreen {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Ordem de desenho: a primeira raiz fica por baixo. */
  readonly roots: readonly LayoutRoot[];
}

export interface LayoutResult {
  readonly screen: Screen;
  /** `"<id do nó>: <mensagem>"` (ou `"tela: …"`). */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------------------

const EPS = 0.001;

type Axis = 'width' | 'height';

/** Nó resolvido: componente, slot (se container), layout do slot e filhos já preparados. */
interface Prepared {
  readonly node: LayoutNode;
  readonly component: ComponentFile;
  readonly slot?: SlotTemplate;
  readonly layout: ResolvedSlotLayout;
  readonly kids: readonly Prepared[];
}

/** Retângulo de um filho relativo à origem do conteúdo do slot, e se cada eixo veio do `hug`. */
interface KidRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** O tamanho é o `hug` do nó, sem corte: os filhos `fill` dele ficam no próprio `hug`. */
  readonly hugW: boolean;
  readonly hugH: boolean;
}

interface Arranged {
  readonly rects: readonly KidRect[];
  /** Extensão ocupada pelos filhos (soma com gaps no eixo principal, maior no cruzado). */
  readonly usedW: number;
  readonly usedH: number;
}

const NONE_LAYOUT: ResolvedSlotLayout = {
  type: 'none',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
};

/** A tela é uma coluna: sem padding, sem gap, filhos no início. */
const SCREEN_LAYOUT: ResolvedSlotLayout = { ...NONE_LAYOUT, type: 'column' };

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const maxOf = (values: readonly number[]) => values.reduce((m, v) => Math.max(m, v), 0);
const hugValue = (value: number) => Math.ceil(value - 1e-9);

/** Posições no eixo principal (`content` nulo = o pai é `hug`: não sobra espaço). */
function mainPositions(
  sizes: readonly number[],
  gap: number,
  content: number | null,
  justify: ResolvedSlotLayout['justify'],
): number[] {
  const used = sum(sizes) + gap * Math.max(0, sizes.length - 1);
  const free = content === null ? 0 : Math.max(0, content - used);
  let offset = 0;
  let extra = 0;
  if (justify === 'center') offset = free / 2;
  else if (justify === 'end') offset = free;
  else if (justify === 'space-between' && sizes.length > 1)
    extra = free / (sizes.length - 1);
  let cursor = offset;
  return sizes.map((size) => {
    const position = cursor;
    cursor += size + gap + extra;
    return position;
  });
}

function crossPosition(
  size: number,
  content: number,
  align: ResolvedSlotLayout['align'],
): number {
  if (align === 'center') return (content - size) / 2;
  if (align === 'end') return content - size;
  return 0;
}

/** Posição de uma raiz ancorada num eixo: `margin` na borda tocada, ou centralizada. */
function anchorOffset(
  anchor: ScreenAnchor,
  axis: 'x' | 'y',
  screenSize: number,
  size: number,
  margin: number,
): number {
  const near =
    axis === 'x'
      ? anchor.endsWith('start') || anchor === 'start'
      : anchor.startsWith('top');
  const far =
    axis === 'x'
      ? anchor.endsWith('end') || anchor === 'end'
      : anchor.startsWith('bottom');
  if (near) return margin;
  if (far) return screenSize - margin - size;
  return (screenSize - size) / 2;
}

export function layoutScreen(
  input: LayoutScreen,
  library: Library,
  measure: TextMeasurer,
): LayoutResult {
  const warnings = new Set<string>();
  const warn = (message: string) => warnings.add(message);
  const types = new Map(library.types.map((t) => [t.id, t]));

  // --- preparo: tipo, componente, slot e layout de cada nó ---------------------------------

  const prepare = (node: LayoutNode): Prepared | undefined => {
    const component = types.get(node.typeId)?.component;
    if (!component) {
      warn(`${node.id}: tipo sem componente: ${node.typeId}`);
      return undefined;
    }
    const slot = findSlot(component);
    if (!slot && node.children.length > 0)
      warn(`${node.id}: filhos ignorados (componente sem slot)`);
    const kids = slot
      ? node.children.map(prepare).filter((k): k is Prepared => k !== undefined)
      : [];
    return {
      node,
      component,
      ...(slot ? { slot } : {}),
      layout: slot ? resolveSlotLayout(slot, node.values) : NONE_LAYOUT,
      kids,
    };
  };

  const specOf = (p: Prepared, axis: Axis) =>
    p.component.sizing?.[axis] ?? p.component.size[axis];
  const withMin = (p: Prepared, axis: Axis, value: number) =>
    Math.max(value, p.component.minSize?.[axis] ?? 0);
  const padW = (p: Prepared) => p.layout.padding.left + p.layout.padding.right;
  const padH = (p: Prepared) => p.layout.padding.top + p.layout.padding.bottom;

  const cache = new Map<Prepared, Map<string, number>>();
  const cached = (p: Prepared, key: string, compute: () => number): number => {
    let perNode = cache.get(p);
    if (!perNode) {
      perNode = new Map();
      cache.set(p, perNode);
    }
    const hit = perNode.get(key);
    if (hit !== undefined) return hit;
    const value = compute();
    perNode.set(key, value);
    return value;
  };

  /** Caixa absoluta do slot do componente instanciado em `box` (nenhuma se o slot estiver invisível). */
  const slotBoxOf = (
    p: Prepared,
    box: Box,
    slotContent: { width: number; height: number },
  ): Box | undefined => {
    const { root } = instantiate(p.component, p.node.values, box, {
      measure,
      idPrefix: p.node.id,
      slotContent,
    });
    for (const node of walk(root)) {
      if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
      return absoluteBoxes(root).get(node.id);
    }
    return undefined;
  };

  // --- medidas intrínsecas (hug), memoizadas ------------------------------------------------

  /** Largura que os filhos arrumados pedem ao slot, mais o padding dele. */
  const slotContentWidth = (p: Prepared): number =>
    cached(p, 'scw', () => {
      const widths = p.kids.map((kid) => {
        const spec = specOf(kid, 'width');
        return typeof spec === 'number'
          ? withMin(kid, 'width', spec)
          : intrinsicWidth(kid);
      });
      const inner =
        p.layout.type === 'row'
          ? sum(widths) + p.layout.gap * Math.max(0, widths.length - 1)
          : maxOf(widths);
      return inner + padW(p);
    });

  /** Largura `hug`: o template medido (com `slotContent` nos containers). */
  function intrinsicWidth(p: Prepared): number {
    return cached(p, 'iw', () => {
      const options = p.slot
        ? { measure, slotContent: { width: slotContentWidth(p), height: 0 } }
        : { measure };
      const { width } = measureComponent(
        p.component,
        p.node.values,
        { width: null, height: null },
        options,
      );
      return withMin(p, 'width', hugValue(width));
    });
  }

  /** Altura `hug` na largura final (`hugW`: a largura também veio do `hug`). */
  function intrinsicHeight(p: Prepared, width: number, hugW: boolean): number {
    return cached(p, `ih|${width}|${hugW}`, () => {
      let slotContent = { width: 0, height: 0 };
      if (p.slot) {
        const probe = slotBoxOf(
          p,
          { x: 0, y: 0, width, height: p.component.size.height },
          { width: slotContentWidth(p), height: 0 },
        );
        if (probe) {
          const arranged = arrangeKids(
            p.kids,
            p.layout,
            hugW && p.layout.type !== 'column'
              ? null
              : Math.max(0, probe.width - padW(p)),
            null,
            false,
          );
          slotContent = { width: probe.width, height: arranged.usedH + padH(p) };
        }
      }
      const { height } = measureComponent(
        p.component,
        p.node.values,
        { width, height: null },
        p.slot ? { measure, slotContent } : { measure },
      );
      return withMin(p, 'height', hugValue(height));
    });
  }

  // --- tamanhos de um filho num eixo ---------------------------------------------------------

  /** Largura de um filho; `cw` nulo = o pai é `hug` nessa largura. */
  const widthOf = (
    kid: Prepared,
    cw: number | null,
    stretch: boolean,
  ): { w: number; hug: boolean } => {
    const spec = specOf(kid, 'width');
    if (typeof spec === 'number') return { w: withMin(kid, 'width', spec), hug: false };
    if ((spec === 'fill' || stretch) && cw !== null)
      return { w: withMin(kid, 'width', cw), hug: false };
    const intrinsic = intrinsicWidth(kid);
    const w = cw === null ? intrinsic : Math.min(intrinsic, cw);
    return { w: withMin(kid, 'width', w), hug: w === intrinsic };
  };

  /** Arruma os filhos num conteúdo `cw` × `ch` (nulo = o pai é `hug` nesse eixo). */
  function arrangeKids(
    kids: readonly Prepared[],
    layout: ResolvedSlotLayout,
    cw: number | null,
    ch: number | null,
    emit: boolean,
  ): Arranged {
    const n = kids.length;
    const gaps = layout.gap * Math.max(0, n - 1);
    const stretch = layout.align === 'stretch';

    if (layout.type === 'column') {
      const widths = kids.map((kid) =>
        widthOf(kid, cw, stretch && specOf(kid, 'width') === 'hug'),
      );
      const fixed = kids.map((kid, i) => {
        const spec = specOf(kid, 'height');
        if (typeof spec === 'number')
          return { h: withMin(kid, 'height', spec), hug: false };
        if (spec === 'hug' || ch === null) {
          if (spec === 'fill' && emit)
            warn(`${kid.node.id}: fill dentro de hug: usando hug`);
          const { w, hug } = widths[i] ?? { w: 0, hug: false };
          return { h: intrinsicHeight(kid, w, hug), hug: true };
        }
        return undefined;
      });
      const fills = fixed.filter((f) => f === undefined).length;
      const taken = sum(fixed.map((f) => f?.h ?? 0));
      const share = fills > 0 && ch !== null ? Math.max(0, ch - taken - gaps) / fills : 0;
      const sized = kids.map((kid, i) => {
        const f = fixed[i];
        return f ?? { h: withMin(kid, 'height', share), hug: false };
      });
      const heights = sized.map((s) => s.h);
      const usedH = sum(heights) + gaps;
      const usedW = maxOf(widths.map((x) => x.w));
      const ys = mainPositions(heights, layout.gap, ch, layout.justify);
      return {
        rects: kids.map((_, i) => {
          const wi = widths[i] ?? { w: 0, hug: false };
          return {
            x: crossPosition(wi.w, cw ?? usedW, layout.align),
            y: ys[i] ?? 0,
            w: wi.w,
            h: heights[i] ?? 0,
            hugW: wi.hug,
            hugH: sized[i]?.hug ?? false,
          };
        }),
        usedW,
        usedH,
      };
    }

    if (layout.type === 'row') {
      const fixed = kids.map((kid) => {
        const spec = specOf(kid, 'width');
        if (spec === 'fill' && cw !== null) return undefined;
        return widthOf(kid, null, false);
      });
      const fills = fixed.filter((f) => f === undefined).length;
      const taken = sum(fixed.map((f) => f?.w ?? 0));
      const share = fills > 0 && cw !== null ? Math.max(0, cw - taken - gaps) / fills : 0;
      const widths = kids.map((kid, i) => {
        const f = fixed[i];
        return f ?? { w: withMin(kid, 'width', share), hug: false };
      });
      // Altura (eixo cruzado): com `ch` nulo, os `fill` recebem a maior altura dos demais.
      const heightOf = (kid: Prepared, i: number): { h: number; hug: boolean } => {
        const spec = specOf(kid, 'height');
        const wi = widths[i] ?? { w: 0, hug: false };
        if (typeof spec === 'number')
          return { h: withMin(kid, 'height', spec), hug: false };
        if (ch !== null && (spec === 'fill' || stretch))
          return { h: withMin(kid, 'height', ch), hug: false };
        return { h: intrinsicHeight(kid, wi.w, wi.hug), hug: true };
      };
      const base = kids.map((kid, i) =>
        specOf(kid, 'height') === 'fill' && ch === null ? undefined : heightOf(kid, i),
      );
      const others = base.filter((b) => b !== undefined).map((b) => b.h);
      const heights = kids.map((kid, i) => {
        const b = base[i];
        if (b) return b;
        if (others.length === 0) return heightOf(kid, i);
        return { h: withMin(kid, 'height', maxOf(others)), hug: false };
      });
      const usedW = sum(widths.map((x) => x.w)) + gaps;
      const usedH = maxOf(heights.map((x) => x.h));
      const xs = mainPositions(
        widths.map((x) => x.w),
        layout.gap,
        cw,
        layout.justify,
      );
      return {
        rects: kids.map((_, i) => {
          const wi = widths[i] ?? { w: 0, hug: false };
          const hi = heights[i] ?? { h: 0, hug: false };
          return {
            x: xs[i] ?? 0,
            y: crossPosition(hi.h, ch ?? usedH, layout.align),
            w: wi.w,
            h: hi.h,
            hugW: wi.hug,
            hugH: hi.hug,
          };
        }),
        usedW,
        usedH,
      };
    }

    // Box (`none`): cada filho no canto do conteúdo.
    const rects = kids.map((kid) => {
      const wi = widthOf(kid, cw, false);
      const spec = specOf(kid, 'height');
      if (typeof spec === 'number')
        return {
          x: 0,
          y: 0,
          w: wi.w,
          h: withMin(kid, 'height', spec),
          hugW: wi.hug,
          hugH: false,
        };
      if (spec === 'fill' && ch !== null)
        return {
          x: 0,
          y: 0,
          w: wi.w,
          h: withMin(kid, 'height', ch),
          hugW: wi.hug,
          hugH: false,
        };
      const h = intrinsicHeight(kid, wi.w, wi.hug);
      return { x: 0, y: 0, w: wi.w, h, hugW: wi.hug, hugH: true };
    });
    return {
      rects,
      usedW: maxOf(rects.map((r) => r.w)),
      usedH: maxOf(rects.map((r) => r.h)),
    };
  }

  // --- colocação: grava a caixa de cada instância e desce pelos filhos ---------------------

  const place = (
    p: Prepared,
    box: Box,
    hugW: boolean,
    hugH: boolean,
    parentId: string | undefined,
    out: Instance[],
  ): void => {
    const { node } = p;
    out.push({
      id: node.id,
      typeId: node.typeId,
      box,
      values: node.values,
      ...(parentId !== undefined ? { parentId } : {}),
    });
    if (!p.slot || p.kids.length === 0) return;
    const probe = slotBoxOf(p, box, { width: slotContentWidth(p), height: 0 });
    if (!probe) {
      warn(`${node.id}: slot invisível: filhos ignorados`);
      return;
    }
    const { layout } = p;
    // Pai `hug` no eixo principal: os filhos `fill` já caíram em `hug` e não sobra espaço.
    const cw =
      hugW && layout.type !== 'column' ? null : Math.max(0, probe.width - padW(p));
    const pre = arrangeKids(p.kids, layout, cw, null, false);
    const slot =
      slotBoxOf(p, box, { width: probe.width, height: pre.usedH + padH(p) }) ?? probe;
    const ch = hugH && layout.type !== 'row' ? null : Math.max(0, slot.height - padH(p));
    const arranged = arrangeKids(p.kids, layout, cw, ch, true);
    const originX = slot.x + layout.padding.left;
    const originY = slot.y + layout.padding.top;
    p.kids.forEach((kid, i) => {
      const r = arranged.rects[i];
      if (!r) return;
      place(
        kid,
        { x: originX + r.x, y: originY + r.y, width: r.w, height: r.h },
        r.hugW,
        r.hugH,
        node.id,
        out,
      );
    });
  };

  // --- tela ----------------------------------------------------------------------------------

  const roots = input.roots
    .map((root) => ({ root, prepared: prepare(root.node) }))
    .filter(
      (r): r is { root: LayoutRoot; prepared: Prepared } => r.prepared !== undefined,
    );

  const flow = roots.filter((r) => r.root.anchor === undefined);
  const flowed = arrangeKids(
    flow.map((r) => r.prepared),
    SCREEN_LAYOUT,
    input.width,
    input.height,
    true,
  );
  if (flowed.usedH > input.height + EPS)
    warn('tela: conteúdo maior que a altura da tela');

  const rootBox = (
    root: LayoutRoot,
    p: Prepared,
  ): { box: Box; hugW: boolean; hugH: boolean } => {
    const flowIndex = flow.findIndex((r) => r.prepared === p);
    const rect = flowed.rects[flowIndex];
    if (root.anchor === undefined && rect)
      return {
        box: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
        hugW: rect.hugW,
        hugH: rect.hugH,
      };
    const margin = Math.max(0, root.margin ?? 0);
    const specW = specOf(p, 'width');
    const specH = specOf(p, 'height');
    const width = withMin(
      p,
      'width',
      typeof specW === 'number'
        ? specW
        : specW === 'fill'
          ? input.width - 2 * margin
          : intrinsicWidth(p),
    );
    const height = withMin(
      p,
      'height',
      typeof specH === 'number'
        ? specH
        : specH === 'fill'
          ? input.height - 2 * margin
          : intrinsicHeight(p, width, specW === 'hug'),
    );
    const anchor = root.anchor ?? 'top-start';
    const x = anchorOffset(anchor, 'x', input.width, width, margin);
    const y = anchorOffset(anchor, 'y', input.height, height, margin);
    return {
      box: { x, y, width, height },
      hugW: specW === 'hug',
      hugH: specH === 'hug',
    };
  };

  const instances: Instance[] = [];
  for (const { root, prepared } of roots) {
    if (root.scrimTypeId !== undefined) {
      const scrim = types.get(root.scrimTypeId);
      const scrimId = `${root.node.id}#scrim`;
      if (!scrim?.component) warn(`${scrimId}: tipo sem componente: ${root.scrimTypeId}`);
      else {
        const values: Record<string, FieldValues[string]> = {};
        for (const field of scrim.fields) values[field.key] = field.default ?? null;
        instances.push({
          id: scrimId,
          typeId: scrim.id,
          box: { x: 0, y: 0, width: input.width, height: input.height },
          values,
        });
      }
    }
    const placed = rootBox(root, prepared);
    place(prepared, placed.box, placed.hugW, placed.hugH, undefined, instances);
  }

  return {
    screen: {
      id: input.id,
      name: input.name,
      width: input.width,
      height: input.height,
      background: input.background,
      instances,
    },
    warnings: [...warnings],
  };
}
