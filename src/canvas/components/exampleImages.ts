/**
 * Imagens estáticas da galeria do Catálogo: a cena de um exemplo desenhada pelo motor numa Stage
 * fora da tela e entregue como PNG `data:`. Gera-se uma vez e guarda-se em cache, uma entrada por
 * cena (especialização@versão, tipo, exemplo, tamanho); a época das fontes e a das imagens só dizem
 * se a imagem guardada ainda vale (se mudaram, ela é refeita no lugar, sem acumular as antigas). Konva fica aqui,
 * não na UI.
 *
 * Auditoria das leituras de pixel (docs/ARCHITECTURE.md, "Imagens remotas: política, consentimento e carregador"): `stage.toDataURL` abaixo é a única
 * leitura de pixels sobre uma camada que pode ter componente com imagem. Ela usa sempre
 * `pixelSafe: true` (a imagem `opaque`, carregada sem CORS, nunca entra: vale o reservado) e as
 * imagens com CORS (`crossOrigin`) não contaminam o canvas. O minimapa (`src/ui/Minimap.tsx` e
 * `src/canvas/minimap.ts`) é DOM e não lê pixel; `src/storage/imageCrop.ts`, `imageImport.ts` e
 * `src/ui/review/ImageCompare.tsx` só leem as imagens do projeto (`blob:`). Um teste
 * (`tests/canvas/pixelReads.test.ts`) falha se uma nova leitura aparecer fora dessa lista.
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
  /** Padrão 2 (nítido em telas comuns). */
  readonly pixelRatio?: number;
  readonly palette?: Partial<RenderPalette>;
  /** Cor de fundo atrás do desenho (CSS); ausente = transparente. */
  readonly background?: string;
  /**
   * Resolve a URL do nó `image` (as duas portas da app e o carregador, de `remoteImages.ts`).
   * Sem ela, toda imagem remota é o reservado. O resultado `opaque` nunca é desenhado aqui.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /** Recebe os avisos do desenho (com código e parâmetros) logo depois de a cena ser desenhada. */
  readonly onWarnings?: (warnings: readonly RenderWarning[]) => void;
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
      {
        // O `toDataURL` abaixo lê pixels: imagem `opaque` (sem CORS) fica de fora.
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
  /** Nome do exemplo, ou `"preview"`. */
  readonly example: string;
  readonly width: number;
  readonly height: number;
  /** Muda quando as fontes terminam de carregar (o texto mede diferente). */
  readonly fontsEpoch: number;
  /** Muda quando uma imagem remota termina de carregar ou o consentimento muda (decisão 7). */
  readonly imagesEpoch: number;
}

/** A cena: o que identifica a imagem, sem as épocas (que só dizem se a guardada ainda vale). */
function sceneKey(key: ExampleImageKey): string {
  return `${key.specId}@${key.version}|${key.typeId}|${key.example}|${key.width}×${key.height}`;
}

function stampOf(key: ExampleImageKey): string {
  return `${key.fontsEpoch}|${key.imagesEpoch}`;
}

export interface ExampleImageCache {
  /** O `data:` da imagem; gera na primeira chamada e devolve a mesma string enquanto as épocas valem. */
  get(
    key: ExampleImageKey,
    draw: () => FrameNode | null,
    options?: ExampleImageOptions,
  ): string | null;
  /** Os avisos do desenho da imagem guardada (vazio se a cena não foi desenhada). */
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
