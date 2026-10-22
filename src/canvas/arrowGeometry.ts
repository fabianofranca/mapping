// Geometria das setas no canvas (v13, ME4): a polilinha/curva desenhada, o hit-test pelo traço, as
// alças da seta selecionada e a alça de ligação de uma marcação. Funções puras (sem DOM nem Konva),
// testadas em `tests/canvas/arrowGeometry.test.ts`. Tudo em unidades do canvas; as distâncias de
// toque entram em px de tela e são divididas pelo zoom.
import {
  arrowRoute,
  fromCanvasPoint,
  projectIndex,
  type Arrow,
  type ArrowEnd,
  type ArrowPoint,
  type ArrowRoute,
  type ArrowSide,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';
import type { Point } from './viewport';

/** Distância (px de tela) do traço em que o toque ainda pega a seta. */
export const ARROW_HIT_TOLERANCE = 7;
/** Raio de toque (px de tela) das alças da seta selecionada e da alça de ligação. */
export const ARROW_HANDLE_HIT_RADIUS = 10;
/** Trecho curto demais (px de tela) não ganha a alça do meio: ela cairia sobre as vizinhas. */
export const ARROW_MID_HANDLE_MIN = 3 * ARROW_HANDLE_HIT_RADIUS;
/** Distância (px de tela) da alça de ligação até a borda direita da marcação. */
export const LINK_HANDLE_OFFSET = 14;
/** Amostras de cada trecho de uma curva (par, para o meio cair numa amostra). */
const CURVE_SAMPLES = 16;
/** A tangente de um ponto de passagem é essa fração da corda entre os vizinhos (Catmull-Rom). */
const TANGENT_FACTOR = 0.5;

/** A seta pronta para desenhar e tocar. */
export interface ArrowShape {
  readonly arrow: Arrow;
  /** Âncoras e pontos de passagem (canvas), com os lados efetivos. */
  readonly route: ArrowRoute;
  /**
   * O traço: os pontos da rota no `straight` e no `elbow`; no `curve`, a curva amostrada (o
   * mesmo desenho e o mesmo alvo do toque).
   */
  readonly path: readonly Point[];
  /** O meio do traço de cada trecho da rota (um a menos que `route.points`). */
  readonly mids: readonly Point[];
  /** O meio do traço pelo comprimento: onde fica o rótulo. */
  readonly label: Point;
  /** Caixa do traço (sem a espessura nem a ponta). */
  readonly bounds: Rect;
}

// ---------------------------------------------------------------------------
// Traço

function normalOf(side: ArrowSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A curva pelos pontos da rota: Hermite cúbica por trecho (como a suavização do Konva, com
 * tangentes de Catmull-Rom nos pontos de passagem). Nas pontas a tangente sai perpendicular ao
 * lado da marcação, então até a seta sem pontos de passagem faz um S entre os lados.
 */
export function curvePath(
  points: readonly Point[],
  fromSide: ArrowSide,
  toSide: ArrowSide,
): { readonly path: Point[]; readonly mids: Point[] } {
  const n = points.length;
  const path: Point[] = [];
  const mids: Point[] = [];
  const first = points[0];
  if (!first || n < 2) return { path: first ? [first] : [], mids };
  const tangent = (i: number): Point => {
    const at = points[i] as Point;
    if (i === 0) {
      const d = dist(at, points[1] as Point);
      const u = normalOf(fromSide);
      return { x: u.x * d, y: u.y * d };
    }
    if (i === n - 1) {
      const d = dist(at, points[n - 2] as Point);
      const u = normalOf(toSide);
      return { x: -u.x * d, y: -u.y * d };
    }
    const prev = points[i - 1] as Point;
    const next = points[i + 1] as Point;
    return {
      x: (next.x - prev.x) * TANGENT_FACTOR,
      y: (next.y - prev.y) * TANGENT_FACTOR,
    };
  };
  path.push(first);
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i] as Point;
    const p3 = points[i + 1] as Point;
    const t0 = tangent(i);
    const t1 = tangent(i + 1);
    const p1 = { x: p0.x + t0.x / 3, y: p0.y + t0.y / 3 };
    const p2 = { x: p3.x - t1.x / 3, y: p3.y - t1.y / 3 };
    const at = (t: number): Point => {
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      return {
        x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
      };
    };
    for (let k = 1; k <= CURVE_SAMPLES; k++) path.push(at(k / CURVE_SAMPLES));
    mids.push(at(0.5));
  }
  return { path, mids };
}

/** O ponto a meio caminho do comprimento da polilinha. */
export function pathMidpoint(path: readonly Point[]): Point {
  const first = path[0];
  if (!first) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < path.length; i++)
    total += dist(path[i - 1] as Point, path[i] as Point);
  if (total === 0) return first;
  let left = total / 2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const length = dist(a, b);
    if (left <= length && length > 0) {
      const t = left / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= length;
  }
  return path[path.length - 1] as Point;
}

function boundsOf(path: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0)
    ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    : { x: 0, y: 0, width: 0, height: 0 };
}

/** Monta o desenho da seta a partir da rota (`arrowRoute`). */
export function shapeOf(arrow: Arrow, route: ArrowRoute): ArrowShape {
  const points = route.points;
  let path: readonly Point[] = points;
  let mids: readonly Point[];
  if (arrow.style === 'curve') {
    const curve = curvePath(points, route.fromSide, route.toSide);
    path = curve.path;
    mids = curve.mids;
  } else {
    mids = points.slice(1).map((p, i) => {
      const a = points[i] as Point;
      return { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
    });
  }
  return { arrow, route, path, mids, label: pathMidpoint(path), bounds: boundsOf(path) };
}

// ---------------------------------------------------------------------------
// Do projeto para as setas desenhadas

interface ShapeEntry {
  readonly from: Marking;
  readonly to: Marking;
  readonly fromContainer: ProjectContainer | undefined;
  readonly toContainer: ProjectContainer | undefined;
  readonly shape: ArrowShape | null;
}

const shapeCache = new WeakMap<Arrow, ShapeEntry>();

/**
 * O desenho da seta no projeto, `null` se uma ponta não existe. Guardado por seta: o mesmo objeto
 * enquanto a seta, as duas marcações e os containers delas são os mesmos, então um gesto que mexe
 * numa marcação refaz só as setas presas a ela.
 */
export function arrowShape(project: Project, arrow: Arrow): ArrowShape | null {
  const index = projectIndex(project);
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to) return null;
  const fromContainer =
    from.containerId === null ? undefined : index.containers.get(from.containerId);
  const toContainer =
    to.containerId === null ? undefined : index.containers.get(to.containerId);
  const cached = shapeCache.get(arrow);
  if (
    cached &&
    cached.from === from &&
    cached.to === to &&
    cached.fromContainer === fromContainer &&
    cached.toContainer === toContainer
  ) {
    return cached.shape;
  }
  const route = arrowRoute(project, arrow);
  const shape = route ? shapeOf(arrow, route) : null;
  shapeCache.set(arrow, { from, to, fromContainer, toContainer, shape });
  return shape;
}

const NO_SHAPES: readonly ArrowShape[] = [];
let lastVisible: {
  readonly project: Project;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  readonly result: readonly ArrowShape[];
} | null = null;

function sameShapes(a: readonly ArrowShape[], b: readonly ArrowShape[]): boolean {
  return a.length === b.length && a.every((shape, i) => shape === b[i]);
}

/**
 * As setas que aparecem: as duas pontas existem e nenhuma está oculta pelo modo de exibição
 * (`visibility`; sem entrada, visível). Na ordem do projeto (a última fica por cima). Guardado pelo
 * projeto e pela visibilidade, e o mesmo array enquanto as setas desenhadas forem as mesmas:
 * pan e zoom não passam por aqui, e editar o que não é seta não redesenha as setas.
 */
export function visibleArrowShapes(
  project: Project | null,
  visibility: ReadonlyMap<string, MarkingVisibility>,
): readonly ArrowShape[] {
  if (!project || project.arrows.length === 0) return NO_SHAPES;
  if (lastVisible?.project === project && lastVisible.visibility === visibility) {
    return lastVisible.result;
  }
  const shapes: ArrowShape[] = [];
  for (const arrow of project.arrows) {
    if (
      visibility.get(arrow.from) === 'hidden' ||
      visibility.get(arrow.to) === 'hidden'
    ) {
      continue;
    }
    const shape = arrowShape(project, arrow);
    if (shape) shapes.push(shape);
  }
  const previous = lastVisible?.result ?? NO_SHAPES;
  const result = sameShapes(previous, shapes) ? previous : shapes;
  lastVisible = { project, visibility, result };
  return result;
}

// ---------------------------------------------------------------------------
// Toque

/** Distância do ponto `p` ao segmento `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Distância do ponto ao traço (a menor entre os segmentos). */
export function distanceToPath(p: Point, path: readonly Point[]): number {
  const only = path[0];
  if (!only) return Infinity;
  if (path.length === 1) return dist(p, only);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    best = Math.min(best, distanceToSegment(p, path[i - 1] as Point, path[i] as Point));
  }
  return best;
}

/**
 * Setas sob o ponto `c` (canvas): as que têm o traço a até `tolerance` px de tela, a mais perto
 * primeiro; no empate, a de cima (a última do array).
 */
export function arrowsAt(
  shapes: readonly ArrowShape[],
  c: Point,
  zoom: number,
  tolerance = ARROW_HIT_TOLERANCE,
): ArrowShape[] {
  const reach = tolerance / zoom;
  const hits: {
    readonly shape: ArrowShape;
    readonly distance: number;
    readonly order: number;
  }[] = [];
  shapes.forEach((shape, order) => {
    const b = shape.bounds;
    if (
      c.x < b.x - reach ||
      c.x > b.x + b.width + reach ||
      c.y < b.y - reach ||
      c.y > b.y + b.height + reach
    ) {
      return;
    }
    const distance = distanceToPath(c, shape.path);
    if (distance <= reach) hits.push({ shape, distance, order });
  });
  hits.sort((x, y) => x.distance - y.distance || y.order - x.order);
  return hits.map((hit) => hit.shape);
}

// ---------------------------------------------------------------------------
// Alças

/**
 * Uma alça da seta selecionada: a ponta (`end`, arrastar até outra marcação ou outro lado), um
 * ponto de passagem (`point`, `index` em `arrow.points`: mover; clique duplo remove), o meio de
 * um trecho (`mid`, `index` = onde o ponto novo entra em `arrow.points`: arrastar o cria) ou, só
 * no `elbow`, um segmento do meio (`segment`, `index` = a pista em `arrow.points` e `route.lanes`;
 * `axis` = a coordenada que ele fixa: arrastar o move em paralelo, e o clique duplo volta à rota
 * padrão). O `elbow` não tem `point` nem `mid`: `points` ali são os segmentos.
 */
export type ArrowHandle =
  | { readonly kind: 'end'; readonly end: ArrowEnd; readonly at: Point }
  | { readonly kind: 'point'; readonly index: number; readonly at: Point }
  | { readonly kind: 'mid'; readonly index: number; readonly at: Point }
  | {
      readonly kind: 'segment';
      readonly index: number;
      readonly axis: 'x' | 'y';
      readonly at: Point;
    };

/**
 * As alças da seta, na ordem de prioridade do toque: as duas pontas, os pontos de passagem, os
 * meios dos trechos (só dos que têm `ARROW_MID_HANDLE_MIN` px de tela ou mais). No `elbow`, as
 * pontas e o meio de cada segmento do meio (com o mesmo comprimento mínimo).
 */
export function arrowHandles(shape: ArrowShape, zoom: number): ArrowHandle[] {
  const points = shape.route.points;
  const handles: ArrowHandle[] = [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return handles;
  handles.push(
    { kind: 'end', end: 'from', at: first },
    { kind: 'end', end: 'to', at: last },
  );
  if (shape.arrow.style === 'elbow') {
    shape.route.lanes.forEach((lane, index) => {
      const a = points[index + 1] as Point;
      const b = points[index + 2] as Point;
      if (dist(a, b) * zoom >= ARROW_MID_HANDLE_MIN) {
        handles.push({
          kind: 'segment',
          index,
          axis: lane.axis,
          at: shape.mids[index + 1] as Point,
        });
      }
    });
    return handles;
  }
  for (let i = 1; i < points.length - 1; i++) {
    handles.push({ kind: 'point', index: i - 1, at: points[i] as Point });
  }
  shape.mids.forEach((at, i) => {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (dist(a, b) * zoom >= ARROW_MID_HANDLE_MIN)
      handles.push({ kind: 'mid', index: i, at });
  });
  return handles;
}

/**
 * A alça do segmento do meio de uma seta `elbow` sob `c`: o segmento inteiro pega o toque (não só
 * a alça do meio), o mais perto primeiro; segmento de comprimento zero não pega.
 */
function segmentHandleAt(shape: ArrowShape, c: Point, zoom: number): ArrowHandle | null {
  const points = shape.route.points;
  const reach = ARROW_HIT_TOLERANCE / zoom;
  let best: ArrowHandle | null = null;
  let bestDistance = Infinity;
  shape.route.lanes.forEach((lane, index) => {
    const a = points[index + 1] as Point;
    const b = points[index + 2] as Point;
    if (a.x === b.x && a.y === b.y) return;
    const distance = distanceToSegment(c, a, b);
    if (distance <= reach && distance < bestDistance) {
      best = {
        kind: 'segment',
        index,
        axis: lane.axis,
        at: shape.mids[index + 1] as Point,
      };
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Os pontos de passagem de uma seta `elbow` com uma pista por segmento do meio, para o gesto que
 * move um segmento: os gravados, se casam com a rota (`arrow.points`), ou o meio de cada segmento
 * da rota padrão, no espaço dos pontos (`placement`), arredondado para o pixel.
 */
export function elbowLanePoints(shape: ArrowShape, placement: Placement): ArrowPoint[] {
  const { arrow, route } = shape;
  if (arrow.points.length === route.lanes.length) return [...arrow.points];
  return route.lanes.map((_, index) => {
    const at = fromCanvasPoint(placement, shape.mids[index + 1] as Point);
    return { x: Math.round(at.x), y: Math.round(at.y) };
  });
}

/** A alça sob `c`: a primeira da ordem de prioridade, e entre as do mesmo tipo a mais perto. */
export function arrowHandleAt(
  shape: ArrowShape,
  c: Point,
  zoom: number,
  radius = ARROW_HANDLE_HIT_RADIUS,
): ArrowHandle | null {
  const reach = radius / zoom;
  let best: ArrowHandle | null = null;
  let bestDistance = Infinity;
  for (const handle of arrowHandles(shape, zoom)) {
    if (best && best.kind !== handle.kind) break;
    const distance = dist(c, handle.at);
    if (distance <= reach && distance < bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  if (!best && shape.arrow.style === 'elbow') return segmentHandleAt(shape, c, zoom);
  return best;
}

/** Centro da alça de ligação da marcação (canvas): fora da borda direita, no meio do lado. */
export function linkHandlePoint(rect: Rect, zoom: number): Point {
  return {
    x: rect.x + rect.width + LINK_HANDLE_OFFSET / zoom,
    y: rect.y + rect.height / 2,
  };
}

/** O ponto `c` está sobre a alça de ligação do retângulo? */
export function isOnLinkHandle(rect: Rect, c: Point, zoom: number): boolean {
  return dist(c, linkHandlePoint(rect, zoom)) <= ARROW_HANDLE_HIT_RADIUS / zoom;
}

/**
 * O lado do retângulo mais perto do ponto (distância ao segmento de cada lado; empate na ordem
 * `top`, `right`, `bottom`, `left`). Dentro do retângulo, o lado de borda mais perto.
 */
export function nearestSide(rect: Rect, p: Point): ArrowSide {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  const sides: readonly [ArrowSide, number][] = [
    ['top', distanceToSegment(p, { x: rect.x, y: rect.y }, { x: x1, y: rect.y })],
    ['right', distanceToSegment(p, { x: x1, y: rect.y }, { x: x1, y: y1 })],
    ['bottom', distanceToSegment(p, { x: rect.x, y: y1 }, { x: x1, y: y1 })],
    ['left', distanceToSegment(p, { x: rect.x, y: rect.y }, { x: rect.x, y: y1 })],
  ];
  let best = sides[0] as [ArrowSide, number];
  for (const side of sides) if (side[1] < best[1]) best = side;
  return best[0];
}

/** Direção (versor) em que a ponta da seta aponta: do penúltimo ao último ponto distinto do traço. */
export function headDirection(path: readonly Point[]): Point {
  const last = path[path.length - 1];
  if (!last) return { x: 1, y: 0 };
  for (let i = path.length - 2; i >= 0; i--) {
    const prev = path[i] as Point;
    const d = dist(prev, last);
    if (d > 1e-6) return { x: (last.x - prev.x) / d, y: (last.y - prev.y) / d };
  }
  return { x: 1, y: 0 };
}

/**
 * O traço sem os últimos `length` de comprimento (a ponta cobre esse trecho): o traço não fura a
 * ponta pelos lados. Mais curto que `length`, sobra o primeiro ponto.
 */
export function trimPathEnd(path: readonly Point[], length: number): Point[] {
  const out = [...path];
  let left = length;
  while (out.length > 1) {
    const last = out[out.length - 1] as Point;
    const prev = out[out.length - 2] as Point;
    const d = dist(prev, last);
    if (d > left) {
      const t = (d - left) / d;
      out[out.length - 1] = {
        x: prev.x + (last.x - prev.x) * t,
        y: prev.y + (last.y - prev.y) * t,
      };
      return out;
    }
    left -= d;
    out.pop();
  }
  return out;
}

/** Largura da ponta (de lado a lado) como fração do comprimento dela. */
const HEAD_WIDTH_RATIO = 0.9;

/**
 * A ponta de seta: um triângulo com a ponta em `tip`, apontando na direção `dir` (versor), de
 * comprimento `length`. Lista plana de pontos para o Konva.
 */
export function headPoints(tip: Point, dir: Point, length: number): number[] {
  const bx = tip.x - dir.x * length;
  const by = tip.y - dir.y * length;
  const half = (length * HEAD_WIDTH_RATIO) / 2;
  return [
    tip.x,
    tip.y,
    bx - dir.y * half,
    by + dir.x * half,
    bx + dir.y * half,
    by - dir.x * half,
  ];
}

/** Os pontos do traço como a lista plana `[x0, y0, x1, y1, …]` do Konva. */
export function flatPoints(path: readonly Point[]): number[] {
  const flat: number[] = [];
  for (const p of path) flat.push(p.x, p.y);
  return flat;
}

/** O que se desenha de todas as setas num zoom: os traços (sem o fim, que a ponta cobre) e as pontas. */
export interface ArrowStrokes {
  /** Lista plana `[x0, y0, x1, y1, …]` do traço de cada seta, menos o trecho da ponta. */
  readonly bodies: readonly (readonly number[])[];
  /** O mesmo para as setas `elbow`, que o desenho pinta com cantos vivos (junção em esquadro). */
  readonly corners: readonly (readonly number[])[];
  /** Triângulo de cada ponta, lista plana de três pontos. */
  readonly heads: readonly (readonly number[])[];
}

/** Fração do comprimento da ponta que o traço deixa de fora (a ponta o cobre). */
const HEAD_OVERLAP = 0.9;
/** Pontos do traço mais perto que isto (px de tela) um do outro não mudam o que se vê. */
const DRAW_SPACING = 2;

/** O traço sem os pontos a menos de `spacing` do anterior mantido (o primeiro e o último ficam). */
export function thinPath(path: readonly Point[], spacing: number): Point[] {
  const first = path[0];
  if (!first) return [];
  const out: Point[] = [first];
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i] as Point;
    if (dist(p, out[out.length - 1] as Point) >= spacing) out.push(p);
  }
  if (path.length > 1) out.push(path[path.length - 1] as Point);
  return out;
}

/**
 * O desenho das setas a `zoom`, com a ponta de `headPx` px de tela: o comprimento dela em unidades
 * do canvas é `headPx / zoom`. Só depende das formas e do zoom (pan não recalcula).
 */
export function arrowStrokes(
  shapes: readonly ArrowShape[],
  zoom: number,
  headPx: number,
): ArrowStrokes {
  const length = headPx / zoom;
  const bodies: number[][] = [];
  const corners: number[][] = [];
  const heads: number[][] = [];
  for (const shape of shapes) {
    const tip = shape.path[shape.path.length - 1];
    if (!tip) continue;
    const trimmed = trimPathEnd(shape.path, length * HEAD_OVERLAP);
    // O canto não é afinado: tirar um ponto perto do outro comeria a dobra de um trecho curto.
    const flat = flatPoints(
      shape.arrow.style === 'elbow' ? trimmed : thinPath(trimmed, DRAW_SPACING / zoom),
    );
    (shape.arrow.style === 'elbow' ? corners : bodies).push(flat);
    heads.push(headPoints(tip, headDirection(shape.path), length));
  }
  return { bodies, corners, heads };
}
