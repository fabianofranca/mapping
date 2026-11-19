import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, type Font, type GsubLookup, type GsubSubtable } from 'opentype.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  guardedLayout,
  inspectFont,
  probeFont,
  pruneSubstitutions,
  turnOffSubstitutions,
} from '../../mcp/image/fontSubstitutions';
import { createFontBook, loadLibraryFont, textWidth } from '../../mcp/image/textMeasurer';

// Stage #2089 (FM1, decisions 1 and 2): the server skips the GSUB subtables `opentype.js` cannot
// apply, probes each library font when it loads and guards every layout.

let dir: string;
let bytes: ArrayBuffer;
const fresh = (): Font => parse(bytes.slice(0));
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapping-subst-'));
  execFileSync('node', ['scripts/testing/gsub-font.mjs', join(dir, 'gsub.ttf')]);
  const file = new Uint8Array(readFileSync(join(dir, 'gsub.ttf')));
  bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sub = (substFormat: number, extra: Partial<GsubSubtable> = {}): GsubSubtable => ({
  substFormat,
  ...extra,
});
const lookup = (lookupType: number, subtables: GsubSubtable[]): GsubLookup => ({
  lookupType,
  subtables,
});
/** A font object with only a GSUB table: what `pruneSubstitutions` reads. */
const withLookups = (lookups: GsubLookup[]): Font =>
  ({ tables: { gsub: { lookups } } }) as unknown as Font;
const kinds = (font: Font) =>
  font.tables!.gsub!.lookups.map((l) => l.subtables.map((s) => s.substFormat));

describe('pruneSubstitutions', () => {
  it('the test font skips 6.2 and 3.1 and keeps the ligature (the lookups and their indexes stay)', () => {
    const font = fresh();
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 3, substFormat: 1, count: 1 },
      { lookupType: 6, substFormat: 2, count: 1 },
    ]);
    expect(font.tables!.gsub!.lookups.map((l) => l.lookupType)).toEqual([6, 3, 4]);
    expect(kinds(font)).toEqual([[], [], [1]]);
  });

  it('the skip list is sorted by type and format, with a count per kind', () => {
    const font = withLookups([
      lookup(6, [sub(2), sub(1), sub(2)]),
      lookup(3, [sub(1)]),
      lookup(1, [sub(1), sub(2)]),
    ]);
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 3, substFormat: 1, count: 1 },
      { lookupType: 6, substFormat: 1, count: 1 },
      { lookupType: 6, substFormat: 2, count: 2 },
    ]);
    expect(kinds(font)).toEqual([[], [], [1, 2]]);
  });

  it('keeps 1.1, 1.2, 2.1, 4.1, 5.1, 5.3 and 6.3 and skips the other formats of those types', () => {
    const font = withLookups([
      lookup(1, [sub(1), sub(2)]),
      lookup(2, [sub(1)]),
      lookup(4, [sub(1)]),
      lookup(5, [sub(1), sub(2), sub(3)]),
      lookup(6, [sub(3)]),
      lookup(8, [sub(1)]),
    ]);
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 5, substFormat: 2, count: 1 },
      { lookupType: 8, substFormat: 1, count: 1 },
    ]);
  });

  it('type 7 is classified by the inner type and format, and a kept one stays wrapped', () => {
    const wrapped = (lookupType: number, substFormat: number) =>
      sub(1, { lookupType, extension: sub(substFormat) });
    const font = withLookups([lookup(7, [wrapped(4, 1), wrapped(6, 2), wrapped(3, 1)])]);
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 3, substFormat: 1, count: 1 },
      { lookupType: 6, substFormat: 2, count: 1 },
    ]);
    expect(font.tables!.gsub!.lookups[0]!.subtables).toHaveLength(1);
    expect(font.tables!.gsub!.lookups[0]!.subtables[0]!.extension!.substFormat).toBe(1);
  });

  const chain = (...indexes: number[]) =>
    sub(3, {
      lookupRecords: indexes.map((lookupListIndex) => ({
        sequenceIndex: 0,
        lookupListIndex,
      })),
    });

  it('a 6.3 that cites only 1.2 or 2.1 lookups stays', () => {
    const font = withLookups([
      lookup(6, [chain(1, 2)]),
      lookup(1, [sub(2)]),
      lookup(2, [sub(1)]),
    ]);
    expect(pruneSubstitutions(font)).toEqual([]);
    expect(kinds(font)).toEqual([[3], [2], [1]]);
  });

  it('a 6.3 that cites a lookup with another kind (1.1 here) is skipped, with its count', () => {
    const font = withLookups([
      lookup(6, [chain(1), chain(2)]),
      lookup(1, [sub(1)]),
      lookup(1, [sub(2)]),
    ]);
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 6, substFormat: 3, count: 1 },
    ]);
    expect(font.tables!.gsub!.lookups[0]!.subtables).toHaveLength(1);
  });

  it('a 6.3 that cites a missing lookup is skipped; one that cites a lookup emptied by pruning stays', () => {
    const font = withLookups([lookup(6, [chain(9), chain(1)]), lookup(3, [sub(1)])]);
    expect(pruneSubstitutions(font)).toEqual([
      { lookupType: 3, substFormat: 1, count: 1 },
      { lookupType: 6, substFormat: 3, count: 1 },
    ]);
    expect(font.tables!.gsub!.lookups[0]!.subtables).toHaveLength(1);
  });

  it('a font without GSUB skips nothing', () => {
    expect(pruneSubstitutions({ tables: {} } as unknown as Font)).toEqual([]);
    expect(pruneSubstitutions({} as unknown as Font)).toEqual([]);
  });
});

describe('probe at load', () => {
  it('the raw test font throws; pruned, it lays out (probe ok)', () => {
    const raw = fresh();
    expect(() => raw.getAdvanceWidth('fit', 14, { kerning: true })).toThrow(
      /substitutionType : 62/,
    );
    const font = fresh();
    expect(inspectFont(font)).toEqual({
      skipped: [
        { lookupType: 3, substFormat: 1, count: 1 },
        { lookupType: 6, substFormat: 2, count: 1 },
      ],
      probe: 'ok',
    });
    expect(font.getAdvanceWidth('fit', 14, { kerning: true })).toBeGreaterThan(0);
  });

  it('a font that still throws has its GSUB turned off and then lays out (gsub-off)', () => {
    const tables: { gsub?: { lookups: GsubLookup[] } } = { gsub: { lookups: [] } };
    const font = {
      tables,
      getAdvanceWidth: () => {
        if (tables.gsub !== undefined) throw new Error('boom');
        return 10;
      },
      getPath: () => ({ commands: [] }),
    } as unknown as Font;
    expect(probeFont(font)).toBe('gsub-off');
    expect(tables.gsub).toBeUndefined();
  });

  it('a font that throws even without GSUB is unusable, and the book leaves it out', () => {
    const font = {
      tables: { gsub: { lookups: [] } },
      getAdvanceWidth: () => {
        throw new Error('boom');
      },
      getPath: () => ({ commands: [] }),
    } as unknown as Font;
    expect(probeFont(font)).toBe('unusable');
    // An unreadable file: `loadLibraryFont` has no font to give, and the embedded one applies.
    expect(loadLibraryFont(new ArrayBuffer(8))).toBeNull();
    const book = createFontBook([
      {
        family: 'Broken',
        weight: '400',
        style: 'normal',
        path: 'fonts/Broken.ttf',
        bytes: new ArrayBuffer(8),
      },
    ]);
    expect(book.hasLibraryFonts).toBe(false);
  });

  it('the book keeps a library font whose GSUB had to be pruned', () => {
    const book = createFontBook([
      { family: 'Gsub', weight: '400', style: 'normal', path: 'fonts/Gsub.ttf', bytes },
    ]);
    expect(book.hasLibraryFonts).toBe(true);
    expect(book.fontFor('Gsub', 400, false)).not.toBe(book.embeddedFor('Gsub', 400));
  });

  it('the embedded stand-in follows the same first-match rule as `fontFor`', () => {
    const book = createFontBook([
      { family: 'Gsub', weight: '400', style: 'normal', path: 'fonts/Gsub.ttf', bytes },
    ]);
    const mono = book.embeddedFor('monospace', 400);
    const sans = book.embeddedFor('sans-serif', 400);
    expect(mono).not.toBe(sans);
    // The library font comes first in the stack: its stand-in is proportional, not the mono face.
    expect(book.embeddedFor('Gsub, monospace', 400)).toBe(sans);
    // A mono family first: the mono face, as `fontFor` resolves it.
    expect(book.embeddedFor('monospace, Gsub', 400)).toBe(mono);
  });
});

describe('guardedLayout', () => {
  const makeFont = (throws: number) => {
    let left = throws;
    const font = {
      tables: { gsub: { lookups: [] as GsubLookup[] } },
      layout() {
        if (left-- > 0) throw new Error('boom');
        return 'own';
      },
    };
    return font;
  };

  it('a layout that works is not touched', () => {
    const font = makeFont(0);
    const result = guardedLayout(
      font as unknown as Font,
      () => {
        throw new Error('no fallback needed');
      },
      () => font.layout(),
    );
    expect(result).toBe('own');
    expect(font.tables.gsub).toBeDefined();
  });

  it('a layout that throws once turns the GSUB off and repeats', () => {
    const font = makeFont(1);
    const result = guardedLayout(
      font as unknown as Font,
      () => {
        throw new Error('no fallback needed');
      },
      () => font.layout(),
    );
    expect(result).toBe('own');
    expect((font as { tables: { gsub?: unknown } }).tables.gsub).toBeUndefined();
  });

  it('a layout that always throws goes to the embedded font', () => {
    const font = makeFont(Infinity);
    const embedded = { name: 'embedded' } as unknown as Font;
    const result = guardedLayout(
      font as unknown as Font,
      () => embedded,
      (face) => (face === embedded ? 'embedded' : font.layout()),
    );
    expect(result).toBe('embedded');
    expect((font as { tables: { gsub?: unknown } }).tables.gsub).toBeUndefined();
  });

  it('turnOffSubstitutions leaves the other tables', () => {
    const font = {
      tables: { gsub: { lookups: [] }, os2: { sCapHeight: 700 } },
    } as unknown as Font;
    turnOffSubstitutions(font);
    expect(font.tables).toEqual({ os2: { sCapHeight: 700 } });
  });
});

describe('the book guards the text it measures', () => {
  it('a font that starts to throw after loading still measures (GSUB off), and then falls back to the embedded font', () => {
    const book = createFontBook([
      { family: 'Gsub', weight: '400', style: 'normal', path: 'fonts/Gsub.ttf', bytes },
    ]);
    const face = book.fontFor('Gsub', 400, false);
    const real = face.getAdvanceWidth.bind(face);
    let throws = 1;
    face.getAdvanceWidth = (text, size, options) => {
      if (throws-- > 0) throw new Error('boom');
      return real(text, size, options);
    };
    const style = {
      family: 'Gsub',
      size: 14,
      weight: 400,
      italic: false,
      letterSpacing: 0,
    };
    expect(textWidth(book, 'fit', style)).toBeCloseTo(
      real('fit', 14, { kerning: true }),
      6,
    );

    face.getAdvanceWidth = () => {
      throw new Error('always');
    };
    const embedded = book.embeddedFor('Gsub', 400);
    expect(textWidth(book, 'fit', style)).toBeCloseTo(
      embedded.getAdvanceWidth('fit', 14, { kerning: true }),
      6,
    );
  });
});
