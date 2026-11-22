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
/**
 * The variable families of stage #2574 (decision 6), built from the `variable-font.mjs` test fonts: `vwght1` and `vwght`
 * share the `--wght` bytes (declared `"400"` and `"100 900"`), `vslnt` and `vslntn` the `--slnt=-20,0,20` bytes (declared
 * `normal` and `italic`, and only `normal`), and `vital` the `--ital=0` bytes (declared `normal` and `italic`).
 */
export const VARIABLE_FONTS = ['vwght1', 'vwght', 'vslnt', 'vslntn', 'vital'] as const;
/** Every font the cases use: the base ones, `rtl` (the extra cases of stage #2448), the variable ones (#2574); `pair` is Mapping Sans at 400 and Mapping Mono at 900. */
export const PARITY_ALL_FONTS = [
  ...PARITY_FONTS,
  'rtl',
  'pair',
  ...VARIABLE_FONTS,
] as const;
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

/**
 * The variable-font cases (stage #2574, VA1, decision 6), after the weight cases. Each family has its upright 400 case,
 * which is the ink reference of the spec:
 * - `vwght1`, declared `"400"`, at 700: the 400 width, and the ink grows by the fake bold (#2652);
 * - `vwght`, declared `"100 900"`, at 700: the width follows the axis, with no fake bold;
 * - `vslnt`, declared `normal` and `italic`: the italic text uses the italic face at `slnt` −14, with no skew;
 * - `vslntn`, declared only `normal`: the italic text measures at `slnt` 0 and gets the 0.25 skew;
 * - `vital`, declared `normal` and `italic`: `ital` stays at its default, so the width equals the upright one.
 */
export const VARIABLE_CASES: readonly ExtraCase[] = [
  { font: 'vwght1', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'vwght1', text: 'Hamburgefonstiv', letterSpacing: 0, weight: 700 },
  { font: 'vwght', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'vwght', text: 'Hamburgefonstiv', letterSpacing: 0, weight: 700 },
  { font: 'vslnt', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'vslnt', text: 'Hamburgefonstiv', letterSpacing: 0, italic: true },
  { font: 'vslntn', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'vslntn', text: 'Hamburgefonstiv', letterSpacing: 0, italic: true },
  { font: 'vital', text: 'Hamburgefonstiv', letterSpacing: 0 },
  { font: 'vital', text: 'Hamburgefonstiv', letterSpacing: 0, italic: true },
];

/** The ink of the weight cases is compared within this many px, as a difference to the upright 400 reference. */
export const INK_TOLERANCE = 1;

/** The font faces to register: `pair` has two (Mapping Sans at 400, Mapping Mono at 900). */
export interface ParityFace {
  readonly family: ParityFont;
  readonly weight: string;
  readonly style: 'normal' | 'italic';
  readonly ext: 'ttf' | 'woff2';
  readonly bytes: Uint8Array;
}

export function parityFaces(): ParityFace[] {
  const bytes = parityFontBytes();
  const single = (['sans', 'calt', 'roboto', 'rtl'] as const).map((family) => ({
    family,
    weight: '400',
    style: 'normal' as const,
    ext: family === 'roboto' ? ('woff2' as const) : ('ttf' as const),
    bytes: bytes[family],
  }));
  const variable = (
    family: (typeof VARIABLE_FONTS)[number],
    weight: string,
    style: 'normal' | 'italic',
    of: 'wght' | 'slnt' | 'ital',
  ): ParityFace => ({ family, weight, style, ext: 'ttf', bytes: bytes[of] });
  return [
    ...single,
    { family: 'pair', weight: '400', style: 'normal', ext: 'ttf', bytes: bytes.sans },
    {
      family: 'pair',
      weight: '900',
      style: 'normal',
      ext: 'ttf',
      bytes: new Uint8Array(readFileSync('mcp/fonts/MappingMono-Regular.ttf')),
    },
    variable('vwght1', '400', 'normal', 'wght'),
    variable('vwght', '100 900', 'normal', 'wght'),
    variable('vslnt', '400', 'normal', 'slnt'),
    variable('vslnt', '400', 'italic', 'slnt'),
    variable('vslntn', '400', 'normal', 'slnt'),
    variable('vital', '400', 'normal', 'ital'),
    variable('vital', '400', 'italic', 'ital'),
  ];
}

/**
 * The bytes of each font: Mapping Sans, the test font of `scripts/testing/gsub-font.mjs --calt`, the Material 3
 * library's Roboto Regular `.woff2` (#2126: the server decodes it, Chromium loads the same bytes natively) and the
 * `--rtl` test font, with the Hebrew letters mapped to the glyphs of `A` to `J` (stage #2448), and the variable test fonts
 * of `scripts/testing/variable-font.mjs` (stage #2574): `wght`, `slnt` (−20, 0, 20) and `ital` (default 0).
 */
export function parityFontBytes(): Record<
  'sans' | 'calt' | 'roboto' | 'rtl' | 'wght' | 'slnt' | 'ital',
  Uint8Array
> {
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
    const variable: [string, string[]][] = [
      ['wght', ['--wght']],
      ['slnt', ['--slnt=-20,0,20']],
      ['ital', ['--ital=0']],
    ];
    for (const [name, options] of variable)
      execFileSync('node', [
        'scripts/testing/variable-font.mjs',
        join(dir, `${name}.ttf`),
        ...options,
      ]);
    return {
      wght: new Uint8Array(readFileSync(join(dir, 'wght.ttf'))),
      slnt: new Uint8Array(readFileSync(join(dir, 'slnt.ttf'))),
      ital: new Uint8Array(readFileSync(join(dir, 'ital.ttf'))),
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
