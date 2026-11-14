/**
 * Design-system fonts loaded from the **bytes** of the files in the folder (or the zip),
 * without network. The app's CSP blocks loading a font by URL, but not a `FontFace` built
 * from an `ArrayBuffer` already in memory. Once loaded, the canvas uses the family by name;
 * the caller must re-measure the texts and redraw.
 *
 * Each user creates its own registry (`createFontRegistry`): the registry remembers the faces
 * it added to the document, to remove them when switching libraries. There is no module state.
 */
import type { LoadedFont } from '../model/components/library';

export interface FontStatus {
  readonly font: LoadedFont;
  readonly status: 'loaded' | 'missing' | 'failed';
  /** Why the font did not load; the interface builds the text through `t()`. */
  readonly problem?: FontProblem;
}

/** Code and parameters of the reason (no text: the language belongs to the interface). */
export type FontProblem =
  | { readonly code: 'missing'; readonly path: string }
  | { readonly code: 'no-fontface' }
  | { readonly code: 'load-failed'; readonly message: string };

/** `FontFace` and `document.fonts`, injectable in tests (jsdom does not have them). */
export interface FontHost {
  readonly FontFace?: new (
    family: string,
    source: ArrayBuffer,
    descriptors?: { weight?: string; style?: string },
  ) => { load(): Promise<unknown> };
  readonly fonts?: { add(face: unknown): unknown; delete(face: unknown): boolean };
}

const defaultHost = (): FontHost => ({
  FontFace: (globalThis as { FontFace?: FontHost['FontFace'] }).FontFace,
  fonts: typeof document !== 'undefined' ? document.fonts : undefined,
});

/** Font registry: keeps the faces added to the document so they can be removed. */
export interface FontRegistry {
  /**
   * Registers the fonts with bytes and returns the status of each declaration. The faces
   * registered earlier by this registry are removed first, so a family with the same name
   * does not mix weights from two packages.
   */
  register(fonts: readonly LoadedFont[]): Promise<FontStatus[]>;
  /** Removes from the document the faces this registry added. */
  clear(): void;
}

export function createFontRegistry(host: FontHost = defaultHost()): FontRegistry {
  let registered: unknown[] = [];

  const clear = (): void => {
    const set = host.fonts;
    if (set) for (const face of registered) set.delete(face);
    registered = [];
  };

  const register = async (fonts: readonly LoadedFont[]): Promise<FontStatus[]> => {
    const { FontFace, fonts: set } = host;
    clear();
    const out: FontStatus[] = [];
    for (const font of fonts) {
      if (!font.bytes) {
        out.push({
          font,
          status: 'missing',
          problem: { code: 'missing', path: font.path },
        });
        continue;
      }
      if (!FontFace || !set) {
        out.push({ font, status: 'failed', problem: { code: 'no-fontface' } });
        continue;
      }
      try {
        const face = new FontFace(font.family, font.bytes, {
          weight: font.weight,
          style: font.style,
        });
        await face.load();
        set.add(face);
        registered.push(face);
        out.push({ font, status: 'loaded' });
      } catch (error) {
        out.push({
          font,
          status: 'failed',
          problem: {
            code: 'load-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    return out;
  };

  return { register, clear };
}
