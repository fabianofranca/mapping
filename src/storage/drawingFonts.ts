/**
 * The drawing font: the embedded Mapping Sans and Mapping Mono (stage #2825, decisions 1 to 4). The MCP measures and
 * draws component text with these files, so the app registers the same four faces in `document.fonts` from bytes in
 * memory (the CSP blocks a font by URL) and the text the server fits is not cut in the canvas.
 *
 * Regular covers the weights 1 to 599 and bold 600 to 1000, style `normal`: weight 600 and above picks the bold
 * file, like the server's `BOLD_FROM`, with no synthetic bold. The interface keeps the system font.
 *
 * No import of the app's report log (`@preact/signals`): the embeddable viewer registers the same faces and carries
 * no signals. The caller says where a failure goes (`onError`).
 */
import mono from 'drawing-font:mono';
import monoBold from 'drawing-font:mono-bold';
import sans from 'drawing-font:sans';
import sansBold from 'drawing-font:sans-bold';
import type { FontHost } from './fonts';

export const DRAWING_SANS_FAMILY = 'Mapping Sans';
export const DRAWING_MONO_FAMILY = 'Mapping Mono';

interface DrawingFace {
  readonly family: string;
  readonly weight: string;
  readonly base64: string;
}

const REGULAR_WEIGHTS = '1 599';
const BOLD_WEIGHTS = '600 1000';

const FACES: readonly DrawingFace[] = [
  { family: DRAWING_SANS_FAMILY, weight: REGULAR_WEIGHTS, base64: sans },
  { family: DRAWING_SANS_FAMILY, weight: BOLD_WEIGHTS, base64: sansBold },
  { family: DRAWING_MONO_FAMILY, weight: REGULAR_WEIGHTS, base64: mono },
  { family: DRAWING_MONO_FAMILY, weight: BOLD_WEIGHTS, base64: monoBold },
];

const defaultHost = (): FontHost => ({
  FontFace: (globalThis as { FontFace?: FontHost['FontFace'] }).FontFace,
  fonts: typeof document !== 'undefined' ? document.fonts : undefined,
});

/** Where a failure goes when the caller says nothing. */
const warn = (error: unknown): void => console.warn('[drawing-fonts]', error);

/**
 * Where the loading is kept: on the `document.fonts` set itself, under a global symbol, so the app and the two
 * bundles of the viewer (`mapping-viewer` and `./formats`, each with its own copy of this module) register the faces
 * once per document, and a second call adds nothing.
 */
const LOADING = Symbol.for('mapping.drawingFonts');
type WithLoading = { [LOADING]?: Promise<void> };

/** The bytes of a face: the base64 text decoded into a fresh `ArrayBuffer`. */
function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Adds one face; `false` when it failed (the failure went to `onError`). */
async function addFace(
  host: FontHost,
  face: DrawingFace,
  onError: (error: unknown) => void,
): Promise<boolean> {
  const { FontFace, fonts } = host;
  if (!FontFace || !fonts) return false;
  try {
    const font = new FontFace(face.family, bytesOf(face.base64), {
      weight: face.weight,
      style: 'normal',
    });
    await font.load();
    fonts.add(font);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

/**
 * Adds the four Mapping faces to `document.fonts` and resolves when they are loaded. A face that fails to load goes
 * to `onError` and the others carry on (the component text falls back to the stack's generic family); it never
 * throws. A second call on the same document adds nothing and gives the first call's promise (unless a face
 * failed: then the next call tries again). Without `FontFace`
 * or `document.fonts` (a test, an old browser) it does nothing.
 */
export function registerDrawingFonts(
  host: FontHost = defaultHost(),
  onError: (error: unknown) => void = warn,
): Promise<void> {
  const { FontFace, fonts } = host;
  if (!FontFace || !fonts) return Promise.resolve();
  const done = (fonts as WithLoading)[LOADING];
  if (done !== undefined) return done;
  const loading = Promise.all(FACES.map((face) => addFace(host, face, onError))).then(
    (results) => {
      // A failure is not kept: a later call (another viewer, a reload of the library) tries again.
      if (results.includes(false)) delete (fonts as WithLoading)[LOADING];
    },
  );
  (fonts as WithLoading)[LOADING] = loading;
  return loading;
}
