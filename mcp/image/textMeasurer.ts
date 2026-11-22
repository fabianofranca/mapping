import {
  EMBEDDED_SLANT,
  fontExtents,
  layingFace,
  LIBRARY_SLANT,
  textWidth,
  type Synthesis,
} from './glyphs';
import { loadFace, type Face } from './harfbuzz';
import monoBold from 'font:mono-bold';
import mono from 'font:mono';
import sansBold from 'font:sans-bold';
import sans from 'font:sans';
import { measureLines, type TextMeasurer } from '../../src/model/components/instantiate';
import type { LoadedFont } from '../../src/model/components/library';
import { SERVER_ELLIPSIS_SLACK } from '../../src/model/components/textWrap';
import {
  cachedMeasurer,
  MEASURE_CACHE_LIMIT,
} from '../../src/model/components/measureCache';

// Server measurer (decision 31): measures with HarfBuzz (stage #2121) and an embedded free font (Mapping
// Sans/Mono, a subset of Liberation, OFL; see mcp/fonts/LICENSE.txt). The library's `fonts`
// (with bytes) apply in place of the embedded one when the text's family cites them. The drawing (sceneRaster)
// uses the same fonts for the glyphs, so measuring and drawing go together. This is the only module of the
// text pipeline that reaches the HarfBuzz runtime (`./harfbuzz`): `glyphs.ts` and `textLayout.ts` import only types
// from here, so the scene rasterizer stays free of it.

export { textWidth };

/** Weight from which the bold font kicks in. */
const BOLD_FROM = 600;
/** Families that ask for the embedded monospaced font. */
const MONO_FAMILY =
  /^(monospace|ui-monospace|mono|courier|courier new|consolas|menlo|monaco|sf mono|cascadia mono|cascadia code|source code pro|fira code|jetbrains mono|roboto mono|dejavu sans mono|liberation mono)$/i;

function embedded(bytes: Uint8Array): Face {
  const face = loadFace(bytes);
  if (face === null) throw new Error('an embedded font cannot be read');
  return face;
}

let builtin: { sans: Face; sansBold: Face; mono: Face; monoBold: Face } | undefined;

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
  readonly font: Face;
}

function weightRange(weight: string): [number, number] {
  const parts = weight
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const low = parts[0] ?? 400;
  return [low, parts[1] ?? low];
}

/** The weight range and style of a face: what `matchFace` reads. */
export interface FaceRange {
  readonly low: number;
  readonly high: number;
  readonly italic: boolean;
}

/** Weight from which Blink emboldens a face whose top weight is lighter. */
const SYNTHETIC_BOLD_FROM = 600;

/**
 * The face CSS picks for a weight and a style (CSS Fonts 4, 5.2; stage #2448, decision 11). The style comes first; a
 * weight inside a face's range matches it; from 400 to 500 the faces up to 500 come first, ascending, then the lighter
 * ones, descending, then the heavier ones; below 400 the lighter ones, descending, then the heavier, ascending; above
 * 500 the heavier ones, ascending, then the lighter ones, descending. A tie goes to the first face.
 */
export function matchFace<T extends FaceRange>(
  faces: readonly T[],
  weight: number,
  italic: boolean,
): T | undefined {
  const styled = faces.filter((f) => f.italic === italic);
  const pool = styled.length > 0 ? styled : faces;
  const inside = pool.find((f) => f.low <= weight && weight <= f.high);
  if (inside !== undefined) return inside;
  const lighter = pool.filter((f) => f.high < weight).sort((a, b) => b.high - a.high);
  const heavier = pool.filter((f) => f.low > weight).sort((a, b) => a.low - b.low);
  if (weight < 400) return [...lighter, ...heavier][0];
  if (weight > 500) return [...heavier, ...lighter][0];
  const upTo500 = heavier.filter((f) => f.low <= 500);
  const above = heavier.filter((f) => f.low > 500);
  return [...upTo500, ...lighter, ...above][0];
}

/** A font reader: the embedded one and the library's (`fonts` with bytes). */
export interface FontBook {
  /** The font that draws/measures `family` with the requested weight and style. */
  fontFor(family: string, weight: number, italic: boolean): Face;
  /**
   * What the drawing adds to the face `fontFor` returns (stage #2448, decisions 12 and 13): synthetic bold (a library
   * face whose top weight is below 600, asked for from 600) and the slant of a face that is not italic (0.25 for a
   * library face, 0.2 for the embedded fonts). The advance does not change.
   */
  synthesis(family: string, weight: number, italic: boolean): Synthesis;
  /** The embedded font for `family` and `weight`: where a text goes when its library font cannot lay it out. */
  embeddedFor(family: string, weight: number): Face;
  /**
   * Whether the family stack resolves to a library face: the first name that is a library family or a mono name is
   * a library family. A generic or mono name, or no name read, ends on an embedded face (stage #2267, decision 3).
   * The weight and the style do not matter: any face of the family counts.
   */
  isLibraryFamily(family: string): boolean;
  /** Whether any library font (`fonts`) was read; otherwise everything is measured with the embedded one. */
  readonly hasLibraryFonts: boolean;
}

/**
 * Reads a library font (`.ttf`, `.otf`, `.woff` or `.woff2`). `null` when the bytes are not a usable font (a corrupt
 * file, a font without `head`, `hhea` or code points): the embedded font applies to its family.
 */
export function loadLibraryFont(bytes: ArrayBuffer): Face | null {
  return loadFace(new Uint8Array(bytes));
}

function candidateOf(entry: LoadedFont): Candidate | null {
  if (entry.bytes === undefined) return null;
  const font = loadLibraryFont(entry.bytes);
  if (font === null) return null;
  const [low, high] = weightRange(entry.weight);
  return {
    family: entry.family.toLowerCase(),
    low,
    high,
    italic: entry.style === 'italic',
    font,
  };
}

export function createFontBook(extra: readonly LoadedFont[] = []): FontBook {
  const candidates: Candidate[] = [];
  for (const entry of extra) {
    const candidate = candidateOf(entry);
    if (candidate !== null) candidates.push(candidate);
  }
  const fromLibrary = (name: string, weight: number, italic: boolean): Candidate | null =>
    matchFace(
      candidates.filter((c) => c.family === name.toLowerCase()),
      weight,
      italic,
    ) ?? null;
  const hasFamily = (name: string): boolean =>
    candidates.some((c) => c.family === name.toLowerCase());
  // The first name `resolve` stops on: a library family or a mono name (`undefined` = the sans).
  const stopName = (family: string): string | undefined =>
    familyNames(family).find((name) => hasFamily(name) || MONO_FAMILY.test(name));
  const embeddedSynthesis = (italic: boolean): Synthesis => ({
    bold: false,
    slant: italic ? EMBEDDED_SLANT : 0,
  });
  const embeddedOf = (family: string, weight: number): Face => {
    const b = builtinFonts();
    const mono = familyNames(family).some((n) => !hasFamily(n) && MONO_FAMILY.test(n));
    if (mono) return weight >= BOLD_FROM ? b.monoBold : b.mono;
    return weight >= BOLD_FROM ? b.sansBold : b.sans;
  };
  const resolved = new Map<string, { face: Face; synthesis: Synthesis }>();
  const resolve = (family: string, weight: number, italic: boolean) => {
    for (const name of familyNames(family)) {
      const hit = fromLibrary(name, weight, italic);
      if (hit !== null)
        return {
          face: hit.font,
          synthesis: {
            bold: weight >= SYNTHETIC_BOLD_FROM && hit.high < SYNTHETIC_BOLD_FROM,
            slant: italic && !hit.italic ? LIBRARY_SLANT : 0,
          },
        };
      if (MONO_FAMILY.test(name)) break;
    }
    return {
      face: embeddedOf(family, weight),
      synthesis: embeddedSynthesis(italic),
    };
  };
  const entryFor = (family: string, weight: number, italic: boolean) => {
    const key = `${family}|${weight}|${italic}`;
    let hit = resolved.get(key);
    if (hit === undefined) {
      hit = resolve(family, weight, italic);
      resolved.set(key, hit);
    }
    return hit;
  };
  return {
    hasLibraryFonts: candidates.length > 0,
    isLibraryFamily(family) {
      const first = stopName(family);
      return first !== undefined && hasFamily(first);
    },
    // The embedded face `resolve` would end on: the first name that is a library font or a mono name.
    embeddedFor(family, weight) {
      const b = builtinFonts();
      const first = stopName(family);
      // A monospace name falls back to Mapping Mono, library family or not (stage #2267, decision 1).
      if (first !== undefined && MONO_FAMILY.test(first))
        return weight >= BOLD_FROM ? b.monoBold : b.mono;
      return weight >= BOLD_FROM ? b.sansBold : b.sans;
    },
    // Cache by family/weight/italic: the measurer asks for the font once per word.
    fontFor: (family, weight, italic) => entryFor(family, weight, italic).face,
    synthesis: (family, weight, italic) => entryFor(family, weight, italic).synthesis,
  };
}

const measurers = new WeakMap<FontBook, TextMeasurer>();

/** The server's `TextMeasurer`, over a font reader (the same one for the same reader). */
export function measurerFor(book: FontBook): TextMeasurer {
  let measure = measurers.get(book);
  if (measure === undefined) {
    // The baselines come from the `fontExtents` of the face that lays the whole text out (the same as `lineInk`'s):
    // the library face, or the embedded one when its shaping throws. Accepted: a text whose whole shaping works but
    // one of its lines throws (or the opposite) can still differ, because the fallback is a last resort and the
    // measure works per text, not per line (stage #2267, decision 2).
    // The measurer memoizes by (text, font, limit): the fonts of a `FontBook` do not change, so
    // the measurement holds as long as the reader exists (decision 19 of #1078).
    measure = cachedMeasurer(
      (text, font, maxWidth) =>
        measureLines(
          text,
          font,
          maxWidth,
          (value) => textWidth(book, value, font),
          fontExtents(layingFace(book, text, font), font.size),
          SERVER_ELLIPSIS_SLACK,
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
