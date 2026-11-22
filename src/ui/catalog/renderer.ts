import { computed, signal, type ReadonlySignal } from '@preact/signals';
import {
  type ExampleImageCache,
  type SceneRasterizer,
  createExampleImageCache,
  renderSceneToDataUrl,
} from '../../canvas/components/exampleImages';
import { konvaMeasurer } from '../../canvas/components/konvaMeasurer';
import { embeddedImageEpoch } from '../../canvas/components/imageLoader';
import { sharedRemoteImageSource } from '../../canvas/components/remoteImages';
import { readCanvasTokens } from '../../canvas/theme';
import type { TextMeasurer } from '../../model';
import type { PackageImages, PackageImageView } from '../../storage/packageImages';

// What the Catalog uses to measure text and rasterize drawings. Injectable in the tests (jsdom
// has no real canvas); in production it uses Konva isolated in `src/canvas/components/`.

export interface CatalogRenderer {
  readonly measure: TextMeasurer;
  readonly rasterize: SceneRasterizer;
  /** Cache of the gallery images (key: specialization@version, type, example, size). */
  readonly cache: ExampleImageCache;
  /**
   * Changes when a remote image finishes loading or the consent changes (decision 7 of the
   * remote images): enters the gallery cache key, like the fonts epoch.
   */
  readonly imagesEpoch: ReadonlySignal<number>;
}

/**
 * The package images the Catalog draws (decision 18 of stage #1903): the decoded-image source of the
 * library and its epoch, which rises when an image finishes (a gallery entry is redone then).
 */
export interface CatalogImages {
  readonly source: PackageImages;
  readonly epoch: number;
}

/** The rasterizer options that bind the drawing to the library's package images. */
export function packageImageOptions(
  specId: string,
  source: PackageImages | undefined,
):
  | { specId: string; packageImage: (spec: string, asset: string) => PackageImageView }
  | Record<string, never> {
  if (source === undefined) return {};
  return { specId, packageImage: (spec, asset) => source.resolve(spec, asset) };
}

export function createCatalogRenderer(
  measure: TextMeasurer,
  rasterize: SceneRasterizer,
  imagesEpoch: ReadonlySignal<number> = signal(0),
): CatalogRenderer {
  return { measure, rasterize, cache: createExampleImageCache(rasterize), imagesEpoch };
}

/** The production images epoch: loader, embedded images and the two gates (consent, switches). */
function productionImagesEpoch(): ReadonlySignal<number> {
  const source = sharedRemoteImageSource();
  let version = 0;
  return computed(() => {
    void source.epoch.value;
    void embeddedImageEpoch.value;
    void source.gate.value;
    return ++version;
  });
}

let shared: CatalogRenderer | null = null;

/** The production renderer, single for the whole page (the cache survives reopenings). */
export function defaultCatalogRenderer(): CatalogRenderer {
  if (shared) return shared;
  const source = sharedRemoteImageSource();
  // Same two gates and same loader as the canvas; an `opaque` image never enters (pixelSafe).
  shared = createCatalogRenderer(
    konvaMeasurer,
    (root, options) =>
      renderSceneToDataUrl(root, {
        // The colors of the placeholder and of the unknown-node box are those of the current theme.
        palette: readCanvasTokens().component,
        ...options,
        remoteImage: options.remoteImage ?? ((url) => source.resolve(url)),
      }),
    productionImagesEpoch(),
  );
  return shared;
}
