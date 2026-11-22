import bidiFactory from 'bidi-js';

// The Unicode bidirectional algorithm (UAX #9) for the server's shaper (stage #2448, decision 2). This is the only
// module that imports `bidi-js`, and only `harfbuzz.ts` imports this one. Pure: no DOM.

/** A span of the text (UTF-16 offsets, `end` exclusive) that reads in one direction. */
export interface BidiRun {
  readonly start: number;
  readonly end: number;
  readonly rtl: boolean;
}

/** The first code unit that can have a bidi class other than L or the neutrals (the Hebrew block). */
const FIRST_RTL_UNIT = 0x0590;

/** An astral character (a surrogate pair); `bidi-js` classifies each UTF-16 unit on its own, so it would read as two letters. */
const ASTRAL = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const ASTRAL_LETTER = /^\p{L}$/u;

let bidi: ReturnType<typeof bidiFactory> | undefined;

const algorithm = () => (bidi ??= bidiFactory());

/** Whether every code unit is below U+0590: none has the class R, AL or AN, or is an explicit control. */
function belowHebrew(text: string): boolean {
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) >= FIRST_RTL_UNIT) return false;
  return true;
}

/**
 * The directional runs of the one-line `text` with `direction` as the base, in **visual** order (left to right on the
 * screen): the longest spans of one embedding level, ordered by the line reordering of the algorithm (rule L2).
 * A text in `ltr` with no code unit at or above U+0590 is one left-to-right run (every level is 0) and `bidi-js` is
 * not called.
 */
export function bidiRuns(text: string, direction: 'ltr' | 'rtl'): BidiRun[] {
  if (text === '') return [];
  if (direction === 'ltr' && belowHebrew(text))
    return [{ start: 0, end: text.length, rtl: false }];
  const api = algorithm();
  // Each astral character becomes two units, so the offsets stay those of `text`: a letter is strong left-to-right
  // (`aa`) and the rest (emoji, symbols) is neutral, as in UAX #9 (the rare right-to-left scripts above U+FFFF are
  // not handled).
  const masked = text.replace(ASTRAL, (c) => (ASTRAL_LETTER.test(c) ? 'aa' : '!!'));
  const embedding = api.getEmbeddingLevels(masked, direction);
  // The code units in visual order: each reversed segment of the line, applied in sequence.
  const order = Array.from({ length: text.length }, (_, i) => i);
  for (const [from, to] of api.getReorderSegments(masked, embedding)) {
    const reversed = order.slice(from!, to! + 1).reverse();
    order.splice(from!, reversed.length, ...reversed);
  }
  return visualRuns(order, embedding.levels);
}

/** The visual order split where the level changes or the logical order breaks: each piece is one run. */
function visualRuns(order: readonly number[], levels: Uint8Array): BidiRun[] {
  const runs: BidiRun[] = [];
  let first = 0;
  const close = (last: number) => {
    const a = order[first]!;
    const b = order[last]!;
    runs.push({
      start: Math.min(a, b),
      end: Math.max(a, b) + 1,
      rtl: levels[a]! % 2 === 1,
    });
  };
  for (let i = 1; i < order.length; i++) {
    const step = order[i]! - order[i - 1]!;
    const sameRun =
      levels[order[i]!] === levels[order[i - 1]!] &&
      (levels[order[i]!]! % 2 === 1 ? step === -1 : step === 1);
    if (!sameRun) {
      close(i - 1);
      first = i;
    }
  }
  close(order.length - 1);
  return runs;
}
