import {
  Blob,
  Buffer as ShapeBuffer,
  DrawFuncs,
  Font,
  Face as HbFace,
  Feature,
  MetricsTag,
  initHarfBuzz,
  Variation,
  shape,
} from 'harfbuzzjs';
import wasmBytes from 'wasm:harfbuzz';
import { CAP_HEIGHT_RATIO } from '../../src/model/components/baseline';
import { MEASURE_CACHE_LIMIT } from '../../src/model/components/measureCache';
import { fontSfnt } from './woff';

// HarfBuzz (WebAssembly) behind a synchronous face API: the shaping engine of the browser, for the server's measurer
// and rasterizer. This is the only module that reaches the HarfBuzz runtime. The module is instantiated once, at
// startup (`initShaper`); a face is loaded from the bytes of a font file (`loadFace`).

/** A path command, in the shape the rasterizer reads (`pathPolygons`): screen coordinates, y growing downward. */
export interface PathCommand {
  readonly type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  readonly x?: number;
  readonly y?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}

/** How a text is laid out; HarfBuzz's default features apply, as in Chromium. */
export interface FaceStyle {
  /**
   * Extra space after each cluster (px). Not zero: the text is shaped once without the optional ligatures (`liga`,
   * `clig`) and the contextual alternates (`calt`), as Chromium does for letter-spaced text.
   */
  readonly letterSpacing?: number;
  /** CSS weight; a variable font follows it on its `wght` axis (default 400). */
  readonly weight?: number;
}

/** The range of a variation axis, in the font's user units. */
export interface AxisRange {
  readonly min: number;
  readonly default: number;
  readonly max: number;
}

/**
 * The variation settings a text asks for (decision 11): `wght` is the weight and `opsz` the size in px (Chromium's
 * `font-optical-sizing: auto`), each clamped to the axis. Other axes stay at their defaults, so they are left out.
 */
export function variationsFor(
  axes: Readonly<Record<string, AxisRange>>,
  weight: number,
  size: number,
): { tag: string; value: number }[] {
  const wanted: Record<string, number> = { wght: weight, opsz: size };
  return Object.entries(wanted).flatMap(([tag, value]) => {
    const axis = axes[tag];
    return axis === undefined
      ? []
      : [{ tag, value: Math.min(axis.max, Math.max(axis.min, value)) }];
  });
}

export interface Face {
  readonly unitsPerEm: number;
  /** Font units, positive up: `hhea`, or the typo metrics when the font sets `USE_TYPO_METRICS`. */
  readonly ascender: number;
  /** Font units, negative below the baseline. */
  readonly descender: number;
  /** Capital height at `size` (px): `OS/2.sCapHeight`, else the top of `H`, else 0.7 of the size. */
  capHeight(size: number): number;
  /** The variation axes of the font (empty for a static font). */
  readonly axes: Readonly<Record<string, AxisRange>>;
  /**
   * Width of the one-line text shaped as a whole (kerning included, no letter spacing), at `size` (px) and CSS
   * `weight`. `spaced` shapes it as letter-spaced text is: without `liga`, `clig` and `calt`.
   */
  advance(text: string, size: number, weight?: number, spaced?: boolean): number;
  /** The outlines of the text with the baseline origin at (`x`, `baseline`), at `size` (px). */
  path(
    text: string,
    x: number,
    baseline: number,
    size: number,
    style?: FaceStyle,
  ): PathCommand[];
}

/** HarfBuzz positions are integers in 1/64 of a font unit with this scale: sub-unit precision for variable fonts. */
const SCALE_SUBDIVISIONS = 64;

let ready: Promise<void> | undefined;
let initialized = false;

const toStderr = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

/**
 * Instantiates HarfBuzz from the embedded bytes. Idempotent: every call returns the same promise. The glue's messages
 * go to stderr (stdout belongs to the protocol).
 */
export function initShaper(): Promise<void> {
  if (ready !== undefined) return ready;
  const starting = initHarfBuzz({
    wasmBinary: wasmBytes,
    print: toStderr,
    printErr: toStderr,
  }).then(
    () => {
      initialized = true;
    },
    (error: unknown) => {
      ready = undefined;
      throw error;
    },
  );
  ready = starting;
  return starting;
}

function requireInitialized(): void {
  if (!initialized) throw new Error('HarfBuzz is not initialized');
}

interface Pen {
  readonly commands: PathCommand[];
  /** Origin of the glyph on the page (px). */
  readonly ox: number;
  readonly oy: number;
  /** Font scale units to px. */
  readonly k: number;
}

let drawFuncs: DrawFuncs | undefined;

/** The draw callbacks (one set for every face): they append to the `Pen` that `drawGlyph` passes. */
function drawFunctions(): DrawFuncs {
  if (drawFuncs !== undefined) return drawFuncs;
  const at = (pen: Pen, x: number, y: number) => ({
    x: pen.ox + x * pen.k,
    y: pen.oy - y * pen.k,
  });
  const funcs = new DrawFuncs();
  funcs.setMoveToFunc((x, y, data) => {
    const pen = data as Pen;
    pen.commands.push({ type: 'M', ...at(pen, x, y) });
  });
  funcs.setLineToFunc((x, y, data) => {
    const pen = data as Pen;
    pen.commands.push({ type: 'L', ...at(pen, x, y) });
  });
  funcs.setQuadraticToFunc((cx, cy, x, y, data) => {
    const pen = data as Pen;
    const c = at(pen, cx, cy);
    pen.commands.push({ type: 'Q', x1: c.x, y1: c.y, ...at(pen, x, y) });
  });
  funcs.setCubicToFunc((c1x, c1y, c2x, c2y, x, y, data) => {
    const pen = data as Pen;
    const c1 = at(pen, c1x, c1y);
    const c2 = at(pen, c2x, c2y);
    pen.commands.push({
      type: 'C',
      x1: c1.x,
      y1: c1.y,
      x2: c2.x,
      y2: c2.y,
      ...at(pen, x, y),
    });
  });
  funcs.setClosePathFunc((data) => {
    (data as Pen).commands.push({ type: 'Z' });
  });
  drawFuncs = funcs;
  return funcs;
}

/** A glyph of the shaped text, in font scale units (1/64 of a font unit). */
interface Placed {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly advance: number;
  readonly cluster: number;
}

/**
 * What Chromium turns off for letter-spaced text (decision 12, checked by the parity pair): the optional ligatures
 * and the contextual alternates. The parity test showed `calt` goes too (`fi` → `wi` does not apply when spaced).
 */
const SPACED_FEATURES = [
  new Feature('liga', 0),
  new Feature('clig', 0),
  new Feature('calt', 0),
];

class HarfBuzzFace implements Face {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly axes: Readonly<Record<string, AxisRange>>;
  private readonly font: Font;
  private readonly buffer = new ShapeBuffer();
  /** Widths in font units, by text, variation settings and feature set. */
  private readonly widths = new Map<string, number>();
  /** The variation key set on the font now. */
  private applied = '';

  constructor(face: HbFace) {
    this.unitsPerEm = face.upem;
    this.axes = face.getAxisInfos();
    this.font = new Font(face);
    this.font.setScale(face.upem * SCALE_SUBDIVISIONS, face.upem * SCALE_SUBDIVISIONS);
    const extents = this.font.hExtents();
    this.ascender = extents.ascender / SCALE_SUBDIVISIONS;
    this.descender = extents.descender / SCALE_SUBDIVISIONS;
  }

  capHeight(size: number): number {
    const k = size / this.unitsPerEm;
    const declared = this.font.getMetricPosition(MetricsTag.CAP_HEIGHT);
    if (declared !== undefined && declared > 0)
      return (declared / SCALE_SUBDIVISIONS) * k;
    const glyph = this.font.nominalGlyph(0x48); // H
    const extents =
      glyph === undefined || glyph === 0 ? undefined : this.font.glyphExtents(glyph);
    const top = extents === undefined ? 0 : extents.yBearing / SCALE_SUBDIVISIONS;
    return top > 0 ? top * k : CAP_HEIGHT_RATIO * size;
  }

  advance(text: string, size: number, weight = 400, spaced = false): number {
    const key = `${this.variationKey(weight, size)}|${spaced ? 's' : ''}|${text}`;
    let units = this.widths.get(key);
    if (units === undefined) {
      units = this.shaped(text, weight, size, spaced).reduce(
        (sum, glyph) => sum + glyph.advance,
        0,
      );
      units /= SCALE_SUBDIVISIONS;
      if (this.widths.size >= MEASURE_CACHE_LIMIT) this.widths.clear();
      this.widths.set(key, units);
    }
    return (units * size) / this.unitsPerEm;
  }

  path(
    text: string,
    x: number,
    baseline: number,
    size: number,
    style: FaceStyle = {},
  ): PathCommand[] {
    const commands: PathCommand[] = [];
    const spacing = style.letterSpacing ?? 0;
    const glyphs = this.shaped(text, style.weight ?? 400, size, spacing !== 0);
    const k = size / (this.unitsPerEm * SCALE_SUBDIVISIONS);
    const gap = spacing / k;
    let pen = 0;
    glyphs.forEach((glyph, i) => {
      this.font.drawGlyph(glyph.id, drawFunctions(), {
        commands,
        ox: x + (pen + glyph.x) * k,
        oy: baseline - glyph.y * k,
        k,
      } satisfies Pen);
      pen += glyph.advance;
      if (glyphs[i + 1]?.cluster !== glyph.cluster) pen += gap;
    });
    return commands;
  }

  /** The variation settings of (`weight`, `size`) as a key; `''` for a font without the axes. */
  private variationKey(weight: number, size: number): string {
    return variationsFor(this.axes, weight, size)
      .map((v) => `${v.tag}=${v.value}`)
      .join(',');
  }

  /** Sets the variations on the font when they differ from the ones set last. */
  private applyVariations(weight: number, size: number): void {
    const key = this.variationKey(weight, size);
    if (key === this.applied) return;
    this.font.setVariations(
      variationsFor(this.axes, weight, size).map((v) => new Variation(v.tag, v.value)),
    );
    this.applied = key;
  }

  /** Shapes `text` as a whole; one entry per glyph with its advance and offsets (font scale units). */
  private shaped(text: string, weight: number, size: number, spaced: boolean): Placed[] {
    this.applyVariations(weight, size);
    const buffer = this.buffer;
    buffer.clearContents();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    shape(this.font, buffer, spaced ? SPACED_FEATURES : undefined);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    return infos.map((info, i) => ({
      id: info.codepoint,
      x: positions[i]!.xOffset,
      y: positions[i]!.yOffset,
      advance: positions[i]!.xAdvance,
      cluster: info.cluster,
    }));
  }
}

/** Whether the sfnt's table directory lists every tag (read from the bytes: `Face.referenceTable` never releases the blob it references, which would keep the whole font in the WebAssembly heap). */
function hasTables(sfnt: Uint8Array, tags: readonly string[]): boolean {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const count = Math.min(view.getUint16(4), Math.floor((sfnt.length - 12) / 16));
  const present = new Set<string>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    present.add(String.fromCharCode(...sfnt.subarray(at, at + 4)));
  }
  return tags.every((tag) => present.has(tag));
}

/** A face is usable with `head` and `hhea` tables and at least one code point in its cmap. */
function usable(face: HbFace, sfnt: Uint8Array): boolean {
  return hasTables(sfnt, ['head', 'hhea']) && face.collectUnicodes().length > 0;
}

/**
 * The face of a font file (`.ttf`, `.otf`, `.woff` or `.woff2`), or `null` when the bytes are not a usable font.
 * Throws before `initShaper()` resolves: that is a programming error, never a tool result.
 */
export function loadFace(bytes: Uint8Array): Face | null {
  requireInitialized();
  const sfnt = fontSfnt(bytes);
  if (sfnt === null || sfnt.length < 12) return null;
  const face = new HbFace(new Blob(sfnt), 0);
  return usable(face, sfnt) ? new HarfBuzzFace(face) : null;
}
