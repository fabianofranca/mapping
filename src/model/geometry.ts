import { fail, type RectTooSmallData } from './errors';
import type { ArrowPoint, Placement, ProjectContainer, Rect } from './types';

/**
 * Tamanho mínimo de cada lado de uma marcação **comum** (sem componente) nos gestos e no MCP,
 * em pixels da imagem.
 */
export const MIN_MARKING_SIZE = 8;

/**
 * Mínimo de cada lado de uma marcação com anotação de tipo **com componente** (o `minSize` do
 * componente, se houver, vale por cima) e de qualquer marcação ao ler o `mapping.json`.
 */
export const MIN_STORED_MARKING_SIZE = 1;

/** Base do mínimo: 1 px quando há mínimo de componente (`componentMin`), 8 px (`MIN_MARKING_SIZE`) sem ele. */
export function markingMinBase(componentMin?: Size | null): number {
  return componentMin ? MIN_STORED_MARKING_SIZE : MIN_MARKING_SIZE;
}

/** Mínimo efetivo por lado: a base (1 ou 8) ou, quando maior, o `minSize` do componente. */
export function effectiveMinSize(componentMin?: Size | null): Size {
  const base = markingMinBase(componentMin);
  return {
    width: Math.max(base, componentMin?.width ?? 0),
    height: Math.max(base, componentMin?.height ?? 0),
  };
}

/**
 * Falha com `rect-too-small` se algum lado do retângulo ficar abaixo do mínimo: 8 px numa
 * marcação comum, 1 px (ou o `minSize` do componente, se maior) quando `componentMin` é dado,
 * isto é, quando a marcação desenha um componente. O `data` do erro diz o tamanho recebido, o
 * mínimo que valeu e de onde ele veio (`component` quando `componentMin` foi dado).
 */
export function checkRectSize(
  rect: Pick<Rect, 'width' | 'height'>,
  componentMin?: Size | null,
): void {
  const min = effectiveMinSize(componentMin);
  if (rect.width >= min.width && rect.height >= min.height) return;
  const data: RectTooSmallData = {
    received: { width: rect.width, height: rect.height },
    min,
    source: componentMin ? 'component' : 'marking',
  };
  fail('rect-too-small', undefined, data);
}

/** Tolerância para comparar coordenadas do canvas (ponto flutuante). */
const EPSILON = 1e-6;

/**
 * Tira o ruído de ponto flutuante: perto de um inteiro (a menos de `eps`) devolve o inteiro,
 * nunca `-0`; fração de verdade (`1868.13`, `0.5`) fica como está. Valor não finito passa.
 */
export function snapNearInteger(v: number, eps: number = EPSILON): number {
  const rounded = Math.round(v);
  if (!Number.isFinite(v) || Math.abs(v - rounded) >= eps) return v;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Limpa o ruído de ponto flutuante do `placement` de um container: `x`, `y` e `scale` passam pelo
 * `snapNearInteger`, mas a escala só vira inteiro se ele for >= 1 (uma escala minúscula nunca vira 0).
 * Fração de verdade (arrasto com zoom, `1868.13`) fica como está.
 */
export function snapPlacement(p: Placement): Placement {
  const scale = snapNearInteger(p.scale);
  return {
    x: snapNearInteger(p.x),
    y: snapNearInteger(p.y),
    scale: scale >= 1 ? scale : p.scale,
  };
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function area(r: Rect): number {
  return r.width * r.height;
}

/** `inner` totalmente dentro de `outer` (bordas coincidentes contam como dentro). */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  );
}

/** Sobreposição com área positiva. Retângulos que só encostam não se sobrepõem. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < right(b) - EPSILON &&
    b.x < right(a) - EPSILON &&
    a.y < bottom(b) - EPSILON &&
    b.y < bottom(a) - EPSILON
  );
}

/**
 * O maior deslocamento de `moving` (retângulos que andam juntos) até `dx`, `dy` sem sobrepor
 * `fixed`, **eixo a eixo**: primeiro o x (contra os fixos que o y atual cruza), depois o y (com o
 * x já aplicado), só quando o destino pedido sobrepõe um fixo, de modo que o movimento encosta no obstáculo (borda igual, distância 0) e
 * desliza ao longo dele no outro eixo. Deslocamento que cabe volta como está. Quem já se
 * sobrepõe não limita (não há "passar por dentro" a evitar).
 */
export function slideToTouch(
  moving: readonly Rect[],
  fixed: readonly Rect[],
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const lands = moving.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
  // Destino livre: fica como está (inclusive "passando por cima" de um container no caminho).
  if (!lands.some((m) => fixed.some((f) => rectsOverlap(m, f)))) return { dx, dy };
  const limitedX = limitX(moving, fixed, dx);
  const flip = (r: Rect): Rect => ({ x: r.y, y: r.x, width: r.height, height: r.width });
  const limitedY = limitX(
    moving.map((r) => flip({ ...r, x: r.x + limitedX })),
    fixed.map(flip),
    dy,
  );
  return { dx: limitedX, dy: limitedY };
}

/** O maior deslocamento em x, até `delta`, sem passar de um fixo que o y atual cruza. */
function limitX(moving: readonly Rect[], fixed: readonly Rect[], delta: number): number {
  let limit = Math.abs(delta);
  for (const m of moving) {
    for (const f of fixed) {
      if (m.y >= bottom(f) - EPSILON || f.y >= bottom(m) - EPSILON) continue;
      const gap = delta > 0 ? f.x - right(m) : m.x - right(f);
      if (gap >= -EPSILON) limit = Math.min(limit, Math.max(0, gap));
    }
  }
  return Math.sign(delta) * limit || 0;
}

export function boundingBox(rects: readonly Rect[]): Rect | null {
  const first = rects[0];
  if (!first) return null;
  let x0 = first.x;
  let y0 = first.y;
  let x1 = right(first);
  let y1 = bottom(first);
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, right(r));
    y1 = Math.max(y1, bottom(r));
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

export function isIntegerRect(r: Rect): boolean {
  return [r.x, r.y, r.width, r.height].every(Number.isInteger);
}

/** Retângulo da imagem inteira, em pixels da imagem. */
export function imagePixelRect(image: Pick<ProjectContainer, 'width' | 'height'>): Rect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

/** Retângulo ocupado pela imagem no canvas, em unidades do canvas. */
export function imageCanvasRect(
  image: Pick<ProjectContainer, 'width' | 'height'>,
  placement: Placement,
): Rect {
  return {
    x: placement.x,
    y: placement.y,
    width: image.width * placement.scale,
    height: image.height * placement.scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Espaços de coordenadas (v13): o de cada container (pixels inteiros dele) e o do canvas
// (unidades inteiras do canvas). Uma marcação vive num só espaço; o assentar
// (`hierarchySettle.ts`) decide qual e converte o `rect`.

/** `placement` do espaço do canvas: unidades do canvas são os "pixels" dele. */
export const IDENTITY_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Retângulo de um espaço (`placement` do container ou identidade) em unidades do canvas (decimal). */
export function toCanvasRect(placement: Placement, rect: Rect): Rect {
  return {
    x: placement.x + rect.x * placement.scale,
    y: placement.y + rect.y * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}

/** Ponto de um espaço (pixels do container, ou o canvas com `placement` identidade) em unidades do canvas. */
export function toCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: placement.x + point.x * placement.scale,
    y: placement.y + point.y * placement.scale,
  };
}

/** Ponto do canvas no espaço de `placement`: o inverso de `toCanvasPoint` (sem arredondar). */
export function fromCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: (point.x - placement.x) / placement.scale,
    y: (point.y - placement.y) / placement.scale,
  };
}

/** `containsRect` com folga de ponto flutuante (coordenadas do canvas, decimais). */
export function containsRectApprox(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    right(inner) <= right(outer) + EPSILON &&
    bottom(inner) <= bottom(outer) + EPSILON
  );
}

/** Arredonda um intervalo pelas bordas e garante o mínimo, preso a [min, max) se houver. */
function roundSpan(
  start: number,
  size: number,
  minimum: number,
  lo: number,
  hi: number,
): [number, number] {
  const a = Math.round(start);
  const width = Math.max(Math.round(start + size) - a, minimum);
  if (width >= hi - lo) return [lo, Math.min(width, hi - lo)];
  return [clamp(a, lo, hi - width), width];
}

/**
 * Converte um retângulo do canvas (decimal) para o espaço de `placement`, em inteiros:
 * as bordas são arredondadas (o tamanho é o que a pessoa via na tela), cada lado fica com
 * pelo menos o mínimo (`MIN_MARKING_SIZE`, ou 1 px e o `min` do componente quando há `min`) e, com `bounds`, o
 * retângulo fica dentro dele (o container; o canvas não tem limite).
 */
export function fromCanvasRect(
  placement: Placement,
  canvas: Rect,
  bounds: Rect | null,
  min?: Size | null,
): Rect {
  const s = placement.scale;
  const [x, width] = roundSpan(
    (canvas.x - placement.x) / s,
    canvas.width / s,
    effectiveMinSize(min).width,
    bounds ? bounds.x : -Infinity,
    bounds ? right(bounds) : Infinity,
  );
  const [y, height] = roundSpan(
    (canvas.y - placement.y) / s,
    canvas.height / s,
    effectiveMinSize(min).height,
    bounds ? bounds.y : -Infinity,
    bounds ? bottom(bounds) : Infinity,
  );
  return { x, y, width, height };
}
