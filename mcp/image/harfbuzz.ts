import {
  Blob,
  Buffer as ShapeBuffer,
  DrawFuncs,
  Font,
  Face as HbFace,
  MetricsTag,
  initHarfBuzz,
  shape,
} from 'harfbuzzjs';
import wasmBytes from 'wasm:harfbuzz';
import { CAP_HEIGHT_RATIO } from '../../src/model/components/baseline';
import { MEASURE_CACHE_LIMIT } from '../../src/model/components/measureCache';
import { isWoff, woffToSfnt } from './woff';

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
  /** Extra space after each character (px). Not zero: each character is shaped on its own, as `textPolygons` draws it. */
  readonly letterSpacing?: number;
}

export interface Face {
  readonly unitsPerEm: number;
  /** Font units, positive up: `hhea`, or the typo metrics when the font sets `USE_TYPO_METRICS`. */
  readonly ascender: number;
  /** Font units, negative below the baseline. */
  readonly descender: number;
  /** Capital height at `size` (px): `OS/2.sCapHeight`, else the top of `H`, else 0.7 of the size. */
  capHeight(size: number): number;
  /** Width of the one-line text shaped as a whole (kerning included, no letter spacing), at `size` (px). */
  advance(text: string, size: number): number;
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
}

class HarfBuzzFace implements Face {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  private readonly font: Font;
  private readonly buffer = new ShapeBuffer();
  /** Widths in font units, by text (the default features; a feature set would be part of the key). */
  private readonly widths = new Map<string, number>();

  constructor(face: HbFace) {
    this.unitsPerEm = face.upem;
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

  advance(text: string, size: number): number {
    let units = this.widths.get(text);
    if (units === undefined) {
      units = this.shaped(text).reduce((sum, glyph) => sum + glyph.advance, 0);
      units /= SCALE_SUBDIVISIONS;
      if (this.widths.size >= MEASURE_CACHE_LIMIT) this.widths.clear();
      this.widths.set(text, units);
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
    if (spacing === 0) {
      this.drawRun(text, x, baseline, size, commands);
      return commands;
    }
    // With letter spacing each character is shaped on its own (no substitution applies), as it is drawn today.
    let at = x;
    for (const char of text) {
      this.drawRun(char, at, baseline, size, commands);
      at += this.advance(char, size) + spacing;
    }
    return commands;
  }

  /** Shapes `text` as a whole; one entry per glyph with its advance and offsets (font scale units). */
  private shaped(text: string): (Placed & { advance: number })[] {
    const buffer = this.buffer;
    buffer.clearContents();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    shape(this.font, buffer);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    return infos.map((info, i) => ({
      id: info.codepoint,
      x: positions[i]!.xOffset,
      y: positions[i]!.yOffset,
      advance: positions[i]!.xAdvance,
    }));
  }

  private drawRun(
    text: string,
    x: number,
    baseline: number,
    size: number,
    commands: PathCommand[],
  ): void {
    const k = size / (this.unitsPerEm * SCALE_SUBDIVISIONS);
    let pen = 0;
    for (const glyph of this.shaped(text)) {
      this.font.drawGlyph(glyph.id, drawFunctions(), {
        commands,
        ox: x + (pen + glyph.x) * k,
        oy: baseline - glyph.y * k,
        k,
      } satisfies Pen);
      pen += glyph.advance;
    }
  }
}

/** A face is usable with `head` and `hhea` tables and at least one code point in its cmap. */
function usable(face: HbFace): boolean {
  return (
    face.referenceTable('head') !== undefined &&
    face.referenceTable('hhea') !== undefined &&
    face.collectUnicodes().length > 0
  );
}

/**
 * The face of a font file (`.ttf`, `.otf` or `.woff`), or `null` when the bytes are not a usable font (`.woff2`
 * included). Throws before `initShaper()` resolves: that is a programming error, never a tool result.
 */
export function loadFace(bytes: Uint8Array): Face | null {
  requireInitialized();
  const sfnt = isWoff(bytes) ? woffToSfnt(bytes) : bytes;
  if (sfnt === null || sfnt.length < 12) return null;
  const face = new HbFace(new Blob(sfnt), 0);
  return usable(face) ? new HarfBuzzFace(face) : null;
}
