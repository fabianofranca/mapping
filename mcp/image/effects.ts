import type { Point } from '../../src/model/components/scene';
import type { PixelRect, Raster } from './raster';

// Efeitos do rasterizador: tracejado do traço e a máscara desfocada da sombra.

export interface Path2 {
  readonly points: Point[];
  readonly closed: boolean;
}

interface Walk {
  index: number;
  left: number;
  on: boolean;
  current: Point[];
  readonly out: Path2[];
}

/** Chega a uma fronteira do padrão em `p`: fecha o trecho ligado, ou abre um novo, e troca de estado. */
function advance(walk: Walk, cycle: readonly number[], p: Point): void {
  if (walk.on) {
    walk.current.push(p);
    walk.out.push({ points: walk.current, closed: false });
    walk.current = [];
  } else {
    walk.current = [p];
  }
  walk.on = !walk.on;
  walk.index = (walk.index + 1) % cycle.length;
  walk.left = cycle[walk.index]!;
}

/** Tracejado de uma polilinha (aberta; o fechamento já vem como último ponto repetido). */
function dashLine(points: readonly Point[], cycle: readonly number[]): Path2[] {
  const walk: Walk = {
    index: 0,
    left: cycle[0]!,
    on: true,
    current: [points[0]!],
    out: [],
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let done = 0;
    while (length - done > walk.left) {
      done += walk.left;
      const t = done / length;
      advance(walk, cycle, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    walk.left -= length - done;
    if (walk.on) walk.current.push(b);
  }
  if (walk.on && walk.current.length > 1) {
    walk.out.push({ points: walk.current, closed: false });
  }
  return walk.out;
}

/** Corta as polilinhas nos trechos "ligados" do padrão `dash` (liga, vão, liga, vão…), em unidades locais. */
export function dashPaths(subpaths: readonly Path2[], dash: readonly number[]): Path2[] {
  const pattern = dash.map((d) => Math.max(0, d));
  if (!pattern.some((d) => d > 0)) return [...subpaths];
  const cycle = pattern.length % 2 === 1 ? [...pattern, ...pattern] : pattern;
  return subpaths.flatMap((sub) =>
    dashLine(sub.closed ? [...sub.points, sub.points[0]!] : sub.points, cycle),
  );
}

/** Desfoque por três passagens de caixa (aproxima o gaussiano), no canal `alpha` (0..1). */
export function blurAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  sigma: number,
): void {
  const radius = Math.max(0, Math.round(sigma * 1.2));
  if (radius === 0) return;
  const tmp = new Float32Array(alpha.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(alpha, tmp, width, height, radius, true);
    boxPass(tmp, alpha, width, height, radius, false);
  }
}

function boxPass(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const at = (line: number, i: number) =>
    horizontal ? line * width + i : i * width + line;
  const size = 2 * radius + 1;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++)
      sum += i >= 0 && i < length ? src[at(line, i)]! : 0;
    for (let i = 0; i < length; i++) {
      dst[at(line, i)] = sum / size;
      const out = i - radius;
      const into = i + radius + 1;
      if (out >= 0) sum -= src[at(line, out)]!;
      if (into < length) sum += src[at(line, into)]!;
    }
  }
}

/** Tamanho máximo (pixels) da máscara temporária de uma sombra. */
export const MAX_SHADOW_PIXELS = 4096 * 4096;

/**
 * Pinta a sombra: `mask` é a cobertura (0..1) do contorno em `box` (pixels do raster); ela é
 * desfocada (`sigma`), deslocada por (`dx`, `dy`) e misturada na `cor` sobre `raster`, dentro de `clip`.
 */
export function compositeShadow(
  raster: Raster,
  mask: Float32Array,
  box: PixelRect,
  sigma: number,
  offset: { dx: number; dy: number },
  color: { rgb: readonly [number, number, number]; alpha: number },
  clip: PixelRect,
): void {
  blurAlpha(mask, box.width, box.height, sigma);
  const x0 = Math.max(0, Math.floor(clip.x));
  const y0 = Math.max(0, Math.floor(clip.y));
  const x1 = Math.min(raster.width, Math.ceil(clip.x + clip.width));
  const y1 = Math.min(raster.height, Math.ceil(clip.y + clip.height));
  const ox = Math.round(box.x + offset.dx);
  const oy = Math.round(box.y + offset.dy);
  for (let y = Math.max(y0, oy); y < Math.min(y1, oy + box.height); y++) {
    for (let x = Math.max(x0, ox); x < Math.min(x1, ox + box.width); x++) {
      const a = mask[(y - oy) * box.width + (x - ox)]! * color.alpha;
      if (a <= 0.002) continue;
      const i = (y * raster.width + x) * 4;
      const dstA = raster.data[i + 3]! / 255;
      const outA = a + dstA * (1 - a);
      for (let c = 0; c < 3; c++) {
        raster.data[i + c] =
          (color.rgb[c]! * a + raster.data[i + c]! * dstA * (1 - a)) / outA;
      }
      raster.data[i + 3] = outA * 255;
    }
  }
}
