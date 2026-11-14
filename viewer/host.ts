/**
 * Embeddable viewer: HOST functions (loading the library by URL and registering the
 * fonts). They stay outside the core (`createViewer` does no network and registers no font) and the
 * demo pages do NOT use them: their CSP blocks network requests (`connect-src 'none'`).
 * They exist for the site that installs the package, where the library folder is served by URL.
 */
import { createFontRegistry } from '../src/storage/fonts';
import type { FontHost, FontRegistry, FontStatus } from '../src/storage/fonts';
import { loadLibrary, resolvePath } from '../src/model/components/library';
import type { Library, TextFile } from '../src/model/components/library';

export type { FontHost, FontStatus } from '../src/storage/fonts';

export interface LoadFromUrlOptions {
  /** Default: the global `fetch`. Pass one when the environment has none (or to authenticate). */
  readonly fetch?: typeof fetch;
  /** Also fetch the fonts declared in `fonts` (default `true`). */
  readonly fonts?: boolean;
}

/** Simultaneous requests of `loadLibraryFromUrl` (components, icons and fonts). */
export const MAX_PARALLEL_REQUESTS = 6;

/** Runs the tasks with at most `limit` in flight; returns the results in order. */
async function runLimited<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Relative references of the specialization: the types' `component`, the fonts' `file` and `icons`. */
function collectRefs(spec: unknown): {
  components: string[];
  fonts: string[];
  icons: string[];
} {
  const components: string[] = [];
  const fonts: string[] = [];
  const icons: string[] = [];
  if (!isRecord(spec)) return { components, fonts, icons };
  if (typeof spec.icons === 'string') icons.push(spec.icons);
  if (Array.isArray(spec.layers)) {
    for (const layer of spec.layers) {
      if (!isRecord(layer) || !Array.isArray(layer.annotationTypes)) continue;
      for (const type of layer.annotationTypes) {
        if (isRecord(type) && typeof type.component === 'string') {
          components.push(type.component);
        }
      }
    }
  }
  if (Array.isArray(spec.fonts)) {
    for (const font of spec.fonts) {
      if (isRecord(font) && typeof font.file === 'string') fonts.push(font.file);
    }
  }
  // Identical references count as a single request.
  return {
    components: [...new Set(components)],
    fonts: [...new Set(fonts)],
    icons: [...new Set(icons)],
  };
}

/** File name without the URL encoding (`my%20spec.json` → `my spec.json`). */
function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Loads the library from the specialization's URL: fetches the JSON, the components it
 * points to (text), the icons file (`icons`, text; always, even with `fonts: false`) and,
 * unless `fonts: false`, the fonts (bytes), all relative to the specialization's URL, and hands the
 * list of files to `loadLibrary`. A component, the icons file or a font that does not
 * come (non-ok response or network error) is left out, and `loadLibrary` reports it (in `problems`
 * or in the fonts' status). Throws if the specialization does not come or if there is no
 * `fetch`.
 */
export async function loadLibraryFromUrl(
  specUrl: string,
  options: LoadFromUrlOptions = {},
): Promise<Library> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error(
      'loadLibraryFromUrl: this environment has no fetch; the host must provide options.fetch.',
    );
  }
  const specResponse = await doFetch(specUrl);
  if (!specResponse.ok) {
    throw new Error(
      `Could not load the specialization ${specUrl} (HTTP ${specResponse.status}).`,
    );
  }
  const specText = await specResponse.text();
  // Absolute URL (the specialization may come relative to the host page).
  const base = new URL(specUrl, globalThis.location?.href ?? 'http://localhost/');
  const specName = decodeName(base.pathname.slice(base.pathname.lastIndexOf('/') + 1));
  const files: TextFile[] = [{ path: specName, text: specText }];

  let spec: unknown;
  try {
    spec = JSON.parse(specText);
  } catch {
    // Invalid JSON: loadLibrary reports the problem and throws for lack of a specialization.
    return loadLibrary(files, { allowOutside: true });
  }
  const refs = collectRefs(spec);

  const get = async <T>(
    ref: string,
    read: (response: Response) => Promise<T>,
  ): Promise<T | undefined> => {
    try {
      const response = await doFetch(new URL(ref, base).href);
      return response.ok ? await read(response) : undefined;
    } catch {
      return undefined;
    }
  };

  // A single set of requests (components, icons, fonts), with the limit on simultaneous ones.
  const fontRefs = options.fonts === false ? [] : refs.fonts;
  const fetched = await runLimited<string | ArrayBuffer | undefined>(
    [
      ...refs.components.map((ref) => () => get(ref, (r) => r.text())),
      ...refs.icons.map((ref) => () => get(ref, (r) => r.text())),
      ...fontRefs.map((ref) => () => get(ref, (r) => r.arrayBuffer())),
    ],
    MAX_PARALLEL_REQUESTS,
  );
  const components = fetched.slice(0, refs.components.length) as (string | undefined)[];
  const icons = fetched.slice(
    refs.components.length,
    refs.components.length + refs.icons.length,
  ) as (string | undefined)[];
  const fonts = fetched.slice(refs.components.length + refs.icons.length) as (
    ArrayBuffer | undefined
  )[];
  refs.components.forEach((ref, index) => {
    const text = components[index];
    if (text !== undefined) files.push({ path: resolvePath(specName, ref), text });
  });
  refs.icons.forEach((ref, index) => {
    const text = icons[index];
    if (text !== undefined) files.push({ path: resolvePath(specName, ref), text });
  });
  refs.fonts.forEach((ref, index) => {
    const bytes = fonts[index];
    if (bytes !== undefined) files.push({ path: resolvePath(specName, ref), bytes });
  });
  return loadLibrary(files, { allowOutside: true });
}

/**
 * Viewer registry per `host`: each call to `registerLibraryFonts` replaces the faces of the
 * previous call (the `src/storage/fonts.ts` registry has no module state).
 */
let defaultRegistry: FontRegistry | undefined;
const hostRegistries = new WeakMap<FontHost, FontRegistry>();

function registryFor(host: FontHost | undefined): FontRegistry {
  if (!host) return (defaultRegistry ??= createFontRegistry());
  let registry = hostRegistries.get(host);
  if (!registry) {
    registry = createFontRegistry(host);
    hostRegistries.set(host, registry);
  }
  return registry;
}

/**
 * Registers the library's fonts (the ones that came with bytes) in the host's document and
 * returns the status of each. Afterwards, call `viewer.redraw()` (or change `fontsVersion` in the
 * React wrapper) to remeasure the texts. `host` exists for tests and for environments without
 * `document.fonts`.
 */
export async function registerLibraryFonts(
  library: Library,
  host?: FontHost,
): Promise<FontStatus[]> {
  return registryFor(host).register(library.fonts);
}
