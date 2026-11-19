import type { Font, GsubLookup, GsubSubtable } from 'opentype.js';

// A library font never makes the server fail (stage #2089). `opentype.js` 2.0.0 applies only some
// GSUB subtables and throws on the rest (`substitutionType : 62 … is not yet supported`), while the
// browser reads the same fonts natively. So the server skips, in memory, what it cannot apply
// (`pruneSubstitutions`), checks the font with a sample text when it is loaded (`probeFont`) and
// guards every layout it asks of `opentype.js` (`guardedLayout`). The file on disk is never changed.

/** A kind of GSUB subtable: the lookup type and the subtable format. */
export interface SkippedSubtable {
  readonly lookupType: number;
  readonly substFormat: number;
  /** How many subtables of this kind were skipped. */
  readonly count: number;
}

/** The subtables `opentype.js` 2.0.0 applies (`FeatureQuery.getLookupMethod`), as `type.format`. */
const APPLIED = new Set(['1.1', '1.2', '2.1', '4.1', '5.1', '5.3', '6.3']);

/** The only kinds a chaining subtable (6.3) can cite: `chainingSubstitutionFormat3` throws on others. */
const CITABLE = new Set(['1.2', '2.1']);

interface Kind {
  readonly lookupType: number;
  readonly substFormat: number;
}

const keyOf = (kind: Kind): string => `${kind.lookupType}.${kind.substFormat}`;

/** The kind of a subtable; type 7 (extension) is classified by its inner type and format. */
function kindOf(lookup: GsubLookup, subtable: GsubSubtable): Kind {
  const { extension } = subtable;
  if (
    lookup.lookupType === 7 &&
    extension !== undefined &&
    subtable.lookupType !== undefined
  )
    return { lookupType: subtable.lookupType, substFormat: extension.substFormat };
  return { lookupType: lookup.lookupType, substFormat: subtable.substFormat };
}

/** Removes from each lookup the subtables `drop` says so; `drop` records what it removes. */
function dropSubtables(
  lookups: readonly GsubLookup[],
  drop: (kind: Kind, subtable: GsubSubtable) => boolean,
): void {
  for (const lookup of lookups)
    lookup.subtables = lookup.subtables.filter(
      (subtable) => !drop(kindOf(lookup, subtable), subtable),
    );
}

/** Whether every subtable of each lookup is one a chaining subtable can cite (an empty lookup is). */
function citableLookups(lookups: readonly GsubLookup[]): boolean[] {
  return lookups.map((lookup) =>
    lookup.subtables.every((subtable) => CITABLE.has(keyOf(kindOf(lookup, subtable)))),
  );
}

/** Whether a chaining subtable cites only lookups that exist and are `citable`. */
function citesOnlyCitable(subtable: GsubSubtable, citable: readonly boolean[]): boolean {
  const records = subtable.extension?.lookupRecords ?? subtable.lookupRecords ?? [];
  return records.every((record) => citable[record.lookupListIndex] === true);
}

function sortedSkips(skipped: ReadonlyMap<string, SkippedSubtable>): SkippedSubtable[] {
  return [...skipped.values()].sort(
    (a, b) => a.lookupType - b.lookupType || a.substFormat - b.substFormat,
  );
}

/**
 * Drops from the parsed font the GSUB subtables `opentype.js` cannot apply, and returns what it
 * skipped (by lookup type and format, sorted). Kept: 1.1, 1.2, 2.1, 4.1, 5.1, 5.3 and 6.3. A 6.3
 * subtable is also dropped when one of its `lookupRecords` cites a lookup with a subtable other
 * than 1.2 or 2.1 (judged on the lookups as they are after the first pass). The lookups and their
 * indexes stay: a lookup can end up with fewer subtables, or none.
 */
export function pruneSubstitutions(font: Font): SkippedSubtable[] {
  const lookups = font.tables?.gsub?.lookups;
  if (lookups === undefined) return [];
  const skipped = new Map<string, SkippedSubtable>();
  const skip = (kind: Kind): true => {
    const key = keyOf(kind);
    const count = (skipped.get(key)?.count ?? 0) + 1;
    skipped.set(key, { ...kind, count });
    return true;
  };
  dropSubtables(lookups, (kind) => !APPLIED.has(keyOf(kind)) && skip(kind));
  const citable = citableLookups(lookups);
  dropSubtables(
    lookups,
    (kind, subtable) =>
      keyOf(kind) === '6.3' && !citesOnlyCitable(subtable, citable) && skip(kind),
  );
  return sortedSkips(skipped);
}

/** Turns the font's glyph substitutions off (no GSUB table: kerning and metrics stay). */
export function turnOffSubstitutions(font: Font): void {
  if (font.tables?.gsub !== undefined) substitutionsOffCount++;
  if (font.tables !== undefined) delete font.tables.gsub;
}

let substitutionsOffCount = 0;

/**
 * Counts the fonts whose glyph substitutions were turned off. A width measured before a font loses them
 * (a ligature that no longer applies) is stale: the measurer's memo drops its entries when this changes.
 */
export function substitutionsEpoch(): number {
  return substitutionsOffCount;
}

/** The text the load probe lays out: letters, an `ffi` and an `fl`, and digits. */
export const PROBE_TEXT = 'Hamburgefonstiv ffi fl 0123456789';

function layoutThrows(font: Font): boolean {
  try {
    font.getAdvanceWidth(PROBE_TEXT, 16, { kerning: true });
    font.getPath(PROBE_TEXT, 0, 0, 16, { kerning: true });
    return false;
  } catch {
    return true;
  }
}

/** What the load probe found: the font lays out, only without substitutions, or not at all. */
export type FontProbe = 'ok' | 'gsub-off' | 'unusable';

/**
 * Lays out the sample text. On a throw the font's GSUB is turned off and the probe repeats; a
 * second throw means the font cannot be used.
 */
export function probeFont(font: Font): FontProbe {
  if (!layoutThrows(font)) return 'ok';
  turnOffSubstitutions(font);
  return layoutThrows(font) ? 'unusable' : 'gsub-off';
}

/** What loading a library font did: what it skipped and how the probe ended. */
export interface FontInspection {
  readonly skipped: readonly SkippedSubtable[];
  readonly probe: FontProbe;
}

/** Prunes and probes a freshly parsed font (the same steps for the measurer and `validate_library`). */
export function inspectFont(font: Font): FontInspection {
  const skipped = pruneSubstitutions(font);
  return { skipped, probe: probeFont(font) };
}

/**
 * Runs a layout (`getAdvanceWidth`, `getPath`) of `opentype.js` so that no error reaches a tool: a
 * throw turns the font's GSUB off and repeats; a second throw lays the text out with the embedded
 * `fallback` font.
 */
export function guardedLayout<T>(
  face: Font,
  fallback: () => Font,
  layout: (face: Font) => T,
): T {
  try {
    return layout(face);
  } catch {
    turnOffSubstitutions(face);
  }
  try {
    return layout(face);
  } catch {
    return layout(fallback());
  }
}
