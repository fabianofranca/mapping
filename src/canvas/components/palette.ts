/**
 * Colors and measurements of the components' drawing that do not come from the scene. The product passes the
 * theme token values (`CanvasTokens.component`); `DEFAULT_PALETTE` is the default for whoever has no theme
 * (the embeddable viewer, the lab and the tests).
 */
export interface RenderPalette {
  /** Fill of the image placeholder. */
  readonly placeholderFill: string;
  /** Outline of the placeholder (X, image stroke, slot). */
  readonly placeholderLine: string;
  /** Outline of the node box the drawing does not know (and text of the missing-type box). */
  readonly unknownLine: string;
  /** Fill of the missing-type box (instance without a component or of an unknown type). */
  readonly unknownFill: string;
  /** Opacidade do contorno de um `slot`. */
  readonly slotOpacity: number;
  /** Size and family of the missing-type box's text font. */
  readonly labelFontSize: number;
  readonly labelFontFamily: string;
}

/** Lab default (without its own theme). */
export const DEFAULT_PALETTE: RenderPalette = {
  placeholderFill: 'rgba(128, 128, 128, 0.25)',
  placeholderLine: 'rgba(128, 128, 128, 0.8)',
  unknownLine: '#d81b60',
  unknownFill: 'rgba(216, 27, 96, 0.06)',
  slotOpacity: 0.6,
  labelFontSize: 12,
  labelFontFamily: 'system-ui, sans-serif',
};
