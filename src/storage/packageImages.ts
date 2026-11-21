/**
 * Library package images in the app (stage #1903, decision 18): the bytes of a file that a
 * component's `image` node cites are decoded with `createImageBitmap(new Blob([bytes]))`, so there
 * is no URL and no `<img>`: the CSP's `img-src` and Trusted Types do not apply, and `pwa/csp.ts`
 * does not change. The decoded bitmaps live in a bounded LRU cache; the drawing asks for
 * `(specId, asset)` and gets the placeholder (`loading`, `failed`) until the bitmap is ready.
 *
 * Reads and decodes start on the first `resolve`, a few at a time. What a library cites is
 * checked again here with the validator's own rules (`imageProblems`: format by header, 1 MB,
 * 2048 px), so a package that skipped the validator still cannot grow the app's memory.
 *
 * Each user creates its own cache (`createPackageImages`); there is no module state.
 */
import { packageImageKey } from '../model/components/imagePath';
import { imageProblems } from '../model/libraryImages';

/** The decoded image. */
export type DecodedPackageImage = ImageBitmap;

/** Why an image is not drawn: no file, over the limits or not the format, or not decodable. */
export type PackageImageFailure = 'missing' | 'refused' | 'decode';

export type PackageImageView =
  | { readonly state: 'loading' }
  | {
      readonly state: 'ready';
      readonly image: DecodedPackageImage;
      readonly width: number;
      readonly height: number;
    }
  | { readonly state: 'failed'; readonly reason: PackageImageFailure };

export const PACKAGE_IMAGE_LIMITS = {
  /** Decoded bytes (RGBA: 4 bytes a pixel) the cache holds; the least recently used leaves first. */
  cacheBytes: 64 * 1024 * 1024,
  /** How many files are read and decoded at the same time. */
  concurrency: 4,
} as const;

/** What the canvas and the gallery need to draw package images. */
export interface PackageImages {
  /** The state of `(specId, asset)`; starts the read and decode if needed. Never throws. */
  resolve(specId: string, asset: string): PackageImageView;
  /** Notifies (with `packageImageKey`) when an image's state changes. */
  subscribe(listener: (key: string) => void): () => void;
  /** Frees the bitmaps of one specialization (its package changed or left the project). */
  drop(specId: string): void;
  /** Frees everything. */
  clear(): void;
  /** How many images the cache holds (ready or failed). */
  readonly size: number;
  /** Decoded bytes held. */
  readonly bytes: number;
}

export interface PackageImagesDeps {
  /** The bytes of a package file, or `null` when it is not there. */
  readonly read: (specId: string, asset: string) => Promise<ArrayBuffer | null>;
  /** Default: `createImageBitmap(blob, { imageOrientation: 'from-image' })`. */
  readonly decode?: (blob: Blob) => Promise<DecodedPackageImage>;
  readonly cacheBytes?: number;
  readonly concurrency?: number;
}

export { packageImageKey };

const defaultDecode = (blob: Blob): Promise<DecodedPackageImage> =>
  createImageBitmap(blob, { imageOrientation: 'from-image' });

interface Entry {
  view: PackageImageView;
  readonly specId: string;
}

export function createPackageImages(deps: PackageImagesDeps): PackageImages {
  const decode = deps.decode ?? defaultDecode;
  const cacheBytes = deps.cacheBytes ?? PACKAGE_IMAGE_LIMITS.cacheBytes;
  const concurrency = deps.concurrency ?? PACKAGE_IMAGE_LIMITS.concurrency;
  /** In use order: the first is the least recently used. */
  const entries = new Map<string, Entry>();
  const listeners = new Set<(key: string) => void>();
  const queue: (() => Promise<void>)[] = [];
  let running = 0;

  const bytesOf = (entry: Entry): number =>
    entry.view.state === 'ready' ? entry.view.width * entry.view.height * 4 : 0;

  // A bitmap that was handed out is never closed: a mounted drawing may hold it for as long as it
  // lives, and a closed one throws in `drawImage`; the garbage collector reclaims it.
  const free = (key: string): void => {
    entries.delete(key);
  };

  const total = (): number => {
    let sum = 0;
    for (const entry of entries.values()) sum += bytesOf(entry);
    return sum;
  };

  const trim = (keep: string): void => {
    let held = total();
    for (const [key, entry] of entries) {
      if (held <= cacheBytes) return;
      if (key === keep) continue;
      // A read in flight has nothing to free, and dropping it would discard its result.
      if (entry.view.state !== 'ready') continue;
      held -= bytesOf(entry);
      entries.delete(key);
    }
  };

  const notify = (key: string): void => {
    for (const listener of [...listeners]) listener(key);
  };

  async function load(specId: string, asset: string): Promise<PackageImageView> {
    let buffer: ArrayBuffer | null;
    try {
      buffer = await deps.read(specId, asset);
    } catch {
      return { state: 'failed', reason: 'missing' };
    }
    if (buffer === null) return { state: 'failed', reason: 'missing' };
    const bytes = new Uint8Array(buffer);
    if (imageProblems(asset, { bytes }).length > 0) {
      return { state: 'failed', reason: 'refused' };
    }
    try {
      const image = await decode(new Blob([bytes]));
      return { state: 'ready', image, width: image.width, height: image.height };
    } catch {
      return { state: 'failed', reason: 'decode' };
    }
  }

  function finish(key: string, owner: Entry, view: PackageImageView): void {
    if (entries.get(key) !== owner) {
      // Dropped while it loaded: nobody was given it, so it can be closed at once.
      if (view.state === 'ready') view.image.close();
      return;
    }
    owner.view = view;
    trim(key);
    notify(key);
  }

  function pump(): void {
    while (running < concurrency && queue.length > 0) {
      const task = queue.shift();
      if (!task) return;
      running++;
      void task().finally(() => {
        running--;
        pump();
      });
    }
  }

  return {
    resolve(specId, asset) {
      const key = packageImageKey(specId, asset);
      const hit = entries.get(key);
      if (hit) {
        // Use order: the entry becomes the most recent.
        entries.delete(key);
        entries.set(key, hit);
        return hit.view;
      }
      const owner: Entry = { view: { state: 'loading' }, specId };
      entries.set(key, owner);
      queue.push(async () => {
        finish(key, owner, await load(specId, asset));
      });
      pump();
      return owner.view;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    drop(specId) {
      for (const [key, entry] of [...entries]) {
        if (entry.specId === specId) free(key);
      }
    },
    clear() {
      for (const key of [...entries.keys()]) free(key);
    },
    get size() {
      return entries.size;
    },
    get bytes() {
      return total();
    },
  };
}
