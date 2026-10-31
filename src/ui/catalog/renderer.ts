import { computed, signal, type ReadonlySignal } from '@preact/signals';
import {
  type ExampleImageCache,
  type SceneRasterizer,
  createExampleImageCache,
  renderSceneToDataUrl,
} from '../../canvas/components/exampleImages';
import { konvaMeasurer } from '../../canvas/components/konvaMeasurer';
import { sharedRemoteImageSource } from '../../canvas/components/remoteImages';
import type { TextMeasurer } from '../../model';

// O que o Catálogo usa para medir texto e rasterizar desenhos. Injetável nos testes (o jsdom
// não tem canvas real); em produção usa o Konva isolado em `src/canvas/components/`.

export interface CatalogRenderer {
  readonly measure: TextMeasurer;
  readonly rasterize: SceneRasterizer;
  /** Cache das imagens da galeria (chave: especialização@versão, tipo, exemplo, tamanho). */
  readonly cache: ExampleImageCache;
  /**
   * Muda quando uma imagem remota termina de carregar ou o consentimento muda (decisão 7 das
   * imagens remotas): entra na chave do cache da galeria, como a época das fontes.
   */
  readonly imagesEpoch: ReadonlySignal<number>;
}

export function createCatalogRenderer(
  measure: TextMeasurer,
  rasterize: SceneRasterizer,
  imagesEpoch: ReadonlySignal<number> = signal(0),
): CatalogRenderer {
  return { measure, rasterize, cache: createExampleImageCache(rasterize), imagesEpoch };
}

/** A época das imagens de produção: carregador mais as duas portas (consentimento, interruptores). */
function productionImagesEpoch(): ReadonlySignal<number> {
  const source = sharedRemoteImageSource();
  let version = 0;
  return computed(() => {
    void source.epoch.value;
    void source.gate.value;
    return ++version;
  });
}

let shared: CatalogRenderer | null = null;

/** O renderizador de produção, único para a página inteira (o cache sobrevive a reaberturas). */
export function defaultCatalogRenderer(): CatalogRenderer {
  if (shared) return shared;
  const source = sharedRemoteImageSource();
  // Mesmas duas portas e mesmo carregador do canvas; a imagem `opaque` nunca entra (pixelSafe).
  shared = createCatalogRenderer(
    konvaMeasurer,
    (root, options) =>
      renderSceneToDataUrl(root, {
        ...options,
        remoteImage: options.remoteImage ?? ((url) => source.resolve(url)),
      }),
    productionImagesEpoch(),
  );
  return shared;
}
