import type { TextMeasurer } from '../../src/model/components/instantiate';
import {
  multiply,
  type CornerRadius,
  type Matrix,
  type Paint,
  type Point,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import type { PixelRect, Raster } from './raster';

// Desenho simplificado de uma cena de componente, em pixels, para `get_marking_image` numa tela
// em branco. O servidor não tem fontes nem canvas: formas viram polígonos preenchidos por
// varredura com cobertura (suavizada), o gradiente vira a cor do primeiro stop, a imagem vira
// um reservado cinza e o texto vira barras (uma por linha, na cor do texto). Sombras e
// tracejado são ignorados e o alinhamento do traço é sempre ao centro. Puro: sem disco.

/** Janela de desenho: escala da imagem para o raster e a região (em pixels do raster) a pintar. */
export interface SceneView {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly clip: PixelRect;
}

type Rgb = readonly [number, number, number];

interface Color {
  readonly rgb: Rgb;
  readonly alpha: number;
}

type Polygon = readonly Point[];

interface Subpath {
  readonly points: Point[];
  readonly closed: boolean;
}

/** Cor do reservado de imagem (sem os dados do arquivo no servidor). */
const IMAGE_PLACEHOLDER: Color = { rgb: [158, 158, 158], alpha: 0.5 };
/** Subamostras verticais por pixel na cobertura. */
const SUBSAMPLES = 4;
const CURVE_STEPS = 16;
const CORNER_STEPS = 10;
const ELLIPSE_STEPS = 64;
const CIRCLE_STEPS = 12;
/** Altura da barra de texto em relação à altura da linha. */
const BAR_RATIO = 0.6;
const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNC = /^rgba?\(\s*([^)]*)\)$/i;

// ---------------------------------------------------------------------------
// Cores

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` e `rgba()`; qualquer outra coisa vira `null`. */
export function parseColor(text: string): Color | null {
  const value = text.trim();
  if (value === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  const hex = HEX.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((d) => d + d).join('');
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], alpha: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const func = FUNC.exec(value);
  if (func) {
    const parts = func[1]!.split(/[\s,/]+/).filter((part) => part !== '');
    const channel = (part: string | undefined) => {
      if (part === undefined) return Number.NaN;
      return part.endsWith('%') ? (Number.parseFloat(part) * 255) / 100 : Number(part);
    };
    const [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])];
    if ([r, g, b].some((c) => Number.isNaN(c))) return null;
    const a = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
    const alpha = parts[3]?.endsWith('%') ? a / 100 : a;
    return {
      rgb: [clamp255(r!), clamp255(g!), clamp255(b!)],
      alpha: Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha)),
    };
  }
  return null;
}

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** A cor sólida em que o preenchimento vira (gradiente: o primeiro stop; imagem: reservado). */
function paintColor(paint: Paint): Color | null {
  let base: Color | null;
  switch (paint.type) {
    case 'solid':
      base = parseColor(paint.color);
      break;
    case 'linear':
    case 'radial':
      base = paint.stops[0] ? parseColor(paint.stops[0].color) : null;
      break;
    case 'image':
      base = IMAGE_PLACEHOLDER;
      break;
  }
  if (base === null) return null;
  return { rgb: base.rgb, alpha: base.alpha * (paint.opacity ?? 1) };
}

// ---------------------------------------------------------------------------
// Geometria

function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function signedArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Orientação positiva, para os pedaços de um traço somarem no preenchimento não-zero. */
function oriented(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

function radii(cornerRadius: CornerRadius, width: number, height: number): number[] {
  const list =
    typeof cornerRadius === 'number'
      ? [cornerRadius, cornerRadius, cornerRadius, cornerRadius]
      : [...cornerRadius];
  const limit = Math.max(0, Math.min(width, height) / 2);
  return list.map((r) => Math.min(Math.max(0, r), limit));
}

/** Retângulo (com cantos arredondados) como polígono no espaço local. */
function roundedRect(width: number, height: number, cornerRadius: CornerRadius): Point[] {
  const [tl, tr, br, bl] = radii(cornerRadius, width, height) as [
    number,
    number,
    number,
    number,
  ];
  if (tl + tr + br + bl === 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
  }
  const points: Point[] = [];
  const corner = (cx: number, cy: number, r: number, from: number) => {
    if (r === 0) {
      points.push({ x: cx, y: cy });
      return;
    }
    for (let i = 0; i <= CORNER_STEPS; i++) {
      const angle = from + (Math.PI / 2) * (i / CORNER_STEPS);
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  };
  corner(tl, tl, tl, Math.PI);
  corner(width - tr, tr, tr, Math.PI * 1.5);
  corner(width - br, height - br, br, 0);
  corner(bl, height - bl, bl, Math.PI / 2);
  return points;
}

function ellipse(width: number, height: number): Point[] {
  const rx = width / 2;
  const ry = height / 2;
  return Array.from({ length: ELLIPSE_STEPS }, (_, i) => {
    const angle = (Math.PI * 2 * i) / ELLIPSE_STEPS;
    return { x: rx + rx * Math.cos(angle), y: ry + ry * Math.sin(angle) };
  });
}

// ---------------------------------------------------------------------------
// Caminhos SVG

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  let i = 0;
  while (i < d.length) {
    const ch = d[i]!;
    if (/[A-Za-z]/.test(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const found = NUMBER.exec(d);
    if (found) {
      tokens.push(Number(found[0]));
      i = NUMBER.lastIndex;
    } else {
      i++;
    }
  }
  return tokens;
}

const ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * Acha o `d` SVG em subcaminhos de pontos: curvas em segmentos e arcos como linha reta até o
 * ponto final. Comando inválido ou truncado encerra a leitura com o que já foi lido.
 */
export function flattenPath(d: string): Subpath[] {
  const tokens = tokenize(d);
  const subpaths: Subpath[] = [];
  let current: Point[] = [];
  let closed = false;
  let pos: Point = { x: 0, y: 0 };
  let start: Point = pos;
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;

  const flush = () => {
    if (current.length > 1 || (current.length === 1 && closed)) {
      subpaths.push({ points: current, closed });
    }
    current = [];
    closed = false;
  };
  const lineTo = (p: Point) => {
    if (current.length === 0) current.push(pos);
    current.push(p);
    pos = p;
  };

  let i = 0;
  let command = '';
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (typeof token === 'string') {
      command = token;
      i++;
      if (!(command.toUpperCase() in ARITY)) break;
      if (command === 'Z' || command === 'z') {
        if (current.length > 0) {
          closed = true;
          pos = start;
          flush();
        }
        lastCubic = null;
        lastQuad = null;
        continue;
      }
    } else if (command === '') {
      break;
    }
    const upper = command.toUpperCase();
    const arity = ARITY[upper]!;
    const args = tokens.slice(i, i + arity);
    if (args.length < arity || args.some((a) => typeof a !== 'number')) break;
    i += arity;
    const n = args as number[];
    const relative = command !== upper;
    const ox = relative ? pos.x : 0;
    const oy = relative ? pos.y : 0;
    let cubic: Point | null = null;
    let quad: Point | null = null;
    switch (upper) {
      case 'M': {
        flush();
        pos = { x: ox + n[0]!, y: oy + n[1]! };
        start = pos;
        current = [pos];
        // Pares seguintes de um M são L.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        lineTo({ x: ox + n[0]!, y: oy + n[1]! });
        break;
      case 'H':
        lineTo({ x: relative ? pos.x + n[0]! : n[0]!, y: pos.y });
        break;
      case 'V':
        lineTo({ x: pos.x, y: relative ? pos.y + n[0]! : n[0]! });
        break;
      case 'C': {
        const c1 = { x: ox + n[0]!, y: oy + n[1]! };
        const c2 = { x: ox + n[2]!, y: oy + n[3]! };
        const end = { x: ox + n[4]!, y: oy + n[5]! };
        cubicTo(lineTo, pos, c1, c2, end);
        cubic = c2;
        break;
      }
      case 'S': {
        const c1: Point = lastCubic
          ? { x: 2 * pos.x - lastCubic.x, y: 2 * pos.y - lastCubic.y }
          : pos;
        const c2 = { x: ox + n[0]!, y: oy + n[1]! };
        const end = { x: ox + n[2]!, y: oy + n[3]! };
        cubicTo(lineTo, pos, c1, c2, end);
        cubic = c2;
        break;
      }
      case 'Q': {
        const c = { x: ox + n[0]!, y: oy + n[1]! };
        const end = { x: ox + n[2]!, y: oy + n[3]! };
        quadTo(lineTo, pos, c, end);
        quad = c;
        break;
      }
      case 'T': {
        const c: Point = lastQuad
          ? { x: 2 * pos.x - lastQuad.x, y: 2 * pos.y - lastQuad.y }
          : pos;
        const end = { x: ox + n[0]!, y: oy + n[1]! };
        quadTo(lineTo, pos, c, end);
        quad = c;
        break;
      }
      case 'A':
        // Arco: linha reta até o ponto final.
        lineTo({ x: ox + n[5]!, y: oy + n[6]! });
        break;
    }
    lastCubic = cubic;
    lastQuad = quad;
  }
  flush();
  return subpaths;
}

type LineTo = (p: Point) => void;

function cubicTo(lineTo: LineTo, p0: Point, c1: Point, c2: Point, p1: Point): void {
  for (let s = 1; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    lineTo({
      x:
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y:
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    });
  }
}

function quadTo(lineTo: LineTo, p0: Point, c: Point, p1: Point): void {
  for (let s = 1; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    lineTo({
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    });
  }
}

// ---------------------------------------------------------------------------
// Traço: união de retângulos por segmento e círculos nos vértices (pontas e junções redondas)

function strokePolygons(subpaths: readonly Subpath[], width: number): Polygon[] {
  const half = width / 2;
  const out: Polygon[] = [];
  const circle = (center: Point): Polygon =>
    Array.from({ length: CIRCLE_STEPS }, (_, i) => {
      const angle = (Math.PI * 2 * i) / CIRCLE_STEPS;
      return {
        x: center.x + half * Math.cos(angle),
        y: center.y + half * Math.sin(angle),
      };
    });
  for (const { points, closed } of subpaths) {
    const count = points.length;
    const segments = closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % count]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      out.push(
        oriented([
          { x: a.x + nx, y: a.y + ny },
          { x: b.x + nx, y: b.y + ny },
          { x: b.x - nx, y: b.y - ny },
          { x: a.x - nx, y: a.y - ny },
        ]),
      );
    }
    for (const point of points) out.push(oriented(circle(point)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preenchimento por varredura com cobertura

interface Edge {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly dir: 1 | -1;
}

function blend(raster: Raster, index: number, color: Color, coverage: number): void {
  const a = Math.min(1, coverage * color.alpha);
  if (a <= 0) return;
  const { data } = raster;
  const dstA = data[index + 3]! / 255;
  const outA = a + dstA * (1 - a);
  for (let c = 0; c < 3; c++) {
    const src = color.rgb[c]!;
    const dst = data[index + c]!;
    data[index + c] = (src * a + dst * dstA * (1 - a)) / outA;
  }
  data[index + 3] = outA * 255;
}

/**
 * Preenche os polígonos (em pixels do raster) com a regra par-ímpar ou não-zero, dentro de
 * `clip`. A cobertura de cada pixel vem de `SUBSAMPLES` amostras verticais com cobertura
 * horizontal exata.
 */
export function fillPolygons(
  raster: Raster,
  polygons: readonly Polygon[],
  rule: 'nonzero' | 'evenodd',
  color: Color,
  clip: PixelRect,
): void {
  if (color.alpha <= 0) return;
  const edges: Edge[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y);
      if (a.y === b.y) continue;
      edges.push(
        a.y < b.y
          ? { x0: a.x, y0: a.y, x1: b.x, y1: b.y, dir: 1 }
          : { x0: b.x, y0: b.y, x1: a.x, y1: a.y, dir: -1 },
      );
    }
  }
  if (edges.length === 0) return;
  const bx0 = Math.max(0, Math.floor(clip.x), Math.floor(minX));
  const bx1 = Math.min(raster.width, Math.ceil(clip.x + clip.width), Math.ceil(maxX));
  const by0 = Math.max(0, Math.floor(clip.y), Math.floor(minY));
  const by1 = Math.min(raster.height, Math.ceil(clip.y + clip.height), Math.ceil(maxY));
  if (bx1 <= bx0 || by1 <= by0) return;

  // Arestas por linha de pixels que elas tocam.
  const buckets: Edge[][] = Array.from({ length: by1 - by0 }, () => []);
  for (const edge of edges) {
    const first = Math.max(by0, Math.floor(edge.y0));
    const last = Math.min(by1 - 1, Math.floor(edge.y1));
    for (let y = first; y <= last; y++) buckets[y - by0]!.push(edge);
  }

  const width = bx1 - bx0;
  const coverage = new Float32Array(width);
  const crossings: { x: number; dir: number }[] = [];
  for (let y = by0; y < by1; y++) {
    const row = buckets[y - by0]!;
    if (row.length === 0) continue;
    coverage.fill(0);
    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = y + (s + 0.5) / SUBSAMPLES;
      crossings.length = 0;
      for (const e of row) {
        if (sy < e.y0 || sy >= e.y1) continue;
        crossings.push({
          x: e.x0 + ((sy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0),
          dir: e.dir,
        });
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let k = 0; k < crossings.length - 1; k++) {
        winding += crossings[k]!.dir;
        const inside = rule === 'nonzero' ? winding !== 0 : (k + 1) % 2 === 1;
        if (!inside) continue;
        const xa = Math.max(bx0, crossings[k]!.x) - bx0;
        const xb = Math.min(bx1, crossings[k + 1]!.x) - bx0;
        if (xb <= xa) continue;
        const ia = Math.floor(xa);
        const ib = Math.min(width - 1, Math.floor(xb));
        if (ia === ib) {
          coverage[ia] = coverage[ia]! + (xb - xa) / SUBSAMPLES;
        } else {
          coverage[ia] = coverage[ia]! + (ia + 1 - xa) / SUBSAMPLES;
          for (let x = ia + 1; x < ib; x++) coverage[x] = coverage[x]! + 1 / SUBSAMPLES;
          coverage[ib] = coverage[ib]! + (xb - ib) / SUBSAMPLES;
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const c = coverage[x]!;
      if (c > 0) blend(raster, (y * raster.width + bx0 + x) * 4, color, Math.min(1, c));
    }
  }
}

// ---------------------------------------------------------------------------
// Cena

class Painter {
  constructor(
    private readonly raster: Raster,
    private readonly measure: TextMeasurer,
    private readonly scale: number,
  ) {}

  paint(node: SceneNode, parent: Matrix, opacity: number, clip: PixelRect): void {
    if (!node.visible) return;
    const matrix = multiply(parent, node.transform);
    const alpha = opacity * node.opacity;
    if (alpha <= 0) return;

    const shapes = this.shapes(node);
    const rule = node.type === 'path' ? node.fillRule : 'nonzero';
    // Linha aberta não tem interior: só o traço.
    const fillable = node.type !== 'line' || node.closed;
    if (fillable && node.type !== 'text') {
      for (const paint of node.fills) {
        const color = paintColor(paint);
        if (color === null) continue;
        this.fill(
          shapes.map((s) => s.points),
          matrix,
          rule,
          color,
          alpha,
          clip,
        );
      }
    }
    if (node.stroke && node.stroke.width > 0) {
      const color = firstColor(node.stroke.paints);
      if (color !== null) {
        const width = Math.max(node.stroke.width, 1 / this.scale);
        this.fill(strokePolygons(shapes, width), matrix, 'nonzero', color, alpha, clip);
      }
    }
    if (node.type === 'text') this.text(node, matrix, alpha, clip);

    if (node.type === 'frame' || node.type === 'group') {
      let childClip = clip;
      if (node.type === 'frame' && node.clip) {
        childClip = intersect(
          clip,
          bounds(this.toRaster(roundedRect(node.width, node.height, 0), matrix)),
        );
      }
      for (const child of node.children) this.paint(child, matrix, alpha, childClip);
    }
  }

  private toRaster(points: Polygon, matrix: Matrix): Point[] {
    return points.map((p) => apply(matrix, p));
  }

  /** Contornos do nó no espaço local (a base do preenchimento e do traço). */
  private shapes(node: SceneNode): Subpath[] {
    switch (node.type) {
      case 'frame':
      case 'rect':
        return [
          {
            points: roundedRect(node.width, node.height, node.cornerRadius),
            closed: true,
          },
        ];
      case 'ellipse':
        return [{ points: ellipse(node.width, node.height), closed: true }];
      case 'line':
        return node.points.length > 1
          ? [{ points: [...node.points], closed: node.closed }]
          : [];
      case 'path':
        return flattenPath(node.d);
      case 'unknown':
        return [{ points: roundedRect(node.width, node.height, 0), closed: true }];
      case 'group':
      case 'text':
        return [];
    }
  }

  private fill(
    polygons: readonly Polygon[],
    matrix: Matrix,
    rule: 'nonzero' | 'evenodd',
    color: Color,
    opacity: number,
    clip: PixelRect,
  ): void {
    if (polygons.length === 0) return;
    fillPolygons(
      this.raster,
      polygons.map((poly) => this.toRaster(poly, matrix)),
      rule,
      { rgb: color.rgb, alpha: color.alpha * opacity },
      clip,
    );
  }

  /** Texto como barras: uma por linha, na cor do texto. */
  private text(node: TextNode, matrix: Matrix, opacity: number, clip: PixelRect): void {
    const color = firstColor(node.fills);
    if (color === null || node.text === '') return;
    const bars = textBars(node, this.measure);
    this.fill(
      bars.map((b) => [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
        { x: b.x, y: b.y + b.height },
      ]),
      matrix,
      'nonzero',
      color,
      opacity,
      clip,
    );
  }
}

function firstColor(paints: readonly Paint[]): Color | null {
  for (const paint of paints) {
    const color = paintColor(paint);
    if (color !== null) return color;
  }
  return null;
}

function bounds(points: readonly Point[]): PixelRect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function intersect(a: PixelRect, b: PixelRect): PixelRect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Barras do texto no espaço local do nó: uma por linha medida. */
export function textBars(node: TextNode, measure: TextMeasurer): PixelRect[] {
  const { style } = node;
  const lineHeight = style.lineHeight ?? style.fontSize * 1.2;
  const font = {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    italic: style.italic,
    lineHeight,
    letterSpacing: style.letterSpacing ?? 0,
  };
  const widthOf = (text: string) => measure(text, font).width;
  const lines: string[] = [];
  for (const paragraph of node.text.split('\n')) {
    const words = paragraph.split(' ').filter((word) => word !== '');
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && node.width > 0 && widthOf(candidate) > node.width + 1e-6) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const total = lines.length * lineHeight;
  const top =
    style.verticalAlign === 'middle'
      ? (node.height - total) / 2
      : style.verticalAlign === 'bottom'
        ? node.height - total
        : 0;
  const barHeight = lineHeight * BAR_RATIO;
  const bars: PixelRect[] = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    const justified = style.align === 'justify' && i < lines.length - 1;
    const width = justified
      ? node.width
      : Math.min(widthOf(line), node.width || Infinity);
    const x =
      style.align === 'center'
        ? (node.width - width) / 2
        : style.align === 'right'
          ? node.width - width
          : 0;
    bars.push({
      x,
      y: top + i * lineHeight + (lineHeight - barHeight) / 2,
      width,
      height: barHeight,
    });
  });
  return bars;
}

/** Desenho (a cena instanciada de uma marcação) para `paintScene`. */
export interface SceneDrawing {
  readonly root: SceneNode;
}

/**
 * Pinta as cenas sobre `raster`, em ordem (as últimas ficam por cima), só dentro de
 * `view.clip`. Uma cena cuja caixa não toca a região é ignorada.
 */
export function paintScene(
  raster: Raster,
  drawings: Iterable<SceneDrawing>,
  measure: TextMeasurer,
  view: SceneView,
): void {
  const base: Matrix = [view.scaleX, 0, 0, view.scaleY, 0, 0];
  const painter = new Painter(raster, measure, Math.sqrt(view.scaleX * view.scaleY));
  const clip = intersect(view.clip, {
    x: 0,
    y: 0,
    width: raster.width,
    height: raster.height,
  });
  for (const { root } of drawings) {
    const box = bounds(
      [
        { x: 0, y: 0 },
        { x: root.width, y: 0 },
        { x: root.width, y: root.height },
        { x: 0, y: root.height },
      ].map((p) => apply(multiply(base, root.transform), p)),
    );
    // Fora da região (encostar conta: uma caixa sem altura ainda pode ter traço).
    if (
      box.x > clip.x + clip.width ||
      box.x + box.width < clip.x ||
      box.y > clip.y + clip.height ||
      box.y + box.height < clip.y
    ) {
      continue;
    }
    painter.paint(root, base, 1, clip);
  }
}
