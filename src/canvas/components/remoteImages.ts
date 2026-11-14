// The bridge between the drawing and remote images (docs/ARCHITECTURE.md, "Remote images: policy,
// consent and loader"): resolves each URL through the app's two gates (URL policy and consent) and,
// once allowed, through the loader. Used by the main canvas and the Catalog gallery.
import { computed, type ReadonlySignal } from '@preact/signals';
import { allowNoCors, remoteImageGate } from '../../store/imagePermissions';
import { reportRemoteImageIssue, resolveRemoteImageIssue } from '../../store/diagnostics';
import {
  REMOTE_IMAGE_LIMITS,
  type RemoteImageLoader,
  type RemoteImageView,
  sharedRemoteImageLoader,
} from './imageLoader';

/** What the canvas and the gallery need to draw remote images. */
export interface RemoteImageSource {
  /** The URL's state (starts the load if needed; never throws). */
  resolve(url: string): RemoteImageView;
  /** Notifies (with the URL) when an image's state changes in the loader. */
  subscribe(listener: (url: string) => void): () => void;
  /**
   * Changes (another value) when the consent or a switch changes: everything that uses a remote
   * image must be redone. Read inside `effect`/`computed`.
   */
  readonly gate: ReadonlySignal<unknown>;
  /** Rises when an image finishes loading. */
  readonly epoch: ReadonlySignal<number>;
}

export interface RemoteImageSourceDeps {
  readonly loader: RemoteImageLoader;
  readonly gate: typeof remoteImageGate;
  readonly allowNoCors: typeof allowNoCors;
  readonly report: typeof reportRemoteImageIssue;
  readonly resolved: typeof resolveRemoteImageIssue;
}

export function createRemoteImageSource(
  deps: Partial<RemoteImageSourceDeps> = {},
): RemoteImageSource {
  const loader = deps.loader ?? sharedRemoteImageLoader();
  const gateSignal = deps.gate ?? remoteImageGate;
  const noCorsSignal = deps.allowNoCors ?? allowNoCors;
  const report = deps.report ?? reportRemoteImageIssue;
  const resolved = deps.resolved ?? resolveRemoteImageIssue;
  // The loader uses the URL normalized by the policy; the drawing, the field's: the notice translates.
  // Bounded like the loader's failures (the oldest drop out; a URL outside the map notifies with the
  // normalized one).
  const rawUrls = new Map<string, Set<string>>();
  const remember = (normalized: string, raw: string): void => {
    const known = rawUrls.get(normalized) ?? new Set<string>();
    known.add(raw);
    rawUrls.delete(normalized);
    rawUrls.set(normalized, known);
    while (rawUrls.size > REMOTE_IMAGE_LIMITS.failureEntries) {
      const oldest = rawUrls.keys().next();
      if (oldest.done) break;
      rawUrls.delete(oldest.value);
    }
  };
  return {
    resolve(url) {
      // `peek`: the drawing runs outside `effect`; whoever needs to react reads `gate`.
      const gate = gateSignal.peek()(url);
      if (!gate.allowed) {
        report(url, gate.state);
        return { state: gate.state };
      }
      remember(gate.url, url);
      const view = loader.request(gate.url, { allowNoCors: noCorsSignal.peek() });
      if (view.state === 'failed')
        report(url, view.reason === 'timeout' ? 'timeout' : 'failed');
      else if (view.state === 'too-large') report(url, 'too-large');
      else if (view.state === 'loaded' || view.state === 'opaque') resolved(url);
      return view;
    },
    subscribe: (listener) =>
      loader.subscribe((loaded) => {
        for (const url of rawUrls.get(loaded) ?? [loaded]) listener(url);
      }),
    gate: computed(() => ({ gate: gateSignal.value, noCors: noCorsSignal.value })),
    epoch: loader.epoch,
  };
}

let shared: RemoteImageSource | null = null;

/** The production source, single for the canvas and the gallery. */
export function sharedRemoteImageSource(): RemoteImageSource {
  shared ??= createRemoteImageSource();
  return shared;
}
