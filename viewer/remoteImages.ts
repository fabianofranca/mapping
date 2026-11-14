/**
 * Remote images of the embeddable viewer. Off by default:
 * without the `remoteImages` option, no `Image` is created and nothing goes over the network.
 *
 * When on, both gates apply, in the host's version: the URL passes the model's pure policy
 * (`checkRemoteImageUrl`: `https:` only, no user and password, no local network) **and** the
 * origin passes the `allowOrigin(origin)` function that the HOST provides (default: refuse all).
 * The viewer stores no consent and has no interface to ask for it: the site decides.
 * It never uses the app's "server without CORS" switch (the image is always requested with
 * `crossOrigin = 'anonymous'`), so no image taints the canvas and the viewer's `toDataURL`
 * stays valid (and runs with `pixelSafe`).
 *
 * The loader is the product's (`RemoteImageLoader`: concurrency, timeout, maximum size,
 * downscaled bitmap, `no-referrer`), one per viewer, destroyed in `dispose()`.
 */
import {
  RemoteImageLoader,
  type RemoteImageView,
} from '../src/canvas/components/imageLoader';
import { checkRemoteImageUrl } from '../src/model/remoteImages';
import type { AllowOrigin } from './allowOrigin';

export type { AllowOrigin };

export interface ViewerRemoteImages {
  /** The URL's state (starts the load if needed; never throws). */
  resolve(url: string): RemoteImageView;
  /** Notifies (with the URL as the component wrote it) when an image's state changes. */
  subscribe(listener: (url: string) => void): () => void;
  dispose(): void;
}

function isAllowed(allowOrigin: AllowOrigin | undefined, origin: string): boolean {
  try {
    return allowOrigin?.(origin) === true;
  } catch {
    return false;
  }
}

export function createViewerRemoteImages(
  allowOrigin: AllowOrigin | undefined,
  loader: RemoteImageLoader = new RemoteImageLoader(),
): ViewerRemoteImages {
  // The loader works with the URL normalized by the policy; the drawing, with the field's.
  const rawUrls = new Map<string, Set<string>>();
  // Normalized URLs the loader has already announced once (loaded or failed). A second notice
  // for the same URL is the cache eviction (limit of 64): the screen does not reload the image
  // because of it, otherwise with more distinct URLs than the cache it would reload forever.
  const announced = new Set<string>();
  // Normalized URLs whose eviction notice is being passed on to the screen right now.
  const evicting = new Set<string>();
  return {
    resolve(url) {
      const check = checkRemoteImageUrl(url, {
        allowHttp: false,
        allowLocalNetwork: false,
      });
      if (!check.ok) return { state: 'invalid' };
      if (!isAllowed(allowOrigin, check.origin)) return { state: 'blocked-consent' };
      const known = rawUrls.get(check.url);
      if (known) known.add(url);
      else rawUrls.set(check.url, new Set([url]));
      // The screen only repaints what was just evicted with the placeholder; it is the one that asks again.
      if (evicting.has(check.url)) return { state: 'loading' };
      return loader.request(check.url, { allowNoCors: false });
    },
    subscribe: (listener) =>
      loader.subscribe((changed) => {
        const evicted = announced.delete(changed);
        if (!evicted) announced.add(changed);
        else evicting.add(changed);
        try {
          for (const url of rawUrls.get(changed) ?? [changed]) listener(url);
        } finally {
          evicting.delete(changed);
        }
      }),
    dispose() {
      loader.dispose();
      rawUrls.clear();
      announced.clear();
      evicting.clear();
    },
  };
}
