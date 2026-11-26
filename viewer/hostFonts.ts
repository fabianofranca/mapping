import type { HostFonts } from '../src/model/components/tokens';
import { registerDrawingFonts } from '../src/storage/drawingFonts';

/**
 * The fonts the viewer draws with when the host passes none: the model's built-in ones, the embedded Mapping Sans and
 * Mapping Mono (nothing to pass: `{}`). `screenFromFormat` sizes the markings with the same ones, so the boxes it
 * gives fit the drawing.
 */
export function viewerHostFonts(): HostFonts {
  return {};
}

/**
 * Registers the four Mapping faces in the host document, once per document (a second call gives the first one's
 * loading). Resolves when they are loaded; a failure is a console warning and the stack's generic family applies.
 */
export function loadViewerFonts(): Promise<void> {
  return registerDrawingFonts();
}
