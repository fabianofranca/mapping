// Semantic zoom: when the marking shows the name. Pure function: the
// CanvasController only draws the result (header line with the name).

/** Minimum size on screen (px) of the marking for the header to appear. Adjustable. */
export const SEMANTIC_MIN_WIDTH = 180;
export const SEMANTIC_MIN_HEIGHT = 100;

/** `none`: no text. `header`: the header line (name + indicators). */
export type SemanticMode = 'none' | 'header';

export interface SemanticInput {
  /** Size of the marking's rectangle on screen, in px. */
  readonly screenWidth: number;
  readonly screenHeight: number;
}

/** Evaluated per marking: the header appears when it is large enough on screen. */
export function semanticMode(input: SemanticInput): SemanticMode {
  return input.screenWidth >= SEMANTIC_MIN_WIDTH &&
    input.screenHeight >= SEMANTIC_MIN_HEIGHT
    ? 'header'
    : 'none';
}
