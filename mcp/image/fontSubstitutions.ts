import type { Face } from './harfbuzz';

// A library font never makes the server fail (stages #2089 and #2121). HarfBuzz shapes every GSUB and GPOS lookup, so
// nothing is skipped; what stays is the last resort: a shaping that throws (a WebAssembly `RuntimeError`) is laid out
// with the embedded font, and no error reaches a tool. The file on disk is never changed.

/**
 * Runs a layout (`advance`, `path`) of a face so that no error reaches a tool: a throw lays the text out with the
 * embedded `fallback` font. Nothing the face cached comes from a layout that threw.
 */
export function guardedLayout<T>(
  face: Face,
  fallback: () => Face,
  layout: (face: Face) => T,
): T {
  try {
    return layout(face);
  } catch {
    return layout(fallback());
  }
}
