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
/** Every font the cases use: the base ones and `rtl` (the extra cases of stage #2448); `pair` is Mapping Sans at 400 and Mapping Mono at 900. */
export const PARITY_ALL_FONTS = [...PARITY_FONTS, 'rtl', 'pair'] as const;
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
  /** The bounding box of the drawn ink, relative to the origin and the baseline (px; stage #2448, BD2). */
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
 * The weight cases (stage #2448, BD2, decision 14): synthetic bold and italic on `sans`, registered only at 400, whose
 * width is the 400 one and whose ink is compared within 1 px; and the CSS matching on the `pair` family.
 */
export const WEIGHT_CASES: readonly ExtraCase[] = [
  // The references: the same text upright at 400, whose ink the others are compared against (the browser rounds the
  // bounds of `measureText` by its own rule, so only the difference to the reference is stable across machines).
  { font: 'sans', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'sans', text: 'H', letterSpacing: 0 },
  ...(['Hamburgefonstiv', 'H'] as const).flatMap((text) => [
    { font: 'sans', text, letterSpacing: 0, weight: 700 } as const,
    { font: 'sans', text, letterSpacing: 0, italic: true } as const,
  ]),
  { font: 'pair', text: 'Hamburgefonstiv', letterSpacing: 0, weight: 550 },
];

/** The ink of the weight cases is compared within this many px, as a difference to the upright 400 reference. */
export const INK_TOLERANCE = 1;

/** The font faces to register: `pair` has two (Mapping Sans at 400, Mapping Mono at 900). */
export interface ParityFace {
  readonly family: ParityFont;
  readonly weight: string;
  readonly ext: 'ttf' | 'woff2';
  readonly bytes: Uint8Array;
}

export function parityFaces(): ParityFace[] {
  const bytes = parityFontBytes();
  const single = (['sans', 'calt', 'roboto', 'rtl'] as const).map((family) => ({
    family,
    weight: '400',
    ext: family === 'roboto' ? ('woff2' as const) : ('ttf' as const),
    bytes: bytes[family],
  }));
  return [
    ...single,
    { family: 'pair', weight: '400', ext: 'ttf', bytes: bytes.sans },
    {
      family: 'pair',
      weight: '900',
      ext: 'ttf',
      bytes: new Uint8Array(readFileSync('mcp/fonts/MappingMono-Regular.ttf')),
    },
  ];
}

/**
 * The bytes of each font: Mapping Sans, the test font of `scripts/testing/gsub-font.mjs --calt`, the Material 3
 * library's Roboto Regular `.woff2` (#2126: the server decodes it, Chromium loads the same bytes natively) and the
 * `--rtl` test font, with the Hebrew letters mapped to the glyphs of `A` to `J` (stage #2448).
 */
export function parityFontBytes(): Record<Exclude<ParityFont, 'pair'>, Uint8Array> {
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
  c: Pick<
    ParityCase,
    'font' | 'text' | 'letterSpacing' | 'direction' | 'weight' | 'italic'
  >,
) =>
  `${c.font}|${c.letterSpacing}|${c.text}${c.direction === undefined ? '' : `|${c.direction}`}${c.weight === undefined ? '' : `|w${c.weight}`}${c.italic ? '|italic' : ''}`;
