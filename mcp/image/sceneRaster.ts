import type { TextMeasurer } from '../../src/model/components/instantiate';
import type { ScreenAnchor } from '../../src/model/components/componentFormat';
import { CUT_REACH, cutsText } from '../../src/model/components/textWrap';
import {
  growRadius,
  partialSides,
  sideSegments,
} from '../../src/model/components/strokeSides';
import {
  multiply,
  nodeMatrix,
  translate,
  type CornerRadius,
  type Matrix,
  type Paint,
  type Point,
  type FrameNode,
  type GroupNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { MAX_SHADOW_PIXELS, compositeShadow, dashPaths } from './effects';
import { createRaster, type PixelRect, type Raster } from './raster';
import { textBars, type TextBar } from './textBars';
import { textInk } from './textLayout';
import type { FontBook } from './textMeasurer';

export { textBars, type TextBar };

// Desenho simplificado de uma cena de componente, em pixels, para `get_marking_image` numa tela
// em branco. O servidor não tem fontes nem canvas: formas viram polígonos preenchidos por
// varredura com cobertura (suavizada), o gradiente vira a cor do primeiro stop, a imagem vira
// um reservado cinza. Com `view.fonts` o texto é desenhado com os glifos da fonte (quebra, `…`
// e trechos); sem ela vira barras (uma por linha, na cor do texto). Traço com `align`, tracejado,
// `cap`/`join` e `sides`, e sombra desfocada. Puro: sem disco.

/** Janela de desenho: escala da imagem para o raster e a região (em pixels do raster) a pintar. */
export interface SceneView {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly clip: PixelRect;
  /** Fontes do desenho do texto; ausente = o texto vira barras (o desenho simplificado). */
  readonly fonts?: FontBook;
  /** Onde fica a origem da imagem (0, 0) no raster, em pixels do raster (padrão 0, 0). */
  readonly originX?: number;
  readonly originY?: number;
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

/** Lê um número SVG em `at`; devolve-o e a posição seguinte, ou `null` se não há número. */
function readNumber(d: string, at: number): [number, number] | null {
  NUMBER.lastIndex = at;
  const found = NUMBER.exec(d);
  return found ? [Number(found[0]), NUMBER.lastIndex] : null;
}

/** Os argumentos 4 e 5 (índices 3 e 4) de `A` são flags de um dígito, sem separador obrigatório. */
function isArcFlag(command: string, argIndex: number): boolean {
  return command.toUpperCase() === 'A' && (argIndex % 7 === 3 || argIndex % 7 === 4);
}

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  let i = 0;
  let command = '';
  let argIndex = 0;
  while (i < d.length) {
    const ch = d[i]!;
    if (/[A-Za-z]/.test(ch)) {
      tokens.push(ch);
      command = ch;
      argIndex = 0;
      i++;
    } else if (isArcFlag(command, argIndex) && (ch === '0' || ch === '1')) {
      tokens.push(Number(ch));
      argIndex++;
      i++;
    } else {
      const found = readNumber(d, i);
      if (found) {
        tokens.push(found[0]);
        argIndex++;
        i = found[1];
      } else {
        i++;
      }
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
        // Número solto depois de Z não tem comando: termina o caminho.
        command = '';
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
        arcTo(lineTo, pos, n, { x: ox + n[5]!, y: oy + n[6]! });
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

/** Passos por quarto de volta ao achatar um arco. */
const ARC_STEPS_PER_QUARTER = 8;

interface ArcCenter {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly phi: number;
  readonly theta1: number;
  readonly delta: number;
}

/** Ângulo orientado do vetor (ux, uy) ao (vx, vy). */
const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/**
 * Pontos extremos do arco elíptico do SVG (`A rx ry rot large sweep x y`) em centro e ângulos
 * (SVG 1.1, F.6.5). Raio pequeno demais cresce até caber nos dois pontos.
 */
function arcCenter(p0: Point, args: readonly number[], end: Point): ArcCenter {
  let rx = Math.abs(args[0]!);
  let ry = Math.abs(args[1]!);
  const phi = (args[2]! * Math.PI) / 180;
  const sweep = args[4]! !== 0;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (p0.x - end.x) / 2;
  const dy = (p0.y - end.y) / 2;
  const x1 = cosPhi * dx + sinPhi * dy;
  const y1 = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const sides = rx2 * y1 * y1 + ry2 * x1 * x1;
  const sign = (args[3]! !== 0) === sweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, (rx2 * ry2 - sides) / sides));
  const cxp = (factor * rx * y1) / ry;
  const cyp = (-factor * ry * x1) / rx;
  const ux = (x1 - cxp) / rx;
  const uy = (y1 - cyp) / ry;
  let delta = vectorAngle(ux, uy, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  return {
    cx: cosPhi * cxp - sinPhi * cyp + (p0.x + end.x) / 2,
    cy: sinPhi * cxp + cosPhi * cyp + (p0.y + end.y) / 2,
    rx,
    ry,
    phi,
    theta1: vectorAngle(1, 0, ux, uy),
    delta,
  };
}

/**
 * Arco elíptico do SVG em segmentos. `args` traz `[rx, ry, rotação, large-arc, sweep, x, y]`
 * (`end` é o ponto final já absoluto). Raio nulo ou pontos iguais viram linha reta.
 */
function arcTo(lineTo: LineTo, p0: Point, args: readonly number[], end: Point): void {
  const flat = args[0] === 0 || args[1] === 0 || (p0.x === end.x && p0.y === end.y);
  if (flat) {
    lineTo(end);
    return;
  }
  const { cx, cy, rx, ry, phi, theta1, delta } = arcCenter(p0, args, end);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const quarter = Math.PI / 2;
  const steps = Math.max(
    2,
    Math.ceil((Math.abs(delta) / quarter) * ARC_STEPS_PER_QUARTER),
  );
  for (let i = 1; i < steps; i++) {
    const t = theta1 + (delta * i) / steps;
    lineTo({
      x: cosPhi * rx * Math.cos(t) - sinPhi * ry * Math.sin(t) + cx,
      y: sinPhi * rx * Math.cos(t) + cosPhi * ry * Math.sin(t) + cy,
    });
  }
  lineTo(end);
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

interface StrokeStyle {
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
}

/** Limite do canto `miter` (como o padrão do canvas 2D): acima dele o canto vira `bevel`. */
const MITER_LIMIT = 10;

function circlePolygon(center: Point, radius: number): Polygon {
  return Array.from({ length: CIRCLE_STEPS }, (_, i) => {
    const angle = (Math.PI * 2 * i) / CIRCLE_STEPS;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

/** O retângulo de um segmento, com a ponta `square` empurrada para fora quando pedida. */
function segmentPolygon(
  a: Point,
  b: Point,
  half: number,
  extendA: boolean,
  extendB: boolean,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy * half;
  const ny = ux * half;
  const from = extendA ? { x: a.x - ux * half, y: a.y - uy * half } : a;
  const to = extendB ? { x: b.x + ux * half, y: b.y + uy * half } : b;
  return oriented([
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ]);
}

/** O canto entre dois segmentos consecutivos (a→b, b→c): círculo, chanfro ou ponta de esquadro. */
function joinPolygon(
  a: Point,
  b: Point,
  c: Point,
  half: number,
  join: StrokeStyle['join'],
): Polygon | null {
  const l1 = Math.hypot(b.x - a.x, b.y - a.y);
  const l2 = Math.hypot(c.x - b.x, c.y - b.y);
  if (l1 === 0 || l2 === 0) return null;
  const d1 = { x: (b.x - a.x) / l1, y: (b.y - a.y) / l1 };
  const d2 = { x: (c.x - b.x) / l2, y: (c.y - b.y) / l2 };
  const cross = d1.x * d2.y - d1.y * d2.x;
  const dot = d1.x * d2.x + d1.y * d2.y;
  if (Math.abs(cross) < 1e-9 && dot > 0) return null;
  if (join === 'round') return circlePolygon(b, half);
  // A volta aponta para o lado da normal esquerda quando `cross` > 0; o canto de fora é o oposto.
  const side = cross > 0 ? -1 : 1;
  const p1 = { x: b.x + side * -d1.y * half, y: b.y + side * d1.x * half };
  const p2 = { x: b.x + side * -d2.y * half, y: b.y + side * d2.x * half };
  const ratio = Math.sqrt(2 / Math.max(1e-9, 1 + dot));
  if (join === 'miter' && ratio <= MITER_LIMIT) {
    const k = 1 / (1 + dot);
    const m = {
      x: b.x + side * (-d1.y - d2.y) * half * k,
      y: b.y + side * (d1.x + d2.x) * half * k,
    };
    return oriented([b, p1, m, p2]);
  }
  return oriented([b, p1, p2]);
}

function segmentPolygons(sub: Subpath, half: number, cap: StrokeStyle['cap']): Polygon[] {
  const { points, closed } = sub;
  const count = points.length;
  const segments = closed ? count : count - 1;
  const out: Polygon[] = [];
  for (let i = 0; i < segments; i++) {
    const square = !closed && cap === 'square';
    const poly = segmentPolygon(
      points[i]!,
      points[(i + 1) % count]!,
      half,
      square && i === 0,
      square && i === segments - 1,
    );
    if (poly) out.push(poly);
  }
  return out;
}

/** Caminho fechado cujo último ponto repete o primeiro: o ponto repetido sai (o fechamento já liga os dois). */
function withoutClosingDuplicate(sub: Subpath): Subpath {
  const { points } = sub;
  const last = points[points.length - 1];
  const first = points[0];
  if (!sub.closed || points.length < 3 || !first || !last) return sub;
  if (first.x !== last.x || first.y !== last.y) return sub;
  return { ...sub, points: points.slice(0, -1) };
}

function cornerPolygons(
  sub: Subpath,
  half: number,
  join: StrokeStyle['join'],
): Polygon[] {
  const { points, closed } = sub;
  const count = points.length;
  const corners = closed ? count : count - 2;
  const out: Polygon[] = [];
  for (let i = 0; i < corners; i++) {
    const at = closed ? i : i + 1;
    const poly = joinPolygon(
      points[(at + count - 1) % count]!,
      points[at]!,
      points[(at + 1) % count]!,
      half,
      join,
    );
    if (poly) out.push(poly);
  }
  return out;
}

function capPolygons(sub: Subpath, half: number, cap: StrokeStyle['cap']): Polygon[] {
  const { points, closed } = sub;
  if (closed || cap !== 'round' || points.length < 2) return [];
  return [points[0]!, points[points.length - 1]!].map((p) =>
    oriented(circlePolygon(p, half)),
  );
}

function strokePolygons(
  subpaths: readonly Subpath[],
  width: number,
  style: StrokeStyle = { cap: 'butt', join: 'miter' },
): Polygon[] {
  const half = width / 2;
  return subpaths
    .map(withoutClosingDuplicate)
    .flatMap((sub) => [
      ...segmentPolygons(sub, half, style.cap),
      ...cornerPolygons(sub, half, style.join),
      ...capPolygons(sub, half, style.cap),
    ]);
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

/** O raio do canto movido `d` px para dentro (negativo = para fora), sem passar de 0. */
function shiftRadius(radius: CornerRadius, d: number): CornerRadius {
  const shift = (r: number) => Math.max(0, r - d);
  return typeof radius === 'number'
    ? shift(radius)
    : [shift(radius[0]), shift(radius[1]), shift(radius[2]), shift(radius[3])];
}

/**
 * O contorno que o traço percorre: `center` é o próprio contorno; `inside`/`outside` movem a
 * linha de centro meia largura para dentro/fora, em quadros, retângulos e elipses (a faixa do
 * traço cobre então só um lado do contorno). O `offset` afasta o contorno da forma, de cada
 * lado, e soma ao raio de cada canto arredondado. Caminhos e linhas ficam ao centro.
 */
function alignedShapes(node: SceneNode, shapes: Subpath[]): Subpath[] {
  const stroke = node.stroke;
  if (!stroke) return shapes;
  if (node.type !== 'frame' && node.type !== 'rect' && node.type !== 'ellipse')
    return shapes;
  const offset = stroke.offset ?? 0;
  const align =
    stroke.align === 'inside'
      ? stroke.width / 2
      : stroke.align === 'outside'
        ? -stroke.width / 2
        : 0;
  const d = align - offset;
  if (d === 0) return shapes;
  const width = Math.max(0.01, node.width - 2 * d);
  const height = Math.max(0.01, node.height - 2 * d);
  const points =
    node.type === 'ellipse'
      ? ellipse(width, height)
      : roundedRect(
          width,
          height,
          shiftRadius(growRadius(node.cornerRadius, offset), align),
        );
  return [{ points: points.map((p) => ({ x: p.x + d, y: p.y + d })), closed: true }];
}

// ---------------------------------------------------------------------------
// Cena

/** A faixa do texto cortado: a largura da caixa, na horizontal; na vertical nada se corta. */
function cutStrip(node: TextNode): Polygon {
  return [
    { x: 0, y: -CUT_REACH },
    { x: node.width, y: -CUT_REACH },
    { x: node.width, y: CUT_REACH },
    { x: 0, y: CUT_REACH },
  ];
}

class Painter {
  constructor(
    private readonly raster: Raster,
    private readonly measure: TextMeasurer,
    private readonly scale: number,
    private readonly fonts?: FontBook,
  ) {}

  paint(node: SceneNode, parent: Matrix, opacity: number, clip: PixelRect): void {
    if (!node.visible) return;
    const matrix = multiply(parent, nodeMatrix(node));
    const alpha = opacity * node.opacity;
    if (alpha <= 0) return;

    const shapes = this.shapes(node);
    this.shadows(node, shapes, matrix, alpha, clip);
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
    this.strokeNode(node, shapes, matrix, alpha, clip);
    if (node.type === 'text') this.text(node, matrix, alpha, clip);

    if (node.type === 'frame' || node.type === 'group') {
      let childClip = clip;
      if (node.type === 'frame' && node.clip) {
        const box = node.clipBox;
        const rect = box
          ? [
              { x: box.x, y: box.y },
              { x: box.x + box.width, y: box.y },
              { x: box.x + box.width, y: box.y + box.height },
              { x: box.x, y: box.y + box.height },
            ]
          : roundedRect(node.width, node.height, 0);
        const corners = this.toRaster(rect, matrix);
        childClip = intersect(clip, bounds(corners));
        if (!isAxisAligned(matrix)) {
          this.paintTurned(node, matrix, alpha, childClip, corners);
          return;
        }
      }
      for (const child of node.children) this.paint(child, matrix, alpha, childClip);
    }
  }

  /**
   * Os filhos de um quadro com `clip` girado: pintados numa camada à parte e compostos pela
   * cobertura do retângulo girado (o recorte reto só serve a quadros alinhados aos eixos).
   */
  private paintTurned(
    node: FrameNode | GroupNode,
    matrix: Matrix,
    alpha: number,
    clip: PixelRect,
    corners: Polygon,
  ): void {
    this.masked(corners, clip, (inner, shift, area) => {
      const into = multiply(shift, matrix);
      for (const child of node.children) inner.paint(child, into, alpha, area);
    });
  }

  /**
   * Pinta com `draw` numa camada do tamanho da região (`clip` ∩ caixa de `mask`) e compõe o
   * resultado pela cobertura do polígono `mask`: um recorte que não é reto. `draw` recebe o
   * pintor da camada, a translação que leva o raster à camada (multiplique-a às matrizes) e a
   * região em coordenadas da camada.
   */
  private masked(
    mask: Polygon,
    clip: PixelRect,
    draw: (painter: Painter, shift: Matrix, area: PixelRect) => void,
  ): void {
    const { raster } = this;
    const region = intersect(clip, bounds(mask));
    const x0 = Math.max(0, Math.floor(region.x));
    const y0 = Math.max(0, Math.floor(region.y));
    const x1 = Math.min(raster.width, Math.ceil(region.x + region.width));
    const y1 = Math.min(raster.height, Math.ceil(region.y + region.height));
    if (x1 <= x0 || y1 <= y0) return;
    const [width, height] = [x1 - x0, y1 - y0];
    const layer = createRaster(width, height);
    draw(new Painter(layer, this.measure, this.scale, this.fonts), translate(-x0, -y0), {
      x: region.x - x0,
      y: region.y - y0,
      width: region.width,
      height: region.height,
    });
    const coverage = createRaster(width, height);
    const shifted = mask.map((p) => ({ x: p.x - x0, y: p.y - y0 }));
    const whole = { x: 0, y: 0, width, height };
    fillPolygons(coverage, [shifted], 'nonzero', { rgb: [0, 0, 0], alpha: 1 }, whole);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        const covered = coverage.data[at + 3]! / 255;
        if (covered <= 0 || layer.data[at + 3]! === 0) continue;
        const rgb: Rgb = [layer.data[at]!, layer.data[at + 1]!, layer.data[at + 2]!];
        const into = ((y + y0) * raster.width + x + x0) * 4;
        blend(raster, into, { rgb, alpha: layer.data[at + 3]! / 255 }, covered);
      }
    }
  }

  /** O traço do nó: contorno com `align`, tracejado, `cap`/`join` ou os `sides` pedidos. */
  private strokeNode(
    node: SceneNode,
    shapes: Subpath[],
    matrix: Matrix,
    alpha: number,
    clip: PixelRect,
  ): void {
    if (!node.stroke || node.stroke.width <= 0) return;
    const color = firstColor(node.stroke.paints);
    if (color === null) return;
    const width = strokeWidth(node.stroke, matrix, this.scale);
    const style: StrokeStyle = {
      cap: node.stroke.cap ?? 'butt',
      join: node.stroke.join ?? 'miter',
    };
    const base = this.sideLines(node) ?? alignedShapes(node, shapes);
    const dash = node.stroke.dash;
    const lines = dash && dash.length > 0 ? dashPaths(base, dash) : base;
    this.fill(strokePolygons(lines, width, style), matrix, 'nonzero', color, alpha, clip);
  }

  /** Sombra (`effects`, sem a interna): a forma do nó desfocada e deslocada, por baixo do nó. */
  private shadows(
    node: SceneNode,
    shapes: Subpath[],
    matrix: Matrix,
    alpha: number,
    clip: PixelRect,
  ): void {
    if (node.type === 'text' || shapes.length === 0) return;
    for (const shadow of node.effects) {
      const color = parseColor(shadow.color);
      if (shadow.inner || color === null) continue;
      const polygons = shapes.map((sub) => this.toRaster(sub.points, matrix));
      const sigma = (shadow.blur * this.scale) / 2;
      const margin = Math.ceil(sigma * 3) + 2;
      const edge = bounds(polygons.flat());
      const box: PixelRect = {
        x: Math.floor(edge.x) - margin,
        y: Math.floor(edge.y) - margin,
        width: Math.ceil(edge.width) + 2 * margin,
        height: Math.ceil(edge.height) + 2 * margin,
      };
      if (box.width * box.height > MAX_SHADOW_PIXELS) continue;
      const temp = createRaster(box.width, box.height);
      fillPolygons(
        temp,
        polygons.map((poly) => poly.map((p) => ({ x: p.x - box.x, y: p.y - box.y }))),
        node.type === 'path' ? node.fillRule : 'nonzero',
        { rgb: [0, 0, 0], alpha: 1 },
        { x: 0, y: 0, width: box.width, height: box.height },
      );
      const mask = new Float32Array(box.width * box.height);
      for (let i = 0; i < mask.length; i++) mask[i] = temp.data[i * 4 + 3]! / 255;
      compositeShadow(
        this.raster,
        mask,
        box,
        sigma,
        { dx: shadow.offset.x * this.scale, dy: shadow.offset.y * this.scale },
        { rgb: color.rgb, alpha: color.alpha * alpha },
        clip,
      );
    }
  }

  /** `stroke.sides` num `frame`/`rect`: os lados pedidos como linhas retas (sem os cantos). */
  private sideLines(node: SceneNode): Subpath[] | null {
    if ((node.type !== 'frame' && node.type !== 'rect') || !node.stroke) return null;
    // Os quatro lados são o contorno inteiro, com o raio dos cantos (decisão 21).
    if (!partialSides(node.stroke)) return null;
    return sideSegments(node.stroke, node.width, node.height).map((seg) => ({
      points: [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x2, y: seg.y2 },
      ],
      closed: false,
    }));
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

  /** Texto: glifos da fonte (com `fonts`) ou barras, uma por linha, na cor do texto. */
  private text(node: TextNode, matrix: Matrix, opacity: number, clip: PixelRect): void {
    if (node.text === '') return;
    if (this.fonts) {
      this.glyphText(node, matrix, opacity, clip, this.fonts);
      return;
    }
    if (node.runLayout) {
      this.richText(node, matrix, opacity, clip);
      return;
    }
    const color = firstColor(node.fills);
    if (color === null) return;
    const bars = textBars(node, this.measure);
    this.fill(bars.map(barPolygon), matrix, 'nonzero', color, opacity, clip);
  }

  /** Os glifos do texto (e o fundo dos chips), cada trecho na sua cor. */
  private glyphText(
    node: TextNode,
    matrix: Matrix,
    opacity: number,
    clip: PixelRect,
    fonts: FontBook,
  ): void {
    const ink = textInk(node, this.measure, fonts);
    const own = firstColor(node.fills);
    // `wrap: none` sem `ellipsis` numa caixa fixa: o glifo que passa da caixa sai cortado por pixel.
    if (!cutsText(node)) return this.drawInk(ink, own, matrix, opacity, clip);
    const strip = this.toRaster(cutStrip(node), matrix);
    if (isAxisAligned(matrix))
      return this.drawInk(ink, own, matrix, opacity, intersect(clip, bounds(strip)));
    // Texto girado: a faixa do corte é um retângulo girado, que só uma máscara recorta.
    this.masked(strip, clip, (inner, shift, area) =>
      inner.drawInk(ink, own, multiply(shift, matrix), opacity, area),
    );
  }

  /** Os polígonos de tinta (fundo dos chips e glifos), cada um na sua cor, dentro de `area`. */
  private drawInk(
    ink: ReturnType<typeof textInk>,
    own: Color | null,
    matrix: Matrix,
    opacity: number,
    area: PixelRect,
  ): void {
    for (const box of ink.boxes) {
      const color = parseColor(box.color);
      if (color === null) continue;
      const poly = roundedRect(box.width, box.height, box.radius).map((p) => ({
        x: p.x + box.x,
        y: p.y + box.y,
      }));
      this.fill([poly], matrix, 'nonzero', color, opacity, area);
    }
    for (const glyphs of ink.glyphs) {
      const color = glyphs.color === undefined ? own : parseColor(glyphs.color);
      if (color !== null)
        this.fill(glyphs.polygons, matrix, 'nonzero', color, opacity, area);
    }
  }

  /** Texto rico: o fundo de cada chip e uma barra por pedaço de texto, em ordem, cada um na sua cor. */
  private richText(
    node: TextNode,
    matrix: Matrix,
    opacity: number,
    clip: PixelRect,
  ): void {
    for (const bar of textBars(node, this.measure)) {
      const color = bar.color === undefined ? null : parseColor(bar.color);
      if (color !== null)
        this.fill([barPolygon(bar)], matrix, 'nonzero', color, opacity, clip);
    }
  }
}

function barPolygon(b: PixelRect): Polygon {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
}

/**
 * Largura do traço no espaço local, com o mínimo de 1 px de saída. `scale: false` fixa a largura
 * em pixels de saída (como `strokeScaleEnabled(false)` na app), em qualquer escala ou transformação.
 */
function strokeWidth(
  stroke: NonNullable<SceneNode['stroke']>,
  matrix: Matrix,
  scale: number,
): number {
  if (stroke.scale !== false) return Math.max(stroke.width, 1 / scale);
  const unit = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
  return unit > 0 ? Math.max(stroke.width, 1) / unit : stroke.width;
}

function firstColor(paints: readonly Paint[]): Color | null {
  for (const paint of paints) {
    const color = paintColor(paint);
    if (color !== null) return color;
  }
  return null;
}

/** Caixa que contém os pontos; laço simples, porque `Math.min(...xs)` estoura a pilha com muitos pontos. */
export function bounds(points: readonly Point[]): PixelRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A matriz só escala e translada (ou gira de 90 em 90°): um retângulo continua alinhado aos eixos. */
function isAxisAligned(m: Matrix): boolean {
  const flat = (a: number, b: number) => Math.abs(a) < 1e-9 * (Math.abs(b) + 1);
  return (flat(m[1], m[0]) && flat(m[2], m[3])) || (flat(m[0], m[1]) && flat(m[3], m[2]));
}

function intersect(a: PixelRect, b: PixelRect): PixelRect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Fração (da largura e da altura) do ponto de cada âncora do desenho em pixels de tela. */
const ANCHOR_FRACTION: Record<ScreenAnchor, readonly [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** Desenho (a cena instanciada de uma marcação) para `paintScene`. */
export interface SceneDrawing {
  readonly root: SceneNode;
  /**
   * Desenho em pixels de tela (`screen` do componente): `root` mede o `size` na origem e é
   * ancorado em `anchor` no `rect` da marcação (pixels da imagem). Na imagem do servidor um pixel
   * de design é um pixel da saída, em qualquer zoom.
   */
  readonly screen?: {
    readonly anchor: ScreenAnchor;
    readonly rect: { x: number; y: number; width: number; height: number };
  };
}

/** A matriz do desenho no raster: a da imagem, ou só a translação do âncora num desenho de tela. */
function drawingBase(drawing: SceneDrawing, view: SceneView): Matrix {
  const ox = view.originX ?? 0;
  const oy = view.originY ?? 0;
  const { screen, root } = drawing;
  if (screen === undefined) return [view.scaleX, 0, 0, view.scaleY, ox, oy];
  const [fx, fy] = ANCHOR_FRACTION[screen.anchor];
  return [
    1,
    0,
    0,
    1,
    ox +
      view.scaleX * screen.rect.x +
      fx * (view.scaleX * screen.rect.width - root.width),
    oy +
      view.scaleY * screen.rect.y +
      fy * (view.scaleY * screen.rect.height - root.height),
  ];
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
  const scale = Math.sqrt(view.scaleX * view.scaleY);
  const painter = new Painter(raster, measure, scale, view.fonts);
  const screenPainter = new Painter(raster, measure, 1, view.fonts);
  const clip = intersect(view.clip, {
    x: 0,
    y: 0,
    width: raster.width,
    height: raster.height,
  });
  for (const drawing of drawings) {
    const { root } = drawing;
    const base = drawingBase(drawing, view);
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
    (drawing.screen === undefined ? painter : screenPainter).paint(root, base, 1, clip);
  }
}
