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

let loaded = false;

/**
 * Registers the four Mapping faces in the host document, once per document (a second call gives the first one's
 * loading). Resolves when they are loaded; a failure is a console warning and the stack's generic family applies.
 */
export function loadViewerFonts(): Promise<void> {
  return registerDrawingFonts().then(() => {
    loaded = true;
  });
}

/**
 * Whether a call of `loadViewerFonts` already finished: a viewer created after that has nothing to redraw (the first
 * viewer of the page redraws once, when the faces load), so the host's `onSource` and `onWarnings` do not fire again.
 */
export function viewerFontsLoaded(): boolean {
  return loaded;
}
