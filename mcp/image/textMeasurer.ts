import { parse, type Font } from 'opentype.js';
import { fontExtents } from './glyphs';
import monoBold from 'font:mono-bold';
import mono from 'font:mono';
import sansBold from 'font:sans-bold';
import sans from 'font:sans';
import {
  measureLines,
  type MeasureFont,
  type TextMeasurer,
} from '../../src/model/components/instantiate';
import type { LoadedFont } from '../../src/model/components/library';
import {
  cachedMeasurer,
  MEASURE_CACHE_LIMIT,
} from '../../src/model/components/measureCache';

// Server measurer (decision 31): measures with opentype.js and an embedded free font (Mapping
// Sans/Mono, a subset of Liberation, OFL; see mcp/fonts/LICENSE.txt). The library's `fonts`
// (with bytes) apply in place of the embedded one when the text's family cites them. The drawing (sceneRaster)
// uses the same fonts for the glyphs, so measuring and drawing go together.

/** Weight from which the bold font kicks in. */
const BOLD_FROM = 600;
/** Families that ask for the embedded monospaced font. */
const MONO_FAMILY =
  /^(monospace|ui-monospace|mono|courier|courier new|consolas|menlo|monaco|sf mono|cascadia mono|cascadia code|source code pro|fira code|jetbrains mono|roboto mono|dejavu sans mono|liberation mono)$/i;

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function embedded(bytes: Uint8Array): Font {
  return parse(toBuffer(bytes));
}

let builtin: { sans: Font; sansBold: Font; mono: Font; monoBold: Font } | undefined;

function builtinFonts() {
  builtin ??= {
    sans: embedded(sans),
    sansBold: embedded(sansBold),
    mono: embedded(mono),
    monoBold: embedded(monoBold),
  };
  return builtin;
}

/** Family names of a CSS stack (`"Inter", sans-serif`), without quotes. */
export function familyNames(family: string): string[] {
  return family
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name !== '');
}

interface Candidate {
  readonly family: string;
  readonly low: number;
  readonly high: number;
  readonly italic: boolean;
  readonly font: Font;
}

function weightRange(weight: string): [number, number] {
  const parts = weight
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const low = parts[0] ?? 400;
  return [low, parts[1] ?? low];
}

/** The distance from a weight to a range (0 if inside it). */
const gap = (weight: number, c: Candidate) =>
  weight < c.low ? c.low - weight : weight > c.high ? weight - c.high : 0;

/** A font reader: the embedded one and the library's (`fonts` with bytes). */
export interface FontBook {
  /** The font that draws/measures `family` with the requested weight and style. */
  fontFor(family: string, weight: number, italic: boolean): Font;
  /** Whether any library font (`fonts`) was read; otherwise everything is measured with the embedded one. */
  readonly hasLibraryFonts: boolean;
}

export function createFontBook(extra: readonly LoadedFont[] = []): FontBook {
  const candidates: Candidate[] = [];
  for (const entry of extra) {
    if (entry.bytes === undefined) continue;
    try {
      const [low, high] = weightRange(entry.weight);
      candidates.push({
        family: entry.family.toLowerCase(),
        low,
        high,
        italic: entry.style === 'italic',
        font: parse(entry.bytes),
      });
    } catch {
      // Unreadable font (woff2, for example): the embedded one applies.
    }
  }
  const fromLibrary = (name: string, weight: number, italic: boolean): Font | null => {
    const same = candidates.filter((c) => c.family === name.toLowerCase());
    const best = [...same].sort(
      (a, b) =>
        Number(b.italic === italic) - Number(a.italic === italic) ||
        gap(weight, a) - gap(weight, b),
    )[0];
    return best?.font ?? null;
  };
  const resolved = new Map<string, Font>();
  const resolve = (family: string, weight: number, italic: boolean): Font => {
    const names = familyNames(family);
    for (const name of names) {
      const hit = fromLibrary(name, weight, italic);
      if (hit !== null) return hit;
      if (MONO_FAMILY.test(name)) {
        const b = builtinFonts();
        return weight >= BOLD_FROM ? b.monoBold : b.mono;
      }
    }
    const b = builtinFonts();
    return weight >= BOLD_FROM ? b.sansBold : b.sans;
  };
  return {
    hasLibraryFonts: candidates.length > 0,
    // Cache by family/weight/italic: the measurer asks for the font once per word.
    fontFor(family, weight, italic) {
      const key = `${family}|${weight}|${italic}`;
      let font = resolved.get(key);
      if (font === undefined) {
        font = resolve(family, weight, italic);
        resolved.set(key, font);
      }
      return font;
    },
  };
}

/** Width of a one-line text with the font and the letter spacing. */
export function textWidth(
  book: FontBook,
  text: string,
  font: Pick<MeasureFont, 'family' | 'size' | 'weight' | 'italic' | 'letterSpacing'>,
): number {
  const face = book.fontFor(font.family, font.weight, font.italic);
  const advance = face.getAdvanceWidth(text, font.size, { kerning: true });
  return Math.max(0, advance + font.letterSpacing * [...text].length);
}

const measurers = new WeakMap<FontBook, TextMeasurer>();

/** The server's `TextMeasurer`, over a font reader (the same one for the same reader). */
export function measurerFor(book: FontBook): TextMeasurer {
  let measure = measurers.get(book);
  if (measure === undefined) {
    // The baselines come from the `fontExtents` of the font that draws (the same as `lineInk`'s).
    // The measurer memoizes by (text, font, limit): the fonts of a `FontBook` do not change, so
    // the measurement holds as long as the reader exists (decision 19 of #1078).
    measure = cachedMeasurer(
      (text, font, maxWidth) =>
        measureLines(
          text,
          font,
          maxWidth,
          (value) => textWidth(book, value, font),
          fontExtents(book.fontFor(font.family, font.weight, font.italic), font.size),
        ),
      { limit: MEASURE_CACHE_LIMIT },
    );
    measurers.set(book, measure);
  }
  return measure;
}

/** Measurer with the embedded font and, if any, the library's `fonts`. */
export function createMeasurer(extra: readonly LoadedFont[] = []): TextMeasurer {
  return measurerFor(createFontBook(extra));
}

let shared: FontBook | undefined;

/** The reader with only the embedded fonts (projects without `fonts`). */
export function builtinFontBook(): FontBook {
  shared ??= createFontBook();
  return shared;
}
