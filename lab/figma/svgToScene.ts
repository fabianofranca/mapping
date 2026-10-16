/**
 * Laboratório "Figma somente leitura": conversor do SVG do "Copy as SVG" do Figma
 * para o modelo de cena (`scene.ts`). Usa `DOMParser`, então roda no navegador (e no jsdom
 * dos testes). Não faz nenhuma requisição de rede: imagens só valem com `data:`.
 *
 * O que não dá para representar vira aviso em `Scene.warnings` (sem duplicatas).
 */

import {
  IDENTITY,
  multiply,
  translate,
  baseNode,
  type CornerRadius,
  type Matrix,
  type Paint,
  type Point,
  type Scene,
  type SceneNode,
  type Shadow,
  type Stroke,
  type GradientStop,
  type TextStyle,
} from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Propriedades (atributos de apresentação + `style=""`), por nome em kebab-case. */
type Props = Record<string, string>;

/** Propriedades que descem dos pais para os filhos. */
const INHERITED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'text-decoration',
  'visibility',
] as const;

/** Elementos que não desenham nada por si (definições, metadados). */
const SKIPPED = new Set([
  'defs',
  'title',
  'desc',
  'metadata',
  'style',
  'mask',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'pattern',
  'filter',
]);

interface Ctx {
  readonly byId: Map<string, Element>;
  readonly warnings: Set<string>;
  readonly useStack: string[];
  counter: number;
}

interface Ident {
  readonly id: string;
  readonly name: string;
}

/** Caixa do nó em coordenadas do usuário (SVG) e origem do espaço local. */
interface PaintBox {
  /** Origem do espaço local do nó, em coordenadas do usuário. */
  readonly ox: number;
  readonly oy: number;
  /** Caixa de objeto (para `objectBoundingBox`), em coordenadas do usuário. */
  readonly bx: number;
  readonly by: number;
  readonly w: number;
  readonly h: number;
}

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

// ---------------------------------------------------------------------------
// Entrada

/** Converte o SVG (texto) em cena. Lança `Error('SVG inválido: …')` se não for um SVG legível. */
export function svgToScene(svg: string): Scene {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      neutralizeStyleAttributes(svg),
      'image/svg+xml',
    );
  } catch (error) {
    throw new Error(`SVG inválido: ${errorMessage(error)}`, { cause: error });
  }
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    const detail = (parserError.textContent ?? '').trim().split('\n')[0] ?? '';
    throw new Error(`SVG inválido: ${detail || 'XML malformado'}`);
  }
  const rootEl = doc.documentElement as Element | null;
  if (!rootEl || rootEl.localName !== 'svg') {
    throw new Error('SVG inválido: elemento raiz <svg> não encontrado');
  }

  const byId = new Map<string, Element>();
  for (const el of Array.from(doc.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id');
    if (id && !byId.has(id)) byId.set(id, el);
  }
  const ctx: Ctx = { byId, warnings: new Set(), useStack: [], counter: 0 };
  const root = convertRoot(rootEl, ctx);
  return { source: 'svg', root, warnings: [...ctx.warnings] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Utilidades de texto/número

const NUMBER_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const LENGTH_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z%]*)\s*$/;

function numbersIn(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return (raw.match(NUMBER_RE) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

/** Comprimento em px; outras unidades viram aviso (uma vez por unidade). */
function length(raw: string | null | undefined, fallback: number, ctx: Ctx): number {
  if (raw === null || raw === undefined) return fallback;
  const match = LENGTH_RE.exec(raw);
  if (!match) return fallback;
  const unit = (match[2] ?? '').toLowerCase();
  if (unit && unit !== 'px') ctx.warnings.add(`unidade não suportada: ${unit}`);
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

/** Primeiro valor de uma lista (`x="10 20 30"`). */
function firstLength(raw: string | null | undefined, fallback: number, ctx: Ctx): number {
  if (!raw) return fallback;
  const first = raw.trim().split(/[\s,]+/)[0];
  return length(first, fallback, ctx);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Número ou porcentagem (`0.5`, `50%`) como fração. */
function fraction(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const trimmed = raw.trim();
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return trimmed.endsWith('%') ? n / 100 : n;
}

function roundTo(n: number, decimals = 4): number {
  return Number(n.toFixed(decimals));
}

// ---------------------------------------------------------------------------
// Cores

const NAMED_COLORS: Record<string, readonly [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  pink: [255, 192, 203],
};

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function parseColor(raw: string | null | undefined): Rgba | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'currentcolor') return { r: 0, g: 0, b: 0, a: 1 };
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    let digits = hex[1] ?? '';
    if (digits.length <= 4) {
      digits = digits
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const byte = (i: number): number => Number.parseInt(digits.slice(i, i + 2), 16);
    return {
      r: byte(0),
      g: byte(2),
      b: byte(4),
      a: digits.length === 8 ? byte(6) / 255 : 1,
    };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(value);
  if (fn) {
    const parts = (fn[1] ?? '').split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (p: string): number =>
      p.endsWith('%') ? (Number.parseFloat(p) * 255) / 100 : Number.parseFloat(p);
    const [r, g, b] = [
      channel(parts[0] ?? ''),
      channel(parts[1] ?? ''),
      channel(parts[2] ?? ''),
    ];
    const alpha = parts[3] === undefined ? 1 : fraction(parts[3], 1);
    if (![r, g, b, alpha].every(Number.isFinite)) return null;
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: clamp01(alpha) };
  }

  const named = NAMED_COLORS[value];
  if (named) return { r: named[0], g: named[1], b: named[2], a: 1 };
  return null;
}

const hex2 = (n: number): string => clampByte(n).toString(16).padStart(2, '0');

/** `#rrggbb` se opaca, senão `rgba(r, g, b, a)`; `alpha` multiplica a opacidade da cor. */
function formatColor(color: Rgba, alpha = 1): string {
  const a = clamp01(color.a * alpha);
  if (a >= 1) return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  return formatRgba(color.r, color.g, color.b, a);
}

function formatRgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${roundTo(clamp01(a))})`;
}

// ---------------------------------------------------------------------------
// Atributos, estilo e herança

function parseStyle(style: string | null): Props {
  const out: Props = {};
  if (!style) return out;
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const key = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/**
 * O documento que o `DOMParser` cria herda a CSP da página, e o Chrome registra uma violação
 * de `style-src-attr` para cada `style=""` do SVG (o Figma põe `white-space: pre` em todo
 * texto), mesmo sem nada ser desenhado. O atributo vira `data-style` antes do parse e é lido
 * daí; o conteúdo é o mesmo.
 */
const STYLE_ATTR = 'data-style';
function neutralizeStyleAttributes(svg: string): string {
  return svg.replace(/(\s)style(\s*=\s*["'])/g, `$1${STYLE_ATTR}$2`);
}

/** Atributos sem prefixo de namespace, sobrescritos pelo `style=""`. */
function propsOf(el: Element): Props {
  const out: Props = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.includes(':') || attr.name === STYLE_ATTR) continue;
    out[attr.name] = attr.value.trim();
  }
  return { ...out, ...parseStyle(el.getAttribute(STYLE_ATTR)) };
}

function mergeInherited(parent: Props, own: Props): Props {
  const out: Props = { ...parent };
  for (const key of INHERITED) {
    const value = own[key];
    if (value !== undefined && value !== 'inherit') out[key] = value;
  }
  return out;
}

function hrefOf(el: Element): string | null {
  return (
    el.getAttribute('href') ??
    el.getAttributeNS(XLINK_NS, 'href') ??
    el.getAttribute('xlink:href')
  );
}

/** `url(#id)` → `id`. */
function urlRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(raw);
  return match?.[1] ?? null;
}

function allocId(el: Element, ctx: Ctx): string {
  return el.getAttribute('id') ?? `svg-${++ctx.counter}`;
}

function identOf(el: Element, tag: string, ctx: Ctx): Ident {
  const explicit = el.getAttribute('id');
  return { id: explicit ?? allocId(el, ctx), name: explicit ?? tag };
}

// ---------------------------------------------------------------------------
// Transformações

const TRANSFORM_RE = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

function parseTransform(raw: string | null | undefined): Matrix {
  if (!raw) return IDENTITY;
  let result: Matrix = IDENTITY;
  for (const match of raw.matchAll(TRANSFORM_RE)) {
    const name = match[1] ?? '';
    const n = numbersIn(match[2]);
    const at = (i: number, fallback = 0): number => n[i] ?? fallback;
    let m: Matrix | null = null;
    switch (name) {
      case 'matrix':
        if (n.length >= 6) m = [at(0), at(1), at(2), at(3), at(4), at(5)];
        break;
      case 'translate':
        m = translate(at(0), at(1));
        break;
      case 'scale':
        m = [at(0, 1), 0, 0, at(1, at(0, 1)), 0, 0];
        break;
      case 'rotate': {
        const rad = (at(0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
        m =
          n.length >= 3
            ? multiply(
                multiply(translate(at(1), at(2)), rotation),
                translate(-at(1), -at(2)),
              )
            : rotation;
        break;
      }
      case 'skewX':
        m = [1, 0, Math.tan((at(0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        m = [1, Math.tan((at(0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        break;
    }
    if (m) result = multiply(result, m);
  }
  return result;
}

function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => Math.abs(v - (IDENTITY[i] ?? 0)) < 1e-9);
}

/** `m · filho.transform` (reposiciona o filho dentro de um novo espaço). */
function premultiply(m: Matrix, node: SceneNode): SceneNode {
  return isIdentity(m) ? node : { ...node, transform: multiply(m, node.transform) };
}

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function parseViewBox(raw: string | null): ViewBox | null {
  const n = numbersIn(raw);
  if (n.length < 4) return null;
  const [x, y, w, h] = n as [number, number, number, number];
  return { x, y, w, h };
}

/** Matriz que leva o espaço do `viewBox` ao do viewport (`preserveAspectRatio` incluído). */
function viewBoxMatrix(
  vb: ViewBox | null,
  w: number,
  h: number,
  par: string | null,
): Matrix {
  if (!vb) return IDENTITY;
  if (w <= 0 || h <= 0 || vb.w <= 0 || vb.h <= 0) return translate(-vb.x, -vb.y);
  let sx = w / vb.w;
  let sy = h / vb.h;
  let tx = 0;
  let ty = 0;
  const [align = 'xMidYMid', mode] = (par?.trim() || 'xMidYMid meet').split(/\s+/);
  if (align !== 'none') {
    const s = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = s;
    sy = s;
    const extraX = w - vb.w * s;
    const extraY = h - vb.h * s;
    tx = align.includes('xMid') ? extraX / 2 : align.includes('xMax') ? extraX : 0;
    ty = align.includes('YMid') ? extraY / 2 : align.includes('YMax') ? extraY : 0;
  }
  return [sx, 0, 0, sy, tx - vb.x * sx, ty - vb.y * sy];
}

// ---------------------------------------------------------------------------
// Tintas (fill/stroke)

function paintWithOpacity(paint: Paint, opacity: number): Paint {
  return opacity >= 1 ? paint : { ...paint, opacity: roundTo(clamp01(opacity)) };
}

function resolvePaints(
  raw: string | undefined,
  opacity: number,
  box: PaintBox,
  ctx: Ctx,
): readonly Paint[] {
  const value = raw?.trim();
  if (!value || value === 'none') return [];

  const ref = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/.exec(value);
  if (ref) {
    const id = ref[1] ?? '';
    const fallback = (ref[2] ?? '').trim();
    const target = ctx.byId.get(id);
    let paints: readonly Paint[] | null = null;
    if (
      target?.localName === 'linearGradient' ||
      target?.localName === 'radialGradient'
    ) {
      paints = gradientPaint(target, box, ctx);
    } else if (target?.localName === 'pattern') {
      paints = patternPaint(target, id, ctx);
    } else {
      ctx.warnings.add(`tinta não encontrada: #${id}`);
    }
    if (paints) return paints.map((p) => paintWithOpacity(p, opacity));
    const color = fallback ? parseColor(fallback) : null;
    return color
      ? [paintWithOpacity({ type: 'solid', color: formatColor(color) }, opacity)]
      : [];
  }

  const color = parseColor(value);
  if (!color) {
    ctx.warnings.add(`cor não suportada: ${value}`);
    return [];
  }
  return [paintWithOpacity({ type: 'solid', color: formatColor(color) }, opacity)];
}

function gradientChain(start: Element, ctx: Ctx): Element[] {
  const chain: Element[] = [];
  let current: Element | undefined = start;
  while (
    current &&
    chain.length < 10 &&
    !chain.includes(current) &&
    (current.localName === 'linearGradient' || current.localName === 'radialGradient')
  ) {
    chain.push(current);
    const href = hrefOf(current);
    current = href?.startsWith('#') ? ctx.byId.get(href.slice(1)) : undefined;
  }
  return chain;
}

function chainAttr(chain: readonly Element[], name: string): string | null {
  for (const el of chain) {
    const value = el.getAttribute(name);
    if (value !== null) return value;
  }
  return null;
}

function stopsOf(chain: readonly Element[]): GradientStop[] {
  const holder = chain.find((el) =>
    Array.from(el.children).some((c) => c.localName === 'stop'),
  );
  if (!holder) return [];
  const stops: GradientStop[] = [];
  let last = 0;
  for (const stop of Array.from(holder.children)) {
    if (stop.localName !== 'stop') continue;
    const props = propsOf(stop);
    const offset = Math.max(last, clamp01(fraction(props.offset, 0)));
    last = offset;
    const color = parseColor(props['stop-color']) ?? { r: 0, g: 0, b: 0, a: 1 };
    const stopOpacity = clamp01(fraction(props['stop-opacity'], 1));
    stops.push({ offset: roundTo(offset), color: formatColor(color, stopOpacity) });
  }
  return stops;
}

function gradientPaint(grad: Element, box: PaintBox, ctx: Ctx): readonly Paint[] | null {
  const chain = gradientChain(grad, ctx);
  const stops = stopsOf(chain);
  const id = grad.getAttribute('id') ?? '';
  if (stops.length === 0) {
    ctx.warnings.add(`gradiente sem paradas: #${id}`);
    return null;
  }
  if (stops.length === 1) {
    return [{ type: 'solid', color: stops[0]?.color ?? '#000000' }];
  }

  const bbox = chainAttr(chain, 'gradientUnits') !== 'userSpaceOnUse';
  const gradientTransform = parseTransform(chainAttr(chain, 'gradientTransform'));
  // Espaço da unidade → espaço do usuário → espaço local do nó.
  const toLocal: Matrix = multiply(
    translate(-box.ox, -box.oy),
    bbox
      ? multiply(
          multiply(translate(box.bx, box.by), [box.w, 0, 0, box.h, 0, 0] as Matrix),
          gradientTransform,
        )
      : gradientTransform,
  );

  // Coordenada na "unidade" do gradiente: fração no bbox, ou px no espaço do usuário.
  const coord = (name: string, fallback: number, size: number): number => {
    const raw = chainAttr(chain, name);
    if (raw === null) return bbox ? fallback : fallback * size;
    if (raw.trim().endsWith('%')) {
      const f = Number.parseFloat(raw) / 100;
      return bbox ? f : f * size;
    }
    return length(raw, bbox ? fallback : fallback * size, ctx);
  };

  if (grad.localName === 'linearGradient') {
    const start = apply(toLocal, { x: coord('x1', 0, box.w), y: coord('y1', 0, box.h) });
    const end = apply(toLocal, { x: coord('x2', 1, box.w), y: coord('y2', 0, box.h) });
    return [{ type: 'linear', start, end, stops }];
  }

  const center = apply(toLocal, {
    x: coord('cx', 0.5, box.w),
    y: coord('cy', 0.5, box.h),
  });
  const r = coord('r', 0.5, Math.min(box.w, box.h));
  const sx = Math.hypot(toLocal[0], toLocal[1]);
  const sy = Math.hypot(toLocal[2], toLocal[3]);
  if (sy > 0 && Math.abs(sx / sy - 1) > 0.05) {
    ctx.warnings.add('gradiente radial elíptico aproximado por círculo');
  }
  return [{ type: 'radial', center, radius: roundTo(r * Math.sqrt(sx * sy)), stops }];
}

function patternPaint(pattern: Element, id: string, ctx: Ctx): readonly Paint[] | null {
  let href: string | null = null;
  let found = false;
  let transformed = !isIdentity(parseTransform(pattern.getAttribute('patternTransform')));
  for (const child of Array.from(pattern.children)) {
    if (child.localName === 'image') {
      found = true;
      href = hrefOf(child);
      transformed ||= !isIdentity(parseTransform(child.getAttribute('transform')));
    } else if (child.localName === 'use') {
      const refId = hrefOf(child)?.replace(/^#/, '');
      const target = refId ? ctx.byId.get(refId) : undefined;
      if (target?.localName !== 'image') continue;
      found = true;
      href = hrefOf(target);
      transformed ||=
        !isIdentity(parseTransform(child.getAttribute('transform'))) ||
        !isIdentity(parseTransform(target.getAttribute('transform')));
    }
    if (found) break;
  }
  if (!found) {
    ctx.warnings.add(`padrão sem imagem não suportado: #${id}`);
    return null;
  }
  if (transformed) ctx.warnings.add(`transformação do padrão de imagem ignorada: #${id}`);
  return [imagePaint(href, ctx)];
}

function imagePaint(href: string | null, ctx: Ctx): Paint {
  if (href && /^data:/i.test(href)) return { type: 'image', src: href };
  const shown = href ? (href.length > 60 ? `${href.slice(0, 60)}…` : href) : '(vazio)';
  ctx.warnings.add(`imagem externa ignorada (sem rede): ${shown}`);
  return { type: 'image' };
}

function parseOpacity(raw: string | undefined): number {
  return clamp01(fraction(raw, 1));
}

function strokeOf(merged: Props, box: PaintBox, ctx: Ctx): Stroke | undefined {
  const width = length(merged['stroke-width'], 1, ctx);
  if (width <= 0) return undefined;
  const paints = resolvePaints(
    merged.stroke,
    parseOpacity(merged['stroke-opacity']),
    box,
    ctx,
  );
  if (paints.length === 0) return undefined;

  const cap = merged['stroke-linecap'];
  const join = merged['stroke-linejoin'];
  const dashRaw = merged['stroke-dasharray'];
  const dash = dashRaw && dashRaw !== 'none' ? numbersIn(dashRaw) : [];
  return {
    paints,
    width,
    align: 'center',
    ...(dash.length > 0 && dash.some((n) => n > 0) ? { dash } : {}),
    ...(cap === 'butt' || cap === 'round' || cap === 'square' ? { cap } : {}),
    ...(join === 'round' || join === 'bevel'
      ? { join }
      : join === 'miter' || join === 'miter-clip' || join === 'arcs'
        ? { join: 'miter' as const }
        : {}),
  };
}

/** Preenchimento (SVG: preto por padrão) e traço (padrão: nenhum) do elemento. */
function paintsOf(
  merged: Props,
  box: PaintBox,
  ctx: Ctx,
  filled = true,
): { fills: readonly Paint[]; stroke?: Stroke } {
  const fills = filled
    ? resolvePaints(
        merged.fill ?? '#000000',
        parseOpacity(merged['fill-opacity']),
        box,
        ctx,
      )
    : [];
  const stroke = strokeOf(merged, box, ctx);
  return stroke ? { fills, stroke } : { fills };
}

// ---------------------------------------------------------------------------
// Filtros (sombras)

function floodColor(el: Element): string {
  const props = propsOf(el);
  const color = parseColor(props['flood-color']) ?? { r: 0, g: 0, b: 0, a: 1 };
  const opacity = clamp01(fraction(props['flood-opacity'], 1));
  return formatRgba(color.r, color.g, color.b, color.a * opacity);
}

/** Reconhece `feDropShadow` e a sequência de sombra do Figma (offset + blur + matriz de cor). */
function shadowsOf(filter: Element, ctx: Ctx): Shadow[] {
  const shadows: Shadow[] = [];
  let dx = 0;
  let dy = 0;
  let std = 0;
  let spread = 0;
  let haveOffset = false;
  let inner = false;
  const reset = (): void => {
    dx = 0;
    dy = 0;
    std = 0;
    spread = 0;
    haveOffset = false;
    inner = false;
  };

  for (const prim of Array.from(filter.children)) {
    switch (prim.localName) {
      case 'feDropShadow':
        shadows.push({
          color: floodColor(prim),
          offset: {
            x: length(prim.getAttribute('dx'), 2, ctx),
            y: length(prim.getAttribute('dy'), 2, ctx),
          },
          blur: roundTo(firstLength(prim.getAttribute('stdDeviation'), 2, ctx) * 2),
        });
        break;
      case 'feOffset':
        dx = length(prim.getAttribute('dx'), 0, ctx);
        dy = length(prim.getAttribute('dy'), 0, ctx);
        haveOffset = true;
        break;
      case 'feGaussianBlur':
        std = firstLength(prim.getAttribute('stdDeviation'), 0, ctx);
        break;
      case 'feMorphology': {
        const radius = firstLength(prim.getAttribute('radius'), 0, ctx);
        spread = prim.getAttribute('operator') === 'erode' ? -radius : radius;
        break;
      }
      case 'feComposite':
        if (haveOffset && prim.getAttribute('operator') === 'arithmetic') inner = true;
        break;
      case 'feColorMatrix': {
        const values = numbersIn(prim.getAttribute('values'));
        if (!haveOffset || values.length !== 20) break;
        shadows.push({
          color: formatRgba(
            (values[4] ?? 0) * 255,
            (values[9] ?? 0) * 255,
            (values[14] ?? 0) * 255,
            values[18] ?? 1,
          ),
          offset: { x: dx, y: dy },
          blur: roundTo(std * 2),
          ...(spread !== 0 ? { spread } : {}),
          ...(inner ? { inner: true } : {}),
        });
        reset();
        break;
      }
      default:
        break;
    }
  }
  return shadows;
}

// ---------------------------------------------------------------------------
// Acabamento comum a todos os nós

function finish<T extends SceneNode>(
  node: T,
  el: Element,
  props: Props,
  merged: Props,
  ctx: Ctx,
): T {
  const display = props.display?.trim();
  const visibility = merged.visibility?.trim();
  const visible =
    display !== 'none' && visibility !== 'hidden' && visibility !== 'collapse';

  const effects: Shadow[] = [];
  const filter = props.filter?.trim();
  if (filter && filter !== 'none') {
    const id = urlRef(filter);
    const target = id ? ctx.byId.get(id) : undefined;
    const shadows = target?.localName === 'filter' ? shadowsOf(target, ctx) : [];
    if (shadows.length > 0) effects.push(...shadows);
    else ctx.warnings.add(`filtro não suportado: ${id ? `#${id}` : filter}`);
  }

  const mask = props.mask?.trim();
  if (mask && mask !== 'none') {
    const id = urlRef(mask);
    ctx.warnings.add(`máscara não suportada: ${id ? `#${id}` : mask}`);
  }

  const clip = props['clip-path']?.trim();
  if (clip && clip !== 'none' && el.localName !== 'g') {
    ctx.warnings.add(`clip-path ignorado em <${el.localName}>`);
  }

  return {
    ...node,
    visible: node.visible && visible,
    opacity: node.opacity * parseOpacity(props.opacity),
    effects: [...node.effects, ...effects],
  };
}

// ---------------------------------------------------------------------------
// Conversão de elementos

function convertChildren(el: Element, ctx: Ctx, merged: Props): SceneNode[] {
  const nodes: SceneNode[] = [];
  for (const child of Array.from(el.children)) {
    const node = convertElement(child, ctx, merged);
    if (node) nodes.push(node);
  }
  return nodes;
}

/** Extensão (a partir da origem do nó) ocupada pelos filhos, de forma aproximada. */
function extentOf(children: readonly SceneNode[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const child of children) {
    const corners: Point[] = [
      { x: 0, y: 0 },
      { x: child.width, y: 0 },
      { x: 0, y: child.height },
      { x: child.width, y: child.height },
    ];
    for (const corner of corners) {
      const p = apply(child.transform, corner);
      width = Math.max(width, p.x);
      height = Math.max(height, p.y);
    }
  }
  return { width: roundTo(width), height: roundTo(height) };
}

function convertRoot(el: Element, ctx: Ctx): SceneNode {
  const props = propsOf(el);
  const merged = mergeInherited({}, props);
  const vb = parseViewBox(el.getAttribute('viewBox'));
  const sized = (name: string, fallback: number | undefined): number | undefined => {
    const raw = el.getAttribute(name);
    if (raw === null || raw.trim().endsWith('%')) return fallback;
    return length(raw, fallback ?? 0, ctx);
  };
  const width = sized('width', vb?.w) ?? 0;
  const height = sized('height', vb?.h) ?? 0;

  const explicit = el.getAttribute('id');
  const id = allocId(el, ctx);
  const matrix = viewBoxMatrix(vb, width, height, el.getAttribute('preserveAspectRatio'));
  const children = convertChildren(el, ctx, merged).map((c) => premultiply(matrix, c));

  const frame: SceneNode = {
    ...baseNode({ id, name: explicit ?? 'svg', width, height }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  };
  return finish(frame, el, props, merged, ctx);
}

function convertElement(el: Element, ctx: Ctx, inherited: Props): SceneNode | null {
  const tag = el.localName;
  const foreign = el.namespaceURI !== null && el.namespaceURI !== SVG_NS;
  if (!foreign && SKIPPED.has(tag)) {
    if (tag === 'style') {
      const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (css.includes('{')) ctx.warnings.add('regras de <style> ignoradas');
    }
    return null;
  }

  const props = propsOf(el);
  const merged = mergeInherited(inherited, props);
  const elementTransform = parseTransform(props.transform);

  if (foreign) {
    return convertUnknown(el, el.tagName, ctx, props, merged, elementTransform);
  }
  if (tag === 'use') return convertUse(el, ctx, props, merged, elementTransform);

  const ident = identOf(el, tag, ctx);
  switch (tag) {
    case 'rect':
      return convertRect(el, ctx, ident, props, merged, elementTransform);
    case 'circle':
    case 'ellipse':
      return convertEllipse(el, ctx, ident, props, merged, elementTransform);
    case 'path':
      return convertPath(el, ctx, ident, props, merged, elementTransform);
    case 'line':
    case 'polyline':
    case 'polygon':
      return convertLine(el, ctx, ident, props, merged, elementTransform);
    case 'text':
      return convertText(el, ctx, ident, props, merged, elementTransform);
    case 'image':
      return convertImage(el, ctx, ident, props, merged, elementTransform);
    case 'g':
    case 'a':
      return convertGroup(el, ctx, ident, props, merged, elementTransform);
    case 'svg':
      return convertNestedSvg(el, ctx, ident, props, merged, elementTransform);
    default:
      return convertUnknown(el, tag, ctx, props, merged, elementTransform, ident);
  }
}

function convertUnknown(
  el: Element,
  sourceType: string,
  ctx: Ctx,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
  ident: Ident = identOf(el, sourceType, ctx),
): SceneNode {
  ctx.warnings.add(`elemento não suportado: <${sourceType}>`);
  const x = length(el.getAttribute('x'), 0, ctx);
  const y = length(el.getAttribute('y'), 0, ctx);
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(x, y)),
      width: length(el.getAttribute('width'), 0, ctx),
      height: length(el.getAttribute('height'), 0, ctx),
    }),
    type: 'unknown',
    sourceType,
  };
  return finish(node, el, props, merged, ctx);
}

function convertUse(
  el: Element,
  ctx: Ctx,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const ref = hrefOf(el)?.trim();
  const refId = ref?.startsWith('#') ? ref.slice(1) : null;
  const target = refId ? ctx.byId.get(refId) : undefined;
  if (!refId || !target || ctx.useStack.includes(refId)) {
    ctx.warnings.add(
      refId
        ? `<use> referencia elemento inexistente ou cíclico: #${refId}`
        : '<use> sem referência',
    );
    return convertUnknown(el, 'use', ctx, props, merged, elementTransform);
  }

  ctx.useStack.push(refId);
  const inner = convertElement(target, ctx, merged);
  ctx.useStack.pop();
  if (!inner) return convertUnknown(el, 'use', ctx, props, merged, elementTransform);

  const x = length(el.getAttribute('x'), 0, ctx);
  const y = length(el.getAttribute('y'), 0, ctx);
  const explicit = el.getAttribute('id');
  const node: SceneNode = {
    ...inner,
    id: explicit ?? allocId(el, ctx),
    name: explicit ?? inner.name,
    transform: multiply(multiply(elementTransform, translate(x, y)), inner.transform),
  };
  return finish(node, el, props, merged, ctx);
}

function convertRect(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const x = length(el.getAttribute('x'), 0, ctx);
  const y = length(el.getAttribute('y'), 0, ctx);
  const width = length(el.getAttribute('width'), 0, ctx);
  const height = length(el.getAttribute('height'), 0, ctx);
  const rx = el.getAttribute('rx');
  const ry = el.getAttribute('ry');
  const radius = length(rx ?? ry, 0, ctx);
  const cornerRadius: CornerRadius = radius;
  const box: PaintBox = { ox: x, oy: y, bx: x, by: y, w: width, h: height };
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(x, y)),
      width,
      height,
      ...paintsOf(merged, box, ctx),
    }),
    type: 'rect',
    cornerRadius,
  };
  return finish(node, el, props, merged, ctx);
}

function convertEllipse(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const cx = length(el.getAttribute('cx'), 0, ctx);
  const cy = length(el.getAttribute('cy'), 0, ctx);
  let rx: number;
  let ry: number;
  if (el.localName === 'circle') {
    rx = length(el.getAttribute('r'), 0, ctx);
    ry = rx;
  } else {
    const rxRaw = el.getAttribute('rx');
    const ryRaw = el.getAttribute('ry');
    rx = length(rxRaw ?? ryRaw, 0, ctx);
    ry = length(ryRaw ?? rxRaw, 0, ctx);
  }
  const box: PaintBox = {
    ox: cx - rx,
    oy: cy - ry,
    bx: cx - rx,
    by: cy - ry,
    w: 2 * rx,
    h: 2 * ry,
  };
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(cx - rx, cy - ry)),
      width: 2 * rx,
      height: 2 * ry,
      ...paintsOf(merged, box, ctx),
    }),
    type: 'ellipse',
  };
  return finish(node, el, props, merged, ctx);
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Caixa aproximada das coordenadas de `d` (pontos de controle incluídos; arcos só pelo destino). */
function pathBounds(d: string): Bounds | null {
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const match of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const command = match[1] ?? '';
    const n = numbersIn(match[2]);
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === 'Z') {
      cx = startX;
      cy = startY;
    } else if (upper === 'H') {
      for (const v of n) {
        cx = (relative ? cx : 0) + v;
        add(cx, cy);
      }
    } else if (upper === 'V') {
      for (const v of n) {
        cy = (relative ? cy : 0) + v;
        add(cx, cy);
      }
    } else {
      const step = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7 }[upper];
      if (!step) continue;
      for (let i = 0; i + step <= n.length; i += step) {
        const baseX = relative ? cx : 0;
        const baseY = relative ? cy : 0;
        // Pares de coordenadas do segmento (arcos: só o destino, nos dois últimos números).
        const pairs: [number, number][] = [];
        if (upper === 'A') pairs.push([n[i + 5] ?? 0, n[i + 6] ?? 0]);
        else
          for (let k = 0; k < step; k += 2)
            pairs.push([n[i + k] ?? 0, n[i + k + 1] ?? 0]);
        for (const [px, py] of pairs) add(baseX + px, baseY + py);
        const [endX, endY] = pairs[pairs.length - 1] ?? [0, 0];
        cx = baseX + endX;
        cy = baseY + endY;
        if (upper === 'M' && i === 0) {
          startX = cx;
          startY = cy;
        }
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function convertPath(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const d = el.getAttribute('d') ?? '';
  const bounds = pathBounds(d);
  const width = bounds ? roundTo(bounds.maxX - bounds.minX) : 0;
  const height = bounds ? roundTo(bounds.maxY - bounds.minY) : 0;
  const box: PaintBox = {
    ox: 0,
    oy: 0,
    bx: bounds?.minX ?? 0,
    by: bounds?.minY ?? 0,
    w: width,
    h: height,
  };
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: elementTransform,
      width,
      height,
      ...paintsOf(merged, box, ctx),
    }),
    type: 'path',
    d,
    fillRule: merged['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
  };
  return finish(node, el, props, merged, ctx);
}

function convertLine(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  let absolute: Point[];
  if (el.localName === 'line') {
    absolute = [
      {
        x: length(el.getAttribute('x1'), 0, ctx),
        y: length(el.getAttribute('y1'), 0, ctx),
      },
      {
        x: length(el.getAttribute('x2'), 0, ctx),
        y: length(el.getAttribute('y2'), 0, ctx),
      },
    ];
  } else {
    const n = numbersIn(el.getAttribute('points'));
    absolute = [];
    for (let i = 0; i + 1 < n.length; i += 2)
      absolute.push({ x: n[i] ?? 0, y: n[i + 1] ?? 0 });
  }
  const minX = Math.min(...absolute.map((p) => p.x));
  const minY = Math.min(...absolute.map((p) => p.y));
  const ox = Number.isFinite(minX) ? minX : 0;
  const oy = Number.isFinite(minY) ? minY : 0;
  const points = absolute.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const width = Math.max(0, ...points.map((p) => p.x));
  const height = Math.max(0, ...points.map((p) => p.y));
  const box: PaintBox = { ox, oy, bx: ox, by: oy, w: width, h: height };
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(ox, oy)),
      width,
      height,
      // `<line>` não tem área para preencher.
      ...paintsOf(merged, box, ctx, el.localName !== 'line'),
    }),
    type: 'line',
    points,
    closed: el.localName === 'polygon',
  };
  return finish(node, el, props, merged, ctx);
}

function convertImage(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const x = length(el.getAttribute('x'), 0, ctx);
  const y = length(el.getAttribute('y'), 0, ctx);
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(x, y)),
      width: length(el.getAttribute('width'), 0, ctx),
      height: length(el.getAttribute('height'), 0, ctx),
      fills: [imagePaint(hrefOf(el), ctx)],
    }),
    type: 'rect',
    cornerRadius: 0,
  };
  return finish(node, el, props, merged, ctx);
}

// --- Texto

interface TextRuns {
  lines: string[];
  lineYs: (number | undefined)[];
  /** x/y do primeiro `<tspan>` (sobrescrevem os do `<text>`). */
  firstX?: number;
  firstY?: number;
  seenTspan: boolean;
}

function collectText(node: Node, runs: TextRuns, ctx: Ctx): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 || child.nodeType === 4) {
      runs.lines[runs.lines.length - 1] += child.textContent ?? '';
    } else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.localName === 'tspan') {
        const yRaw = el.getAttribute('y');
        const xRaw = el.getAttribute('x');
        const y = yRaw === null ? undefined : firstLength(yRaw, 0, ctx);
        if (!runs.seenTspan) {
          runs.seenTspan = true;
          if (xRaw !== null) runs.firstX = firstLength(xRaw, 0, ctx);
          if (y !== undefined) runs.firstY = y;
          runs.lineYs[0] ??= y;
        } else if (y !== undefined && y !== runs.lineYs[runs.lineYs.length - 1]) {
          runs.lines.push('');
          runs.lineYs.push(y);
        }
      }
      collectText(el, runs, ctx);
    }
  }
}

function fontWeightOf(raw: string | undefined): number {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'normal') return 400;
  if (value === 'bold' || value === 'bolder') return 700;
  if (value === 'lighter') return 300;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.min(900, Math.max(100, Math.round(n))) : 400;
}

function convertText(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const fontSize = length(merged['font-size'], 16, ctx);
  const runs: TextRuns = { lines: [''], lineYs: [undefined], seenTspan: false };
  collectText(el, runs, ctx);
  const lines = runs.lines.map((line) => line.replace(/\s+/g, ' ').trim());
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const text = lines.join('\n');

  const x =
    (runs.firstX ?? firstLength(el.getAttribute('x'), 0, ctx)) +
    firstLength(el.getAttribute('dx'), 0, ctx);
  const y =
    (runs.firstY ?? firstLength(el.getAttribute('y'), 0, ctx)) +
    firstLength(el.getAttribute('dy'), 0, ctx);

  const ys = runs.lineYs;
  const lineHeight =
    lines.length > 1 && ys[0] !== undefined && ys[1] !== undefined && ys[1] !== ys[0]
      ? Math.abs(ys[1] - ys[0])
      : undefined;
  const height =
    lineHeight !== undefined ? lineHeight * lines.length : fontSize * 1.2 * lines.length;
  const textLength = el.getAttribute('textLength');
  const width = textLength === null ? 0 : length(textLength, 0, ctx);

  const family = (merged['font-family'] ?? 'sans-serif').split(',')[0] ?? '';
  const anchor = merged['text-anchor'];
  const decoration = merged['text-decoration'] ?? '';
  const spacingRaw = merged['letter-spacing'];
  const spacing =
    spacingRaw && spacingRaw !== 'normal' ? length(spacingRaw, 0, ctx) : undefined;
  const style: TextStyle = {
    fontFamily: family.replace(/["']/g, '').trim() || 'sans-serif',
    fontSize,
    fontWeight: fontWeightOf(merged['font-weight']),
    italic: /^(italic|oblique)/.test(merged['font-style'] ?? ''),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(spacing !== undefined ? { letterSpacing: spacing } : {}),
    align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
    verticalAlign: 'top',
    ...(decoration.includes('underline')
      ? { decoration: 'underline' as const }
      : decoration.includes('line-through')
        ? { decoration: 'line-through' as const }
        : {}),
  };

  const top = y - fontSize;
  const box: PaintBox = { ox: x, oy: top, bx: x, by: top, w: width, h: height };
  const node: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(x, top)),
      width,
      height,
      ...paintsOf(merged, box, ctx),
    }),
    type: 'text',
    text,
    style,
  };
  return finish(node, el, props, merged, ctx);
}

// --- Grupos

interface ClipRect {
  readonly tx: number;
  readonly ty: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** `clip-path` cujo `<clipPath>` tem um único `<rect>` só transladado; senão `null` (com aviso). */
function resolveClip(raw: string, ctx: Ctx): ClipRect | null {
  const id = urlRef(raw);
  const clipPath = id ? ctx.byId.get(id) : undefined;
  if (!id || clipPath?.localName !== 'clipPath') {
    ctx.warnings.add(`clip-path não suportado: ${id ? `#${id}` : raw}`);
    return null;
  }
  const shapes = Array.from(clipPath.children).filter(
    (c) => c.localName !== 'title' && c.localName !== 'desc',
  );
  const rect = shapes.length === 1 ? shapes[0] : undefined;
  if (rect?.localName !== 'rect') {
    ctx.warnings.add(`clip-path não suportado: #${id}`);
    return null;
  }
  const x = length(rect.getAttribute('x'), 0, ctx);
  const y = length(rect.getAttribute('y'), 0, ctx);
  const m = multiply(parseTransform(propsOf(rect).transform), translate(x, y));
  if (
    Math.abs(m[0] - 1) > 1e-9 ||
    Math.abs(m[3] - 1) > 1e-9 ||
    m[1] !== 0 ||
    m[2] !== 0
  ) {
    ctx.warnings.add(`clip-path com transformação não suportado: #${id}`);
    return null;
  }
  return {
    tx: m[4],
    ty: m[5],
    width: length(rect.getAttribute('width'), 0, ctx),
    height: length(rect.getAttribute('height'), 0, ctx),
    radius: length(rect.getAttribute('rx') ?? rect.getAttribute('ry'), 0, ctx),
  };
}

function convertGroup(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const clipRaw = props['clip-path']?.trim();
  const clip = clipRaw && clipRaw !== 'none' ? resolveClip(clipRaw, ctx) : null;
  const children = convertChildren(el, ctx, merged);

  if (clip) {
    const frame: SceneNode = {
      ...baseNode({
        ...ident,
        transform: multiply(elementTransform, translate(clip.tx, clip.ty)),
        width: clip.width,
        height: clip.height,
      }),
      type: 'frame',
      clip: true,
      cornerRadius: clip.radius,
      children: children.map((c) => premultiply(translate(-clip.tx, -clip.ty), c)),
    };
    return finish(frame, el, props, merged, ctx);
  }

  const group: SceneNode = {
    ...baseNode({ ...ident, transform: elementTransform, ...extentOf(children) }),
    type: 'group',
    children,
  };
  return finish(group, el, props, merged, ctx);
}

function convertNestedSvg(
  el: Element,
  ctx: Ctx,
  ident: Ident,
  props: Props,
  merged: Props,
  elementTransform: Matrix,
): SceneNode {
  const x = length(el.getAttribute('x'), 0, ctx);
  const y = length(el.getAttribute('y'), 0, ctx);
  const vb = parseViewBox(el.getAttribute('viewBox'));
  const widthRaw = el.getAttribute('width');
  const heightRaw = el.getAttribute('height');
  const width =
    widthRaw === null || widthRaw.endsWith('%') ? (vb?.w ?? 0) : length(widthRaw, 0, ctx);
  const height =
    heightRaw === null || heightRaw.endsWith('%')
      ? (vb?.h ?? 0)
      : length(heightRaw, 0, ctx);
  const matrix = viewBoxMatrix(vb, width, height, el.getAttribute('preserveAspectRatio'));
  const children = convertChildren(el, ctx, merged).map((c) => premultiply(matrix, c));
  const group: SceneNode = {
    ...baseNode({
      ...ident,
      transform: multiply(elementTransform, translate(x, y)),
      ...extentOf(children),
    }),
    type: 'group',
    children,
  };
  return finish(group, el, props, merged, ctx);
}
