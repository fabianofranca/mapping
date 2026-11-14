import { signal, type ReadonlySignal } from '@preact/signals';

export type DisplayImage<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly bitmap: T }
  /** The file does not exist in the storage (missing image). */
  | { readonly status: 'missing' }
  /** The file exists but could not be decoded. */
  | { readonly status: 'error' };

export interface DisplayImages<T> {
  readonly images: ReadonlySignal<ReadonlyMap<string, DisplayImage<T>>>;
  /** Starts loading the image, if it is not already loaded or loading. */
  ensure(path: string): void;
  /**
   * Releases (`close()`) the bitmaps of the files outside `paths` (files that left the
   * project). If one of them comes back (undo), `ensure` loads it again.
   */
  retain(paths: ReadonlySet<string>): void;
  /** Discards the bitmap to load it again (e.g. file re-pointed). */
  invalidate(path: string): void;
  dispose(): void;
}

/**
 * Closes the bitmap only on the next frame. Whoever draws it (the canvas) may still have a
 * pending draw from the frame in which the bitmap was in the map: the map changes right away
 * and the next frame stops referencing it, before it closes. Drawing a closed `ImageBitmap`
 * throws `InvalidStateError` (finding 10 of the 2026-10-11 report).
 */
function closeAfterFrame(bitmap: { close(): void }): void {
  const close = () => bitmap.close();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(close);
  else setTimeout(close, 0);
}

/**
 * Display bitmaps by file path, loaded on demand and
 * released (`close()`) when leaving the project. The map never holds a closed bitmap: the
 * path leaves the map first and the bitmap closes after the next frame.
 */
export function createDisplayImages<T extends { close(): void }>(
  load: (path: string) => Promise<T | null>,
): DisplayImages<T> {
  const images = signal<ReadonlyMap<string, DisplayImage<T>>>(new Map());
  let disposed = false;
  let generation = 0;
  const loadingGeneration = new Map<string, number>();

  const set = (path: string, value: DisplayImage<T> | null) => {
    const next = new Map(images.value);
    if (value) next.set(path, value);
    else next.delete(path);
    images.value = next;
  };

  /** The bitmap of `path`, to close after taking it out of the map (`undefined` if none). */
  const bitmapOf = (path: string): T | undefined => {
    const current = images.value.get(path);
    return current?.status === 'ready' ? current.bitmap : undefined;
  };

  return {
    images,
    ensure(path) {
      if (disposed || images.value.has(path)) return;
      const token = ++generation;
      loadingGeneration.set(path, token);
      set(path, { status: 'loading' });
      load(path).then(
        (bitmap) => {
          const stale = disposed || loadingGeneration.get(path) !== token;
          if (stale) {
            bitmap?.close();
            return;
          }
          set(path, bitmap ? { status: 'ready', bitmap } : { status: 'missing' });
        },
        () => {
          if (!disposed && loadingGeneration.get(path) === token) {
            set(path, { status: 'error' });
          }
        },
      );
    },
    retain(paths) {
      if (disposed) return;
      const dropped = [...images.value.keys()].filter((path) => !paths.has(path));
      if (dropped.length === 0) return;
      const next = new Map(images.value);
      const bitmaps: T[] = [];
      for (const path of dropped) {
        const bitmap = bitmapOf(path);
        if (bitmap) bitmaps.push(bitmap);
        // A load in progress arrives "stale": the bitmap is closed on arrival.
        loadingGeneration.delete(path);
        next.delete(path);
      }
      images.value = next;
      for (const bitmap of bitmaps) closeAfterFrame(bitmap);
    },
    invalidate(path) {
      const bitmap = bitmapOf(path);
      loadingGeneration.delete(path);
      set(path, null);
      if (bitmap) closeAfterFrame(bitmap);
    },
    dispose() {
      disposed = true;
      const bitmaps = [...images.value.keys()].flatMap((path) => bitmapOf(path) ?? []);
      images.value = new Map();
      for (const bitmap of bitmaps) closeAfterFrame(bitmap);
    },
  };
}
