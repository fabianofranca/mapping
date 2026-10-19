import {
  type ExampleImageCache,
  type SceneRasterizer,
  createExampleImageCache,
  renderSceneToDataUrl,
} from '../../canvas/components/exampleImages';
import { konvaMeasurer } from '../../canvas/components/konvaMeasurer';
import type { TextMeasurer } from '../../model';

// O que o Catálogo usa para medir texto e rasterizar desenhos. Injetável nos testes (o jsdom
// não tem canvas real); em produção usa o Konva isolado em `src/canvas/components/`.

export interface CatalogRenderer {
  readonly measure: TextMeasurer;
  readonly rasterize: SceneRasterizer;
  /** Cache das imagens da galeria (chave: especialização@versão, tipo, exemplo, tamanho). */
  readonly cache: ExampleImageCache;
}

export function createCatalogRenderer(
  measure: TextMeasurer,
  rasterize: SceneRasterizer,
): CatalogRenderer {
  return { measure, rasterize, cache: createExampleImageCache(rasterize) };
}

let shared: CatalogRenderer | null = null;

/** O renderizador de produção, único para a página inteira (o cache sobrevive a reaberturas). */
export function defaultCatalogRenderer(): CatalogRenderer {
  shared ??= createCatalogRenderer(konvaMeasurer, renderSceneToDataUrl);
  return shared;
}
