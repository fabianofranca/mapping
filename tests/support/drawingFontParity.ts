// The cases of the drawing font parity (stage #2825, decision 7): single words in the default component fonts,
// shared by `tests/mcp/drawingFontParity.test.ts` (the server's widths) and `tests/e2e/drawingFont.spec.ts`
// (the app's `konvaMeasurer` in Chromium).

/** The default stacks of `src/model/components/tokens.ts` (`DEFAULT_SANS`, `DEFAULT_MONO`). */
export const DRAWING_PARITY_FAMILIES = {
  sans: '"Mapping Sans", sans-serif',
  mono: '"Mapping Mono", monospace',
} as const;

export interface ParityCase {
  readonly family: keyof typeof DRAWING_PARITY_FAMILIES;
  readonly size: number;
  readonly weight: number;
  readonly text: string;
}

const WORDS = ['Hamburger', 'Confirm', 'illumination', 'WWW', 'Total 1.234,56'];

export const DRAWING_PARITY_CASES: readonly ParityCase[] = (
  ['sans', 'mono'] as const
).flatMap((family) =>
  [12, 14, 20].flatMap((size) =>
    [400, 700].flatMap((weight) => WORDS.map((text) => ({ family, size, weight, text }))),
  ),
);
