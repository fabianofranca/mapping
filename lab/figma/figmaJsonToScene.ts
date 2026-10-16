/**
 * Laboratório "Figma somente leitura": conversor do JSON de nós da API REST do Figma
 * (`GET /v1/files/:key/nodes`, `GET /v1/files/:key` ou um nó solto) para o modelo `Scene`.
 *
 * Puro (sem DOM, sem rede) e tolerante: valida por estreitamento sobre `unknown`, nunca
 * confia no formato e transforma o que não sabe desenhar em avisos (`Scene.warnings`).
 */

import {
  baseNode,
  IDENTITY,
  translate,
  type CornerRadius,
  type GradientStop,
  type Matrix,
  type Paint,
  type PathNode,
  type Point,
  type Scene,
  type SceneNode,
  type Shadow,
  type Stroke,
  type TextStyle,
} from './scene';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isNode = (v: unknown): v is Rec => isRec(v) && typeof v.type === 'string';

function fail(message: string): Error {
  return new Error(`JSON do Figma inválido: ${message}`);
}

/** Cor do Figma: canais em 0..1. */
export interface FigmaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** `{ r, g, b, a }` (0..1) em `rgba(R, G, B, A)`: canais inteiros 0..255, alfa com 3 casas. */
export function figmaColor(c: FigmaColor, alpha = 1): string {
  const channel = (v: number): number => Math.round(clamp01(v) * 255);
  const a = Math.round(clamp01((c.a ?? 1) * alpha) * 1000) / 1000;
  return `rgba(${channel(c.r)}, ${channel(c.g)}, ${channel(c.b)}, ${a})`;
}

function readColor(v: unknown): FigmaColor | undefined {
  if (!isRec(v)) return undefined;
  const r = num(v.r);
  const g = num(v.g);
  const b = num(v.b);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  const a = num(v.a);
  return a === undefined ? { r, g, b } : { r, g, b, a };
}

function readPoint(v: unknown): Point | undefined {
  if (!isRec(v)) return undefined;
  const x = num(v.x);
  const y = num(v.y);
  return x === undefined || y === undefined ? undefined : { x, y };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function readBox(v: unknown): Box | undefined {
  if (!isRec(v)) return undefined;
  const x = num(v.x);
  const y = num(v.y);
  const width = num(v.width);
  const height = num(v.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return { x, y, width, height };
}

/** `[[a, c, e], [b, d, f]]` do Figma na matriz `[a, b, c, d, e, f]` do modelo. */
function readRelativeTransform(v: unknown): Matrix | undefined {
  if (!Array.isArray(v) || v.length < 2) return undefined;
  const row = (r: unknown): [number, number, number] | undefined => {
    if (!Array.isArray(r) || r.length < 3) return undefined;
    const [p, q, s] = [num(r[0]), num(r[1]), num(r[2])];
    return p === undefined || q === undefined || s === undefined ? undefined : [p, q, s];
  };
  const r0 = row(v[0]);
  const r1 = row(v[1]);
  if (!r0 || !r1) return undefined;
  return [r0[0], r1[0], r0[1], r1[1], r0[2], r1[2]];
}

interface Ctx {
  /** Conjunto preserva a ordem de inserção e deduplica as mensagens. */
  readonly warnings: Set<string>;
  counter: number;
  imageFills: number;
}

const warn = (ctx: Ctx, message: string): void => {
  ctx.warnings.add(message);
};

// ---------------------------------------------------------------------------------------
// Pintura, traço e efeitos
// ---------------------------------------------------------------------------------------

function checkBlendMode(v: unknown, ctx: Ctx): void {
  if (v === undefined || v === 'NORMAL' || v === 'PASS_THROUGH') return;
  warn(ctx, 'modos de mesclagem foram ignorados');
}

function readStops(v: unknown): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const s of list(v)) {
    if (!isRec(s)) continue;
    const offset = num(s.position);
    const color = readColor(s.color);
    if (offset === undefined || !color) continue;
    stops.push({ offset, color: figmaColor(color) });
  }
  return stops;
}

function convertPaint(p: unknown, w: number, h: number, ctx: Ctx): Paint | undefined {
  if (!isRec(p) || p.visible === false) return undefined;
  checkBlendMode(p.blendMode, ctx);
  const opacity = num(p.opacity) ?? 1;
  const type = str(p.type);
  switch (type) {
    case 'SOLID': {
      const color = readColor(p.color);
      return color ? { type: 'solid', color: figmaColor(color), opacity } : undefined;
    }
    case 'GRADIENT_LINEAR': {
      const stops = readStops(p.gradientStops);
      if (stops.length === 0) {
        warn(ctx, 'gradiente sem paradas de cor foi ignorado');
        return undefined;
      }
      const handles = list(p.gradientHandlePositions).map(readPoint);
      const a = handles[0] ?? { x: 0, y: 0.5 };
      const b = handles[1] ?? { x: 1, y: 0.5 };
      return {
        type: 'linear',
        start: { x: a.x * w, y: a.y * h },
        end: { x: b.x * w, y: b.y * h },
        stops,
        opacity,
      };
    }
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND': {
      if (type !== 'GRADIENT_RADIAL')
        warn(
          ctx,
          `gradiente ${type === 'GRADIENT_ANGULAR' ? 'angular' : 'diamante'} aproximado como radial`,
        );
      const stops = readStops(p.gradientStops);
      if (stops.length === 0) {
        warn(ctx, 'gradiente sem paradas de cor foi ignorado');
        return undefined;
      }
      const handles = list(p.gradientHandlePositions).map(readPoint);
      const a = handles[0] ?? { x: 0.5, y: 0.5 };
      const b = handles[1] ?? { x: 1, y: 0.5 };
      return {
        type: 'radial',
        center: { x: a.x * w, y: a.y * h },
        radius: Math.hypot((b.x - a.x) * w, (b.y - a.y) * h),
        stops,
        opacity,
      };
    }
    case 'IMAGE':
      ctx.imageFills++;
      return { type: 'image', opacity };
    default:
      warn(ctx, `tipo de preenchimento não suportado: ${type ?? 'desconhecido'}`);
      return undefined;
  }
}

function convertPaints(v: unknown, w: number, h: number, ctx: Ctx): Paint[] {
  const out: Paint[] = [];
  for (const p of list(v)) {
    const paint = convertPaint(p, w, h, ctx);
    if (paint) out.push(paint);
  }
  return out;
}

const STROKE_ALIGN: Record<string, Stroke['align']> = {
  INSIDE: 'inside',
  CENTER: 'center',
  OUTSIDE: 'outside',
};
const STROKE_CAP: Record<string, NonNullable<Stroke['cap']>> = {
  NONE: 'butt',
  ROUND: 'round',
  SQUARE: 'square',
};
const STROKE_JOIN: Record<string, NonNullable<Stroke['join']>> = {
  MITER: 'miter',
  ROUND: 'round',
  BEVEL: 'bevel',
};

function convertStroke(raw: Rec, w: number, h: number, ctx: Ctx): Stroke | undefined {
  const paints = convertPaints(raw.strokes, w, h, ctx);
  if (paints.length === 0) return undefined;

  let width = num(raw.strokeWeight) ?? 1;
  if (isRec(raw.individualStrokeWeights)) {
    const w4 = ['top', 'right', 'bottom', 'left']
      .map((k) => num((raw.individualStrokeWeights as Rec)[k]))
      .filter((n): n is number => n !== undefined);
    if (w4.length > 0) {
      width = Math.max(...w4);
      warn(ctx, 'espessuras de traço por lado foram ignoradas; vale a maior');
    }
  }
  if (width <= 0) return undefined;

  const dash = list(raw.strokeDashes)
    .map(num)
    .filter((n): n is number => n !== undefined);
  const capName = str(raw.strokeCap);
  let cap = capName ? STROKE_CAP[capName] : undefined;
  if (capName && !cap) {
    warn(ctx, 'pontas de seta no traço foram ignoradas');
    cap = 'butt';
  }
  const joinName = str(raw.strokeJoin);
  const join = joinName ? STROKE_JOIN[joinName] : undefined;
  const alignName = str(raw.strokeAlign);

  return {
    paints,
    width,
    align: (alignName ? STROKE_ALIGN[alignName] : undefined) ?? 'center',
    ...(dash.length > 0 ? { dash } : {}),
    ...(cap ? { cap } : {}),
    ...(join ? { join } : {}),
  };
}

function convertEffects(v: unknown, ctx: Ctx): Shadow[] {
  const out: Shadow[] = [];
  for (const e of list(v)) {
    if (!isRec(e) || e.visible === false) continue;
    const type = str(e.type);
    if (type !== 'DROP_SHADOW' && type !== 'INNER_SHADOW') {
      warn(ctx, `efeito não suportado: ${type ?? 'desconhecido'}`);
      continue;
    }
    const color = readColor(e.color) ?? { r: 0, g: 0, b: 0, a: 0.25 };
    const spread = num(e.spread);
    out.push({
      color: figmaColor(color),
      offset: readPoint(e.offset) ?? { x: 0, y: 0 },
      blur: num(e.radius) ?? 0,
      ...(spread !== undefined ? { spread } : {}),
      ...(type === 'INNER_SHADOW' ? { inner: true } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Texto e cantos
// ---------------------------------------------------------------------------------------

const H_ALIGN: Record<string, TextStyle['align']> = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
  JUSTIFIED: 'justify',
};
const V_ALIGN: Record<string, TextStyle['verticalAlign']> = {
  TOP: 'top',
  CENTER: 'middle',
  BOTTOM: 'bottom',
};

function convertTextStyle(raw: Rec, ctx: Ctx): TextStyle {
  const s = isRec(raw.style) ? raw.style : {};
  if (list(raw.characterStyleOverrides).some((o) => typeof o === 'number' && o !== 0)) {
    warn(
      ctx,
      'estilos por trecho de texto foram ignorados; vale o estilo do primeiro caractere',
    );
  }
  const italic =
    s.italic === true ||
    [s.fontPostScriptName, s.fontStyle].some(
      (n) => typeof n === 'string' && /italic/i.test(n),
    );
  const lineHeight = num(s.lineHeightPx);
  const letterSpacing = num(s.letterSpacing);
  const decorationName = str(s.textDecoration) ?? str(raw.textDecoration);
  const decoration =
    decorationName === 'UNDERLINE'
      ? 'underline'
      : decorationName === 'STRIKETHROUGH'
        ? 'line-through'
        : undefined;
  const hAlign = str(s.textAlignHorizontal);
  const vAlign = str(s.textAlignVertical);
  return {
    fontFamily: str(s.fontFamily) ?? 'sans-serif',
    fontSize: num(s.fontSize) ?? 14,
    fontWeight: num(s.fontWeight) ?? 400,
    italic,
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(letterSpacing !== undefined && letterSpacing !== 0 ? { letterSpacing } : {}),
    align: (hAlign ? H_ALIGN[hAlign] : undefined) ?? 'left',
    verticalAlign: (vAlign ? V_ALIGN[vAlign] : undefined) ?? 'top',
    ...(decoration ? { decoration } : {}),
  };
}

function readCornerRadius(raw: Rec): CornerRadius {
  const radii = list(raw.rectangleCornerRadii).map(num);
  if (radii.length === 4 && radii.every((r): r is number => r !== undefined)) {
    return [
      radii[0] as number,
      radii[1] as number,
      radii[2] as number,
      radii[3] as number,
    ];
  }
  return num(raw.cornerRadius) ?? 0;
}

// ---------------------------------------------------------------------------------------
// Nós
// ---------------------------------------------------------------------------------------

type Placement =
  | { readonly kind: 'root' }
  | { readonly kind: 'child'; readonly parentBox: Box | undefined }
  /** Nó de nível superior de uma lista: posicionado pela caixa, relativa ao menor x/y. */
  | { readonly kind: 'top'; readonly target: Point | undefined };

interface Common {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly transform: Matrix;
  readonly width: number;
  readonly height: number;
}

function warnIgnoredRotation(raw: Rec, ctx: Ctx): void {
  const rotation = num(raw.rotation);
  if (rotation !== undefined && Math.abs(rotation) > 1e-6) {
    warn(
      ctx,
      'sem relativeTransform, rotações foram ignoradas; exporte com geometry=paths',
    );
  }
}

function resolveTransform(
  raw: Rec,
  placement: Placement,
  w: number,
  h: number,
  box: Box | undefined,
  ctx: Ctx,
): Matrix {
  if (placement.kind === 'root') return IDENTITY;
  const rt = readRelativeTransform(raw.relativeTransform);
  if (placement.kind === 'top') {
    const target = placement.target;
    if (!rt) {
      warnIgnoredRotation(raw, ctx);
      return target ? translate(target.x, target.y) : IDENTITY;
    }
    if (!target) return rt;
    // Mantém rotação/escala e move para que a caixa dos cantos comece em `target`.
    const [a, b, c, d] = rt;
    const xs = [0, a * w, c * h, a * w + c * h];
    const ys = [0, b * w, d * h, b * w + d * h];
    return [a, b, c, d, target.x - Math.min(...xs), target.y - Math.min(...ys)];
  }
  if (rt) return reconcileWithBox(rt, w, h, box, placement.parentBox, ctx);
  warnIgnoredRotation(raw, ctx);
  return box && placement.parentBox
    ? translate(box.x - placement.parentBox.x, box.y - placement.parentBox.y)
    : IDENTITY;
}

/**
 * Confere o `relativeTransform` com a `absoluteBoundingBox`. No Figma, a posição de um filho de
 * GROUP (ou BOOLEAN_OPERATION) é mostrada relativa ao contêiner mais próximo (quadro ou página),
 * não ao grupo; se a API devolver assim, aplicar a matriz "como vem" deslocaria o filho duas
 * vezes. A caixa absoluta é a verdade: quando a caixa prevista pela matriz não bate com ela,
 * mantém rotação e escala e corrige só a translação (um aviso, uma vez).
 */
function reconcileWithBox(
  rt: Matrix,
  w: number,
  h: number,
  box: Box | undefined,
  parentBox: Box | undefined,
  ctx: Ctx,
): Matrix {
  if (!box || !parentBox) return rt;
  const [a, b, c, d, e, f] = rt;
  const xs = [0, a * w, c * h, a * w + c * h];
  const ys = [0, b * w, d * h, b * w + d * h];
  const predictedX = parentBox.x + e + Math.min(...xs);
  const predictedY = parentBox.y + f + Math.min(...ys);
  if (Math.abs(predictedX - box.x) <= 1 && Math.abs(predictedY - box.y) <= 1) return rt;
  warn(
    ctx,
    'relativeTransform não batia com absoluteBoundingBox (filhos de grupo?): posição corrigida pela caixa absoluta',
  );
  return [
    a,
    b,
    c,
    d,
    box.x - parentBox.x - Math.min(...xs),
    box.y - parentBox.y - Math.min(...ys),
  ];
}

const FRAME_TYPES = new Set([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
]);
const VECTOR_TYPES = new Set(['VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION']);

function convertChildren(raw: Rec, parentBox: Box | undefined, ctx: Ctx): SceneNode[] {
  const out: SceneNode[] = [];
  for (const child of list(raw.children)) {
    if (!isNode(child)) continue;
    const node = convertNode(child, { kind: 'child', parentBox }, ctx);
    if (node) out.push(node);
  }
  return out;
}

function convertNode(raw: Rec, placement: Placement, ctx: Ctx): SceneNode | undefined {
  const type = str(raw.type) ?? 'UNKNOWN';
  if (type === 'SLICE') return undefined;

  const id = str(raw.id) ?? `figma-${++ctx.counter}`;
  const name = str(raw.name) ?? type.toLowerCase();
  const box = readBox(raw.absoluteBoundingBox);
  const size = isRec(raw.size) ? readPoint(raw.size) : undefined;
  const width = size?.x ?? box?.width ?? 0;
  const height = size?.y ?? box?.height ?? 0;
  const common: Common = {
    id,
    name,
    visible: raw.visible !== false,
    opacity: num(raw.opacity) ?? 1,
    transform: resolveTransform(raw, placement, width, height, box, ctx),
    width,
    height,
  };
  checkBlendMode(raw.blendMode, ctx);
  const fills = convertPaints(raw.fills, width, height, ctx);
  const stroke = convertStroke(raw, width, height, ctx);
  const effects = convertEffects(raw.effects, ctx);
  const base = (): ReturnType<typeof baseNode> =>
    baseNode({ ...common, fills, effects, ...(stroke ? { stroke } : {}) });

  if (FRAME_TYPES.has(type)) {
    return {
      ...base(),
      type: 'frame',
      clip: type === 'SECTION' ? false : raw.clipsContent === true,
      cornerRadius: readCornerRadius(raw),
      children: convertChildren(raw, box, ctx),
    };
  }

  switch (type) {
    case 'GROUP':
      return { ...base(), type: 'group', children: convertChildren(raw, box, ctx) };
    case 'RECTANGLE':
      return { ...base(), type: 'rect', cornerRadius: readCornerRadius(raw) };
    case 'ELLIPSE': {
      const arc = isRec(raw.arcData) ? raw.arcData : undefined;
      if (arc) {
        const sweep =
          (num(arc.endingAngle) ?? 2 * Math.PI) - (num(arc.startingAngle) ?? 0);
        const partial = Math.abs(Math.abs(sweep) - 2 * Math.PI) > 1e-3;
        if (partial || (num(arc.innerRadius) ?? 0) > 0) {
          warn(ctx, 'arcos de elipse foram desenhados como elipses inteiras');
        }
      }
      return { ...base(), type: 'ellipse' };
    }
    case 'LINE':
      return {
        ...baseNode({ ...common, fills: [], effects, ...(stroke ? { stroke } : {}) }),
        type: 'line',
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
        ],
        closed: false,
      };
    case 'TEXT':
      return {
        ...base(),
        type: 'text',
        text: typeof raw.characters === 'string' ? raw.characters : '',
        style: convertTextStyle(raw, ctx),
      };
    default:
      break;
  }

  if (VECTOR_TYPES.has(type)) {
    const vector = convertVector(raw, common, fills, stroke, effects);
    if (vector) return vector;
    warn(ctx, 'vetores sem fillGeometry: exporte com geometry=paths');
  } else {
    warn(ctx, `tipo não suportado: ${type}`);
  }
  return { ...base(), type: 'unknown', sourceType: type };
}

interface Geometry {
  readonly path: string;
  readonly rule: PathNode['fillRule'];
}

function readGeometry(v: unknown): Geometry[] {
  const out: Geometry[] = [];
  for (const g of list(v)) {
    const path = isRec(g) ? str(g.path) : undefined;
    if (!isRec(g) || !path) continue;
    out.push({ path, rule: g.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero' });
  }
  return out;
}

/**
 * Vetores viram `path` a partir de `fillGeometry`/`strokeGeometry` (o Figma já contorna o
 * traço). Vários caminhos ficam num `group` com a identidade do nó. Sem nenhuma das duas
 * listas devolve `undefined` (o chamador faz o nó `unknown`).
 */
function convertVector(
  raw: Rec,
  common: Common,
  fills: readonly Paint[],
  stroke: Stroke | undefined,
  effects: readonly Shadow[],
): SceneNode | undefined {
  const fillGeo = readGeometry(raw.fillGeometry);
  const strokeGeo = readGeometry(raw.strokeGeometry);
  if (!Array.isArray(raw.fillGeometry) && !Array.isArray(raw.strokeGeometry))
    return undefined;

  // Sem `strokeGeometry`, o traço fica no próprio caminho de preenchimento.
  const keepStroke = stroke !== undefined && strokeGeo.length === 0;
  const parts: {
    name: string;
    id: string;
    geo: Geometry;
    fills: readonly Paint[];
    stroke?: Stroke;
  }[] = [];
  if (fills.length > 0 || keepStroke) {
    fillGeo.forEach((geo, i) =>
      parts.push({
        name: `${common.name} (fill ${i + 1})`,
        id: `${common.id}:fill-${i}`,
        geo,
        fills,
        ...(keepStroke ? { stroke } : {}),
      }),
    );
  }
  if (stroke && strokeGeo.length > 0) {
    strokeGeo.forEach((geo, i) =>
      parts.push({
        name: `${common.name} (stroke ${i + 1})`,
        id: `${common.id}:stroke-${i}`,
        geo,
        fills: stroke.paints,
      }),
    );
  }

  const pathNode = (
    part: (typeof parts)[number],
    own: Partial<Common> & { effects?: readonly Shadow[] },
  ): PathNode => ({
    ...baseNode({
      ...common,
      id: part.id,
      name: part.name,
      fills: part.fills,
      effects: [],
      ...(part.stroke ? { stroke: part.stroke } : {}),
      ...own,
    }),
    type: 'path',
    d: part.geo.path,
    fillRule: part.geo.rule,
  });

  const [only] = parts;
  if (parts.length === 1 && only) {
    return pathNode(only, { id: common.id, name: common.name, effects });
  }
  return {
    ...baseNode({ ...common, effects }),
    type: 'group',
    children: parts.map((part) =>
      pathNode(part, { transform: IDENTITY, visible: true, opacity: 1 }),
    ),
  };
}

// ---------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------

/** Filhos de uma página (`CANVAS`). */
function canvasNodes(canvas: Rec): Rec[] {
  const nodes = list(canvas.children).filter(isNode);
  if (nodes.length === 0) throw fail('a página não tem nenhum nó');
  return nodes;
}

function fromNode(node: Rec, ctx: Ctx): Rec[] {
  if (node.type === 'DOCUMENT') {
    const canvases = list(node.children).filter(
      (c): c is Rec => isNode(c) && c.type === 'CANVAS',
    );
    const [first] = canvases;
    if (!first) throw fail('o documento não tem nenhuma página (CANVAS)');
    if (canvases.length > 1) {
      warn(
        ctx,
        `o arquivo tem ${canvases.length} páginas; só a primeira (${str(first.name) ?? 'sem nome'}) foi convertida`,
      );
    }
    return canvasNodes(first);
  }
  if (node.type === 'CANVAS') return canvasNodes(node);
  return [node];
}

function extractNodes(input: unknown, ctx: Ctx): Rec[] {
  if (Array.isArray(input)) {
    const nodes = input.filter(isNode);
    if (nodes.length === 0) throw fail('a lista não tem nenhum nó');
    return nodes;
  }
  if (!isRec(input))
    throw fail('esperado um objeto (nó, "nodes" ou "document") ou uma lista de nós');

  if (isRec(input.nodes)) {
    const out: Rec[] = [];
    for (const [key, entry] of Object.entries(input.nodes)) {
      if (isRec(entry) && isNode(entry.document)) out.push(entry.document);
      else warn(ctx, `o nó ${key} não veio na resposta e foi ignorado`);
    }
    if (out.length === 0) throw fail('a resposta não tem nenhum nó em "nodes"');
    return out;
  }
  if (isRec(input.document)) {
    if (!isNode(input.document)) throw fail('"document" não é um nó');
    return fromNode(input.document, ctx);
  }
  if (isNode(input)) return fromNode(input, ctx);
  throw fail('nenhum nó reconhecido (esperado "nodes", "document" ou um nó com "type")');
}

/** Converte nós do JSON da API REST do Figma (formas aceitas na documentação do módulo). */
export function figmaJsonToScene(input: unknown): Scene {
  const ctx: Ctx = { warnings: new Set(), counter: 0, imageFills: 0 };
  const raws = extractNodes(input, ctx).filter((r) => r.type !== 'SLICE');
  const [first] = raws;
  if (!first) throw fail('só há fatias (SLICE), nada para desenhar');

  let root: SceneNode | undefined;
  if (raws.length === 1) {
    root = convertNode(first, { kind: 'root' }, ctx);
  } else {
    const boxes = raws.map((r) => readBox(r.absoluteBoundingBox));
    const present = boxes.filter((b): b is Box => b !== undefined);
    const minX = present.length ? Math.min(...present.map((b) => b.x)) : 0;
    const minY = present.length ? Math.min(...present.map((b) => b.y)) : 0;
    const maxX = present.length ? Math.max(...present.map((b) => b.x + b.width)) : 0;
    const maxY = present.length ? Math.max(...present.map((b) => b.y + b.height)) : 0;
    const children: SceneNode[] = [];
    raws.forEach((raw, i) => {
      const box = boxes[i];
      const target = box ? { x: box.x - minX, y: box.y - minY } : undefined;
      const node = convertNode(raw, { kind: 'top', target }, ctx);
      if (node) children.push(node);
    });
    root = {
      ...baseNode({
        id: 'nodes',
        name: 'nodes',
        width: maxX - minX,
        height: maxY - minY,
      }),
      type: 'group',
      children,
    };
  }
  if (!root) throw fail('nenhum nó desenhável');

  if (ctx.imageFills > 0) {
    warn(
      ctx,
      `${ctx.imageFills} preenchimento(s) de imagem sem os pixels (imageRef): desenhados como reservado`,
    );
  }
  return { source: 'figma-json', root, warnings: [...ctx.warnings] };
}
