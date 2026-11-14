/**
 * Component engine (stage #747, CF4): pure layout of rich text (`runs`).
 *
 * The runs of a `text` node wrap as ONE single text, by word. The layout is derived from any
 * `TextMeasurer`: each piece of a line is measured with `measure(piece, runFont)` without
 * `maxWidth` (the width of one line), so the approximate measurer and the canvas one get the
 * per-run measurement without duplicated code, and the drawing uses the same layout as the
 * measurement.
 *
 * Rules:
 * - Break opportunities: the spaces inside runs **without a background** and the edges of an
 *   inline box (chip, the run with a background). A word that crosses runs with no space between
 *   them (`"Pa"` + `"yment"`) is a single word. `\n` in a run without a background forces the
 *   break; in a chip it becomes a space.
 * - At the start of a line the spaces of runs without a background are discarded (as in CSS); the
 *   chip's text is not: it is drawn whole, with the leading space. Spaces at the end of the line
 *   do not count.
 * - Chip: unbreakable atom of width `text + 2·h` and height `run line + 2·v`. Larger than the
 *   line, it stays alone and overflows the width; one that does not fit in the rest of the line
 *   goes whole to the next line. A word larger than the width also stays alone on the line.
 * - Line height of a run = the node's `lineHeight` × (run size / node size); the line height is
 *   the maximum between the node's `lineHeight` and the height of the pieces (the chip includes
 *   the vertical padding). Limit: the pieces are vertically centered on the line, not aligned
 *   by the baseline.
 * - `wrap: none` only breaks at `\n`; `maxLines` keeps the first N lines; `ellipsis` (on the line
 *   cut by `maxLines`, or on the one that exceeds the box) removes characters from the end of the
 *   last text piece (in the middle of a run if needed; a chip leaves whole) until the line plus
 *   the `…` fits, and the `…` uses the font of the last piece that remained.
 * - `align` applies per line, against the box width (when there is one).
 * - `direction: 'rtl'` reverses the order of the pieces within the line (the first at the right edge).
 *
 * Pure functions, no DOM. The positions (`x`, `y`) are relative to the corner of the text box,
 * before `verticalAlign` (the drawing applies the vertical offset).
 */
import type { MeasureFont, TextMeasurer, TextMetrics } from './instantiate';

const EPS = 1e-9;

/** A resolved run: the text, the font and, when it has a background, the inline box's padding. */
export interface RichRun {
  readonly text: string;
  /**
   * The run's font (family, size, weight, italic and letter spacing). The run's `lineHeight`,
   * `wrap`, `ellipsis` and `maxLines` are ignored: the node's apply.
   */
  readonly font: MeasureFont;
  /** Present = the run has a background (chip): `padding` is `[vertical, horizontal]` in px. */
  readonly chip?: { readonly padding: readonly [number, number] };
}

/** What belongs to the node, not to the runs. */
export interface RichBase {
  /** The node's font size (px): the reference for scaling the runs' line height. */
  readonly size: number;
  /** The node's line height, in px. */
  readonly lineHeight: number;
  readonly wrap?: 'word' | 'none';
  readonly ellipsis?: boolean;
  /** Integer ≥ 1. */
  readonly maxLines?: number;
  /** Alignment of each line against the box width (default `left`). */
  readonly align?: 'left' | 'center' | 'right';
  /**
   * `rtl` = the text reads right to left: the pieces of each line run right to left (the first at
   * the right edge of the content). The order in the list, the width and the wrapping do not
   * change; the order of the glyphs within a piece is up to whoever draws. Absent = `ltr`.
   */
  readonly direction?: 'rtl';
}

/** A piece of a line: text from a single run (or the whole box of a chip). */
export interface RunPiece {
  /** Index of the run in the source list. */
  readonly run: number;
  /** The text to draw (in the chip, includes the leading space, if any). */
  readonly text: string;
  /** Horizontal position in the text box (with the `align` applied). */
  readonly x: number;
  /** Width of the piece; in the chip, the box's (text + 2·h). */
  readonly width: number;
  /** Height of the piece; in the chip, the box's (run line + 2·v). */
  readonly height: number;
  /** `true` = inline box (draws the background; the text sits the horizontal `padding` inward). */
  readonly chip: boolean;
}

export interface RunLine {
  /** Top of the line in the text box. */
  readonly y: number;
  readonly height: number;
  /** Width of the line's content (without trailing spaces). */
  readonly width: number;
  readonly pieces: readonly RunPiece[];
}

export interface RunLayout {
  /** The widest line. */
  readonly width: number;
  /** Sum of the line heights. */
  readonly height: number;
  readonly lines: readonly RunLine[];
}

// ---------------------------------------------------------------------------------------
// Measurement context
// ---------------------------------------------------------------------------------------

/** A text segment of a run with its width already measured (in the chip, the box's). */
interface Seg {
  readonly run: number;
  readonly text: string;
  readonly width: number;
  readonly chip: boolean;
}

type Atom =
  | { readonly kind: 'break' }
  | { readonly kind: 'space'; readonly seg: Seg }
  | { readonly kind: 'word'; readonly segs: readonly Seg[]; readonly width: number };

interface Context {
  readonly runs: readonly RichRun[];
  readonly base: RichBase;
  /** Line height of the run (with the chip's vertical padding). */
  readonly heightOf: (run: number) => number;
  /** Width of the run's text on a single line (without the chip's padding). */
  readonly textWidth: (run: number, text: string) => number;
  readonly seg: (run: number, text: string) => Seg;
}

/** The line height of a run: the node's, scaled by the run's size. */
function runLineHeight(base: RichBase, font: MeasureFont): number {
  return base.size > 0 ? (base.lineHeight * font.size) / base.size : base.lineHeight;
}

function createContext(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
): Context {
  const cache = new Map<string, number>();
  const fontOf = (run: number): MeasureFont => {
    const font = runs[run]?.font as MeasureFont;
    return {
      family: font.family,
      size: font.size,
      weight: font.weight,
      italic: font.italic,
      letterSpacing: font.letterSpacing,
      lineHeight: runLineHeight(base, font),
    };
  };
  const textWidth = (run: number, text: string): number => {
    const key = `${run}\u0000${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measure(text, fontOf(run)).width;
      cache.set(key, width);
    }
    return width;
  };
  const padding = (run: number): readonly [number, number] =>
    runs[run]?.chip?.padding ?? [0, 0];
  const heightOf = (run: number): number =>
    runLineHeight(base, runs[run]?.font as MeasureFont) +
    (runs[run]?.chip ? 2 * padding(run)[0] : 0);
  const seg = (run: number, text: string): Seg => {
    const chip = runs[run]?.chip !== undefined;
    const width = textWidth(run, text) + (chip ? 2 * padding(run)[1] : 0);
    return { run, text, width, chip };
  };
  return { runs, base, heightOf, textWidth, seg };
}

// ---------------------------------------------------------------------------------------
// Atoms: words, spaces, forced breaks and chips
// ---------------------------------------------------------------------------------------

/** Pieces of a text without a background: `\n`, a sequence of spaces or a sequence of non-spaces. */
const TOKEN = /\n|[ \t]+|[^ \t\n]+/g;

function wordAtom(segs: readonly Seg[]): Atom {
  return { kind: 'word', segs, width: segs.reduce((sum, seg) => sum + seg.width, 0) };
}

/** Splits the runs into atoms; a word that crosses runs becomes a single atom. */
function toAtoms(ctx: Context): Atom[] {
  const atoms: Atom[] = [];
  let word: Seg[] = [];
  const flush = (): void => {
    if (word.length > 0) atoms.push(wordAtom(word));
    word = [];
  };
  ctx.runs.forEach((run, index) => {
    if (run.text === '') return;
    if (run.chip) {
      flush();
      atoms.push(wordAtom([ctx.seg(index, run.text.replace(/\n/g, ' '))]));
      return;
    }
    for (const token of run.text.match(TOKEN) ?? []) {
      if (token === '\n') {
        flush();
        atoms.push({ kind: 'break' });
      } else if (token.trim() === '') {
        flush();
        atoms.push({ kind: 'space', seg: ctx.seg(index, token) });
      } else {
        word.push(ctx.seg(index, token));
      }
    }
  });
  flush();
  return atoms;
}

// ---------------------------------------------------------------------------------------
// Line breaking
// ---------------------------------------------------------------------------------------

/** Distributes the atoms into lines (greedy); infinite `limit` = only the forced breaks. */
function breakLines(atoms: readonly Atom[], limit: number): Seg[][] {
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let width = 0;
  let pending: Seg[] = [];
  let pendingWidth = 0;
  const endLine = (): void => {
    lines.push(line);
    line = [];
    width = 0;
    pending = [];
    pendingWidth = 0;
  };
  for (const atom of atoms) {
    if (atom.kind === 'break') {
      endLine();
    } else if (atom.kind === 'space') {
      // a space at the start of the line is discarded; the others wait for the next word
      if (line.length > 0) {
        pending.push(atom.seg);
        pendingWidth += atom.seg.width;
      }
    } else {
      if (line.length > 0 && width + pendingWidth + atom.width > limit + EPS) endLine();
      line.push(...pending, ...atom.segs);
      width += pendingWidth + atom.width;
      pending = [];
      pendingWidth = 0;
    }
  }
  lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------------------
// maxLines and ellipsis
// ---------------------------------------------------------------------------------------

const sumWidths = (segs: readonly Seg[]): number =>
  segs.reduce((sum, seg) => sum + seg.width, 0);

const isBlank = (seg: Seg | undefined): boolean =>
  seg !== undefined && !seg.chip && seg.text.trim() === '';

/** Removes the last code point (emoji and surrogate pairs go whole). */
export function dropLastChar(text: string): string {
  return [...text].slice(0, -1).join('');
}

/**
 * Removes from the end of the line (whole chips, letters of the last text) until the line + `…`
 * fits in `limit`; the `…` uses the font of the last piece that remained.
 */
function ellipsize(line: readonly Seg[], ctx: Context, limit: number): Seg[] {
  const kept = [...line];
  let run = line[line.length - 1]?.run ?? 0;
  while (kept.length > 0) {
    while (isBlank(kept[kept.length - 1])) kept.pop();
    const tail = kept[kept.length - 1];
    if (tail === undefined) break;
    run = tail.run;
    if (sumWidths(kept) + ctx.textWidth(run, '…') <= limit + EPS) break;
    kept.pop();
    const shorter = tail.chip ? '' : dropLastChar(tail.text).trimEnd();
    if (shorter !== '') kept.push(ctx.seg(tail.run, shorter));
  }
  return [...kept, { run, text: '…', width: ctx.textWidth(run, '…'), chip: false }];
}

/** Applies `maxLines` and `ellipsis` to the already-broken lines. */
function clipLines(
  lines: readonly Seg[][],
  ctx: Context,
  boxWidth: number,
): readonly (readonly Seg[])[] {
  const { maxLines, ellipsis } = ctx.base;
  const cut = maxLines !== undefined && lines.length > maxLines;
  const kept = cut ? lines.slice(0, maxLines) : lines;
  if (ellipsis !== true) return kept;
  const last = kept.length - 1;
  return kept.map((line, i) =>
    (cut && i === last) || sumWidths(line) > boxWidth + EPS
      ? ellipsize(line, ctx, boxWidth)
      : line,
  );
}

// ---------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------

/** Joins neighboring segments of the same run (without a background) into a single, already measured piece. */
function mergePieces(line: readonly Seg[], ctx: Context): Omit<RunPiece, 'x'>[] {
  const groups: { run: number; text: string; chip: boolean; width: number }[] = [];
  for (const seg of line) {
    const prev = groups[groups.length - 1];
    if (prev && !prev.chip && !seg.chip && prev.run === seg.run) prev.text += seg.text;
    else groups.push({ run: seg.run, text: seg.text, chip: seg.chip, width: seg.width });
  }
  return groups.map((g) => ({
    run: g.run,
    text: g.text,
    chip: g.chip,
    width: g.chip ? g.width : ctx.textWidth(g.run, g.text),
    height: ctx.heightOf(g.run),
  }));
}

/** Horizontal offset of the line against the box width. */
function alignOffset(
  align: RichBase['align'],
  boxWidth: number,
  lineWidth: number,
): number {
  if (!Number.isFinite(boxWidth) || align === undefined || align === 'left') return 0;
  const free = Math.max(0, boxWidth - lineWidth);
  return align === 'center' ? free / 2 : free;
}

function buildLayout(
  lines: readonly (readonly Seg[])[],
  ctx: Context,
  boxWidth: number,
): RunLayout {
  let y = 0;
  let widest = 0;
  const out: RunLine[] = lines.map((line) => {
    const merged = mergePieces(line, ctx);
    const width = merged.reduce((sum, piece) => sum + piece.width, 0);
    const height = merged.reduce(
      (max, piece) => Math.max(max, piece.height),
      ctx.base.lineHeight,
    );
    const start = alignOffset(ctx.base.align, boxWidth, width);
    const rtl = ctx.base.direction === 'rtl';
    let x = 0;
    const pieces = merged.map((piece): RunPiece => {
      // In rtl the piece takes the same stretch of the line, measured from the content's right edge.
      const placed = { ...piece, x: start + (rtl ? width - x - piece.width : x) };
      x += piece.width;
      return placed;
    });
    const result: RunLine = { y, height, width, pieces };
    y += height;
    widest = Math.max(widest, width);
    return result;
  });
  return { width: widest, height: y, lines: out };
}

/**
 * The layout of the runs in a box of width `maxWidth` (absent = no limit: only the forced
 * breaks). `measure` is any `TextMeasurer`; it is only called without `maxWidth`.
 */
export function layoutRuns(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
  maxWidth?: number,
): RunLayout {
  const ctx = createContext(runs, base, measure);
  const boxWidth = maxWidth ?? Infinity;
  const limit = base.wrap === 'none' ? Infinity : boxWidth;
  const lines = breakLines(toAtoms(ctx), limit);
  return buildLayout(clipLines(lines, ctx, boxWidth), ctx, boxWidth);
}

/**
 * Measures rich text the way a `TextMeasurer` measures a text: width of the widest line, summed
 * height and the text of each line (the pieces joined, already with the `…`).
 */
export function measureRichText(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
  maxWidth?: number,
): TextMetrics {
  const layout = layoutRuns(runs, base, measure, maxWidth);
  return {
    width: layout.width,
    height: layout.height,
    lines: layout.lines.map((line) => line.pieces.map((piece) => piece.text).join('')),
  };
}

/**
 * The `min-content` of rich text: the largest unbreakable piece, the widest word (a word that
 * crosses runs is a single one) or the whole chip, which is atomic. With `wrap: none` the text does
 * not wrap: the widest line counts. Like `layoutRuns`, it only calls the measurer without `maxWidth`.

 */
export function minContentRuns(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
): number {
  if (base.wrap === 'none') return layoutRuns(runs, base, measure).width;
  return toAtoms(createContext(runs, base, measure)).reduce(
    (widest, atom) => (atom.kind === 'word' ? Math.max(widest, atom.width) : widest),
    0,
  );
}
