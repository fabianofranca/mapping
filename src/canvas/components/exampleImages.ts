/**
 * Imagens estáticas da galeria do Catálogo: a cena de um exemplo desenhada pelo motor numa Stage
 * fora da tela e entregue como PNG `data:`. Gera-se uma vez e guarda-se em cache pela chave
 * (especialização@versão, tipo, exemplo, tamanho, época das fontes). Konva fica aqui, não na UI.
 */
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { FrameNode } from '../../model/components/scene';
import { type RenderPalette, renderScene } from './renderScene';

export interface ExampleImageOptions {
  /** Padrão 2 (nítido em telas comuns). */
  readonly pixelRatio?: number;
  readonly palette?: Partial<RenderPalette>;
  /** Cor de fundo atrás do desenho (CSS); ausente = transparente. */
  readonly background?: string;
}

/** Rasteriza a cena; injetável para os testes (sem canvas real no jsdom). */
export type SceneRasterizer = (root: FrameNode, options: ExampleImageOptions) => string;

/** Desenha `root` numa Stage fora da tela e devolve o PNG como `data:`. */
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
      options.palette === undefined ? {} : { palette: options.palette },
    );
    layer.add(rendered.root);
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
  /** Nome do exemplo, ou `"preview"`. */
  readonly example: string;
  readonly width: number;
  readonly height: number;
  /** Muda quando as fontes terminam de carregar (o texto mede diferente). */
  readonly fontsEpoch: number;
}

export function exampleImageKey(key: ExampleImageKey): string {
  return `${key.specId}@${key.version}|${key.typeId}|${key.example}|${key.width}×${key.height}|${key.fontsEpoch}`;
}

export interface ExampleImageCache {
  /** O `data:` da imagem; gera na primeira chamada e devolve a mesma string nas seguintes. */
  get(
    key: ExampleImageKey,
    draw: () => FrameNode | null,
    options?: ExampleImageOptions,
  ): string | null;
  clear(): void;
  readonly size: number;
}

export function createExampleImageCache(
  rasterize: SceneRasterizer = renderSceneToDataUrl,
): ExampleImageCache {
  const images = new Map<string, string>();
  return {
    get(key, draw, options = {}) {
      const id = exampleImageKey(key);
      const cached = images.get(id);
      if (cached !== undefined) return cached;
      const root = draw();
      if (root === null) return null;
      const url = rasterize(root, options);
      images.set(id, url);
      return url;
    },
    clear() {
      images.clear();
    },
    get size() {
      return images.size;
    },
  };
}
