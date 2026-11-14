/**
 * Static images of the Catalog gallery: the scene of an example drawn by the engine on an
 * off-screen Stage and delivered as a `data:` PNG. It is generated once and cached, one entry
 * per scene (specialization@version, type, example, size); the fonts epoch and the images
 * epoch only tell whether the stored image is still valid (if they changed, it is redone in
 * place, without accumulating the old ones). Konva stays here, not in the UI.
 *
 * Audit of the pixel reads (docs/ARCHITECTURE.md, "Remote images: policy, consent and loader"):
 * `stage.toDataURL` below is the only pixel read over a layer that may have a component with an
 * image. It always uses `pixelSafe: true` (the `opaque` image, loaded without CORS, never gets
 * in: the placeholder applies) and images with CORS (`crossOrigin`) do not taint the canvas.
 * The minimap (`src/ui/Minimap.tsx` and `src/canvas/minimap.ts`) is DOM and does not read
 * pixels; `src/storage/imageCrop.ts`, `imageImport.ts` and `src/ui/review/ImageCompare.tsx`
 * only read the project's images (`blob:`). A test (`tests/canvas/pixelReads.test.ts`) fails
 * if a new read appears outside this list.
 */
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { FrameNode } from '../../model/components/scene';
import {
  type RemoteImageResult,
  type RenderPalette,
  type RenderWarning,
  renderScene,
} from './renderScene';

export interface ExampleImageOptions {
  /** Default 2 (sharp on ordinary screens). */
  readonly pixelRatio?: number;
  readonly palette?: Partial<RenderPalette>;
  /** Background color behind the drawing (CSS); absent = transparent. */
  readonly background?: string;
  /**
   * Resolves the URL of the `image` node (the app's two gates and the loader, from
   * `remoteImages.ts`). Without it, every remote image is the placeholder. The `opaque` result
   * is never drawn here.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /** Receives the drawing warnings (with code and parameters) right after the scene is drawn. */
  readonly onWarnings?: (warnings: readonly RenderWarning[]) => void;
}

/** Rasterizes the scene; injectable for tests (no real canvas in jsdom). */
export type SceneRasterizer = (root: FrameNode, options: ExampleImageOptions) => string;

/** Draws `root` on an off-screen Stage and returns the PNG as `data:`. */
export const renderSceneToDataUrl: SceneRasterizer = (root, options = {}) => {
  const width = Math.max(1, Math.ceil(root.width));
  const height = Math.max(1, Math.ceil(root.height));
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width,
    height,
  });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    if (options.background !== undefined) {
      layer.add(new KonvaRect({ x: 0, y: 0, width, height, fill: options.background }));
    }
    const rendered = renderScene(
      { root, warnings: [] },
      {
        // The `toDataURL` below reads pixels: an `opaque` image (no CORS) is left out.
        pixelSafe: true,
        ...(options.palette === undefined ? {} : { palette: options.palette }),
        ...(options.remoteImage === undefined
          ? {}
          : { remoteImage: options.remoteImage }),
      },
    );
    layer.add(rendered.root);
    options.onWarnings?.(rendered.warnings);
    layer.draw();
    return stage.toDataURL({
      pixelRatio: options.pixelRatio ?? 2,
      mimeType: 'image/png',
    });
  } finally {
    stage.destroy();
  }
};

export interface ExampleImageKey {
  readonly specId: string;
  readonly version: number;
  readonly typeId: string;
  /** Name of the example, or `"preview"`. */
  readonly example: string;
  readonly width: number;
  readonly height: number;
  /** Changes when the fonts finish loading (the text measures differently). */
  readonly fontsEpoch: number;
  /** Changes when a remote image finishes loading or the consent changes (decision 7). */
  readonly imagesEpoch: number;
}

/** The scene: what identifies the image, without the epochs (which only tell whether the
 * stored one is still valid). */
function sceneKey(key: ExampleImageKey): string {
  return `${key.specId}@${key.version}|${key.typeId}|${key.example}|${key.width}×${key.height}`;
}

function stampOf(key: ExampleImageKey): string {
  return `${key.fontsEpoch}|${key.imagesEpoch}`;
}

export interface ExampleImageCache {
  /** The image's `data:`; generates on the first call and returns the same string while the
   * epochs are valid. */
  get(
    key: ExampleImageKey,
    draw: () => FrameNode | null,
    options?: ExampleImageOptions,
  ): string | null;
  /** The drawing warnings of the stored image (empty if the scene was not drawn). */
  warnings(key: ExampleImageKey): readonly RenderWarning[];
  clear(): void;
  readonly size: number;
}

interface CachedImage {
  readonly stamp: string;
  readonly url: string;
  readonly warnings: readonly RenderWarning[];
}

const NO_WARNINGS: readonly RenderWarning[] = [];

export function createExampleImageCache(
  rasterize: SceneRasterizer = renderSceneToDataUrl,
): ExampleImageCache {
  const images = new Map<string, CachedImage>();
  return {
    get(key, draw, options = {}) {
      const id = sceneKey(key);
      const stamp = stampOf(key);
      const cached = images.get(id);
      if (cached?.stamp === stamp) return cached.url;
      const root = draw();
      if (root === null) return null;
      let warnings = NO_WARNINGS;
      const url = rasterize(root, {
        ...options,
        onWarnings: (found) => {
          warnings = found;
          options.onWarnings?.(found);
        },
      });
      images.set(id, { stamp, url, warnings });
      return url;
    },
    warnings(key) {
      return images.get(sceneKey(key))?.warnings ?? NO_WARNINGS;
    },
    clear() {
      images.clear();
    },
    get size() {
      return images.size;
    },
  };
}
