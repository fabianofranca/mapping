// Types of a remote image's state for drawing. No imports on purpose: the declarations
// of the `mapping-viewer` package reach them (via `renderScene`) and cannot pull in the loader,
// which imports `@preact/signals`.

/** States the loader knows. `blocked-consent` and `invalid` come from the app's gates. */
export type RemoteImageState = 'loading' | 'loaded' | 'opaque' | 'failed' | 'too-large';

/** State of an image for drawing: the loader's plus those of the two gates. */
export type RemoteImageViewState = RemoteImageState | 'blocked-consent' | 'invalid';

/** What drawing receives from a remote URL. Only `loaded` and `opaque` bring `image`. */
export interface RemoteImageView {
  readonly state: RemoteImageViewState;
  /** Reduced bitmap (or the element itself, without `createImageBitmap`). */
  readonly image?: CanvasImageSource;
  /** Size of the `image` source, in pixels (this is what `fit` computes the crop on). */
  readonly width?: number;
  readonly height?: number;
  /** Why `failed`, for Diagnostics (`timeout` = the time limit was exceeded). */
  readonly reason?: 'failed' | 'timeout';
}
