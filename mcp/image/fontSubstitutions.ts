import type { Face } from './harfbuzz';

// A library font never makes the server fail (stages #2089 and #2121). HarfBuzz shapes every GSUB and GPOS lookup, so
// nothing is skipped; what stays is the last resort: a shaping that throws (a WebAssembly `RuntimeError`) is laid out
// with the embedded font, and no error reaches a tool. The file on disk is never changed.

/**
 * Runs a layout (`advance`, `path`) of a face so that no error reaches a tool: a throw lays the text out with the
 * embedded `fallback` font. Nothing the face cached comes from a layout that threw. Returns the face that laid the
 * text out too, so what depends on the face (the vertical metrics) reads it from the same one that drew the glyphs
 * (stage #2267, decision 2). This is the only place that catches the throw.
 */
export function guardedLayoutWith<T>(
  face: Face,
  fallback: () => Face,
  layout: (face: Face) => T,
): { readonly value: T; readonly face: Face } {
  try {
    return { value: layout(face), face };
  } catch {
    const embedded = fallback();
    return { value: layout(embedded), face: embedded };
  }
}

/** `guardedLayoutWith` for a caller that only needs the layout's result. */
export function guardedLayout<T>(
  face: Face,
  fallback: () => Face,
  layout: (face: Face) => T,
): T {
  return guardedLayoutWith(face, fallback, layout).value;
}
