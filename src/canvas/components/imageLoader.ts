// The only place that creates an image from a URL outside `src/storage/` (docs/ARCHITECTURE.md,
// "Remote images: policy, consent and loader"; `imageCreationSyntaxRules` rule in
// eslint.config.js): no code builds an image URL outside the URL policy and the consent.
// RI3 added the remote images here (`crossOrigin`, `referrerPolicy`, limits, cache).

import { signal, type ReadonlySignal } from '@preact/signals';
import type { RemoteImageView } from './remoteImageTypes';

export type {
  RemoteImageState,
  RemoteImageView,
  RemoteImageViewState,
} from './remoteImageTypes';

const DATA_URL = /^data:/i;

export interface EmbeddedImageHandlers {
  onLoad(element: HTMLImageElement): void;
  onError?(): void;
}

/** Embedded images kept by URL (the least recent leave; nobody re-decodes on every draw). */
export const EMBEDDED_IMAGE_CACHE_ENTRIES = 64;

const embeddedReady = new Map<string, HTMLImageElement>();
const embeddedWaiting = new Map<string, EmbeddedImageHandlers[]>();
const embeddedEpochSignal = signal(0);

/** Goes up when an embedded image finishes loading (the Catalog gallery redoes the PNG). */
export const embeddedImageEpoch: ReadonlySignal<number> = embeddedEpochSignal;

/** The embedded image already loaded (and makes it the most recent); `undefined` if not yet. */
export function cachedEmbeddedImage(src: string): HTMLImageElement | undefined {
  const element = embeddedReady.get(src);
  if (element) {
    embeddedReady.delete(src);
    embeddedReady.set(src, element);
  }
  return element;
}

/** Forgets the embedded images (tests and project switch). */
export function clearEmbeddedImages(): void {
  embeddedReady.clear();
  embeddedWaiting.clear();
}

function settleEmbedded(src: string, element: HTMLImageElement | null): void {
  const waiting = embeddedWaiting.get(src) ?? [];
  embeddedWaiting.delete(src);
  if (element === null) {
    for (const handlers of waiting) handlers.onError?.();
    return;
  }
  embeddedReady.set(src, element);
  while (embeddedReady.size > EMBEDDED_IMAGE_CACHE_ENTRIES) {
    const oldest = embeddedReady.keys().next();
    if (oldest.done) break;
    embeddedReady.delete(oldest.value);
  }
  embeddedEpochSignal.value += 1;
  for (const handlers of waiting) handlers.onLoad(element);
}

/**
 * Loads an embedded image (`data:`). Returns `null` for any other scheme
 * (extra defense: the renderer already falls back to the placeholder before calling). Whoever asks
 * while the same URL loads shares the same `Image`; the loaded one is kept (`cachedEmbeddedImage`).
 */
export function loadEmbeddedImage(
  src: string,
  handlers: EmbeddedImageHandlers,
): HTMLImageElement | null {
  if (!DATA_URL.test(src)) return null;
  const ready = embeddedReady.get(src);
  if (ready) {
    handlers.onLoad(ready);
    return ready;
  }
  const waiting = embeddedWaiting.get(src);
  if (waiting) {
    waiting.push(handlers);
    return null;
  }
  embeddedWaiting.set(src, [handlers]);
  const element = new Image();
  element.onload = () => settleEmbedded(src, element);
  element.onerror = () => settleEmbedded(src, null);
  element.src = src;
  return element;
}

// ---------------------------------------------------------------------------------------------
// Remote images (docs/ARCHITECTURE.md, "Remote images: policy, consent and loader"). The class
// does not know the consent or the URL policy: its caller (`remoteImages.ts`) only asks for a URL
// that already went through the app's two gates. Here live the limits (concurrency, time, size),
// the reduced bitmap, the in-memory cache and the single retry without CORS.

export interface RemoteImageRequest {
  /** "Show images from servers without CORS" switch (decision 17). */
  readonly allowNoCors: boolean;
}

/** Loader limits (decision 6). */
export const REMOTE_IMAGE_LIMITS = {
  parallel: 6,
  timeoutMs: 20_000,
  maxSide: 8192,
  maxPixels: 40_000_000,
  displaySide: 2048,
  cacheEntries: 64,
  /** Failures remembered in the session (only the URL and the reason; drops the oldest). */
  failureEntries: 512,
} as const;

/** Dependencies swappable in the tests (jsdom does not really load images). */
export interface RemoteImageLoaderDeps {
  createImage(): HTMLImageElement;
  /** `undefined` = the browser has no `createImageBitmap`: uses the element itself. */
  createBitmap:
    | ((image: HTMLImageElement, options?: ImageBitmapOptions) => Promise<ImageBitmap>)
    | undefined;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  requestFrame(callback: () => void): void;
}

function defaultDeps(): RemoteImageLoaderDeps {
  return {
    createImage: () => new Image(),
    createBitmap:
      typeof createImageBitmap === 'function'
        ? (image, options) => createImageBitmap(image, options)
        : undefined,
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
    requestFrame: (callback) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
      else globalThis.setTimeout(callback, 16);
    },
  };
}

interface Ready {
  readonly image: CanvasImageSource;
  /** The same `image` when it is a bitmap (has `close()`), otherwise `null`. */
  readonly bitmap: ImageBitmap | null;
  readonly width: number;
  readonly height: number;
  readonly opaque: boolean;
}

interface Pending {
  readonly url: string;
  /** Attempt without `crossOrigin` (the only one, decision 17). */
  readonly noCors: boolean;
  element: HTMLImageElement | null;
  timer: unknown;
}

interface Failure {
  readonly state: 'failed' | 'too-large';
  readonly timeout: boolean;
  /** The retry without CORS was already made (or it would not help): it is not repeated. */
  readonly triedNoCors: boolean;
}

export class RemoteImageLoader {
  private readonly deps: RemoteImageLoaderDeps;
  /** Loaded (`loaded` and `opaque`), from least to most recent (LRU by Map order). */
  private readonly ready = new Map<string, Ready>();
  private readonly failures = new Map<string, Failure>();
  private readonly inFlight = new Map<string, Pending>();
  private readonly queue: Pending[] = [];
  private active = 0;
  private readonly listeners = new Set<(url: string) => void>();
  private readonly toClose: ImageBitmap[] = [];
  private closeScheduled = false;
  /**
   * URLs requested in the current frame and the previous one: the cache does not evict any of them
   * (evicting an in-view URL would only get it requested again, in a cycle). With more in-view URLs
   * than the limit, the cache goes over the limit until they leave view.
   */
  private seen = new Set<string>();
  private seenBefore = new Set<string>();
  private seenScheduled = false;
  /** Last value of the CORS switch seen in a `request` (the retry depends on it). */
  private noCorsAllowed = false;
  private readonly epochSignal = signal(0);

  /** Goes up when an image finishes loading (the Catalog gallery invalidates the cache). */
  readonly epoch: ReadonlySignal<number> = this.epochSignal;

  constructor(deps: Partial<RemoteImageLoaderDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /**
   * The current state of a URL; starts the load if needed. Never throws. `url` must have
   * gone through the app's two gates (URL policy and consent).
   */
  request(url: string, { allowNoCors }: RemoteImageRequest): RemoteImageView {
    this.noCorsAllowed = allowNoCors;
    this.markSeen(url);
    const ready = this.ready.get(url);
    if (ready) {
      // An image loaded without CORS only shows with the switch on.
      if (ready.opaque && !allowNoCors) return { state: 'failed', reason: 'failed' };
      this.ready.delete(url);
      this.ready.set(url, ready);
      return {
        state: ready.opaque ? 'opaque' : 'loaded',
        image: ready.image,
        width: ready.width,
        height: ready.height,
      };
    }
    const failure = this.failures.get(url);
    if (failure) {
      // The single retry: the switch was turned on after the CORS failure.
      if (failure.state === 'failed' && !failure.triedNoCors && allowNoCors) {
        this.failures.delete(url);
        this.enqueue(url, true);
        return { state: 'loading' };
      }
      return failure.state === 'too-large'
        ? { state: 'too-large' }
        : { state: 'failed', reason: failure.timeout ? 'timeout' : 'failed' };
    }
    if (!this.inFlight.has(url)) this.enqueue(url, false);
    return { state: 'loading' };
  }

  /** Notifies (with the URL) each state change: loaded, failed or left the cache. */
  subscribe(listener: (url: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drops the cache and cancels what is in progress (tests and app shutdown). */
  dispose(): void {
    for (const pending of this.inFlight.values()) this.cancel(pending);
    this.inFlight.clear();
    this.queue.length = 0;
    this.active = 0;
    for (const entry of this.ready.values()) this.release(entry);
    this.ready.clear();
    this.failures.clear();
    this.listeners.clear();
    this.seen.clear();
    this.seenBefore.clear();
  }

  /** Marks the URL as in view; each frame the marks age one generation. */
  private markSeen(url: string): void {
    this.seen.add(url);
    if (this.seenScheduled) return;
    this.seenScheduled = true;
    this.deps.requestFrame(() => this.ageSeen());
  }

  private ageSeen(): void {
    this.seenBefore = this.seen;
    this.seen = new Set();
    // While marks from the previous generation remain, one more frame takes it out of view.
    if (this.seenBefore.size > 0) this.deps.requestFrame(() => this.ageSeen());
    else this.seenScheduled = false;
  }

  private enqueue(url: string, noCors: boolean): void {
    const pending: Pending = { url, noCors, element: null, timer: null };
    this.inFlight.set(url, pending);
    this.queue.push(pending);
    this.pump();
  }

  private pump(): void {
    while (this.active < REMOTE_IMAGE_LIMITS.parallel) {
      const next = this.queue.shift();
      if (!next) return;
      this.active += 1;
      this.start(next);
    }
  }

  private start(pending: Pending): void {
    const element = this.deps.createImage();
    pending.element = element;
    // No cookies across origins (except for the single retry without CORS) and no `Referer`.
    if (!pending.noCors) element.crossOrigin = 'anonymous';
    element.referrerPolicy = 'no-referrer';
    element.onload = () => {
      if (!this.owns(pending)) return;
      this.settle(pending);
      void this.onLoaded(pending, element);
    };
    element.onerror = () => {
      if (!this.owns(pending)) return;
      this.settle(pending);
      // Server without CORS: with the switch on, a single retry without `crossOrigin`.
      if (!pending.noCors && this.noCorsAllowed) {
        this.enqueue(pending.url, true);
        return;
      }
      this.fail(pending.url, 'failed', false, pending.noCors);
    };
    pending.timer = this.deps.setTimeout(() => {
      if (!this.owns(pending)) return;
      this.cancel(pending);
      this.settle(pending);
      // Timing out is not a lack of CORS: there is no retry.
      this.fail(pending.url, 'failed', true, true);
    }, REMOTE_IMAGE_LIMITS.timeoutMs);
    element.src = pending.url;
  }

  private owns(pending: Pending): boolean {
    return this.inFlight.get(pending.url) === pending;
  }

  /** Stops the clock and frees the slot (the next in the queue starts right away). */
  private settle(pending: Pending): void {
    if (pending.timer !== null) this.deps.clearTimeout(pending.timer);
    pending.timer = null;
    this.active = Math.max(0, this.active - 1);
    this.pump();
  }

  private cancel(pending: Pending): void {
    if (pending.timer !== null) this.deps.clearTimeout(pending.timer);
    pending.timer = null;
    const element = pending.element;
    if (!element) return;
    element.onload = null;
    element.onerror = null;
    // Abandons the transfer (only the empty string: never builds a URL outside the policy).
    element.src = '';
  }

  private fail(
    url: string,
    state: Failure['state'],
    timeout: boolean,
    triedNoCors: boolean,
  ): void {
    this.inFlight.delete(url);
    this.failures.delete(url);
    this.failures.set(url, { state, timeout, triedNoCors });
    while (this.failures.size > REMOTE_IMAGE_LIMITS.failureEntries) {
      const oldest = this.failures.keys().next();
      if (oldest.done) break;
      this.failures.delete(oldest.value);
    }
    this.emit(url);
  }

  private async onLoaded(pending: Pending, element: HTMLImageElement): Promise<void> {
    const { url } = pending;
    const width = element.naturalWidth;
    const height = element.naturalHeight;
    const { maxSide, maxPixels } = REMOTE_IMAGE_LIMITS;
    if (width <= 0 || height <= 0) {
      this.fail(url, 'failed', false, true);
      return;
    }
    if (width > maxSide || height > maxSide || width * height > maxPixels) {
      // Nothing is decoded to a bitmap.
      this.fail(url, 'too-large', false, true);
      return;
    }
    let shown: Omit<Ready, 'opaque'>;
    try {
      shown = await this.display(element, width, height);
    } catch {
      if (this.owns(pending)) this.fail(url, 'failed', false, pending.noCors);
      return;
    }
    // It may have been cancelled (`dispose`) while the bitmap was being made.
    if (!this.owns(pending)) {
      if (shown.bitmap) this.defer(shown.bitmap);
      return;
    }
    this.inFlight.delete(url);
    this.store(url, { ...shown, opaque: pending.noCors });
    this.epochSignal.value += 1;
    this.emit(url);
  }

  /** What is drawn: a bitmap reduced to 2048 px on the longer side, or the element itself. */
  private async display(
    element: HTMLImageElement,
    width: number,
    height: number,
  ): Promise<Omit<Ready, 'opaque'>> {
    const createBitmap = this.deps.createBitmap;
    if (!createBitmap) return { image: element, bitmap: null, width, height };
    const longest = Math.max(width, height);
    const limit = REMOTE_IMAGE_LIMITS.displaySide;
    try {
      const bitmap =
        longest <= limit
          ? await createBitmap(element)
          : await createBitmap(element, {
              resizeWidth: Math.max(1, Math.round((width * limit) / longest)),
              resizeHeight: Math.max(1, Math.round((height * limit) / longest)),
              resizeQuality: 'high',
            });
      return { image: bitmap, bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // No bitmap came out: the loaded element will do.
      return { image: element, bitmap: null, width, height };
    }
  }

  private store(url: string, entry: Ready): void {
    this.ready.set(url, entry);
    if (this.ready.size <= REMOTE_IMAGE_LIMITS.cacheEntries) return;
    // From least to most recent, only those not in view; above the limit, stops when
    // there are no more out of view.
    for (const [evictedUrl, evicted] of [...this.ready]) {
      if (this.ready.size <= REMOTE_IMAGE_LIMITS.cacheEntries) break;
      if (
        evictedUrl === url ||
        this.seen.has(evictedUrl) ||
        this.seenBefore.has(evictedUrl)
      )
        continue;
      this.ready.delete(evictedUrl);
      // A Konva node may be using the bitmap in this frame: `close()` waits for the next one.
      this.release(evicted);
      this.emit(evictedUrl);
    }
  }

  private release(entry: Ready): void {
    if (entry.bitmap) this.defer(entry.bitmap);
  }

  private defer(bitmap: ImageBitmap): void {
    this.toClose.push(bitmap);
    if (this.closeScheduled) return;
    this.closeScheduled = true;
    this.deps.requestFrame(() => {
      this.closeScheduled = false;
      for (const item of this.toClose.splice(0)) item.close();
    });
  }

  private emit(url: string): void {
    for (const listener of [...this.listeners]) listener(url);
  }
}

let shared: RemoteImageLoader | null = null;

/** The app's single loader (the cache survives project switches and reopenings). */
export function sharedRemoteImageLoader(): RemoteImageLoader {
  shared ??= new RemoteImageLoader();
  return shared;
}
