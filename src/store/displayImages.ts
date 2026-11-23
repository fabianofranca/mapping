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
  /**
   * Loads the file again in place (content changed on disk); a path not in the map is left
   * alone. The entry stays as it is while the new load runs, so a `ready` image keeps showing
   * the old bitmap (no flash of the placeholder) until the new one arrives.
   */
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
 * path leaves the map first (or the new bitmap replaces the old one) and the bitmap closes
 * after the next frame. `invalidate` loads a path of the map again in place, so every reader
 * of the shared map (canvas, previews, review) redraws a file replaced on disk.
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

  /**
   * Starts a load with a new generation token. The entry of `path` stays as it is until the
   * load arrives; a result that a later load, `retain` or `dispose` made stale closes its bitmap.
   */
  const startLoad = (path: string) => {
    const token = ++generation;
    loadingGeneration.set(path, token);
    const current = () => !disposed && loadingGeneration.get(path) === token;
    load(path).then(
      (bitmap) => {
        if (!current()) {
          bitmap?.close();
          return;
        }
        const old = bitmapOf(path);
        set(path, bitmap ? { status: 'ready', bitmap } : { status: 'missing' });
        if (old) closeAfterFrame(old);
      },
      () => {
        if (!current()) return;
        const old = bitmapOf(path);
        set(path, { status: 'error' });
        if (old) closeAfterFrame(old);
      },
    );
  };

  return {
    images,
    ensure(path) {
      if (disposed || images.value.has(path)) return;
      set(path, { status: 'loading' });
      startLoad(path);
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
      if (disposed || !images.value.has(path)) return;
      startLoad(path);
    },
    dispose() {
      disposed = true;
      const bitmaps = [...images.value.keys()].flatMap((path) => bitmapOf(path) ?? []);
      images.value = new Map();
      for (const bitmap of bitmaps) closeAfterFrame(bitmap);
    },
  };
}
