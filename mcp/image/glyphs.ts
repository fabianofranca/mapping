import type { Font, PathCommand } from 'opentype.js';
import type { Point } from '../../src/model/components/scene';

// Contornos de glifos (opentype.js) como polígonos, para o rasterizador preencher.

export type Polygon = readonly Point[];

const CURVE_STEPS = 8;
/** Inclinação do itálico sintético (a fonte embutida não tem itálico): ~11,3°. */
const ITALIC_SLANT = 0.2;

function cubic(p0: Point, c1: Point, c2: Point, p1: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y:
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    });
  }
}

function quad(p0: Point, c: Point, p1: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    });
  }
}

/** Um ponto do comando (`x`/`y`, `x1`/`y1` ou `x2`/`y2`), ou `from` se faltar. */
function point(cmd: PathCommand, n: '' | '1' | '2', from: Point): Point {
  const x = n === '' ? cmd.x : n === '1' ? cmd.x1 : cmd.x2;
  const y = n === '' ? cmd.y : n === '1' ? cmd.y1 : cmd.y2;
  return { x: x ?? from.x, y: y ?? from.y };
}

/** Passo de um comando do caminho: devolve o novo ponto corrente. */
function step(cmd: PathCommand, from: Point, out: Point[]): Point {
  const to = point(cmd, '', from);
  if (cmd.type === 'C')
    cubic(from, point(cmd, '1', from), point(cmd, '2', from), to, out);
  else if (cmd.type === 'Q') quad(from, point(cmd, '1', from), to, out);
  else out.push(to);
  return to;
}

/** Os contornos fechados de um caminho do opentype.js (curvas viram segmentos). */
export function pathPolygons(commands: readonly PathCommand[]): Polygon[] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let at: Point = { x: 0, y: 0 };
  const close = () => {
    if (current.length > 2) polygons.push(current);
    current = [];
  };
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      close();
      at = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
      current = [at];
    } else if (cmd.type === 'Z') {
      close();
    } else {
      at = step(cmd, at, current);
    }
  }
  close();
  return polygons;
}

/** Inclina os polígonos em torno da linha de base (itálico sintético). */
export function slant(polygons: readonly Polygon[], baseline: number): Polygon[] {
  return polygons.map((poly) =>
    poly.map((p) => ({ x: p.x + (baseline - p.y) * ITALIC_SLANT, y: p.y })),
  );
}

export interface GlyphStyle {
  readonly size: number;
  readonly letterSpacing: number;
  readonly italic: boolean;
}

/** Contornos do texto com a origem da linha de base em (`x`, `baseline`). */
export function textPolygons(
  face: Font,
  text: string,
  x: number,
  baseline: number,
  style: GlyphStyle,
): Polygon[] {
  let polygons: Polygon[];
  if (style.letterSpacing === 0) {
    polygons = pathPolygons(
      face.getPath(text, x, baseline, style.size, { kerning: true }).commands,
    );
  } else {
    polygons = [];
    let at = x;
    for (const char of text) {
      polygons.push(
        ...pathPolygons(face.getPath(char, at, baseline, style.size).commands),
      );
      at += face.getAdvanceWidth(char, style.size) + style.letterSpacing;
    }
  }
  return style.italic ? slant(polygons, baseline) : polygons;
}

/** Sem `sCapHeight` nem glifo `H`, a maiúscula vale esta fração do corpo (a mesma da app). */
const CAP_HEIGHT_FALLBACK = 0.7;

/**
 * Altura da maiúscula no tamanho dado (px, positivo), para o `cap-middle`. É o único lugar que a lê:
 * `OS/2.sCapHeight`; sem ele, o topo da caixa do glifo `H`; sem `H`, 0,7 do corpo.
 */
export function capHeightOf(face: Font, size: number): number {
  const k = size / face.unitsPerEm;
  const declared = face.tables?.os2?.sCapHeight;
  if (typeof declared === 'number' && declared > 0) return declared * k;
  const glyph = face.charToGlyph('H');
  const top = glyph.index > 0 ? glyph.getBoundingBox().y2 : 0;
  return top > 0 ? top * k : CAP_HEIGHT_FALLBACK * size;
}

/** Ascendente e descendente da fonte no tamanho dado (px, ambos positivos). */
export function fontExtents(
  face: Font,
  size: number,
): { ascent: number; descent: number } {
  const k = size / face.unitsPerEm;
  return { ascent: face.ascender * k, descent: -face.descender * k };
}
