/**
 * Laboratório "Componentes": instancia um componente (`mapping-component`) numa caixa e
 * produz a árvore de cena que o renderizador Konva já desenha (`lab/scene/scene.ts`).
 *
 * Passos: (1) avalia as expressões contra os valores dos campos; (2) calcula o tamanho de cada
 * nó (px, %, `fill`, `hug`); (3) posiciona os filhos conforme o `layout` do pai; (4) monta os
 * nós da cena. Funções puras, sem DOM: o texto é medido por um `TextMeasurer` injetado.
 *
 * Regras de tamanho (documentadas aqui para os testes e para quem escreve templates):
 * - Padrão de `width`/`height` omitidos: `'hug'` para texto, `'fill'` para todo o resto, nos
 *   dois eixos. Num pai `none`, um filho sem tamanho e sem âncoras ocupa o pai inteiro.
 * - px fixos; `"N%"` é fração da área de conteúdo do pai; `'hug'` vem do conteúdo (texto
 *   medido, quadro que abraça os filhos, caminho = `viewBox`, retângulo/elipse/slot = 0).
 * - `'fill'` no eixo principal de `row`/`column` divide o que sobra entre os `fill`; no eixo
 *   cruzado e em `none` é a área de conteúdo toda (menos as âncoras, se houver).
 * - Quadro `hug`: primeiro mede-se o conteúdo (com `fill` e `%` valendo 0); depois o resultado
 *   vira o tamanho do quadro e `fill`/`%` são resolvidos contra ele. Só o `fill` no eixo
 *   principal de um `hug` avisa ("fill dentro de hug vira 0"), porque ali o resultado é mesmo 0.
 * - Âncoras (pai `none`): `left`+`right` (ou `top`+`bottom`) esticam o filho entre elas,
 *   mesmo que ele tenha tamanho fixo (como as constraints do Figma).
 * - `lineHeight` entregue ao `TextMeasurer` já em px.
 * - Nó `slot` com `options.slotContent` (tamanho dos filhos já arrumados mais o padding do
 *   slot, vindo de `layout.ts`): `hug` vale o `slotContent` do eixo; `fill` (ou âncoras nos dois
 *   lados) com o pai sendo medido (`hug`) também, sem o aviso de "fill dentro de hug". Com o pai
 *   já medido, o `fill` divide o que sobra, que então é o próprio `slotContent`. Sem
 *   `slotContent` nada muda (o slot vale 0 ao medir). `measureComponent` mede só o plano da raiz.
 */
import type {
  Anchors,
  BoolExpr,
  ComponentFile,
  Expr,
  FieldValues,
  FillSpec,
  FontSpec,
  FrameTemplate,
  GradientSpec,
  PathTemplate,
  SizeSpec,
  StrokeSpec,
  TemplateNode,
  TextTemplate,
} from './componentFormat';
import { evaluate, evaluateBoolean, evaluateText, referencedFields } from './expressions';
import {
  type CornerRadius,
  type FrameNode,
  type Matrix,
  type Paint,
  type SceneNode,
  type Shadow,
  type Stroke,
  type TextStyle,
  baseNode,
  translate,
} from '../scene/scene';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextMetrics {
  readonly width: number;
  readonly height: number;
}

/** Mede um texto com a fonte dada (largura máxima opcional, para quebra de linha). */
export type TextMeasurer = (
  text: string,
  font: {
    family: string;
    size: number;
    weight: number;
    italic: boolean;
    lineHeight: number;
    letterSpacing: number;
  },
  maxWidth?: number,
) => TextMetrics;

export interface InstantiateOptions {
  readonly measure: TextMeasurer;
  /** Prefixo dos ids dos nós (ex.: id da instância). */
  readonly idPrefix?: string;
  /**
   * Tamanho do conteúdo do slot (filhos arrumados mais o padding do slot), para medir um
   * componente cujo tamanho depende dos filhos (`hug`). Ver o comentário do topo do arquivo.
   */
  readonly slotContent?: { readonly width: number; readonly height: number };
}

export interface Instantiated {
  readonly root: FrameNode;
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------------------
// Medidor aproximado
// ---------------------------------------------------------------------------------------

/**
 * Medidor aproximado sem canvas (testes e Node): largura ≈ 0,55·tamanho por caractere (0,6 se
 * o peso for ≥ 600) mais o espaçamento entre letras; altura = linhas × altura de linha. Com
 * `maxWidth`, quebra por palavras (uma palavra maior que a largura fica sozinha na linha).
 */
export const approximateMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const charWidth = font.size * (font.weight >= 600 ? 0.6 : 0.55) + font.letterSpacing;
  const textWidth = (chars: number) => Math.max(0, chars * charWidth);
  let lines = 0;
  let widest = 0;
  for (const paragraph of text.split('\n')) {
    if (maxWidth === undefined) {
      lines += 1;
      widest = Math.max(widest, textWidth(paragraph.length));
      continue;
    }
    const words = paragraph.split(' ').filter((word) => word !== '');
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = 0;
    for (const word of words) {
      const candidate = current === 0 ? word.length : current + 1 + word.length;
      if (current > 0 && textWidth(candidate) > maxWidth + 1e-9) {
        lines += 1;
        widest = Math.max(widest, textWidth(current));
        current = word.length;
      } else {
        current = candidate;
      }
    }
    lines += 1;
    widest = Math.max(widest, textWidth(current));
  }
  return { width: widest, height: Math.max(1, lines) * font.lineHeight };
};

// ---------------------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------------------

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Número → todos os lados; `[v, h]`; `[cima, direita, baixo, esquerda]`. */
export function normalizePadding(
  padding: number | readonly number[] | undefined,
): Padding {
  if (padding === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof padding === 'number')
    return { top: padding, right: padding, bottom: padding, left: padding };
  if (padding.length === 2) {
    const [v = 0, h = 0] = padding;
    return { top: v, right: h, bottom: v, left: h };
  }
  const [top = 0, right = 0, bottom = 0, left = 0] = padding;
  return { top, right, bottom, left };
}

type Axis = 'w' | 'h';

interface Kid {
  readonly node: TemplateNode;
  /** Índice no template (inclui os filhos invisíveis), para o caminho do id. */
  readonly index: number;
}

interface FrameLayout {
  readonly kind: 'none' | 'row' | 'column';
  /** Eixo principal (`null` em `none`). */
  readonly main: Axis | null;
  readonly gap: number;
  readonly pad: Padding;
  readonly align: 'start' | 'center' | 'end' | 'stretch';
  readonly justify: 'start' | 'center' | 'end' | 'space-between';
}

interface Placement {
  readonly kid: Kid;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Plan {
  readonly w: number;
  readonly h: number;
  readonly placements: readonly Placement[];
}

const EPS = 0.001;
const FALLBACK_FONT_FAMILY = 'Inter';

function isNone(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === '' || c === 'none';
}

function nodeName(node: TemplateNode): string {
  return node.name ?? node.type;
}

function anchorsOf(
  node: TemplateNode,
  axis: Axis,
): { start?: number; end?: number; center: boolean } {
  const a: Anchors | undefined = node.anchors;
  if (!a) return { center: false };
  return axis === 'w'
    ? { start: a.left, end: a.right, center: a.centerX === true }
    : { start: a.top, end: a.bottom, center: a.centerY === true };
}

// ---------------------------------------------------------------------------------------
// Instanciação
// ---------------------------------------------------------------------------------------

/**
 * Monta o "motor" de um componente com seus valores: avaliação, tamanhos e planos dos quadros.
 * `instantiate` e `measureComponent` compartilham este fechamento (e o cache dos planos).
 */
function createEngine(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
) {
  const warnings = new Set<string>();
  const warn = (message: string) => warnings.add(message);
  const prefix = options.idPrefix ?? 'c';

  for (const key of referencedFields(component.template))
    if (!(key in values)) warn(`campo não informado: ${key}`);

  // --- avaliação de expressões ----------------------------------------------------------

  const ev = <T>(expr: Expr<T> | undefined, fallback: T): T =>
    expr === undefined ? fallback : evaluate(expr, values, fallback);

  const num = (expr: Expr<number> | undefined, fallback: number): number => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : fallback;
  };

  const str = (expr: Expr<string> | undefined, fallback: string): string => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return value === null || value === undefined ? fallback : String(value);
  };

  /** Booleano (`visible`, `italic`): um `$field` com "não" é falso, via `evaluateBoolean`. */
  const bool = (expr: BoolExpr | undefined, fallback: boolean): boolean =>
    expr === undefined ? fallback : evaluateBoolean(expr, values, fallback);

  const oneOf = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };

  const isVisible = (node: TemplateNode) => bool(node.visible, true);

  // --- texto ----------------------------------------------------------------------------

  const textFont = (node: TextTemplate) => {
    const font: FontSpec = node.font ?? {};
    const size = Math.max(0, num(font.size, 14));
    const lh = num(font.lineHeight, 1.2);
    return {
      family: str(font.family, FALLBACK_FONT_FAMILY),
      size,
      weight: num(font.weight, 400),
      italic: bool(font.italic, false),
      lineHeight: lh <= 3 ? lh * size : lh,
      letterSpacing: num(font.letterSpacing, 0),
    };
  };

  const measureText = (node: TextTemplate, maxWidth?: number) =>
    options.measure(evaluateText(node.text, values, ''), textFont(node), maxWidth);

  // --- tamanhos -------------------------------------------------------------------------

  const specOf = (node: TemplateNode, axis: Axis): SizeSpec =>
    (axis === 'w' ? node.width : node.height) ?? (node.type === 'text' ? 'hug' : 'fill');

  const layoutOf = (frame: FrameTemplate): FrameLayout => {
    const layout = frame.layout;
    if (!layout || layout.type === 'none')
      return {
        kind: 'none',
        main: null,
        gap: 0,
        pad: normalizePadding(undefined),
        align: 'start',
        justify: 'start',
      };
    return {
      kind: layout.type,
      main: layout.type === 'row' ? 'w' : 'h',
      gap: Math.max(0, num(layout.gap, 0)),
      pad: normalizePadding(evaluate(layout.padding, values, 0)),
      align: layout.align ?? 'start',
      justify: layout.justify ?? 'start',
    };
  };

  const visibleKids = (frame: FrameTemplate): Kid[] =>
    (frame.children ?? [])
      .map((node, index) => ({ node, index }))
      .filter((kid) => isVisible(kid.node));

  const planCache = new Map<FrameTemplate, Map<string, Plan>>();

  /** Tamanho do conteúdo de um nó num eixo (`otherSize`: a largura já resolvida, para a altura). */
  const hugSize = (
    node: TemplateNode,
    axis: Axis,
    otherSize: number | undefined,
  ): number => {
    switch (node.type) {
      case 'text': {
        if (axis === 'w') return measureText(node).width;
        const wrap = specOf(node, 'w') === 'hug' ? undefined : otherSize;
        return measureText(node, wrap).height;
      }
      case 'frame': {
        if (axis === 'w') return planFrame(node, null, null).w;
        return planFrame(node, otherSize ?? null, null).h;
      }
      case 'path':
        return node.viewBox[axis === 'w' ? 0 : 1];
      default:
        return 0;
    }
  };

  const kidSize = (
    kid: Kid,
    axis: Axis,
    content: number | null,
    otherSize: number | undefined,
    layout: FrameLayout,
  ): number | 'fill' => {
    const { node } = kid;
    const spec = specOf(node, axis);
    const isMain = layout.main === axis;
    const anchors = layout.kind === 'none' ? anchorsOf(node, axis) : undefined;
    if (
      anchors &&
      !anchors.center &&
      anchors.start !== undefined &&
      anchors.end !== undefined &&
      content !== null
    )
      return Math.max(0, content - anchors.start - anchors.end);
    if (typeof spec === 'number') return Math.max(0, spec);
    if (node.type === 'slot' && options.slotContent) {
      const inner = options.slotContent[axis === 'w' ? 'width' : 'height'];
      const anchored =
        anchors !== undefined &&
        !anchors.center &&
        anchors.start !== undefined &&
        anchors.end !== undefined;
      if (spec === 'hug' || (content === null && (spec === 'fill' || anchored)))
        return Math.max(0, inner);
    }
    if (spec === 'hug') {
      if (
        !isMain &&
        layout.kind !== 'none' &&
        layout.align === 'stretch' &&
        content !== null
      )
        return content;
      return Math.max(0, hugSize(node, axis, otherSize));
    }
    if (spec === 'fill') {
      if (isMain) return 'fill';
      if (content === null) return 0;
      return Math.max(0, content - (anchors?.start ?? 0) - (anchors?.end ?? 0));
    }
    const percent = parseFloat(spec);
    return content === null || !Number.isFinite(percent) ? 0 : (content * percent) / 100;
  };

  /** Tamanhos dos filhos num eixo; `content` nulo = o pai está sendo medido (hug). */
  const resolveAxis = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    content: number | null,
    others: readonly number[] | null,
  ): number[] => {
    const raw = kids.map((kid, i) => kidSize(kid, axis, content, others?.[i], layout));
    if (layout.kind === 'none') return raw.map((s) => (s === 'fill' ? 0 : s));
    const fills = raw.filter((s) => s === 'fill').length;
    const fixed = raw.reduce<number>((sum, s) => sum + (s === 'fill' ? 0 : s), 0);
    let share = 0;
    if (layout.main === axis) {
      if (content === null) {
        if (fills > 0) warn('fill dentro de hug vira 0');
      } else {
        const remaining = content - fixed - layout.gap * Math.max(0, kids.length - 1);
        if (remaining < -EPS) warn(`conteúdo maior que a caixa: ${nodeName(frame)}`);
        share = fills > 0 ? Math.max(0, remaining) / fills : 0;
      }
    } else if (content !== null && fixed > 0) {
      if (raw.some((s) => s !== 'fill' && s > content + EPS))
        warn(`conteúdo maior que a caixa: ${nodeName(frame)}`);
    }
    return raw.map((s) => (s === 'fill' ? share : s));
  };

  /** Tamanho do quadro num eixo a partir dos filhos (`hug`), com o padding. */
  const hugTotal = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    padding: number,
  ): number => {
    if (sizes.length === 0) return padding;
    if (layout.kind === 'none') {
      let edge = 0;
      kids.forEach((kid, i) => {
        const a = anchorsOf(kid.node, axis);
        const size = sizes[i] ?? 0;
        edge = Math.max(edge, a.center ? size : (a.start ?? 0) + size + (a.end ?? 0));
      });
      return edge + padding;
    }
    if (layout.main === axis)
      return (
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * (sizes.length - 1) + padding
      );
    return Math.max(...sizes) + padding;
  };

  /** Posição (relativa ao pai) de cada filho num eixo. */
  const positionAxis = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    total: number,
  ): number[] => {
    const startPad = axis === 'w' ? layout.pad.left : layout.pad.top;
    const endPad = axis === 'w' ? layout.pad.right : layout.pad.bottom;
    const content = total - startPad - endPad;
    if (layout.kind === 'none') {
      return kids.map((kid, i) => {
        const a = anchorsOf(kid.node, axis);
        const size = sizes[i] ?? 0;
        if (a.center) return (content - size) / 2;
        if (a.start !== undefined) return a.start;
        if (a.end !== undefined) return content - a.end - size;
        return 0;
      });
    }
    if (layout.main === axis) {
      const used =
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * Math.max(0, sizes.length - 1);
      const free = Math.max(0, content - used);
      let offset = 0;
      let extra = 0;
      if (layout.justify === 'center') offset = free / 2;
      else if (layout.justify === 'end') offset = free;
      else if (layout.justify === 'space-between' && sizes.length > 1)
        extra = free / (sizes.length - 1);
      let cursor = startPad + offset;
      return sizes.map((size) => {
        const position = cursor;
        cursor += size + layout.gap + extra;
        return position;
      });
    }
    return sizes.map((size) => {
      if (layout.align === 'center') return startPad + (content - size) / 2;
      if (layout.align === 'end') return startPad + content - size;
      return startPad;
    });
  };

  /** Plano de um quadro: `null` num eixo = `hug` (o quadro abraça os filhos). */
  const planFrame = (frame: FrameTemplate, w: number | null, h: number | null): Plan => {
    const key = `${w ?? 'n'}x${h ?? 'n'}`;
    const cached = planCache.get(frame)?.get(key);
    if (cached) return cached;

    const layout = layoutOf(frame);
    const kids = visibleKids(frame);
    const padW = layout.pad.left + layout.pad.right;
    const padH = layout.pad.top + layout.pad.bottom;

    const solve = (
      axis: Axis,
      known: number | null,
      others: readonly number[] | null,
    ): { total: number; sizes: number[] } => {
      const pad = axis === 'w' ? padW : padH;
      let total = known;
      if (total === null) {
        const preliminary = resolveAxis(frame, layout, kids, axis, null, others);
        total = hugTotal(layout, kids, axis, preliminary, pad);
      }
      return {
        total,
        sizes: resolveAxis(frame, layout, kids, axis, Math.max(0, total - pad), others),
      };
    };

    const horizontal = solve('w', w, null);
    const vertical = solve('h', h, horizontal.sizes);
    const xs = positionAxis(layout, kids, 'w', horizontal.sizes, horizontal.total);
    const ys = positionAxis(layout, kids, 'h', vertical.sizes, vertical.total);
    const plan: Plan = {
      w: horizontal.total,
      h: vertical.total,
      placements: kids.map((kid, i) => ({
        kid,
        x: xs[i] ?? 0,
        y: ys[i] ?? 0,
        w: horizontal.sizes[i] ?? 0,
        h: vertical.sizes[i] ?? 0,
      })),
    };
    let perFrame = planCache.get(frame);
    if (!perFrame) {
      perFrame = new Map();
      planCache.set(frame, perFrame);
    }
    perFrame.set(key, plan);
    return plan;
  };

  // --- estilo ---------------------------------------------------------------------------

  /**
   * Gradiente linear pela convenção do CSS: a linha passa pelo centro da caixa, na direção do
   * ângulo (0° = esquerda→direita, 90° = cima→baixo), com comprimento que cobre os cantos.
   */
  const gradientPaint = (gradient: GradientSpec, w: number, h: number): Paint => {
    const rad = (gradient.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const length = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2;
    const cy = h / 2;
    return {
      type: 'linear',
      start: { x: cx - (dx * length) / 2, y: cy - (dy * length) / 2 },
      end: { x: cx + (dx * length) / 2, y: cy + (dy * length) / 2 },
      stops: gradient.stops.map((stop) => ({ offset: stop.offset, color: stop.color })),
    };
  };

  const fillsOf = (fill: Expr<FillSpec> | undefined, w: number, h: number): Paint[] => {
    const value = ev<FillSpec>(fill, 'none');
    if (typeof value === 'string')
      return isNone(value) ? [] : [{ type: 'solid', color: value }];
    if (typeof value === 'object' && value !== null && value.type === 'linear')
      return value.stops.length > 0 ? [gradientPaint(value, w, h)] : [];
    return [];
  };

  const strokeOf = (
    spec: StrokeSpec | undefined,
    defaultAlign: 'inside' | 'center',
    scale: number,
  ): Stroke | undefined => {
    if (!spec) return undefined;
    const color = str(spec.color, 'none');
    if (isNone(color)) return undefined;
    const width = Math.max(0, num(spec.width, 1));
    return {
      paints: [{ type: 'solid', color }],
      width: width / scale,
      align: spec.align ?? defaultAlign,
      ...(spec.dash ? { dash: spec.dash } : {}),
    };
  };

  const effectsOf = (node: TemplateNode, scale: number): Shadow[] => {
    const shadow = node.shadow;
    if (!shadow) return [];
    const color = str(shadow.color, 'none');
    if (isNone(color)) return [];
    return [
      {
        color,
        offset: { x: (shadow.x ?? 0) / scale, y: (shadow.y ?? 0) / scale },
        blur: (shadow.blur ?? 0) / scale,
      },
    ];
  };

  const radiusOf = (node: TemplateNode): CornerRadius => {
    const value = ev<unknown>(node.cornerRadius as Expr<unknown> | undefined, 0);
    if (Array.isArray(value) && value.length === 4) {
      const [a, b, c, d] = value.map((v) => Math.max(0, Number(v) || 0));
      return [a ?? 0, b ?? 0, c ?? 0, d ?? 0];
    }
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  // --- montagem dos nós -----------------------------------------------------------------

  const common = (
    node: TemplateNode,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => ({
    ...baseNode({ id, name: nodeName(node) }),
    opacity: Math.min(1, Math.max(0, num(node.opacity, 1))),
    transform: translate(x, y),
    width: w,
    height: h,
    fills: fillsOf(node.fill, w, h),
    effects: effectsOf(node, 1),
  });

  const buildFrame = (
    frame: FrameTemplate,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
    isRoot: boolean,
  ): FrameNode => {
    const plan = planFrame(frame, w, h);
    const stroke = strokeOf(frame.stroke, 'inside', 1);
    return {
      ...common(frame, `${prefix}/${path}`, x, y, w, h),
      ...(stroke ? { stroke } : {}),
      type: 'frame',
      clip: frame.clip ?? isRoot,
      cornerRadius: radiusOf(frame),
      children: plan.placements.map((p) =>
        buildNode(p.kid.node, `${path}.${p.kid.index}`, p.x, p.y, p.w, p.h),
      ),
    };
  };

  const buildPath = (
    node: PathTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const [vbW, vbH] = node.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy))) {
      warn('ícone esticado: escala diferente nos dois eixos');
    }
    const scale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
    const stroke = strokeOf(node.stroke, 'center', scale);
    const transform: Matrix = [sx, 0, 0, sy, x, y];
    return {
      ...common(node, id, x, y, vbW, vbH),
      transform,
      effects: effectsOf(node, scale),
      ...(stroke ? { stroke } : {}),
      type: 'path',
      d: str(node.d, ''),
      fillRule: node.fillRule ?? 'nonzero',
    };
  };

  const buildText = (
    node: TextTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const font = textFont(node);
    const font0: FontSpec = node.font ?? {};
    const decoration = oneOf(
      font0.decoration,
      ['none', 'underline', 'line-through'],
      'none',
    );
    const style: TextStyle = {
      fontFamily: font.family,
      fontSize: font.size,
      fontWeight: font.weight,
      italic: font.italic,
      lineHeight: font.lineHeight,
      letterSpacing: font.letterSpacing,
      align: oneOf(font0.align, ['left', 'center', 'right'], 'left'),
      verticalAlign: oneOf(font0.verticalAlign, ['top', 'middle', 'bottom'], 'top'),
      ...(decoration === 'none' ? {} : { decoration }),
    };
    const color = str(node.color, '#000000');
    const stroke = strokeOf(node.stroke, 'inside', 1);
    return {
      ...common(node, id, x, y, w, h),
      fills: isNone(color) ? [] : [{ type: 'solid', color }],
      ...(stroke ? { stroke } : {}),
      type: 'text',
      text: evaluateText(node.text, values, ''),
      style,
    };
  };

  const buildNode = (
    node: TemplateNode,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const id = `${prefix}/${path}`;
    switch (node.type) {
      case 'frame':
        return buildFrame(node, path, x, y, w, h, false);
      case 'path':
        return buildPath(node, id, x, y, w, h);
      case 'text':
        return buildText(node, id, x, y, w, h);
      case 'slot': {
        const label = str(node.label, node.name ?? 'slot');
        return {
          ...common(node, id, x, y, w, h),
          name: label,
          type: 'unknown',
          sourceType: 'slot',
        };
      }
      case 'rect': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'rect',
          cornerRadius: radiusOf(node),
        };
      }
      case 'ellipse': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'ellipse',
        };
      }
    }
  };

  const buildRoot = (box: Box): FrameNode =>
    buildFrame(component.template, 'root', box.x, box.y, box.width, box.height, true);

  return { warnings, planFrame, buildRoot };
}

export function instantiate(
  component: ComponentFile,
  values: FieldValues,
  box: Box,
  options: InstantiateOptions,
): Instantiated {
  const engine = createEngine(component, values, options);
  const root = engine.buildRoot(box);
  return { root, warnings: [...engine.warnings] };
}

/**
 * Mede o componente sem montar nós: o plano da raiz do template, com `null` = `hug` naquele
 * eixo (o quadro abraça os filhos; com `slotContent`, o slot vale o tamanho dos filhos).
 */
export function measureComponent(
  component: ComponentFile,
  values: FieldValues,
  size: { readonly width: number | null; readonly height: number | null },
  options: InstantiateOptions,
): { width: number; height: number; warnings: readonly string[] } {
  const engine = createEngine(component, values, options);
  const plan = engine.planFrame(component.template, size.width, size.height);
  return { width: plan.w, height: plan.h, warnings: [...engine.warnings] };
}
