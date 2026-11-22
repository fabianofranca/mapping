// Stage #2121 (HB3, decision 13): the cases the server and Chromium both measure (see `tests/fixtures/shaping-parity.json`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PARITY_STRINGS = [
  'fit',
  'ii',
  'fi ii',
  'AV To Ty',
  'Hamburgefonstiv',
] as const;
export const PARITY_SPACINGS = [0, 4] as const;
export const PARITY_SIZE = 100;
export const PARITY_FONTS = ['sans', 'calt', 'roboto'] as const;
/** Every font the cases use: the base ones and `rtl` (the extra cases of stage #2448). */
export const PARITY_ALL_FONTS = [...PARITY_FONTS, 'rtl'] as const;
export type ParityFont = (typeof PARITY_ALL_FONTS)[number];

export interface ParityCase {
  readonly font: ParityFont;
  readonly text: string;
  readonly letterSpacing: number;
  readonly width: number;
  /** The base direction of the text (absent = `ltr`; stage #2448). */
  readonly direction?: 'rtl';
  /** CSS weight (absent = 400). */
  readonly weight?: number;
  readonly italic?: boolean;
  /** The left edge (px) of each code point, in logical order (stage #2448). */
  readonly starts?: readonly number[];
  /** The bounding box of the drawn ink (px; stage #2448, BD2). */
  readonly ink?: { readonly left: number; readonly right: number; readonly top: number };
}

/** The input of an extra case (the values come from the server). */
export type ExtraCase = Pick<ParityCase, 'font' | 'text' | 'letterSpacing'> &
  Partial<Pick<ParityCase, 'direction' | 'weight' | 'italic'>>;

/**
 * The cases of stage #2448 (decision 10), on the `rtl` test font at size 100. They sit after the base cases in the
 * fixture, which keep their place and values.
 */
export const BIDI_CASES: readonly ExtraCase[] = [
  { font: 'rtl', text: 'abc אבג def', letterSpacing: 0 },
  { font: 'rtl', text: 'abc אבג def', letterSpacing: 4 },
  { font: 'rtl', text: 'abc אבג def', letterSpacing: 0, direction: 'rtl' },
  { font: 'rtl', text: 'אבג 123 דה', letterSpacing: 0, direction: 'rtl' },
  { font: 'rtl', text: 'Pay invoice.', letterSpacing: 0, direction: 'rtl' },
  { font: 'rtl', text: 'א(ב)', letterSpacing: 0, direction: 'rtl' },
];

/**
 * The bytes of each font: Mapping Sans, the test font of `scripts/testing/gsub-font.mjs --calt`, the Material 3
 * library's Roboto Regular `.woff2` (#2126: the server decodes it, Chromium loads the same bytes natively) and the
 * `--rtl` test font, with the Hebrew letters mapped to the glyphs of `A` to `J` (stage #2448).
 */
export function parityFontBytes(): Record<ParityFont, Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'mapping-parity-'));
  try {
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'calt.ttf'),
      '--calt',
    ]);
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'rtl.ttf'),
      '--rtl',
    ]);
    return {
      sans: new Uint8Array(readFileSync('mcp/fonts/MappingSans-Regular.ttf')),
      calt: new Uint8Array(readFileSync(join(dir, 'calt.ttf'))),
      roboto: new Uint8Array(
        readFileSync('libraries/material3-compose/fonts/Roboto-Regular.woff2'),
      ),
      rtl: new Uint8Array(readFileSync(join(dir, 'rtl.ttf'))),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const parityKey = (
  c: Pick<ParityCase, 'font' | 'text' | 'letterSpacing' | 'direction'>,
) =>
  `${c.font}|${c.letterSpacing}|${c.text}${c.direction === undefined ? '' : `|${c.direction}`}`;
